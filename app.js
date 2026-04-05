const API="https://mayconnect-backend-1.onrender.com"

const welcomeSound=new Audio("sounds/welcome.mp3")
const successSound=new Audio("sounds/success.mp3")

let cachedPlans=[]
let currentBalance=0
let currentUser=null
let ws=null
let hasPlayedWelcome=false

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

/* ================= AUTH CHECK ================= */

if(!getToken()){
window.location.replace("index.html")
}

/* ================= DASHBOARD ================= */

async function loadDashboard(){

const token=getToken()
if(!token){
logout()
return
}

try{

/* SAFE TOKEN DECODE */
let payload
try{
payload = JSON.parse(atob(token.split(".")[1]))
}catch{
throw new Error("Bad token")
}

currentUser = payload

/* SHOW UI FIRST (fixes blank/scatter) */
document.body.style.display="block"

/* USERNAME */
if(el("usernameDisplay")){
el("usernameDisplay").innerText="Hello "+payload.username
}

/* ADMIN */
if(payload.is_admin && el("admin")){
el("admin").style.display="block"
}

/* SOUND ONCE */
if(!hasPlayedWelcome){
welcomeSound.play().catch(()=>{})
hasPlayedWelcome=true
}

/* LOAD DATA (non-blocking) */
fetchTransactions()
loadPlans()
loadAdminProfit()

/* DELAY WS (prevents freeze) */
setTimeout(connectWebSocket,1000)

}catch(err){

console.log(err)
showToast("Session expired")
logout()
return

}

}

/* ================= WALLET ================= */

function animateWallet(balance){
currentBalance=Number(balance||0)

if(el("walletBalance")){
el("walletBalance").innerText="₦"+currentBalance.toLocaleString()
}
}

/* ================= TRANSACTIONS ================= */

async function fetchTransactions(){

try{

const res=await fetch(API+"/api/transactions",{
headers:{Authorization:"Bearer "+getToken()}
})

if(!res.ok) return

const tx=await res.json()

if(tx.length && tx[0].wallet_balance !== undefined){
animateWallet(tx[0].wallet_balance)
}

const home=el("transactionHistory")
if(home){
home.innerHTML=""

tx.slice(0,5).forEach(t=>{
const div=document.createElement("div")
div.className="transactionCard"
div.innerHTML=`
<strong>${t.type}</strong> ₦${t.amount}<br>
${t.phone||""}<br>
<span>${t.status}</span>
`
home.appendChild(div)
})
}

const all=el("allTransactions")
if(all){
all.innerHTML=""

tx.forEach(t=>{
const div=document.createElement("div")
div.className="transactionCard"
div.innerHTML=`
<strong>${t.type}</strong> ₦${t.amount}<br>
${t.phone||""}<br>
<span>${t.status}</span>
`
all.appendChild(div)
})
}

}catch(err){
console.log("TX error", err)
}

}

/* ================= PLANS ================= */

async function loadPlans(){

try{

const res=await fetch(API+"/api/plans",{
headers:{Authorization:"Bearer "+getToken()}
})

if(!res.ok) return

const plans=await res.json()

cachedPlans = plans.filter(p=>p.company===currentUser.company)

updatePlans()

}catch(err){
console.log("Plans error", err)
}

}

function updatePlans(){

const network=el("networkSelect")?.value
const select=el("planSelect")

if(!select) return

select.innerHTML=""

cachedPlans
.filter(p=>!network || p.network===network)
.forEach(plan=>{
const opt=document.createElement("option")
opt.value=plan.id
opt.textContent=`${plan.name} - ₦${plan.price}`
select.appendChild(opt)
})

}

/* ================= NETWORK ================= */

const logos={
MTN:"images/mtn.png",
Airtel:"images/airtel.png",
Glo:"images/glo.png"
}

function handlePhoneInput(input,select,logo){

const phone=el(input)?.value
if(!phone || phone.length<4) return

const prefix=phone.substring(0,4)

let net=null

if(["0803","0806","0703"].includes(prefix)) net="MTN"
if(["0802","0808","0708"].includes(prefix)) net="Airtel"
if(["0805","0705"].includes(prefix)) net="Glo"

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
showToast("Data successful")
fetchTransactions()

}else{
showToast(data.message||"Failed")
}

}catch(err){
console.log(err)
showToast("Network error")
}

}

/* ================= ADMIN ================= */

async function loadAdminProfit(){

if(!el("adminTotalProfit")) return

try{

const res=await fetch(API+"/api/admin/profits",{
headers:{Authorization:"Bearer "+getToken()}
})

if(!res.ok) return

const data=await res.json()
el("adminTotalProfit").innerText="₦"+(data.total_profit||0)

}catch(err){
console.log(err)
}

}

function toggleBiometric(){
const current=localStorage.getItem("biometric")==="true"
localStorage.setItem("biometric",(!current).toString())
showToast("Biometric "+(!current?"Enabled":"Disabled"))
}

/* ================= WEBSOCKET ================= */

function connectWebSocket(){

if(ws) ws.close()

try{

const wsURL=API.replace("https","wss").replace("http","ws")

ws=new WebSocket(wsURL+"?token="+getToken())

ws.onmessage=(msg)=>{
const data=JSON.parse(msg.data)

if(data.type==="wallet_update"){
animateWallet(data.balance)
fetchTransactions()
}
}

ws.onclose=()=>{
setTimeout(connectWebSocket,5000)
}

}catch(err){
console.log("WS error", err)
}

}

/* ================= LOGOUT ================= */

function logout(){

try{
if(ws) ws.close()
}catch{}

localStorage.clear()

/* HARD REDIRECT (fixes sticking) */
window.location.replace("index.html")

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

})