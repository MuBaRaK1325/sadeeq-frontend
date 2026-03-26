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

/* TRANSACTION ID */

function generateTransactionID(){
return "MC"+Date.now()+Math.floor(Math.random()*1000)
}

/* SAVE TRANSACTION */

function saveTransaction(tx){

let history=JSON.parse(localStorage.getItem("transactions")||"[]")

history.unshift(tx)

localStorage.setItem("transactions",JSON.stringify(history))

}

/* NETWORK PREFIX */

const NETWORK_PREFIX={

MTN:["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],

AIRTEL:["0802","0808","0701","0708","0812","0901","0902","0907","0911","0912"],

GLO:["0805","0807","0705","0811","0815","0905","0915"],

"9MOBILE":["0809","0817","0818","0908","0909"]

}

/* DETECT NETWORK */

function detectNetwork(phone){

if(!phone) return null

phone=phone.replace(/\D/g,"")

if(phone.startsWith("234")){
phone="0"+phone.slice(3)
}

const prefix=phone.substring(0,4)

for(const net in NETWORK_PREFIX){

if(NETWORK_PREFIX[net].includes(prefix)){
return net
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

}

/* PHONE INPUT */

let lastNetworkLoaded=null

function handlePhoneInput(input){

const phone=input.value

if(phone.length<4) return

const network=detectNetwork(phone)

if(!network) return

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

const plans=await res.json()

const container=el("plans")

if(!container) return

container.innerHTML=""

const filtered=plans.filter(p=>p.network?.toUpperCase()===network)

filtered.forEach(plan=>{

const name=plan.plan || plan.name || "Data Plan"

const price=plan.price || plan.amount || 0

const validity=plan.validity || plan.duration || "N/A"

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

}catch{

showToast("Failed to load plans")

}

}

/* PURCHASE MODAL */

let selectedPlan=null
let purchaseType=null

function openPinModal(plan,type){

selectedPlan=plan
purchaseType=type

el("pinModal")?.classList.remove("hidden")

}

function closePinModal(){
el("pinModal")?.classList.add("hidden")
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

showToast(data.message || "Transaction failed")

return
}

successSound.play()

const tx={
id:generateTransactionID(),
type:"DATA",
network:detectNetwork(phone),
phone,
amount:data.amount,
status:"SUCCESS",
date:new Date().toLocaleString()
}

saveTransaction(tx)

showReceipt(tx)

}catch{

showToast("Network error")

}

}

/* AIRTIME PURCHASE */

async function buyAirtime(phone,amount,pin){

const token=getToken()

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

showToast(data.message || "Transaction failed")

return
}

successSound.play()

const tx={
id:generateTransactionID(),
type:"AIRTIME",
network:detectNetwork(phone),
phone,
amount:data.amount,
status:"SUCCESS",
date:new Date().toLocaleString()
}

saveTransaction(tx)

showReceipt(tx)

}catch{

showToast("Network error")

}

}

/* CONFIRM PURCHASE */

function confirmPurchase(){

const pin=el("pin")?.value

if(!pin){
showToast("Enter PIN")
return
}

if(purchaseType==="airtime"){

buyAirtime(
el("phone")?.value,
el("amount")?.value,
pin
)

}else{

buyData(selectedPlan,pin)

}

closePinModal()

}

/* SAVE PIN */

async function savePin(){

const pin=el("pin")?.value
const token=getToken()

const res=await fetch(`${API}/api/set-pin`,{

method:"POST",

headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},

body:JSON.stringify({pin})

})

const data=await res.json()

showToast(data.message)

}

/* PASSWORD CHANGE */

async function changePassword(){

const oldPass=el("oldPassword")?.value
const newPass=el("newPassword")?.value

const token=getToken()

try{

const res=await fetch(`${API}/api/change-password`,{

method:"POST",

headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},

body:JSON.stringify({
old_password:oldPass,
new_password:newPass
})

})

const data=await res.json()

showToast(data.message)

}catch{

showToast("Password change failed")

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

const res=await fetch(`${API}/api/me`,{
headers:{Authorization:`Bearer ${token}`}
})

const data=await res.json()

const user=data.user || data

if(el("usernameDisplay"))
el("usernameDisplay").innerText=`Hello ${user.username}`

if(el("walletBalance"))
el("walletBalance").innerText=`₦${user.wallet_balance || 0}`

if(user.is_admin){

el("adminPanel")?.classList.remove("hidden")

}

}catch(e){

console.log(e)

}

el("dashboardLoader")?.remove()

}

/* PAGE LOAD */

document.addEventListener("DOMContentLoaded",()=>{

loadDashboard()

})

/* LOGOUT */

function logout(){

localStorage.removeItem("token")

window.location="login.html"

}