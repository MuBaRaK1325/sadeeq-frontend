const API = "https://mayconnect-backend-1.onrender.com";

let isApp = false;

document.addEventListener("DOMContentLoaded", () => {

    console.log("window.Capacitor =", window.Capacitor);

    console.log(
        "isNativePlatform =",
        window.Capacitor?.isNativePlatform?.()
    );

    console.log(
        "Plugins =",
        window.Capacitor?.Plugins
    );

    console.log(
        "Plugin keys =",
        Object.keys(window.Capacitor?.Plugins || {})
    );

    // Correct plugin
    console.log(
        "NativeBiometric =",
        window.Capacitor?.Plugins?.NativeBiometric
    );

    // Check saved login details
    console.log(
        "Saved Username =",
        localStorage.getItem("username")
    );

    console.log(
        "Saved Password =",
        localStorage.getItem("biometric_password")
    );

    // Show everything in LocalStorage
    console.log("===== LOCAL STORAGE =====");

    if (localStorage.length === 0) {

        console.log("LocalStorage is EMPTY");

    } else {

        for (let i = 0; i < localStorage.length; i++) {

            const key = localStorage.key(i);

            console.log(
                key + " =",
                localStorage.getItem(key)
            );

        }

    }

    console.log("=========================");

    isApp = !!window.Capacitor?.isNativePlatform?.();

    console.log("isApp =", isApp);

});

// Block admin APIs if running in app
if(isApp) {
  if(typeof axios !== 'undefined') {
    axios.defaults.headers.common['X-App-Version'] = '1.0.0';
  }
}


let cachedPlans = {}; // now an object: {SME: [], SME2: [], GIFTING: [], CORPORATE_GIFTING: []}
let cachedAdminPlans = [];
let planTypes = ['SME', 'SME2', 'GIFTING', 'CORPORATE_GIFTING']; // ADDED BOTH
let activePlanType = 'SME'; // default tab
let currentUser = null;
let ws = null;

let selectedNetwork = null;
let selectedPlan = null;
let airtimeNetwork = null;
let actionType = null;
let editingPlanId = null;
let selectedPlanId = null;
let selectedPhone = null;
let cachedRegOptions = null;
let biometricReady = false;

/* ================= HELPERS ================= */
function getToken() { return localStorage.getItem("token"); }
function el(id) { return document.getElementById(id); }
function formatNaira(num) { return "₦" + Number(num || 0).toLocaleString(); }
function formatDate(date) { return new Date(date).toLocaleDateString('en-GB'); }
function openModal(id) { const m = el(id); if (m) m.style.display = "flex"; }
function closeModal(id) { const m = el(id); if (m) m.style.display = "none"; }

/* ================= WEBAUTHN HELPERS ================= */
function bufferEncode(value) {
  if (!value) return null;
  const uint8Array = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferDecode(value) {
  if (!value) return null;
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/* ================= MESSAGE MODAL ================= */
function showMsg(msg, type = "info") {
  const color = type === "error"? "#ff4d4d" : type === "success"? "#00c853" : "#2196f3";
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <p style="color:${color};margin-bottom:16px">${msg}</p>
      <button onclick="closeModal('msgModal')" class="primaryBtn">OK</button>
    </div>`;
  openModal("msgModal");
}

/* ================= INPUT MODAL ================= */
function showInputModal(title, placeholder, callback) {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3 style="margin-bottom:12px">${title}</h3>
      <input id="modalInput" type="text" placeholder="${placeholder}" style="width:100%;padding:10px;margin-bottom:16px" />
      <div style="display:flex;gap:8px;justify-content:center">
        <button id="modalCancelBtn" class="secondaryBtn">Cancel</button>
        <button id="modalOkBtn" class="primaryBtn">OK</button>
      </div>
    </div>`;
  openModal("msgModal");
  setTimeout(() => el("modalInput")?.focus(), 100);

  el("modalCancelBtn").onclick = () => closeModal("msgModal");
  el("modalOkBtn").onclick = () => {
    const val = el("modalInput").value;
    closeModal("msgModal");
    if (val) callback(val);
  };
}

/* ================= LOADER ================= */
function showLoader(text = "Processing...") {
  if (el("loaderText")) el("loaderText").innerText = text;
  openModal("loaderModal");
}

function hideLoader() { 
  closeModal("loaderModal"); 
}

/* ================= AUTH ================= */
function checkAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/* ================= LOAD DASHBOARD ================= */
async function loadDashboard() {
  if (!checkAuth()) return;

  showLoader("Loading dashboard..."); // <-- Unlocks APK if it fails

  try {
    initKycListeners(); 

    const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
    if (!res.ok) throw new Error("Failed to fetch user - " + res.status);
    const contentType = res.headers.get("content-type");
    if (!contentType ||!contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    currentUser = await res.json();
    window.CURRENT_USER_ID = currentUser.id;
    console.log("Current user tier:", currentUser.user_tier);

    if (el("usernameDisplay")) el("usernameDisplay").innerText = "Hello " + currentUser.username;
    if (el("companyBadge")) el("companyBadge").innerText = currentUser.company.toUpperCase();

  const isApp = window.Capacitor && window.Capacitor.isNativePlatform();

if (currentUser && currentUser.is_admin === true && !isApp) {
  // Only show admin on WEB, hide on APP
  document.querySelectorAll(".adminOnly").forEach(e => e.style.display = "block");
  if (el("adminWalletBalance")) el("adminWalletBalance").innerText = formatNaira(currentUser.admin_wallet);
  if (el("adminWalletBalance2")) el("adminWalletBalance2").innerText = formatNaira(currentUser.admin_wallet);
}

    initNavigation();
    await loadAccount();
    await loadPlans();
    fetchTransactions();
    if (currentUser.is_admin) loadAdminData();
    checkBiometricStatus();

    setTimeout(connectWebSocket, 1000);

  } catch (e) {
    console.error("Load user error:", e);
    showMsg("Failed to load dashboard. Check internet or login again.", "error"); // <-- Don’t logout, show error
  } finally {
    hideLoader(); // <-- This always runs. No more frozen LOADING
  }
}

/* ================= NAV ================= */
function initNavigation() {
  document.querySelectorAll(".section").forEach(s => s.style.display = "none");
  el("home").style.display = "block";
}

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.style.display = "none");
  
  const target = el(id);
  if (!target) {
    console.error("Section not found:", id);
    return; // prevents the crash
  }
  
  target.style.display = "block";
  
  if (id === "profitDashboard") loadProfitDashboard();
  if (id === "topUsersManager") loadTopUsers();
  if (id === "withdrawals") {
    populateBankDropdown();
    loadWithdrawals();
  }
  if (id === "plansManager") loadAdminPlans();
  if (id === "usersManager") loadAdminUsers();
  if (id === "profile") checkBiometricStatus();
}

/* ================= WALLET ================= */
function updateWallet(balance) {
  if (el("walletBalance")) el("walletBalance").innerText = formatNaira(balance);
}

async function loadWallet() {
  const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
  const user = await res.json();

  updateWallet(user.wallet_balance);

  const wallet = user.wallet || {};
  const dva = wallet.dva || {};

  // --- PAYMENTPOINT DVA FOR ALL COMPANIES ---
  const dvaContainer = el("dvaContainer");
  if (dvaContainer) {
    if (dva.accountNumber) {
      dvaContainer.innerHTML = `
        <div class="walletCard">
          <h4>PaymentPoint Virtual Account</h4>
          <p><strong>Bank:</strong> ${dva.bankName || 'N/A'}</p>
          <p><strong>Account Number:</strong> ${dva.accountNumber} 
            <button onclick="copyToClipboard('${dva.accountNumber}')" class="smallBtn">Copy</button>
          </p>
          <p><strong>Account Name:</strong> ${dva.accountName || user.username}</p>
          <small style="opacity:0.7">Transfer to this account to fund your wallet instantly. Use exact amount.</small>
        </div>`;
    } else {
      // No DVA yet - show generate button
      dvaContainer.innerHTML = `
        <button onclick="generateDVA()" class="primaryBtn">Generate Virtual Account</button>`;
    }
  }

// --- RENDER TRANSACTIONS ---
const list = el("walletTransactionsList");
const transactions = wallet.transactions || [];
if (list) {
  if (!transactions.length) {
    list.innerHTML = `<p style="opacity:0.6;text-align:center;">No wallet transactions yet</p>`;
    return;
  }
  list.innerHTML = "";
  
  transactions.forEach(tx => {
    const statusColor = tx.tx_status === "SUCCESS" ? "#00c853" : tx.tx_status === "PENDING" ? "#ffa000" : "#ff4d4d";
    const wasManual = tx.metadata?.manual_deducted ? '<span class="badge badgeWarning">MANUAL</span>' : '';
    const wasReversed = tx.metadata?.reversed ? '<span class="badge badgeDanger">REVERSED</span>' : '';

    // Save full tx object in data attribute, escape single quotes
    const txData = JSON.stringify(tx).replace(/'/g, "&#39;");

    list.innerHTML += `
      <div class="transactionCard" style="cursor:pointer" data-tx='${txData}'>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <strong>${tx.type || 'Wallet Tx'}</strong> ${wasManual} ${wasReversed}<br>
            <small style="font-family:monospace">${tx.reference || 'N/A'}</small>
          </div>
          <div style="text-align:right">
            <strong style="font-size:18px">${formatNaira(tx.amount || 0)}</strong><br>
            <span style="color:${statusColor};font-weight:600">${tx.tx_status || tx.type.toUpperCase()}</span>
          </div>
        </div>
        <small style="opacity:0.5">${formatDate(tx.created_at)}</small>
      </div>`;
  });

  // Add click event to all cards after rendering
  document.querySelectorAll('.transactionCard').forEach(card => {
    card.addEventListener('click', () => {
      const tx = JSON.parse(card.dataset.tx);
      showReceipt({
        number: tx.reference,
        network: tx.network,
        plan: tx.plan_name,
        type: tx.type,
        date: formatDate(tx.created_at),
        amount: tx.amount,
        status: tx.tx_status,
        id: tx.id,
        balance_before: tx.balance_before, // ← Yanzu zai fito
        balance_after: tx.balance_after    // ← Yanzu zai fito
      });
    });
  });
}
}

// Helper for copy button
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showMsg("Copied to clipboard!", "success");
}

/* ================= COPY ACCOUNT ================= */
function copyAccount() {
  const acc = el("accountNumber").innerText;
  navigator.clipboard.writeText(acc);
  showMsg("Account number copied!", "success");
}

/* ================= TRANSACTIONS ================= */
async function fetchTransactions() {
  try {
    const res = await fetch(API + "/api/transactions", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to fetch transactions - " + res.status);
    const contentType = res.headers.get("content-type");
    if (!contentType ||!contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    const tx = await res.json();

    if (el("transactionHistory")) {
      el("transactionHistory").innerHTML = "";
      tx.slice(0, 5).forEach(t => {
        const card = txCard(t);
        card.onclick = () => showReceipt({
          number: t.phone || t.reference,
          network: t.network,
          plan: t.plan_name || t.type,
          type: t.type,
          date: new Date(t.created_at).toLocaleString(),
          amount: t.amount, // ← Sauya price → amount
          status: t.status,
          txnId: t.reference,
          id: t.id,
          balance_before: t.balance_before, // ← snake_case
          balance_after: t.balance_after    // ← snake_case
        });
        el("transactionHistory").appendChild(card);
      });
    }

    if (el("allTransactions")) {
      el("allTransactions").innerHTML = "";
      tx.forEach(t => {
        const card = txCard(t);
        card.onclick = () => showReceipt({
          number: t.phone || t.reference,
          network: t.network,
          plan: t.plan_name || t.type,
          type: t.type,
          date: new Date(t.created_at).toLocaleString(),
          amount: t.amount, // ← Sauya price → amount
          status: t.status,
          txnId: t.reference,
          id: t.id,
          balance_before: t.balance_before, // ← snake_case
          balance_after: t.balance_after    // ← snake_case
        });
        el("allTransactions").appendChild(card);
      });
    }
  } catch (e) {
    console.error("Fetch transactions error:", e);
    if (el("transactionHistory")) {
      el("transactionHistory").innerHTML = "<p style='color:#ff4d4d'>Failed to load transactions</p>";
    }
  }
}

function txCard(t) {
  const div = document.createElement("div");
  div.className = "transactionCard";
  const statusColor = t.status === "SUCCESS"? "#00c853" : t.status === "FAILED"? "#ff4d4d" : "#ffa000";
  div.innerHTML = `
    <strong>${t.type}</strong> ${formatNaira(t.amount)}<br>
    ${t.phone || t.network || t.reference || ""}<br>
    <span style="color:${statusColor}">${t.status}</span>
    <small style="float:right">${formatDate(t.created_at)}</small>`;
  div.style.cursor = "pointer";
  return div;
}

/* ================= LOAD PLANS WITH TABS ================= */
async function loadPlans() {
  try {
    const res = await fetch(API + "/api/plans", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to fetch plans - " + res.status);
    const response = await res.json();

    // New format from backend: {success: true, data: {SME:[], SME2:[], GIFTING:[]}, planTypes: []}
    cachedPlans = response.data || {};
    planTypes = response.planTypes || ['SME', 'SME2', 'GIFTING', 'CORPORATE_GIFTING'];
    activePlanType = planTypes[0] || 'SME';

    renderPlanTabs(); // draw tabs first
    renderPlans();
  } catch (e) {
    console.log("PLANS ERROR", e);
    const list = el("planList");
    if (list) list.innerHTML = "<p style='color:#ff4d4d'>Failed to load plans. Please refresh.</p>";
  }
}

function selectNetwork(network, element) {
  selectedNetwork = (network || "").toLowerCase();
  selectedPlan = null;
  document.querySelectorAll(".networkItem").forEach(n => n.classList.remove("active"));
  if (element) element.classList.add("active");

  // show tabs after network is selected
  const tabContainer = el("planTabs");
  if (tabContainer) tabContainer.classList.add("show");

  renderPlanTabs();
  renderPlans();
}

function selectPlanType(type) {
  activePlanType = type;
  document.querySelectorAll(".planTab").forEach(t => t.classList.remove("active"));
  document.querySelector(`.planTab[data-type="${type}"]`)?.classList.add("active");
  renderPlans();
}

// Render the SME | SME2 | GIFTING | CORPORATE GIFTING tabs
function renderPlanTabs() {
  let tabContainer = el("planTabs");
  if (!tabContainer) {
    const list = el("planList");
    tabContainer = document.createElement("div");
    tabContainer.id = "planTabs";
    tabContainer.className = "planTabs";
    list.parentNode.insertBefore(tabContainer, list);
  }

  const tabLabels = {
    SME: "SME",
    SME2: "SME2",
    GIFTING: "GIFTING",
    CORPORATE_GIFTING: "CORPORATE GIFTING" // nice label
  };

  tabContainer.innerHTML = "";
  planTypes.forEach(type => {
    const btn = document.createElement("button");
    btn.className = "planTab" + (type === activePlanType? " active" : "");
    btn.setAttribute("data-type", type);
    btn.innerText = tabLabels[type] || type; // use nice label
    btn.onclick = () => selectPlanType(type);
    tabContainer.appendChild(btn);
  });
}

// Get correct price based on user tier
function getPlanPrice(plan) {
  const tier = currentUser?.user_tier || 'default';
  if (tier === 'top' && plan.top_price) return Number(plan.top_price);
  if (tier === 'regular' && plan.regular_price) return Number(plan.regular_price);
  return Number(plan.price);
}

function renderPlans() {
  const list = el("planList");
  if (!list) return;
  list.innerHTML = "";

  if (!selectedNetwork) {
    list.innerHTML = "<p>Select a network first</p>";
    return;
  }

  // Get plans for active tab + selected network
  const plansForType = cachedPlans[activePlanType] || [];
  const filtered = plansForType.filter(p => (p.network || "").toLowerCase() === selectedNetwork && p.is_active!== false);

  if (!filtered.length) {
    list.innerHTML = `<p>No ${activePlanType} plans available for this network</p>`;
    return;
  }

  const tier = currentUser?.user_tier || 'default';

  filtered.forEach(p => {
    const div = document.createElement("div");
    div.className = "planItem";

    const priceDisplay = getPlanPrice(p);
    let badge = "";

    if (tier === 'top') {
      badge = `<span class="topUserBadge">TOP</span>`;
    } else if (tier === 'regular' && p.regular_price) {
      badge = `<span class="regularUserBadge">REGULAR</span>`;
    }

    const validityText = p.validity? `${p.validity} Days` : "";

    div.innerHTML = `
      <strong>${p.name}</strong> ${badge}<br>
      ${validityText}<br>
      <strong>${formatNaira(priceDisplay)}</strong>
    `;

    div.onclick = () => {
      selectedPlan = {...p, price: priceDisplay };
      openPurchaseModal(p.id, p.name, priceDisplay);
    };

    list.appendChild(div);
  });
}

/* ================= AIRTIME NETWORK ================= */
function selectAirtimeNetwork(network, element) {

    airtimeNetwork = (network || "").toLowerCase();

    document.querySelectorAll(".airtimeNet").forEach(item => {
        item.classList.remove("active");
    });

    if (element) {
        element.classList.add("active");
    }

    console.log("Selected Airtime Network:", airtimeNetwork);

}

/* ================= BIOMETRIC ================= */

const APP_NAME = "SADEEQ DATA HUB";
const APP_LOGO = "/images/SADEEQ.PNG";

const NativeBiometric =
window.Capacitor?.Plugins?.NativeBiometric;

function el(id){
return document.getElementById(id);
}

function getToken(){
return localStorage.getItem("token");
}

function isNativeApp(){
return !!window.Capacitor && !!NativeBiometric;
}

function showDebug(msg,error=false){

const box=el("biometricStatus");

if(!box) return;

box.innerHTML=`

<div style="color:${error?"#ff4444":"#14b8b6"};    
            font-size:13px;    
            white-space:pre-line;">    
    ${msg}    
</div>`;  }

/* ==========================================
CHECK STATUS
========================================== */

async function checkBiometricStatus() {

const btn = el("enableBiometricBtn");  

if (!btn) return;  

btn.style.display = "none";  

if (!isNativeApp()) {  
    return;  
}  

try {  

    const available = await NativeBiometric.isAvailable();  

    if (!available.isAvailable) {  

        showDebug(  
            "Fingerprint is not available on this device.",  
            true  
        );  

        return;  

    }  

    const username = localStorage.getItem("username");  

    if (!username) {  

        btn.style.display = "flex";  
        btn.innerHTML = "Enable Fingerprint";  
        btn.onclick = enableBiometric;  

        showDebug(  
            "Please login first."  
        );  

        return;  

    }  

    const result = await NativeBiometric.isCredentialsSaved({  

        server: "sadeeq-datahub-" + username  

    });  

    const saved = result.isSaved;  

    btn.style.display = "flex";  

    if (saved) {  

        btn.innerHTML = "Login with Fingerprint";  
        btn.onclick = loginWithBiometric;  

        showDebug(  
            "Fingerprint login is enabled."  
        );  

    } else {  

        btn.innerHTML = "Enable Fingerprint";  
        btn.onclick = enableBiometric;  

        showDebug(  
            "Tap the button below to enable fingerprint login."  
        );  

    }  

} catch (err) {  

    console.error(err);  

    showDebug(  
        err.message || "Unable to check fingerprint status.",  
        true  
    );  

}

}

/* ==========================================
ENABLE BIOMETRIC
========================================== */

async function enableBiometric() {

const btn = el("enableBiometricBtn");  

if (!btn) return;  

try {  

    btn.disabled = true;  
    btn.innerHTML = "Touch Fingerprint...";

const username = localStorage.getItem("username");
const password = localStorage.getItem("biometric_password");

console.log("USERNAME =", username);
console.log("PASSWORD =", password);
console.log("ALL LOCAL STORAGE =", JSON.stringify(localStorage));

if (!username)
throw new Error("Please login first.");

if (!password)
throw new Error("Please login with username and password first.");
await NativeBiometric.verifyIdentity({

title: APP_NAME,  
        subtitle: "Enable Fingerprint",  
        description: "Authenticate",  
        reason: "Enable biometric login",  
        negativeButtonText: "Cancel"  

    });  

    await NativeBiometric.setCredentials({  

        username,  
        password,  
        server: "sadeeq-datahub-" + username  

    });  

    localStorage.removeItem("biometric_password");  

    localStorage.setItem(  
        "biometric_enabled",  
        "true"  
    );  

    showMsg(  
        "Fingerprint Enabled Successfully",  
        "success"  
    );  

    checkBiometricStatus();  

} catch (err) {  

    console.error(err);  

    btn.disabled = false;  
    btn.innerHTML = "Enable Fingerprint";  

    showDebug(  
        err.message || "Fingerprint setup failed.",  
        true  
    );  

}

}

/* ==========================================
LOGIN WITH BIOMETRIC (ANDROID)
========================================== */

async function loginWithBiometric() {

const btn = el("enableBiometricBtn");  

if (!btn) return;  

try {  

    btn.disabled = true;  
    btn.innerHTML = "Touch Fingerprint...";  

    const username = localStorage.getItem("username");  

    if (!username)  
        throw new Error("Please login normally first.");  

    const server = "sadeeq-datahub-" + username;  

    const result = await NativeBiometric.isCredentialsSaved({  
        server  
    });  

    if (!result.isSaved)  
        throw new Error("Fingerprint has not been enabled.");  

    await NativeBiometric.verifyIdentity({  
        title: APP_NAME,  
        subtitle: "Fingerprint",  
        description: "Authenticate",  
        reason: "Login with fingerprint"  
    });  

    const credentials = await NativeBiometric.getCredentials({  
        server  
    });  

    const res = await fetch(API + "/api/login", {  

        method: "POST",  

        headers: {  
            "Content-Type": "application/json"  
        },  

        body: JSON.stringify({  

            username: credentials.username,  
            password: credentials.password  

        })  

    });  

    const data = await res.json();  

    if (!res.ok)  
        throw new Error(data.message || "Login failed");

localStorage.setItem("token", data.token);
localStorage.setItem("username", data.user.username);
localStorage.setItem("userId", data.user.id);
localStorage.setItem("email", data.user.email || "");

window.location.href = "dashboard.html";  

} catch (err) {  

    console.error(err);  

    btn.disabled = false;  
    btn.innerHTML = "Login with Fingerprint";  

    showDebug(  
        err.message || "Fingerprint login failed.",  
        true  
    );  

}

}

/* ==========================================
INITIALISE
========================================== */

function initBiometric(){

checkBiometricStatus();

}

if(document.readyState==="loading"){

document.addEventListener(
"DOMContentLoaded",
initBiometric
);

}else{

initBiometric();

}

/* ================= END BIOMETRIC ================= */
/* ================= PURCHASE MODAL ================= */

async function openPurchaseModal(planId, planName, planPrice) {

    selectedPlanId = planId;
    selectedPhone = el("dataPhone")?.value;

    if (!selectedPhone)
        return showMsg("Enter phone number first", "error");

    actionType = "DATA";

    const pinInput = el("pinInput");
    const pinTitle = el("pinModalTitle");
    const pinDetails = el("pinModalDetails");
    const bioBtn = el("biometricPurchaseBtn");

    if (pinInput) pinInput.value = "";

    if (pinTitle)
        pinTitle.innerText = "Confirm Purchase";

    if (pinDetails)
        pinDetails.innerHTML =
            `<strong>${planName}</strong><br>
             ${formatNaira(planPrice)}<br>
             To: ${selectedPhone}`;

    if (
        window.Capacitor?.isNativePlatform?.() &&
        window.Capacitor?.Plugins?.NativeBiometric
    ) {
        if (bioBtn) bioBtn.style.display = "flex";
    } else {
        if (bioBtn) bioBtn.style.display = "none";
    }

    openModal("pinModal");

    setTimeout(() => {
        pinInput?.focus();
    }, 100);
}

/* ================= BUY DATA - WITH SADEEQ RECEIPT ================= */
async function buyData(pin) {
  const phone = selectedPhone || el("dataPhone")?.value;

  if (!phone || !selectedPlanId) return showMsg("Select plan & enter phone", "error");
  if (!pin) return showMsg("Enter PIN", "error");

  showLoader("Purchasing data...");

  try {
    const res = await fetch(API + "/api/buy-data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ phone, plan_id: selectedPlanId, pin })
    });

    const data = await res.json();
    hideLoader();

    if (res.ok && data.success !== false) {
      updateWallet(data.balance);
      fetchTransactions();
      
      // Show SADEEQ receipt
      showReceipt({
        number: data.phone || phone,
        network: data.network || selectedNetwork?.toUpperCase(),
        plan: data.plan_name || selectedPlan?.name,
        amount: data.amount, // use API amount to avoid NaN
        date: data.created_at || new Date().toISOString(),
        txnId: data.reference || data.transaction_id || data.id || 'SQD' + Date.now().toString().slice(-8),
        status: data.status || 'SUCCESS'
      });

      if (el("dataPhone")) el("dataPhone").value = '';
    } else {
      showMsg(data.message || "Purchase failed", "error");
    }
  } catch (err) {
    hideLoader();
    showMsg("Network error. Try again.", "error");
  }
}

/* ================= BUY AIRTIME - WITH SADEEQ RECEIPT ================= */
async function buyAirtime(pin) {
  const phone = selectedPhone || el("airtimePhone")?.value;
  const amount = el("airtimeAmount")?.value;

  if (!phone || !amount || !airtimeNetwork) return showMsg("Fill all fields", "error");
  if (!pin) return showMsg("Enter PIN", "error");

  showLoader("Purchasing airtime...");

  try {
    const res = await fetch(API + "/api/buy-airtime", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ phone, amount, network: airtimeNetwork, pin })
    });

    const data = await res.json();
    hideLoader();

    if (res.ok && data.success !== false) {
      updateWallet(data.balance);
      fetchTransactions();

      // Show SADEEQ receipt
      showReceipt({
        number: data.phone || phone,
        network: data.network || airtimeNetwork?.toUpperCase(),
        plan: 'Airtime Top-up',
        amount: data.amount || amount, // prefer API amount
        date: data.created_at || new Date().toISOString(),
        txnId: data.reference || data.transaction_id || data.id || 'SQD' + Date.now().toString().slice(-8),
        status: data.status || 'SUCCESS'
      });

      if (el("airtimePhone")) el("airtimePhone").value = '';
      if (el("airtimeAmount")) el("airtimeAmount").value = '';
    } else {
      showMsg(data.message || "Purchase failed", "error");
    }
  } catch (err) {
    hideLoader();
    showMsg("Network error. Try again.", "error");
  }
}

/* ================= LOADER - FIXED TO NOT CONFLICT ================= */
function showLoader(text = "Processing...") {
  if (el("loaderText")) el("loaderText").innerText = text;
  openModal("loaderModal");
}
function hideLoader() { 
  closeModal("loaderModal"); 
}

/* ================= KYC MODAL HANDLERS ================= */
function openKycModal() {
  el("kycModal").style.display = "flex";
}

function closeKycModal() {
  el("kycModal").style.display = "none";
  el("idNumberInput").value = '';
  el("idError").style.display = 'none';
}

function initKycListeners() {
  if (!el('idTypeSelect')) return;

  el('idTypeSelect').addEventListener('change', () => {
    const idType = el('idTypeSelect').value;
    el('idNumberInput').placeholder = idType === 'bvn' ? 'Enter 11-digit BVN' : 'Enter 11-digit NIN';
    el('idNumberInput').value = '';
    el('idError').style.display = 'none';
  });

  el('idNumberInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    if (e.target.value.length === 11) el('idError').style.display = 'none';
  });

  el('submitKycBtn').addEventListener('click', submitKycAndGenerate);
}

/* ================= FUND WALLET WITH KYC ================= */
let pendingFundAmount = 0;

function openFundModal() {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Fund Wallet</h3>
      <input id="fundAmount" type="number" placeholder="Minimum ₦100" style="width:100%;padding:10px;margin:12px 0" min="100" />
      <p style="font-size:13px;opacity:0.7;margin-bottom:12px">Fund via PaymentPoint Bank Transfer</p>
      <button onclick="confirmFund()" class="primaryBtn">Generate Account Details</button>
    </div>`;
  openModal("msgModal");
}

async function confirmFund() {
  const amount = Number(el("fundAmount")?.value);
  if (!amount || amount < 100) return showMsg("Minimum funding is ₦100", "error");

  pendingFundAmount = amount;

  showLoader("Checking account...");
  try {
    const res = await fetch(API + "/api/wallet/create-dva", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({})
    });
    const data = await res.json();
    hideLoader();

    console.log('DVA Response:', data);

    // FIXED: Check requireKyc explicitly first
    if (data.requireKyc === true) {
      closeModal('msgModal');
      openKycModal();
      return;
    }

    // Account exists or was just created
    if (res.ok && data.success && (data.account_number || data.account?.account_number)) {
      const acc = data.account_number ? data : data.account;
      showPaymentPointDetails(acc, amount);
    } else {
      showMsg(data.error || data.message || "Failed to generate account", "error");
    }
  } catch (err) {
    hideLoader();
    console.error("DVA Error:", err);
    showMsg("Server error", "error");
  }
}

// Submit from KYC modal
async function submitKycAndGenerate() {
  const idType = el('idTypeSelect').value;
  const idNumber = el('idNumberInput').value;
  const idError = el('idError');

  if (idNumber.length !== 11) {
    idError.textContent = `${idType.toUpperCase()} must be exactly 11 digits`;
    idError.style.display = 'block';
    return;
  }

  const body = {};
  body[idType] = idNumber;

  showLoader("Verifying & generating account...");
  try {
    const res = await fetch(API + "/api/wallet/create-dva", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    hideLoader();

    if (data.success && data.account_number) {
      closeKycModal();
      // If funding flow, show payment details. If DVA generation flow, just refresh.
      if (pendingFundAmount > 0) {
        showPaymentPointDetails(data, pendingFundAmount);
        pendingFundAmount = 0;
      } else {
        showMsg("Account generated successfully!", "success");
      }
      await loadAccount();
    } else if (data.requireKyc === true) {
      // KYC still required - keep modal open
      idError.textContent = data.message || "Verification failed. Check your BVN/NIN";
      idError.style.display = 'block';
    } else {
      idError.textContent = data.error || data.message || "Verification failed";
      idError.style.display = 'block';
    }
  } catch (err) {
    hideLoader();
    idError.textContent = 'Network error. Try again.';
    idError.style.display = 'block';
  }
}

function showPaymentPointDetails(data, amount) {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Bank Transfer Details</h3>
      <p style="opacity:0.8;margin-bottom:15px">Transfer ₦${formatNaira(amount)} to the account below. Your wallet will be credited automatically within 1-2 minutes.</p>

      <div style="background:var(--card-bg);padding:15px;border-radius:12px;margin:15px 0;text-align:left">
        <div style="margin-bottom:10px">
          <small style="opacity:0.6">Bank Name</small>
          <h4 style="margin:5px 0">${data.bank_name}</h4>
        </div>
        <div style="margin-bottom:10px">
          <small style="opacity:0.6">Account Number</small>
          <h4 style="margin:5px 0;font-family:monospace;font-size:18px">
            ${data.account_number}
            <button onclick="copyToClipboard('${data.account_number}')" class="smallBtn" style="float:right">Copy</button>
          </h4>
        </div>
        <div>
          <small style="opacity:0.6">Account Name</small>
          <h4 style="margin:5px 0">${data.account_name}</h4>
        </div>
      </div>

      <small style="color:#ffa000">Reference: ${data.reference || 'N/A'}</small>
      <br><br>
      <button onclick="closeModal('msgModal')" class="secondaryBtn">Done</button>
    </div>`;
  openModal("msgModal");
}

/* ================= DVA GENERATION - CORRECTED ================= */
async function generateDVA() {
  showLoader("Creating your PaymentPoint account...");
  try {
    const res = await fetch(API + "/api/wallet/create-dva", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({})
    });
    const data = await res.json();
    hideLoader();

    console.log('DVA Response:', data);

    // Check requireKyc explicitly - this must come first
    if (data.requireKyc === true) {
      openKycModal();
      return;
    }

    // Success case
    if (res.ok && data.success && data.account_number) {
      showMsg("Virtual account created successfully", "success");
      await loadAccount();
      return;
    }

    // All other errors - show message, don't open modal
    showMsg(data.message || data.error || "Failed to create account", "error");

  } catch (err) {
    hideLoader();
    console.error("DVA Error:", err);
    showMsg("Server error", "error");
  }
}



/* ================= ADMIN: TRANSACTIONS MANAGER ================= */
async function loadAdminTransactions() {
  const status = el("txStatusFilter")?.value || "";
  const search = el("txSearch")?.value || "";
  const list = el("transactionsList");
  if (!list) return;

  list.innerHTML = `<p style="text-align:center;opacity:0.6">Loading transactions...</p>`;
  showLoader("Loading transactions...");
  
  try {
    const token = getToken();
    if (!token) {
      hideLoader();
      list.innerHTML = `<p style="color:red;text-align:center">Not authenticated. Please login again.</p>`;
      return;
    }

    const url = `${API}/admin/wallet/transactions?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&t=${Date.now()}`;
    console.log("[ADMIN TX] Fetching:", url);
    
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    hideLoader();

    const transactions = Array.isArray(data) ? data : [];
    console.log("[ADMIN TX] Loaded:", transactions.length, "transactions");
    
    list.innerHTML = "";
    if (!transactions.length) {
      list.innerHTML = `<p style="text-align:center;opacity:0.6">No transactions found</p>`;
      return;
    }

    transactions.forEach(tx => {
      const isManual = tx.metadata?.manual_approved || tx.metadata?.manual_deducted;
      const isReversed = tx.status === 'REVERSED' || tx.metadata?.reversed;
      const isFailed = tx.status === 'FAILED';
      const isPending = tx.status === 'PENDING';
      const isSuccess = tx.status === 'SUCCESS';
      
      // Status color da label
      let statusColor = "#ff4d4d";
      let statusLabel = tx.status;
      
      if (isSuccess) {
        statusColor = "#00c853";
      } else if (isFailed) {
        statusColor = "#ff6b00";
        statusLabel = "FAILED";
      } else if (isPending) {
        statusColor = "#ffa000";
        statusLabel = "PENDING";
      } else if (isReversed) {
        statusColor = "#ff4d4d";
        statusLabel = "REVERSED";
      }
      
      if (isManual) {
        statusColor = "#2196f3";
        statusLabel = "MANUAL APPROVED";
      }

      // Type display
      const displayType = tx.display_type || (tx.type === 'WALLET_FUND' || tx.type === 'REFUND' ? 'CREDIT' : 'DEBIT');
      const typeColor = tx.display_color || (displayType === 'CREDIT' ? "#00c853" : "#ff4d4d");

      const wasManual = isManual ? '<span class="badge badgeInfo">MANUAL</span>' : '';
      const wasReversed = isReversed ? '<span class="badge badgeDanger">REVERSED</span>' : '';
      const isFailBadge = isFailed ? '<span class="badge badgeWarning">FAILED</span>' : '';
      const isPendingBadge = isPending ? '<span class="badge badgeWarning">PENDING</span>' : '';

      // Response message display
      const responseMsgHtml = tx.response_msg ? 
        `<div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:4px;font-size:12px">
          <strong>Provider Response:</strong> ${tx.response_msg}
        </div>` : '';

      // API response preview - don debug
      const apiResponseHtml = tx.api_response && isFailed ? 
        `<details style="margin-top:8px;font-size:11px">
          <summary style="cursor:pointer;opacity:0.7">View API Response</summary>
          <pre style="background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto;margin-top:4px">${JSON.stringify(tx.api_response, null, 2)}</pre>
        </details>` : '';

      list.innerHTML += `
        <div class="transactionCard">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <div style="flex:1">
              <strong>${tx.type || 'Transaction'} - ${tx.plan_name || tx.network || ''}</strong> 
              ${wasManual} ${wasReversed} ${isFailBadge} ${isPendingBadge}<br>
              <small style="opacity:0.7">${tx.username || 'N/A'} - ${tx.email || 'N/A'}</small><br>
              <small style="font-family:monospace">${tx.reference || 'N/A'}</small><br>
              ${tx.phone ? `<small style="opacity:0.7">Phone: ${tx.phone}</small><br>` : ''}
              ${tx.provider ? `<small style="opacity:0.7">Provider: ${tx.provider}</small>` : ''}
            </div>
            <div style="text-align:right">
              <strong style="font-size:18px;color:${typeColor}">${displayType === 'CREDIT' ? '+' : '-'}${formatNaira(tx.amount || 0)}</strong><br>
              <span style="color:${statusColor};font-weight:600">${statusLabel}</span><br>
              <small style="opacity:0.6">${formatDate(tx.created_at)}</small>
              ${tx.updated_at !== tx.created_at ? `<br><small style="opacity:0.5">Updated: ${formatDate(tx.updated_at)}</small>` : ''}
            </div>
          </div>

          ${responseMsgHtml}
          ${apiResponseHtml}

          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            ${isFailed && !isManual ?
              `<button onclick="forceDeductTransaction('${tx.reference}', ${tx.amount}, '${tx.username}')" class="warningBtn">Confirm Delivered</button>` : ''}

            ${isSuccess && !isReversed ?
              `<button onclick="reverseTransaction('${tx.reference}')" class="dangerBtn">Reverse/Refund</button>` : ''}

            ${isPending ?
              `<button onclick="checkTransactionStatus('${tx.reference}')" class="infoBtn">Check Status</button>` : ''}
          </div>
        </div>`;
    });
  } catch (e) {
    hideLoader();
    console.error("Load transactions error:", e);
    el("transactionsList").innerHTML = `<p style="color:red;text-align:center">Failed to load transactions: ${e.message}</p>`;
  }
}

async function forceDeductTransaction(reference, amount, username) {
  const reason = prompt(`Confirm delivery for ${username}?\n\nAmount: ₦${formatNaira(amount)}\nReference: ${reference}\n\nEnter reason for manual approval:`, "Confirmed from provider - delivered");
  if (!reason) return;

  if (!confirm(`Confirm: Mark this transaction as SUCCESS and re-deduct ₦${formatNaira(amount)} from user wallet?\n\nThis means the service was actually delivered despite provider saying failed.`)) return;

  showLoader("Processing manual approval...");
  try {
    const res = await fetch(API + "/admin/wallet/force-deduct", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ reference, reason })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminTransactions();
      loadAdminUsers();
    }
  } catch (e) {
    hideLoader();
    console.error("Force deduct error:", e);
    showMsg("Server error", "error");
  }
}

async function reverseTransaction(reference) {
  const reason = prompt("Enter reason for reversal:", "Customer complaint - service not received");
  if (!reason) return;

  if (!confirm(`Confirm reversal of transaction ${reference}? User wallet will be refunded.`)) return;

  showLoader("Processing reversal...");
  try {
    const res = await fetch(API + "/admin/wallet/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ reference, reason })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminTransactions();
      loadAdminUsers();
    }
  } catch (e) {
    hideLoader();
    console.error("Reverse transaction error:", e);
    showMsg("Server error", "error");
  }
}

async function checkTransactionStatus(reference) {
  showMsg("Checking with provider...", "info");
  // Zaka iya saka endpoint na checking anan daga baya
  showMsg("Please check provider dashboard manually for now", "info");
}

/* ================= ADMIN: USERS MANAGER ================= */
async function loadAdminUsers() {
  const search = el("userSearch")?.value || "";
  try {
    const res = await fetch(`${API}/admin/users?search=${encodeURIComponent(search)}`, {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to load users");
    const users = await res.json();
    const list = el("adminUsersList");
    if (list) {
      list.innerHTML = "";
      if (!users.length) {
        list.innerHTML = `<p style="text-align:center;opacity:0.6">No users found</p>`;
        return;
      }
      users.forEach(u => {
        const tierColor = u.user_tier === 'top'? '#00c853' : u.user_tier === 'regular'? '#ffa000' : '#888';
        const tierBadge = `<span style="color:${tierColor};font-weight:bold">${u.user_tier.toUpperCase()}</span>`;
        list.innerHTML += `<div class="userCard">
          <strong>${u.username}</strong> - ${u.email} ${tierBadge}<br>
          Wallet: ${formatNaira(u.wallet_balance)} | Phone: ${u.phone || 'N/A'}<br>
          <select onchange="setUserTier(${u.id}, this.value)" class="tierSelect">
            <option value="default" ${u.user_tier === 'default'? 'selected' : ''}>Default</option>
            <option value="regular" ${u.user_tier === 'regular'? 'selected' : ''}>Regular</option>
            <option value="top" ${u.user_tier === 'top'? 'selected' : ''}>Top</option>
          </select>
        </div>`;
      });
    }
  } catch(e) {
    console.error("Load users error:", e);
    showMsg("Failed to load users", "error");
  }
}

async function setUserTier(id, tier) {
  showLoader("Updating tier...");
  try {
    const res = await fetch(`${API}/admin/users/set-tier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ user_id: id, tier })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message || "Tier updated", res.ok? "success" : "error");
    if (res.ok) {
      loadAdminUsers(); // Refresh users list
      broadcastTopUserUpdate(currentUser.company);
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}
/* ================= ADMIN: PLANS MANAGER ================= */
async function loadAdminPlans() {
  try {
    const res = await fetch(API + "/admin/plans", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const plans = await res.json();
    cachedAdminPlans = plans;
    const list = el("adminPlansList");
    if (list) {
      list.innerHTML = "";
      plans.forEach(p => {
        const statusColor = p.is_active ? "#00c853" : "#ff4d4d";
        const restrictBadge = p.restricted ? `<span class="badge badgeWarning">RESTRICTED</span>` : '';
        const providerBadge = p.provider ? `<span class="badge">${p.provider.toUpperCase()}</span>` : '';
        
        const defaultDisplay = p.default_price != null && p.default_price !== '' ? formatNaira(p.default_price) : formatNaira(p.price);
        const regularDisplay = p.regular_price != null && p.regular_price !== '' ? formatNaira(p.regular_price) : '-';
        const topDisplay = p.top_price != null && p.top_price !== '' ? formatNaira(p.top_price) : '-';
        
        list.innerHTML += `<div class="planCard">
          <strong>${p.name}</strong> - ${p.network} ${restrictBadge} ${providerBadge}<br>
          Default: ${defaultDisplay} | Regular: ${regularDisplay} | Top: ${topDisplay} | Cost: ${formatNaira(p.cost)}<br>
          Provider: ${p.provider || 'N/A'} | Net ID: ${p.network_id || 'N/A'} | API ID: ${p.api_plan_id || 'N/A'}<br>
          <span style="color:${statusColor}">${p.is_active ? 'Active' : 'Disabled'}</span>
          <button onclick="editPlan(${p.id})" class="primaryBtn">Edit</button>
          <button onclick="togglePlan(${p.id}, ${!p.is_active})" class="dangerBtn">${p.is_active ? 'Disable' : 'Enable'}</button>
        </div>`;
      });
    }
  } catch(e) {
    console.error("Load admin plans error:", e);
  }
}

async function addPlan() {
  const plan = {
    plan_id: el("newPlanId")?.value,
    network: el("newPlanNetwork")?.value,
    name: el("newPlanName")?.value,
    price: el("newPlanPrice")?.value,
    default_price: el("newPlanDefaultPrice")?.value || null,
    regular_price: el("newPlanRegularPrice")?.value || null,
    top_price: el("newPlanTopPrice")?.value || null,
    cost: el("newPlanCost")?.value,
    validity: el("newPlanValidity")?.value,
    restricted: el("newPlanRestricted")?.checked,
    provider: el("newPlanProvider")?.value,
    network_id: el("newPlanNetworkId")?.value,
    api_plan_id: el("newPlanApiId")?.value
  };

  if (!plan.plan_id || !plan.network || !plan.name || !plan.price || !plan.cost || !plan.provider || !plan.network_id || !plan.api_plan_id) {
    return showMsg("Fill all required fields including provider details", "error");
  }

  showLoader("Adding plan...");
  try {
    const res = await fetch(API + "/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(plan)
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminPlans();
      loadPlans();
      broadcastTopUserUpdate(currentUser.company);
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

async function togglePlan(id, is_active) {
  showLoader("Updating...");
  try {
    const res = await fetch(`${API}/admin/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ is_active })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminPlans();
      loadPlans();
      broadcastTopUserUpdate(currentUser.company);
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

async function editPlan(id) {
  const plan = cachedAdminPlans.find(p => p.id === id);
  if (!plan) return showMsg("Plan not found", "error");

  editingPlanId = id;

  if (el("editPlanName")) el("editPlanName").value = plan.name || "";
  if (el("editPlanPrice")) el("editPlanPrice").value = plan.price || "";
  if (el("editPlanDefaultPrice")) el("editPlanDefaultPrice").value = plan.default_price || "";
  if (el("editPlanRegularPrice")) el("editPlanRegularPrice").value = plan.regular_price || "";
  if (el("editPlanTopPrice")) el("editPlanTopPrice").value = plan.top_price || "";
  if (el("editPlanCost")) el("editPlanCost").value = plan.cost || "";
  if (el("editPlanValidity")) el("editPlanValidity").value = plan.validity || "";
  if (el("editPlanRestricted")) el("editPlanRestricted").checked = plan.restricted || false;
  if (el("editPlanProvider")) el("editPlanProvider").value = plan.provider || "";
  if (el("editPlanNetworkId")) el("editPlanNetworkId").value = plan.network_id || "";
  if (el("editPlanApiId")) el("editPlanApiId").value = plan.api_plan_id || "";
  if (el("editPlanActive")) el("editPlanActive").checked = plan.is_active !== false;

  openModal("editPlanModal");
}

async function savePlanEdit() {
  if (!editingPlanId) return;

  const updated = {
    name: el("editPlanName")?.value,
    price: el("editPlanPrice")?.value,
    default_price: el("editPlanDefaultPrice")?.value || null,
    regular_price: el("editPlanRegularPrice")?.value || null,
    top_price: el("editPlanTopPrice")?.value || null,
    cost: el("editPlanCost")?.value,
    validity: el("editPlanValidity")?.value,
    restricted: el("editPlanRestricted")?.checked,
    provider: el("editPlanProvider")?.value,
    network_id: el("editPlanNetworkId")?.value,
    api_plan_id: el("editPlanApiId")?.value,
    is_active: el("editPlanActive")?.checked
  };

  if (!updated.name || !updated.price || !updated.cost || !updated.provider || !updated.network_id || !updated.api_plan_id) {
    return showMsg("Name, Price, Cost, Provider, Network ID and API Plan ID are required", "error");
  }

  showLoader("Updating plan...");
  try {
    const res = await fetch(`${API}/admin/plans/${editingPlanId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(updated)
    });
    const data = await res.json();
    hideLoader();
    closeModal("editPlanModal");
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminPlans();
      loadPlans();
      broadcastTopUserUpdate(currentUser.company);
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}


/* ================= ACCOUNT ================= */
async function loadAccount() {
  const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
  const user = await res.json();

  if (el("bankName")) el("bankName").innerText = user.bank_name || "N/A";
  if (el("accountNumber")) el("accountNumber").innerText = user.account_number || "N/A";
  if (el("accountName")) el("accountName").innerText = user.account_name || "N/A";

  if (!user.account_number && el("generateAccountBtn")) {
    el("generateAccountBtn").style.display = "block";
  }

  updateWallet(user.wallet_balance);
}

async function generateAccount() {
  showLoader("Creating your PaymentPoint account...");
  try {
    const res = await fetch(API + "/api/wallet/create-dva", {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json();
    hideLoader();
    
    if (res.ok && (data.success || data.account_number)) {
      showMsg("Virtual account created successfully", "success");
      if (el("generateAccountBtn")) el("generateAccountBtn").style.display = "none";
      await loadAccount();
    } else {
      showMsg(data.message || data.error || "Failed to create account", "error");
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= BROADCAST ================= */
function broadcastTopUserUpdate(company) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'tier_update',
      company: company
    }));
  }
}

/* ================= PASSWORD & PIN ================= */
async function submitPassword() {
  const oldPass = el("oldPassword").value;
  const newPass = el("newPassword").value;
  if (!oldPass ||!newPass) return showMsg("Fill fields", "error");

  showLoader("Updating...");
  const res = await fetch(API + "/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify({ oldPass, newPass })
  });
  const data = await res.json();
  hideLoader();
  showMsg(data.message, res.ok ? "success" : "error");
}

async function submitPin() {
  const oldPin = el("oldPin").value;
  const newPin = el("newPin").value;
  const confirmPin = el("confirmPin").value;
  
  if (!oldPin || !newPin || !confirmPin) return showMsg("Fill all fields", "error");
  if (newPin !== confirmPin) return showMsg("PINs do not match", "error");
  if (newPin.length !== 4 || isNaN(newPin)) return showMsg("PIN must be 4 digits", "error");

  showLoader("Updating...");
  const res = await fetch(API + "/api/change-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify({ oldPin, newPin })
  });
  const data = await res.json();
  hideLoader();
  showMsg(data.message, res.ok ? "success" : "error");
  
  if(res.ok) {
    el("oldPin").value = "";
    el("newPin").value = "";
    el("confirmPin").value = "";
    closeModal('pinModalBox');
  }
}

/* ================= FORGOT PIN ================= */
async function forgotPin() {
  const password = prompt("Enter your login password to reset PIN:");
  if (!password) return;

  const newPin = prompt("Enter new 4-digit PIN:");
  if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
    return showMsg("PIN must be 4 digits", "error");
  }

  const confirmPin = prompt("Confirm new PIN:");
  if (newPin !== confirmPin) {
    return showMsg("PINs do not match", "error");
  }

  showLoader("Resetting PIN...");
  const res = await fetch(API + "/api/reset-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify({ password, newPin })
  });
  const data = await res.json();
  hideLoader();
  showMsg(data.message, res.ok ? "success" : "error");
  
  if(res.ok) closeModal('pinModalBox');
}



/* ================= ADMIN DATA LOADER ================= */
function loadAdminData() {
  loadWithdrawals();
  loadAdminPlans();
  loadAdminUsers();
}

/* ================= MODAL ================= */
function openModal(id) { el(id).style.display = "flex"; }
function closeModal(id) { el(id).style.display = "none"; }

/* ================= WS ================= */
function connectWebSocket() {
  const wsURL = API.replace("https", "wss");
  ws = new WebSocket(wsURL + "?token=" + getToken());
  ws.onmessage = msg => {
    const data = JSON.parse(msg.data);
    if (data.type === "wallet_update") updateWallet(data.balance);
  };
  ws.onerror = () => console.log("WS error");
  ws.onclose = () => setTimeout(connectWebSocket, 5000);
}

/* ================= LOGOUT ================= */
function logout() {
    if (typeof ws !== "undefined" && ws) {
        ws.close();
    }

    // Remove only session data
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("email");
    localStorage.removeItem("biometric_password");

    // Keep:
    // username
    // biometric_enabled

    window.location.href = "login.html";
}
// Disable all admin functions in app
if(isApp) {
  window.loadAdminTransactions = () => console.log("Admin disabled in app");
  window.loadAdminUsers = () => console.log("Admin disabled in app");
  window.loadAdminPlans = () => console.log("Admin disabled in app");
  window.addPlan = () => {};
  window.editPlan = () => {};
  window.reverseTransaction = () => {};
  window.forceDeductTransaction = () => {};
}

/* ================= START ================= */
document.addEventListener("DOMContentLoaded", loadDashboard);