const API = "https://mayconnect-backend-1.onrender.com";

/* TOKEN */
function getToken(){
  return localStorage.getItem("token");
}

/* ELEMENT */
function el(id){
  return document.getElementById(id);
}

/* LOADER CONTROL */
function hideLoader(){
  const loader = el("dashboardLoader");
  if(loader){
    loader.style.display="none";
  }
}

/* SAFE FETCH */
async function safeFetch(url, options={}, timeout=10000){

  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), timeout);

  try{

    const res = await fetch(url,{
      ...options,
      signal:controller.signal
    });

    clearTimeout(id);
    return res;

  }catch(e){

    clearTimeout(id);
    console.log("Fetch error:",url);
    throw e;

  }
}

/* SUCCESS SOUND */
const successSound = new Audio("sounds/success.mp3");

/* TOAST */
function showToast(msg){

  const t = document.createElement("div");
  t.innerText = msg;

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
  });

  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

/* WALLET */
function animateWallet(balance){
  const wallet = el("walletBalance");
  if(wallet){
    wallet.innerText = `₦${balance}`;
  }
}

/* TRANSACTIONS */
function renderTransactions(transactions){

  const container = el("transactionHistory");
  if(!container) return;

  container.innerHTML="";

  transactions.slice(0,5).forEach(tx=>{

    const div=document.createElement("div");
    div.className="transaction-card";

    div.innerHTML=`
    <p><strong>${tx.type}</strong> - ₦${tx.amount}</p>
    <p>${tx.phone||""} ${tx.network?`(${tx.network})`:''}</p>
    <p>${tx.date||""}</p>
    `;

    container.appendChild(div);

  });

}

/* FETCH USER TRANSACTIONS */
async function fetchTransactions(){

  try{

    const res = await safeFetch(`${API}/api/transactions`,{
      headers:{Authorization:`Bearer ${getToken()}`}
    });

    if(!res.ok) return;

    const data = await res.json();
    renderTransactions(data);

  }catch(e){

    console.log("transactions error",e);

  }

}

/* NETWORK DETECTION */

const NETWORK_PREFIX={
MTN:["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],
AIRTEL:["0802","0808","0701","0708","0812","0901","0902","0907","0911","0912"],
GLO:["0805","0807","0705","0811","0815","0905","0915"],
"9MOBILE":["0809","0817","0818","0908","0909"]
};

function detectNetwork(phone){

  phone=phone.replace(/\D/g,"");

  if(phone.startsWith("234")){
    phone="0"+phone.slice(3);
  }

  const prefix=phone.substring(0,4);

  for(const net in NETWORK_PREFIX){
    if(NETWORK_PREFIX[net].includes(prefix)){
      return net;
    }
  }

  return null;
}

/* PIN MODAL */

let selectedPlan=null;

function openPinModal(type){

  const modal=el("pinModal");
  if(!modal) return;

  modal.style.display="flex";

  const body=el("pinModalBody");

  if(type==="setPin"){

    body.innerHTML=`
    <input id="pinInput" maxlength="4" placeholder="4 digit PIN">
    <button onclick="savePin()">Save PIN</button>
    `;

  }else{

    body.innerHTML=`
    <input id="pinInput" maxlength="4" placeholder="Enter PIN">
    <button onclick="confirmPurchase()">Confirm</button>
    `;

  }

}

function closePinModal(){
  el("pinModal").style.display="none";
}

/* SAVE PIN */

function savePin(){

  const pin=el("pinInput").value;

  if(pin.length!==4){
    showToast("Enter 4 digit PIN");
    return;
  }

  localStorage.setItem("userPin",pin);

  showToast("PIN saved");
  closePinModal();

}

/* PURCHASE PLAN */

function purchasePlan(planId){

  selectedPlan = planId;

  if(!localStorage.getItem("userPin")){
    openPinModal("setPin");
  }else{
    openPinModal("confirm");
  }

}

/* CONFIRM PURCHASE */

async function confirmPurchase(){

  const pin = el("pinInput").value;
  const phone = el("phone")?.value;

  if(!pin){
    showToast("Enter PIN");
    return;
  }

  if(!phone){
    showToast("Enter phone");
    return;
  }

  try{

    const res = await safeFetch(`${API}/api/buy-data`,{

      method:"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${getToken()}`
      },

      body:JSON.stringify({
        plan_id:selectedPlan,
        phone,
        pin
      })

    });

    const data = await res.json();

    if(res.ok){

      showToast("Purchase successful");

      successSound.play();

      animateWallet(data.wallet_balance);

      fetchTransactions();

    }else{

      showToast(data.error || "Purchase failed");

    }

  }catch(e){

    showToast("Purchase error");

  }

  closePinModal();

}

/* ADMIN TRANSACTIONS */

async function loadAdminTransactions(){

  try{

    const res = await safeFetch(`${API}/api/admin/transactions`,{
      headers:{Authorization:`Bearer ${getToken()}`}
    });

    if(!res.ok) return;

    const txs = await res.json();

    const container = el("transactionHistoryAdmin");
    if(!container) return;

    container.innerHTML="";

    let profit = 0;

    txs.slice(0,10).forEach(tx=>{

      profit += Number(tx.profit || 0);

      const div = document.createElement("div");

      div.className="transaction-card";

      div.innerHTML=`
      <p><strong>${tx.type}</strong> - ₦${tx.amount}</p>
      <p>${tx.username||""}</p>
      <p>${tx.phone||""}</p>
      <p>${tx.date||""}</p>
      `;

      container.appendChild(div);

    });

    const profitEl = el("profitBalance");

    if(profitEl){
      profitEl.innerText=`₦${profit}`;
    }

  }catch(e){

    showToast("Admin transactions failed");

  }

}

/* DASHBOARD */

async function loadDashboard(){

  const token = getToken();

  if(!token){
    window.location="login.html";
    return;
  }

  try{

    const userReq = safeFetch(`${API}/api/me`,{
      headers:{Authorization:`Bearer ${token}`}
    });

    const txReq = fetchTransactions();

    const [userRes] = await Promise.all([userReq, txReq]);

    if(!userRes.ok){
      window.location="login.html";
      return;
    }

    const user = await userRes.json();

    if(el("usernameDisplay")){
      el("usernameDisplay").innerText=`Hello ${user.username}`;
    }

    if(el("walletBalance")){
      el("walletBalance").innerText=`₦${user.wallet_balance}`;
    }

    if(user.is_admin){

      const adminPanel = el("adminPanel");

      if(adminPanel){
        adminPanel.style.display="block";
      }

      loadAdminTransactions();

    }

    if(!localStorage.getItem("userPin")){
      setTimeout(()=>openPinModal("setPin"),1000);
    }

    connectWalletWebSocket();

  }catch(e){

    console.log("Dashboard error:",e);

    showToast("Dashboard loading failed");

  }

  /* LOADER ALWAYS HIDE */

  setTimeout(hideLoader,500);

}

/* WEBSOCKET */

let ws;

function connectWalletWebSocket(){

  if(ws) ws.close();

  ws = new WebSocket(`${API.replace(/^http/,"ws")}`);

  ws.onmessage = (msg)=>{

    const data = JSON.parse(msg.data);

    if(data.type==="wallet_update"){

      animateWallet(data.balance);

      fetchTransactions();

    }

  };

  ws.onclose = ()=>{
    setTimeout(connectWalletWebSocket,5000);
  };

}

/* LOGOUT */

function logout(){

  localStorage.removeItem("token");

  window.location="login.html";

}

/* EVENTS */

document.addEventListener("DOMContentLoaded",loadDashboard);

el("refreshProfit")?.addEventListener("click",loadAdminTransactions);