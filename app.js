const API="https://mayconnect-backend-1.onrender.com"

let cachedPlans=[]
let filteredPlans=[]
let selectedNetwork=null
let selectedPlan=null
let currentUser=null
let ws=null
let purchaseType=""

/* HELPERS */
function getToken(){return localStorage.getItem("token")}
function el(id){return document.getElementById(id)}

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

/* AUTH */
function checkAuth(){
if(!getToken()){
window.location.href="login.html"
return false
}
return true
}

/* DASHBOARD */
function loadDashboard(){

if(!checkAuth()) return

try{
currentUser = JSON.parse(atob(getToken().split(".")[1]))
}catch{
logout(); return
}

/* 🔥 FIX COMPANY THEME */
document.body.classList.remove("teeversh","bnhabeeb","sadeeq")
document.body.classList.add(currentUser.company)

document.body.style.display="block"

el("usernameDisplay").innerText="Hello "+currentUser.username

/* ADMIN SHOW */
if(currentUser.is_admin && el("adminSection")){
el("adminSection").style.display="block"
}

fetchTransactions()
loadPlans()
loadAccount()

setTimeout(connectWebSocket,1000)
}

/* WALLET */
function animateWallet(balance){
el("walletBalance").innerText="₦"+Number(balance||0).toLocaleString()
}

/* TRANSACTIONS */
async function fetchTransactions(){
try{
const res=await fetch(API+"/api/transactions",{headers:{Authorization:"Bearer "+getToken()}})
const tx=await res.json()

if(tx.length) animateWallet(tx[0].wallet_balance)

const home=el("transactionHistory")
home.innerHTML=""

tx.slice(0,5).forEach(t=>{
const div=document.createElement("div")
div.className="transactionCard"
div.innerHTML=`${t.type} - ₦${t.amount}`
home.appendChild(div)
})
}catch{}
}

/* PLANS */
async function loadPlans(){
const res=await fetch(API+"/api/plans",{headers:{Authorization:"Bearer "+getToken()}})
cachedPlans=await res.json()

/* 🔥 COMPANY FILTER */
cachedPlans=cachedPlans.filter(p=>p.company===currentUser.company)

renderNetworks()
}

/* NETWORK LOGOS */
function renderNetworks(){
const box=el("networkList")
box.innerHTML=""

const networks=["MTN","AIRTEL","GLO"]

networks.forEach(n=>{
const img=document.createElement("img")
img.src="images/"+n.toLowerCase()+".png"
img.style.width="60px"
img.onclick=()=>selectNetwork(n)
box.appendChild(img)
})
}

function selectNetwork(net){
selectedNetwork=net
filteredPlans=cachedPlans.filter(p=>p.network===net)
renderPlans()
}

/* RENDER PLANS */
function renderPlans(){
const list=el("planList")
list.innerHTML=""

filteredPlans.forEach(p=>{
const div=document.createElement("div")
div.className="planItem"
div.innerHTML=`${p.name}<br>₦${p.price}`
div.onclick=()=>{
selectedPlan=p.id
document.querySelectorAll(".planItem").forEach(i=>i.classList.remove("active"))
div.classList.add("active")
}
list.appendChild(div)
})
}

/* BUY DATA */
async function buyData(pin){

const phone=el("dataPhone").value

if(!phone || !selectedPlan){
return showToast("Fill all fields")
}

const res=await fetch(API+"/api/buy-data",{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+getToken()
},
body:JSON.stringify({phone,plan_id:selectedPlan,pin})
})

const data=await res.json()

if(res.ok){
showToast("Success ✅")
fetchTransactions()
}else{
showToast(data.message)
}
}

/* 🔥 SIMPLE BIOMETRIC (NO PASSKEY) */
async function confirmBiometric(){

if(localStorage.getItem("biometric")!=="true"){
return showToast("Enable biometric first")
}

/* simulate success (device unlock only) */
if(purchaseType==="data") buyData("0000")
}

/* TOGGLE */
function toggleBiometric(){
let state=localStorage.getItem("biometric")
localStorage.setItem("biometric", state==="true"?"false":"true")
showToast("Biometric "+(state==="true"?"Disabled":"Enabled"))
}

/* ACCOUNT */
async function loadAccount(){
try{
const res=await fetch(API+"/api/me",{headers:{Authorization:"Bearer "+getToken()}})
const user=await res.json()

el("bankName").innerText=user.bank_name||"N/A"
el("accountNumber").innerText=user.account_number||"N/A"
}catch{}
}

/* NAVIGATION */
function showSection(id){
document.querySelectorAll("section").forEach(s=>s.style.display="none")
el(id).style.display="block"
}

/* LOGOUT */
function logout(){
localStorage.clear()
window.location.href="login.html"
}

/* WS */
function connectWebSocket(){
const wsURL=API.replace("https","wss")
ws=new WebSocket(wsURL+"?token="+getToken())

ws.onmessage=(msg)=>{
const data=JSON.parse(msg.data)
if(data.type==="wallet_update"){
animateWallet(data.balance)
}
}
}

document.addEventListener("DOMContentLoaded",loadDashboard)