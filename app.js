const API="https://mayconnect-backend-1.onrender.com"

const welcomeSound=new Audio("sounds/welcome.mp3")
const successSound=new Audio("sounds/success.mp3")

let cachedPlans=[]
let currentBalance=0
let currentUser=null
let ws

/* ================= HELPERS ================= */

function getToken(){
return localStorage.getItem("token")
}

function el(id){
return document.getElementById(id)
}

function showToast(msg){
const t=document.createElement("div")
t.innerText=msg

Object.assign(t.style,{
position:"fixed",
bottom:"30px",
left:"50%",
transform:"translateX(-50%)",
background:"#000",
padding:"12px 20px",
borderRadius:"8px",
color:"#fff",
zIndex:"9999"
})

document.body.appendChild(t)
setTimeout(()=>t.remove(),3000)
}

/* ================= REDIRECT (WELCOME PAGE) ================= */

if(!location.pathname.includes("index.html")){
if(!getToken()){
location.href="index.html"
}
}

/* ================= WALLET ================= */

function animateWallet(balance){
currentBalance=Number(balance||0)
if(el("walletBalance"))
el("walletBalance").innerText="₦"+currentBalance.toLocaleString()
}

/* ================= DASHBOARD ================= */

async function loadDashboard(){

const token=getToken()

if(!token){
location="index.html"
return
}

try{

const res=await fetch(API+"/api/me",{
headers:{Authorization:"Bearer "+token}
})

if(!res.ok) throw new Error()

const user=await res.json()
currentUser=user

el("usernameDisplay").innerText="Hello "+user.username

animateWallet(user.wallet_balance)

if(user.is_admin && el("admin")){
el("admin").style.display="block"
}

try{welcomeSound.play()}catch{}

fetchTransactions()
loadPlans()
connectWalletWebSocket()
loadAdminProfit()

}catch{

showToast("Session expired")
logout()

}

document.body.style.display="block"
}

/* ================= TRANSACTIONS ================= */

async function fetchTransactions(){

try{

const res=await fetch(API+"/api/transactions",{
headers:{Authorization:"Bearer "+getToken()}
})

const tx=await res.json()

const container=el("transactionHistory")
if(!container) return

container.innerHTML=""

tx.slice(0,5).forEach(t=>{

const div=document.createElement("div")
div.className="transactionCard"

div.innerHTML=`
<strong>${t.type}</strong> ₦${t.amount}<br>
${t.phone||""}<br>
<span>${t.status}</span><br>
<button onclick='showReceipt(${JSON.stringify(t)})'>Receipt</button>
`

container.appendChild(div)

})

}catch{}
}

/* ================= LOAD PLANS ================= */

async function loadPlans(){

try{

const res=await fetch(API+"/api/plans")
const allPlans=await res.json()

/* ✅ FILTER BY COMPANY */
cachedPlans = allPlans.filter(p=>p.company === currentUser.company)

updatePlans()

}catch{
showToast("Failed to load plans")
}

}

/* ================= UPDATE PLANS ================= */

function updatePlans(){

const network=el("networkSelect")?.value
const select=el("planSelect")

if(!select) return

select.innerHTML=""

cachedPlans
.filter(p=>!network || p.network===network)
.forEach(plan=>{

/* ✅ TOP USER PRICE */
const price = currentUser.top_user ? plan.cost : plan.price

const opt=document.createElement("option")
opt.value=plan.id
opt.textContent=`${plan.name} - ₦${price}`

select.appendChild(opt)

})

}

/* ================= NETWORK DETECTION ================= */

const prefixes={
MTN:["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906"],
Airtel:["0802","0808","0708","0812","0701","0902","0907"],
Glo:["0805","0705","0815","0811","0905"]
}

const logos={
MTN:"images/mtn.png",
Airtel:"images/airtel.png",
Glo:"images/glo.png"
}

function detectNetwork(phone){

const prefix=phone.substring(0,4)

for(const n in prefixes){
if(prefixes[n].includes(prefix)) return n
}

return null
}

function handlePhoneInput(input,select,logo){

const phone=el(input)?.value
if(!phone || phone.length<4) return

const net=detectNetwork(phone)

if(net){

if(el(select)) el(select).value=net
if(el(logo)) el(logo).src=logos[net]

updatePlans()

}

}

/* ================= BUY DATA ================= */

async function buyData(pin){

const phone=el("dataPhone").value
const planId=el("planSelect").value

if(!phone || !planId){
showToast("Fill all fields")
return
}

const plan=cachedPlans.find(p=>p.id==planId)
const price = currentUser.top_user ? plan.cost : plan.price

if(currentBalance < price){
showToast("Insufficient balance")
return
}

const bio=await biometricAuth()
if(!bio) return

try{

const res=await fetch(API+"/api/buy-data",{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+getToken()
},
body:JSON.stringify({phone,plan_id:planId,pin})
})

const data=await res.json()

if(res.ok && data.success){

successSound.play()
animateWallet(currentBalance-price)
showToast("Data successful")

fetchTransactions()

}else{
showToast(data.message||"Failed")
}

}catch{
showToast("Network error")
}

}

/* ================= BUY AIRTIME ================= */

async function buyAirtime(pin){

const phone=el("airtimePhone").value
const amount=Number(el("airtimeAmount").value)

if(!phone || !amount){
showToast("Fill all fields")
return
}

if(currentBalance<amount){
showToast("Insufficient balance")
return
}

const bio=await biometricAuth()
if(!bio) return

try{

const res=await fetch(API+"/api/buy-airtime",{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+getToken()
},
body:JSON.stringify({phone,amount,pin})
})

const data=await res.json()

if(res.ok && data.success){

successSound.play()
animateWallet(currentBalance-amount)
showToast("Airtime sent")

fetchTransactions()

}else{
showToast(data.message||"Failed")
}

}catch{
showToast("Network error")
}

}

/* ================= BIOMETRIC ================= */

async function biometricAuth(){

if(localStorage.getItem("biometric")!=="true") return true

if(!window.PublicKeyCredential){
showToast("Not supported")
return true
}

try{

const challenge=new Uint8Array(32)
crypto.getRandomValues(challenge)

await navigator.credentials.get({
publicKey:{
challenge,
timeout:60000,
userVerification:"preferred"
}
})

return true

}catch{
showToast("Biometric failed")
return false
}

}

/* ================= WEBSOCKET ================= */

function connectWalletWebSocket(){

const token=getToken()

try{

const wsURL = API.replace("https","wss").replace("http","ws")

ws=new WebSocket(wsURL+"?token="+token)

ws.onmessage=(msg)=>{
const data=JSON.parse(msg.data)

if(data.type==="wallet_update"){
animateWallet(data.balance)
fetchTransactions()
}
}

ws.onclose=()=>{
setTimeout(connectWalletWebSocket,5000)
}

}catch{}

}

/* ================= ADMIN ================= */

async function loadAdminProfit(){

if(!el("adminTotalProfit")) return

try{

const res=await fetch(API+"/api/admin/profits",{
headers:{Authorization:"Bearer "+getToken()}
})

const data=await res.json()
el("adminTotalProfit").innerText="₦"+(data.total_profit||0)

}catch{}
}

/* ================= LOGOUT ================= */

function logout(){
localStorage.removeItem("token")
location="index.html"
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded",()=>{

loadDashboard()

if(el("networkSelect")){
el("networkSelect").addEventListener("change",updatePlans)
}

if(el("dataPhone")){
el("dataPhone").addEventListener("input",()=>handlePhoneInput("dataPhone","networkSelect","networkLogo"))
}

if(el("airtimePhone")){
el("airtimePhone").addEventListener("input",()=>handlePhoneInput("airtimePhone","airtimeNetwork","airtimeLogo"))
}

})