const API="https://mayconnect-backend-1.onrender.com"

/* TOKEN */

function getToken(){
return localStorage.getItem("token")
}

/* ELEMENT */

function el(id){
return document.getElementById(id)
}

/* SUCCESS SOUND */

const successSound=new Audio("sounds/success.mp3")

/* TOAST */

function showToast(msg){

const t=document.createElement("div")

t.innerText=msg
t.style.position="fixed"
t.style.bottom="30px"
t.style.left="50%"
t.style.transform="translateX(-50%)"
t.style.background="#000"
t.style.padding="12px 20px"
t.style.borderRadius="8px"
t.style.color="#fff"
t.style.zIndex="9999"

document.body.appendChild(t)

setTimeout(()=>t.remove(),3000)

}

/* GENERATE TRANSACTION ID */

function generateTransactionID(){

return "MC"+Date.now()+Math.floor(Math.random()*1000)

}

/* SAVE TRANSACTION HISTORY */

function saveTransaction(tx){

let history=JSON.parse(localStorage.getItem("transactions")||"[]")

history.unshift(tx)

localStorage.setItem("transactions",JSON.stringify(history))

}

/* NETWORK PREFIX (FULL NIGERIA) */

const NETWORK_PREFIX={

MTN:[
"0803","0806","0703","0706","0813","0816","0810","0814",
"0903","0906","0913","0916"
],

AIRTEL:[
"0802","0808","0701","0708","0812",
"0901","0902","0907","0911","0912"
],

GLO:[
"0805","0807","0705","0811","0815",
"0905","0915"
],

"9MOBILE":[
"0809","0817","0818","0908","0909"
]

}

/* DETECT NETWORK */

function detectNetwork(phone){

if(!phone) return null

phone=phone.replace(/\D/g,"")

if(phone.startsWith("234")){
phone="0"+phone.slice(3)
}

const prefix=phone.substring(0,4)

for(const network in NETWORK_PREFIX){

if(NETWORK_PREFIX[network].includes(prefix)){
return network
}

}

return null

}

/* NETWORK LOGO */

function showNetworkLogo(network){

const logo=el("networkLogo")

if(!logo) return

const logos={
MTN:"images/MTN.png",
AIRTEL:"images/Airtel.png",
GLO:"images/Glo.png",
"9MOBILE":"images/9mobile.png"
}

logo.src=logos[network] || ""
logo.style.display="block"
logo.style.border="3px solid #2f6bff"
logo.style.borderRadius="50%"
logo.style.padding="4px"

}

/* PHONE INPUT */

let lastNetworkLoaded=null

function handlePhoneInput(input){

const phone=input.value

if(phone.length<4) return

const network=detectNetwork(phone)

if(!network){
el("plans").innerHTML=""
return
}

showNetworkLogo(network)

if(network===lastNetworkLoaded) return

lastNetworkLoaded=network

loadDataPlans(network)

}

/* LOAD DATA PLANS */

async function loadDataPlans(network){

try{

const token=getToken()

const res=await fetch(`${API}/api/plans`,{
headers:{Authorization:`Bearer ${token}`}
})

let plans=await res.json()

if(!Array.isArray(plans)){
showToast("Failed to load plans")
return
}

const container=el("plans")

if(!container) return

container.innerHTML=""

const filtered=plans.filter(p=>
p.network?.toUpperCase()===network
)

if(filtered.length===0){
container.innerHTML="<p>No plans available</p>"
return
}

filtered.forEach(plan=>{

const name=plan.plan || plan.name || "Data Plan"
const price=plan.price || plan.amount || 0
const validity=plan.validity || plan.duration || ""
const id=plan.plan_id || plan.id

const card=document.createElement("div")

card.className="planCard"

card.innerHTML=`
<h4>${name}</h4>
<p>₦${price}</p>
<p>${validity}</p>
<button onclick="openPinModal('${id}','data')">Buy</button>
`

container.appendChild(card)

})

}catch(e){

console.log(e)
showToast("Network error loading plans")

}

}

/* PURCHASE MODAL */

let selectedPlan=null
let purchaseType=null

function openPinModal(plan,type){

selectedPlan=plan
purchaseType=type

const modal=el("pinModal")

if(modal) modal.classList.remove("hidden")

}

function closePinModal(){

const modal=el("pinModal")

if(modal) modal.classList.add("hidden")

}

/* DATA PURCHASE */

async function buyData(planId,pin){

const phone=el("phone")?.value
const token=getToken()

if(!phone){
showToast("Enter phone number")
return
}

try{

const res=await fetch(`${API}/api/buy-data`,{

method:"POST",

headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},

body:JSON.stringify({
plan_id:planId,
phone,
pin
})

})

const data=await res.json()

if(!data.status){

if(data.message?.toLowerCase().includes("balance")){
showToast("Insufficient wallet balance")
}else{
showToast(data.message || "Transaction failed")
}

return
}

successSound.play()

const txid=generateTransactionID()

const tx={
id:txid,
type:"DATA",
network:detectNetwork(phone),
phone:phone,
amount:data.amount || "",
status:"SUCCESS",
date:new Date().toLocaleString()
}

saveTransaction(tx)

showToast("Data purchase successful")

showReceipt(tx)

}catch{

showToast("Network error")

}

}

/* AIRTIME PURCHASE */

async function buyAirtime(phone,amount,pin){

const token=getToken()

if(!phone || !amount){
showToast("Enter phone and amount")
return
}

try{

const res=await fetch(`${API}/api/buy-airtime`,{

method:"POST",

headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},

body:JSON.stringify({
network:detectNetwork(phone),
phone,
amount,
pin
})

})

const data=await res.json()

if(!data.status){

if(data.message?.toLowerCase().includes("balance")){
showToast("Insufficient wallet balance")
}else{
showToast(data.message || "Transaction failed")
}

return
}

successSound.play()

const txid=generateTransactionID()

const tx={
id:txid,
type:"AIRTIME",
network:detectNetwork(phone),
phone:phone,
amount:amount,
status:"SUCCESS",
date:new Date().toLocaleString()
}

saveTransaction(tx)

showToast("Airtime successful")

showReceipt(tx)

}catch{

showToast("Network error")

}

}

/* CONFIRM PURCHASE */

function confirmPurchase(){

const pin=el("pin")?.value

if(!pin){
showToast("Enter transaction PIN")
return
}

if(purchaseType==="airtime"){

const phone=el("phone")?.value
const amount=el("amount")?.value

buyAirtime(phone,amount,pin)

}else{

buyData(selectedPlan,pin)

}

closePinModal()

}

/* BIOMETRIC PURCHASE */

function confirmBiometric(){

if(!localStorage.getItem("biometric")){
showToast("Enable biometric first")
return
}

if(purchaseType==="airtime"){

const phone=el("phone")?.value
const amount=el("amount")?.value

buyAirtime(phone,amount,"biometric")

}else{

buyData(selectedPlan,"biometric")

}

closePinModal()

}

/* RECEIPT */

function showReceipt(data){

const receipt=`

<div class="receipt">

<img src="images/logo.png" style="width:120px;margin-bottom:10px">

<h3>MayConnect Receipt</h3>

<p><b>Reference:</b> ${data.id}</p>

<p><b>Type:</b> ${data.type}</p>

<p><b>Network:</b> ${data.network}</p>

<p><b>Phone:</b> ${data.phone}</p>

<p><b>Amount:</b> ₦${data.amount}</p>

<p><b>Status:</b> ${data.status}</p>

<p><b>Date:</b> ${data.date}</p>

<button onclick="shareReceipt()">Share Receipt</button>

</div>

`

const div=document.createElement("div")
div.innerHTML=receipt

document.body.appendChild(div)

}

/* SHARE RECEIPT */

function shareReceipt(){

if(navigator.share){

navigator.share({
title:"MayConnect Receipt",
text:"Transaction completed successfully"
})

}else{

showToast("Sharing not supported")

}

}

/* DASHBOARD */

async function loadDashboard(){

const token=getToken()

if(!token){
window.location="login.html"
return
}

try{

const res=await fetch(`${API}/api/user`,{
headers:{Authorization:`Bearer ${token}`}
})

const user=await res.json()

if(el("usernameDisplay"))
el("usernameDisplay").innerText=`Hello ${user.name}`

if(el("walletBalance"))
el("walletBalance").innerText=`₦${user.wallet || 0}`

if((user.is_admin || user.isAdmin || user.role==="admin") && el("adminPanel")){
el("adminPanel").style.display="block"
}

}catch(e){

console.log(e)

}

const loader=el("dashboardLoader")
if(loader) loader.style.display="none"

}

/* PAGE LOAD FIX */

document.addEventListener("DOMContentLoaded",()=>{

setTimeout(()=>{

const loader=el("dashboardLoader")
if(loader) loader.style.display="none"

},2000)

loadDashboard()

})

/* LOGOUT */

function logout(){

localStorage.removeItem("token")

window.location="login.html"

}