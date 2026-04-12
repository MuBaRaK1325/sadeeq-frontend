const API="https://mayconnect-backend-1.onrender.com"

let cachedPlans=[]
let currentUser=null
let ws=null

let selectedNetwork=null
let selectedPlan=null

/* ================= HELPERS ================= */

function getToken(){ return localStorage.getItem("token") }
function el(id){ return document.getElementById(id) }

/* ================= MESSAGE ================= */

function showMsg(msg){
if(!el("msgBox")) return alert(msg)

el("msgBox").innerHTML=`
<div style="text-align:center;color:white">
<p>${msg}</p>
<button onclick="closeModal('msgModal')" 
style="background:#6c5ce7;padding:12px;border:none;border-radius:10px;color:#fff;width:100%">
OK
</button>
</div>
`
openModal("msgModal")
}

/* ================= AUTH ================= */

function checkAuth(){
if(!getToken()){
window.location.href="login.html"
return false
}
return true
}

/* ================= LOAD ================= */

async function loadDashboard(){

if(!checkAuth()) return

try{
currentUser = JSON.parse(atob(getToken().split(".")[1]))
}catch{
logout()
return
}

document.body.style.display="block"

if(el("usernameDisplay")){
el("usernameDisplay").innerText="Hello "+currentUser.username
}

initNavigation()

await loadAccount()
await loadPlans()
fetchTransactions()

setTimeout(connectWebSocket,1000)
}

/* ================= NAVIGATION ================= */

function initNavigation(){

document.querySelectorAll(".section").forEach(s=>{
s.style.display="none"
})

if(el("home")) el("home").style.display="block"
}

function showSection(id){

document.querySelectorAll(".section").forEach(s=>{
s.style.display="none"
})

if(el(id)){
el(id).style.display="block"
}
}

/* ================= WALLET ================= */

function updateWallet(balance){
if(el("walletBalance")){
el("walletBalance").innerText="₦"+Number(balance).toLocaleString()
}
}

/* ================= TRANSACTIONS ================= */

async function fetchTransactions(){
try{
const res=await fetch(API+"/api/transactions",{
headers:{Authorization:"Bearer "+getToken()}
})

const tx=await res.json()

if(tx.length) updateWallet(tx[0].wallet_balance)

if(el("transactionHistory")){
el("transactionHistory").innerHTML=""
tx.slice(0,5).forEach(t=>el("transactionHistory").appendChild(txCard(t)))
}

if(el("allTransactions")){
el("allTransactions").innerHTML=""
tx.forEach(t=>el("allTransactions").appendChild(txCard(t)))
}

}catch(e){
console.log("TX ERROR",e)
}
}

function txCard(t){
const div=document.createElement("div")
div.className="transactionCard"
div.innerHTML=`
<strong>${t.type}</strong> ₦${t.amount}<br>
${t.phone||""}<br>
<span>${t.status}</span>
`
return div
}

/* ================= PLANS ================= */

async function loadPlans(){
try{
const res=await fetch(API+"/api/plans",{
headers:{Authorization:"Bearer "+getToken()}
})
cachedPlans = await res.json()
}catch(e){
console.log("PLANS ERROR",e)
}
}

/* ================= NETWORK ================= */

function selectNetwork(network, element){

selectedNetwork = (network || "").toLowerCase()
selectedPlan = null

document.querySelectorAll(".networkItem").forEach(n=>{
n.classList.remove("active")
})

if(element){
element.classList.add("active")
}

renderPlans()
}

/* ================= RENDER PLANS ================= */

function renderPlans(){

const list=el("planList")
if(!list) return

list.innerHTML=""

/* ✅ FIXED MATCHING */
const filtered = cachedPlans.filter(p=>
(p.network || "").toLowerCase().includes(selectedNetwork)
)

if(!filtered.length){
list.innerHTML="<p style='color:white'>No plans available</p>"
return
}

filtered.forEach(p=>{

/* ✅ FIX VALIDITY */
let validity = p.validity || p.duration || p.plan_validity || "N/A"

const div=document.createElement("div")
div.className="planItem"

div.innerHTML=`
<strong>${p.name}</strong><br>
${validity}<br>
<strong>₦${p.price}</strong>
`

div.onclick=()=>{
selectedPlan = p
openConfirmModal(p)
}

list.appendChild(div)

})
}

/* ================= CONFIRM ================= */

function openConfirmModal(plan){

let validity = plan.validity || plan.duration || plan.plan_validity || "N/A"

el("msgBox").innerHTML=`
<div style="text-align:center;color:white">
<h3 style="color:#6c5ce7">Confirm Purchase</h3>
<p>${plan.name}</p>
<p>${validity}</p>
<p>₦${plan.price}</p>

<button onclick="openPinModal()" 
style="background:#6c5ce7;margin-top:10px;padding:12px;border:none;border-radius:10px;color:#fff;width:100%">
Enter PIN
</button>

<button onclick="confirmBiometric()" 
style="margin-top:10px;padding:12px;width:100%">
Use Fingerprint
</button>
</div>
`

openModal("msgModal")
}

/* ================= PIN ================= */

function openPinModal(){
closeModal("msgModal")

if(el("pinModal")){
el("pinModal").style.display="flex"
}else{
showMsg("PIN modal missing in HTML")
}
}

function confirmPurchase(){

const pin=el("pinInput")?.value

if(!pin) return showMsg("Enter PIN")

closeModal("pinModal")
buyData(pin)
}

/* ================= BUY DATA ================= */

async function buyData(pin){

const phone=el("dataPhone")?.value

if(!phone || !selectedPlan){
showMsg("Select plan & enter phone")
return
}

try{
const res=await fetch(API+"/api/buy-data",{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+getToken()
},
body:JSON.stringify({
phone,
plan_id:selectedPlan.id,
pin
})
})

const data=await res.json()

if(res.ok){
showMsg("Purchase Successful ✅")
fetchTransactions()
}else{
showMsg(data.message)
}
}catch{
showMsg("Network error")
}
}

/* ================= BIOMETRIC ================= */

function confirmBiometric(){

if(localStorage.getItem("biometric")!=="true"){
showMsg("Enable biometric first")
return
}

el("msgBox").innerHTML=`
<div style="text-align:center;color:white">
<h3>🔒 Biometric</h3>
<p>Touch fingerprint sensor</p>
<button onclick="finishBiometric()" 
style="background:#6c5ce7;padding:12px;border:none;border-radius:10px;color:#fff;width:100%">
Continue
</button>
</div>
`

openModal("msgModal")
}

function finishBiometric(){
closeModal("msgModal")
buyData("biometric")
}

/* ================= TOGGLE ================= */

async function toggleBiometric(){

let state = localStorage.getItem("biometric")

if(state==="true"){
localStorage.setItem("biometric","false")
showMsg("Biometric Disabled ❌")
}else{
localStorage.setItem("biometric","true")

try{
await fetch(API+"/api/biometric/enable",{
method:"POST",
headers:{Authorization:"Bearer "+getToken()}
})
}catch{}

showMsg("Biometric Enabled ✅")
}
}

/* ================= ACCOUNT ================= */

async function loadAccount(){

try{
const res=await fetch(API+"/api/me",{
headers:{Authorization:"Bearer "+getToken()}
})

const user=await res.json()

if(el("bankName")) el("bankName").innerText=user.bank_name||"N/A"
if(el("accountNumber")) el("accountNumber").innerText=user.account_number||"N/A"

}catch{}
}

/* ================= MODALS ================= */

function openModal(id){
if(el(id)) el(id).style.display="flex"
}

function closeModal(id){
if(el(id)) el(id).style.display="none"
}

/* ================= WS ================= */

function connectWebSocket(){

const wsURL=API.replace("https","wss")
ws=new WebSocket(wsURL+"?token="+getToken())

ws.onmessage=(msg)=>{
const data=JSON.parse(msg.data)
if(data.type==="wallet_update"){
updateWallet(data.balance)
}
}
}

/* ================= LOGOUT ================= */

function logout(){
try{ if(ws) ws.close() }catch{}
localStorage.clear()
window.location.href="login.html"
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded",loadDashboard)