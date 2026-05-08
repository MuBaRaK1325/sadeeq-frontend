const API = "https://mayconnect-backend-1.onrender.com"; // One backend for all companies

let cachedPlans = [];
let cachedAdminPlans = [];
let currentUser = null;
let ws = null;

let selectedNetwork = null;
let selectedPlan = null;
let airtimeNetwork = null;
let actionType = null;
let editingPlanId = null;
let selectedPlanId = null;
let selectedPhone = null;

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
  el("msgBox").innerHTML = `<p style="text-align:center">${text}</p>`;
  openModal("msgModal");
}
function hideLoader() { closeModal("msgModal"); }

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

  try {
    const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
    if (!res.ok) throw new Error("Failed to fetch user - " + res.status);
    const contentType = res.headers.get("content-type");
    if (!contentType ||!contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    currentUser = await res.json();
    window.CURRENT_USER_ID = currentUser.id;
    console.log("Current user tier:", currentUser.user_tier);
  } catch (e) {
    console.error("Load user error:", e);
    logout();
    return;
  }

  if (el("usernameDisplay")) el("usernameDisplay").innerText = "Hello " + currentUser.username;
  if (el("companyBadge")) el("companyBadge").innerText = currentUser.company.toUpperCase();

  if (currentUser && currentUser.is_admin === true) {
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
}

/* ================= NAV ================= */
function initNavigation() {
  document.querySelectorAll(".section").forEach(s => s.style.display = "none");
  el("home").style.display = "block";
}

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.style.display = "none");
  el(id).style.display = "block";
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

  // --- FIX: RENDER DVA BASED ON COMPANY ---
  const dvaContainer = el("dvaContainer");
  if (dvaContainer) {
    if (dva.accountNumber && ["mayconnect", "Teeversh", "bnhabeeb"].includes(currentUser.company)) {
      // Monnify DVA for these 3 companies
      dvaContainer.innerHTML = `
        <div class="walletCard">
          <h4>Monnify Virtual Account</h4>
          <p><strong>Bank:</strong> ${dva.bankName || 'N/A'}</p>
          <p><strong>Account Number:</strong> ${dva.accountNumber} 
            <button onclick="copyToClipboard('${dva.accountNumber}')" class="smallBtn">Copy</button>
          </p>
          <p><strong>Account Name:</strong> ${dva.accountName || user.username}</p>
          <small style="opacity:0.7">Transfer to this account to fund your wallet instantly</small>
        </div>`;
    } else if (dva.accountNumber && currentUser.company === "sadeeq") {
      // Flutterwave DVA for Sadeeq
      dvaContainer.innerHTML = `
        <div class="walletCard">
          <h4>Flutterwave Virtual Account</h4>
          <p><strong>Bank:</strong> ${dva.bankName || 'N/A'}</p>
          <p><strong>Account Number:</strong> ${dva.accountNumber}
            <button onclick="copyToClipboard('${dva.accountNumber}')" class="smallBtn">Copy</button>
          </p>
          <p><strong>Account Name:</strong> ${dva.accountName || user.username}</p>
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

      list.innerHTML += `
        <div class="transactionCard">
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
  }
}

// New function to generate Monnify/Flutterwave DVA
async function generateDVA() {
  showLoader("Creating your dedicated account...");
  try {
    const endpoint = currentUser.company === "sadeeq" ? "/api/flutterwave/create-dva" : "/api/monnify/create-dva";
    const res = await fetch(API + endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) await loadWallet();
  } catch {
    hideLoader();
    showMsg("Server error", "error");
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
      tx.slice(0, 5).forEach(t => el("transactionHistory").appendChild(txCard(t)));
    }

    if (el("allTransactions")) {
      el("allTransactions").innerHTML = "";
      tx.forEach(t => el("allTransactions").appendChild(txCard(t)));
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
    ${t.phone || t.network || ""}<br>
    <span style="color:${statusColor}">${t.status}</span>
    <small style="float:right">${formatDate(t.created_at)}</small>`;
  return div;
}

/* ================= PLANS ================= */
async function loadPlans() {
  try {
    const res = await fetch(API + "/api/plans", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to fetch plans - " + res.status);
    const contentType = res.headers.get("content-type");
    if (!contentType ||!contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    const data = await res.json();
    cachedPlans = Array.isArray(data)? data : [];
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
  renderPlans();
}

function selectAirtimeNetwork(network, element) {
  airtimeNetwork = network;
  document.querySelectorAll(".airtimeNet").forEach(n => n.classList.remove("active"));
  if (element) element.classList.add("active");
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

  const filtered = cachedPlans.filter(p => (p.network || "").toLowerCase() === selectedNetwork && p.is_active!== false);

  if (!filtered.length) {
    list.innerHTML = "<p>No plans available for this network</p>";
    return;
  }

  const tier = currentUser?.user_tier || 'default';
  console.log("Rendering plans for tier:", tier);

  filtered.forEach(p => {
    const div = document.createElement("div");
    div.className = "planItem";

    const priceDisplay = getPlanPrice(p);
    let badge = "";

    if (tier === 'top') {
      badge = `<span class="topUserBadge">TOP</span>`;
    } else if (tier === 'regular' && p.regular_price) {
      badge = `<span class="regularUserBadge" style="position:absolute;top:8px;right:8px;background:#ffa000;padding:2px 6px;border-radius:4px;font-size:10px;">REGULAR</span>`;
    }

    div.innerHTML = `
      <strong>${p.name}</strong> ${badge}<br>
      ${p.validity || ""}<br>
      <strong>${formatNaira(priceDisplay)}</strong>
    `;

    div.onclick = () => {
      selectedPlan = {...p, price: priceDisplay };
      openPurchaseModal(p.id, p.name, priceDisplay);
    };

    list.appendChild(div);
  });
}

/* ================= BIOMETRIC STATUS ================= */
async function checkBiometricStatus() {
  const elStatus = el("biometricStatus");
  const enableBtn = el("enableBiometricBtn");
  const loginBtn = el("biometricLoginBtn");
  if (!elStatus) return;

  if (!window.isSecureContext) {
    elStatus.innerText = "Status: HTTPS required for biometric";
    elStatus.style.color = "var(--warning)";
    if (enableBtn) enableBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "none";
    return;
  }

  if (!window.PublicKeyCredential) {
    elStatus.innerText = "Status: Not supported on this device/browser";
    elStatus.style.color = "var(--danger)";
    if (enableBtn) enableBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "none";
    return;
  }

  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      elStatus.innerText = "Status: No fingerprint/passkey enrolled on device";
      elStatus.style.color = "var(--warning)";
      if (enableBtn) enableBtn.style.display = "none";
      if (loginBtn) loginBtn.style.display = "none";
      return;
    }

    // Safe fetch with content-type check
    const res = await fetch(API + '/api/auth/webauthn/check-enabled', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });

    if (!res.ok) {
      throw new Error("Server error " + res.status);
    }

    const contentType = res.headers.get("content-type");
    if (!contentType ||!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Non-JSON response from check-enabled:", text);
      throw new Error("Server returned HTML instead of JSON");
    }

    const data = await res.json();

    if (data.enabled) {
      elStatus.innerText = "Status: Enabled ✓";
      elStatus.style.color = "var(--success)";
      if (enableBtn) enableBtn.style.display = "none";
      if (loginBtn) loginBtn.style.display = "inline-block";
    } else {
      elStatus.innerText = "Status: Available - click to enable";
      elStatus.style.color = "var(--warning)";
      if (enableBtn) enableBtn.style.display = "block";
      if (loginBtn) loginBtn.style.display = "none";
    }
  } catch (e) {
    elStatus.innerText = "Status: Check failed - " + e.message;
    elStatus.style.color = "var(--danger)";
    console.error("Biometric check error:", e);
    if (enableBtn) enableBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "none";
  }
}

/* ================= WEBAUTHN ================= */
async function enableBiometric() {
  if (!window.PublicKeyCredential) {
    return showMsg('Biometric not supported on this device/browser', 'error');
  }

  try {
    const startRes = await fetch(API + '/api/auth/webauthn/register-start', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });

    if (!startRes.ok) throw new Error("Failed to start registration - " + startRes.status);
    const start = await startRes.json();
    if (start.error) throw new Error(start.error);

    const options = {
   ...start,
      challenge: bufferDecode(start.challenge),
      user: {...start.user, id: bufferDecode(start.user.id) }
    };

    if (options.excludeCredentials && options.excludeCredentials.length > 0) {
      options.excludeCredentials = options.excludeCredentials.map(cred => ({
    ...cred,
        id: bufferDecode(cred.id)
      }));
    } else {
      delete options.excludeCredentials;
    }

    const cred = await navigator.credentials.create({
      publicKey: options,
      signal: AbortSignal.timeout(60000)
    });

    showLoader('Saving credential...');

    const credential = {
      id: cred.id,
      rawId: bufferEncode(cred.rawId),
      response: {
        attestationObject: bufferEncode(cred.response.attestationObject),
        clientDataJSON: bufferEncode(cred.response.clientDataJSON)
      },
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults()
    };

    const finishRes = await fetch(API + '/api/auth/webauthn/register-finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify(credential)
    });

    if (!finishRes.ok) throw new Error("Failed to finish registration - " + finishRes.status);
    const finish = await finishRes.json();

    hideLoader();
    if (finish.verified) {
      showMsg('Fingerprint enabled successfully!', 'success');
      checkBiometricStatus();
    } else {
      showMsg('Failed: ' + (finish.error || 'Unknown'), 'error');
    }
  } catch (e) {
    hideLoader();
    if (e.name === 'NotAllowedError') {
      showMsg('Biometric cancelled or timed out', 'error');
    } else if (e.name === 'InvalidStateError') {
      showMsg('Biometric already enabled. Clear site data first.', 'error');
    } else {
      showMsg('Error: ' + e.message, 'error');
    }
  }
}

async function loginWithBiometric() {
  showInputModal('Biometric Login', 'Enter your email', async (email) => {
    try {
      showLoader('Starting biometric login...');
      const startRes = await fetch(API + '/api/auth/webauthn/login-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!startRes.ok) throw new Error("Failed to start login - " + startRes.status);
      const start = await startRes.json();
      if (start.error) throw new Error(start.error);

      hideLoader();
      showLoader('Touch fingerprint sensor...');

      const options = {
    ...start,
        challenge: bufferDecode(start.challenge),
        allowCredentials: start.allowCredentials.map(cred => ({
      ...cred,
          id: bufferDecode(cred.id)
        }))
      };

      const assertion = await navigator.credentials.get({
        publicKey: options,
        signal: AbortSignal.timeout(60000)
      });

      showLoader('Verifying...');

      const credential = {
        id: assertion.id,
        rawId: bufferEncode(assertion.rawId),
        response: {
          authenticatorData: bufferEncode(assertion.response.authenticatorData),
          clientDataJSON: bufferEncode(assertion.response.clientDataJSON),
          signature: bufferEncode(assertion.response.signature),
          userHandle: assertion.response.userHandle? bufferEncode(assertion.response.userHandle) : null
        },
        type: assertion.type,
        clientExtensionResults: assertion.getClientExtensionResults()
      };

      const finishRes = await fetch(API + '/api/auth/webauthn/login-finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...credential, email })
      });

      if (!finishRes.ok) throw new Error("Failed to finish login - " + finishRes.status);
      const finish = await finishRes.json();

      hideLoader();
      if (finish.token) {
        localStorage.setItem('token', finish.token);
        location.reload();
      } else {
        showMsg('Biometric login failed: ' + (finish.error || 'Unknown'), 'error');
      }
    } catch (e) {
      hideLoader();
      if (e.name === 'NotAllowedError') {
        showMsg('Biometric cancelled or timed out', 'error');
      } else {
        showMsg('Biometric error: ' + e.message, 'error');
      }
    }
  });
}
/* ================= PURCHASE MODAL ================= */
async function openPurchaseModal(planId, planName, planPrice) {
  selectedPlanId = planId;
  selectedPhone = el('dataPhone')?.value;

  if (!selectedPhone) return showMsg('Enter phone number first', 'error');

  actionType = "DATA";
  const pinInput = el('pinInput');
  const pinTitle = el('pinModalTitle');
  const pinDetails = el('pinModalDetails');
  const bioBtn = el('biometricPurchaseBtn');

  if (pinInput) pinInput.value = '';
  if (pinTitle) pinTitle.innerText = 'Confirm Purchase';
  if (pinDetails) pinDetails.innerHTML = `<strong>${planName}</strong><br>${formatNaira(planPrice)}<br>To: ${selectedPhone}`;

  try {
    const res = await fetch(API + '/api/auth/webauthn/check-enabled', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await res.json();
    if (bioBtn) bioBtn.style.display = data.enabled? 'inline-block' : 'none';
  } catch (e) {
    console.log('Biometric check failed:', e);
  }

  openModal('pinModal');
  setTimeout(() => el('pinInput')?.focus(), 100);
}

function openAirtimePin() {
  const phone = el("airtimePhone").value;
  const amount = el("airtimeAmount").value;
  if (!phone ||!amount ||!airtimeNetwork) return showMsg("Fill all fields", "error");

  selectedPhone = phone;
  actionType = "AIRTIME";
  const pinInput = el('pinInput');
  const pinTitle = el('pinModalTitle');
  const pinDetails = el('pinModalDetails');

  if (pinInput) pinInput.value = '';
  if (pinTitle) pinTitle.innerText = 'Confirm Airtime';
  if (pinDetails) pinDetails.innerHTML = `<strong>${airtimeNetwork.toUpperCase()} Airtime</strong><br>${formatNaira(amount)}<br>To: ${phone}`;

  fetch(API + '/api/auth/webauthn/check-enabled', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  }).then(r => r.json()).then(data => {
    const bioBtn = el('biometricPurchaseBtn');
    if (bioBtn) bioBtn.style.display = data.enabled? 'inline-block' : 'none';
  }).catch(() => {});

  openModal('pinModal');
  setTimeout(() => el('pinInput')?.focus(), 100);
}

function confirmPurchase() {
  const pin = el('pinInput')?.value;
  if (!pin) return showMsg('Enter PIN', 'error');
  closeModal('pinModal');

  if (actionType === "DATA") buyData(pin);
  if (actionType === "AIRTIME") buyAirtime(pin);
}

async function purchaseWithBiometric() {
  if (!selectedPhone) return showMsg('Enter phone number first', 'error');

  try {
    closeModal('pinModal');
    showLoader('Verify fingerprint...');

    const start = await fetch(API + '/api/auth/webauthn/verify-purchase', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    }).then(r => r.json());

    hideLoader();

    start.challenge = bufferDecode(start.challenge);
    start.allowCredentials = start.allowCredentials.map(cred => ({
    ...cred,
      id: bufferDecode(cred.id)
    }));

    const assertion = await navigator.credentials.get({ publicKey: start });

    const credential = {
      id: assertion.id,
      rawId: bufferEncode(assertion.rawId),
      response: {
        authenticatorData: bufferEncode(assertion.response.authenticatorData),
        clientDataJSON: bufferEncode(assertion.response.clientDataJSON),
        signature: bufferEncode(assertion.response.signature),
        userHandle: assertion.response.userHandle? bufferEncode(assertion.response.userHandle) : null
      },
      type: assertion.type
    };

    showLoader('Verifying...');
    const verify = await fetch(API + '/api/auth/webauthn/verify-purchase-finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify(credential)
    }).then(r => r.json());

    hideLoader();
    if (!verify.verified) return showMsg('Fingerprint verification failed', 'error');

    if (actionType === "DATA") buyData('biometric_verified');
    if (actionType === "AIRTIME") buyAirtime('biometric_verified');

  } catch (e) {
    hideLoader();
    if (e.name === 'NotAllowedError') {
      showMsg('Fingerprint cancelled', 'error');
    } else {
      showMsg('Error: ' + e.message, 'error');
    }
  }
}

/* ================= BUY DATA - WITH SADEEQ RECEIPT ================= */
async function buyData(pin) {
  const phone = selectedPhone || el("dataPhone")?.value;

  if (!phone ||!selectedPlanId) return showMsg("Select plan & enter phone", "error");
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

    if (res.ok && data.success!== false) {
      updateWallet(data.balance);
      fetchTransactions();
      
      // Show SADEEQ receipt
      showReceipt({
        company: 'Sadeeq',
        reference: data.reference || data.transaction_id || 'TXN' + Date.now(),
        created_at: data.created_at || new Date().toISOString(),
        type: 'Data',
        network: selectedNetwork?.toUpperCase(),
        phone: phone,
        plan_name: selectedPlan?.name,
        amount: selectedPlan?.price,
        status: data.status || 'SUCCESS',
        balance_after: data.balance
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

  if (!phone ||!amount ||!airtimeNetwork) return showMsg("Fill all fields", "error");
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

    if (res.ok && data.success!== false) {
      updateWallet(data.balance);
      fetchTransactions();

      // Show SADEEQ receipt
      showReceipt({
        company: 'Sadeeq',
        reference: data.reference || data.transaction_id || 'TXN' + Date.now(),
        created_at: data.created_at || new Date().toISOString(),
        type: 'Airtime',
        network: airtimeNetwork?.toUpperCase(),
        phone: phone,
        plan_name: 'Airtime Top-up',
        amount: amount,
        status: data.status || 'SUCCESS',
        balance_after: data.balance
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

/* ================= FUND ================= */
function openFundModal() {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Fund Wallet</h3>
      <input id="fundAmount" type="number" placeholder="Minimum ₦100" style="width:100%;padding:10px;margin:12px 0" min="100" />
      <p style="font-size:13px;opacity:0.7;margin-bottom:12px">Payment via ${currentUser.company === 'sadeeq'? 'Flutterwave' : 'Monnify Bank Transfer'}</p>
      <button onclick="confirmFund()" class="primaryBtn">Continue to Payment</button>
    </div>`;
  openModal("msgModal");
}

async function confirmFund() {
  const amount = Number(el("fundAmount")?.value);
  if (!amount || amount < 100) return showMsg("Minimum funding is ₦100", "error");

  showLoader("Initializing payment...");
  try {
    const res = await fetch(API + "/api/fund/init", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    hideLoader();

    if (data.url) {
      // Flutterwave for Sadeeq
      window.location.href = data.url;
    } else if (data.account_number) {
      // Monnify for Mayconnect/BnHabeeb/Teeversh
      showMonnifyDetails(data, amount);
    } else {
      showMsg(data.message || "Payment failed", "error");
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

function showMonnifyDetails(data, amount) {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Bank Transfer Details</h3>
      <p style="opacity:0.8;margin-bottom:15px">Transfer ₦${formatNaira(amount)} to the account below. Your wallet will be credited automatically.</p>

      <div style="background:var(--card-bg);padding:15px;border-radius:12px;margin:15px 0;text-align:left">
        <div style="margin-bottom:10px">
          <small style="opacity:0.6">Bank Name</small>
          <h4 style="margin:5px 0">${data.bank_name}</h4>
        </div>
        <div style="margin-bottom:10px">
          <small style="opacity:0.6">Account Number</small>
          <h4 style="margin:5px 0;font-family:monospace;font-size:18px">${data.account_number}</h4>
        </div>
        <div>
          <small style="opacity:0.6">Account Name</small>
          <h4 style="margin:5px 0">${data.account_name}</h4>
        </div>
      </div>

      <small style="color:#ffa000">Reference: ${data.reference}</small>
      <br><br>
      <button onclick="closeModal('msgModal')" class="secondaryBtn">I have made the transfer</button>
    </div>`;
  openModal("msgModal");
}

/* ================= ADMIN: PROFIT DASHBOARD ================= */
async function loadProfitDashboard() {
  const from = el("profitFrom")?.value || new Date(new Date().setDate(1)).toISOString().split('T')[0];
  const to = el("profitTo")?.value || new Date().toISOString().split('T')[0];

  showLoader("Loading profit data...");
  try {
    const res = await fetch(`${API}/admin/profit?from=${from}&to=${to}`, {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json();
    hideLoader();

    if (el("totalProfit")) el("totalProfit").innerText = formatNaira(data.total);
    if (el("adminWalletBalance")) el("adminWalletBalance").innerText = formatNaira(data.admin_wallet);
    if (el("adminWalletBalance2")) el("adminWalletBalance2").innerText = formatNaira(data.admin_wallet);

    const table = el("profitTable");
    if (table) {
      table.innerHTML = `<tr><th>Date</th><th>Sales</th><th>Profit</th></tr>`;
      data.daily.forEach(d => {
        table.innerHTML += `<tr>
          <td>${formatDate(d.date)}</td>
          <td>${d.total_sales}</td>
          <td>${formatNaira(d.total_profit)}</td>
        </tr>`;
      });
    }
  } catch {
    hideLoader();
    showMsg("Failed to load profit data", "error");
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

    // Removed provider param - backend doesn't use it
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
      const isManual = tx.metadata?.manual_deducted;
      const isReversed = tx.metadata?.reversed;
      
      // Determine display status from type and metadata
      let displayStatus = tx.type === 'credit' ? 'CREDIT' : 'DEBIT';
      let statusColor = tx.type === 'credit' ? "#00c853" : "#ff4d4d";
      
      if (isManual) {
        displayStatus = "MANUAL DEDUCT";
        statusColor = "#ffa000";
      }
      if (isReversed) {
        displayStatus = "REVERSED";
        statusColor = "#ff4d4d";
      }

      const wasManual = isManual ? '<span class="badge badgeWarning">MANUAL</span>' : '';
      const wasReversed = isReversed ? '<span class="badge badgeDanger">REVERSED</span>' : '';

      list.innerHTML += `
        <div class="transactionCard">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <div>
              <strong>${tx.type || 'Transaction'}</strong> ${wasManual} ${wasReversed}<br>
              <small style="opacity:0.7">${tx.username || 'N/A'} - ${tx.email || 'N/A'}</small><br>
              <small style="font-family:monospace">${tx.reference || 'N/A'}</small>
            </div>
            <div style="text-align:right">
              <strong style="font-size:18px">${formatNaira(tx.amount || 0)}</strong><br>
              <span style="color:${statusColor};font-weight:600">${displayStatus}</span><br>
              <small style="opacity:0.6">${tx.admin_email || 'System'}</small>
            </div>
          </div>

          <small style="opacity:0.5">${formatDate(tx.created_at)}</small>

          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            ${tx.type === 'debit' && !isManual && !isReversed ?
              `<button onclick="forceDeductTransaction('${tx.reference}', ${tx.amount})" class="warningBtn">Force Deduct</button>` : ''}

            ${tx.type === 'credit' && !isReversed ?
              `<button onclick="reverseTransaction('${tx.reference}')" class="dangerBtn">Reverse</button>` : ''}
          </div>
        </div>`;
    });
  } catch (e) {
    hideLoader();
    console.error("Load transactions error:", e);
    el("transactionsList").innerHTML = `<p style="color:red;text-align:center">Failed to load transactions: ${e.message}</p>`;
  }
}

async function forceDeductTransaction(reference, amount) {
  const reason = prompt(`Deduct ₦${formatNaira(amount)} from user wallet?\n\nEnter reason:`, "Admin manual deduction");
  if (!reason) return;

  if (!confirm(`Confirm deduction of ₦${formatNaira(amount)} from user wallet? This cannot be undone.`)) return;

  showLoader("Processing deduction...");
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
  const reason = prompt("Enter reason for reversal:", "Admin reversal");
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

let isModalOpen = false;

async function loadAdminPlans() {
  try {
    const res = await fetch(API + "/admin/plans?t=" + Date.now(), {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to load plans");
    const plans = await res.json();
    cachedAdminPlans = plans;
    const list = el("adminPlansList");
    if (list) {
      list.innerHTML = "";
      if (!plans.length) {
        list.innerHTML = `<p style="text-align:center;opacity:0.6">No plans yet</p>`;
        return;
      }
      plans.forEach(p => {
        const statusColor = p.is_active? "#00c853" : "#ff4d4d";
        const restrictBadge = p.restricted? `<span class="badge badgeWarning">RESTRICTED</span>` : '';
        const providerBadge = p.provider? `<span class="badge">${p.provider.toUpperCase()}</span>` : '';
        list.innerHTML += `<div class="planCard">
          <strong>${p.name}</strong> - ${p.network} ${restrictBadge} ${providerBadge}<br>
          Default: ${formatNaira(p.price)} | Regular: ${formatNaira(p.regular_price || p.price)} | Top: ${formatNaira(p.top_price || p.price)} | Cost: ${formatNaira(p.cost)}<br>
          Provider: ${p.provider || 'N/A'} | Net ID: ${p.network_id || 'N/A'} | API ID: ${p.api_plan_id || 'N/A'}<br>
          <span style="color:${statusColor}">${p.is_active? 'Active' : 'Disabled'}</span>
          <button data-edit-id="${p.id}" class="primaryBtn editPlanBtn">Edit</button>
          <button data-toggle-id="${p.id}" data-toggle-state="${!p.is_active}" class="dangerBtn togglePlanBtn">${p.is_active? 'Disable' : 'Enable'}</button>
        </div>`;
      });

      // pointerdown works on Android where onclick fails
      document.querySelectorAll(".editPlanBtn").forEach(btn => {
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isModalOpen) return;
          editPlan(Number(e.target.dataset.editId));
        });
      });
      document.querySelectorAll(".togglePlanBtn").forEach(btn => {
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isModalOpen) return;
          togglePlan(Number(e.target.dataset.toggleId), e.target.dataset.toggleState === "true");
        });
      });
    }
  } catch(e) {
    console.error("Load admin plans error:", e);
    showMsg("Failed to load plans", "error");
  }
}

async function addPlan() {
  const plan = {
    plan_id: el("newPlanId")?.value?.trim(),
    network: el("newPlanNetwork")?.value?.trim(),
    name: el("newPlanName")?.value?.trim(),
    price: el("newPlanPrice")?.value? Number(el("newPlanPrice").value) : null,
    regular_price: el("newPlanUserPrice")?.value? Number(el("newPlanUserPrice").value) : null,
    top_price: el("newPlanTopPrice")?.value? Number(el("newPlanTopPrice").value) : null,
    cost: el("newPlanCost")?.value? Number(el("newPlanCost").value) : null,
    validity: el("newPlanValidity")?.value?.trim(),
    restricted:!!el("newPlanRestricted")?.checked,
    provider: el("newPlanProvider")?.value?.trim(),
    network_id: el("newPlanNetworkId")?.value? Number(el("newPlanNetworkId").value) : null,
    api_plan_id: el("newPlanApiId")?.value?.trim()
  };

  if (!plan.plan_id ||!plan.network ||!plan.name ||!plan.price ||!plan.cost ||!plan.provider ||!plan.network_id ||!plan.api_plan_id) {
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
    showMsg(data.message, res.ok? "success" : "error");
    if (res.ok) {
      closeModal('addPlanModal');
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
  if (isModalOpen) return;
  showLoader("Updating...");
  try {
    const res = await fetch(`${API}/admin/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ is_active })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok? "success" : "error");
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
  isModalOpen = true;

  const safeSet = (id, val) => {
    const element = document.getElementById(id);
    if (element) {
      if (element.type === "checkbox") element.checked =!!val;
      else element.value = val?? "";
    }
  };

  safeSet("editPlanId", plan.id);
  safeSet("editPlanNetwork", plan.network);
  safeSet("editPlanName", plan.name);
  safeSet("editPlanPrice", plan.price);
  safeSet("editPlanUserPrice", plan.regular_price);
  safeSet("editPlanTopPrice", plan.top_price);
  safeSet("editPlanCost", plan.cost);
  safeSet("editPlanValidity", plan.validity);
  safeSet("editPlanProvider", plan.provider);
  safeSet("editPlanNetworkId", plan.network_id);
  safeSet("editPlanApiId", plan.api_plan_id);
  safeSet("editPlanRestricted", plan.restricted);
  safeSet("editPlanActive", plan.is_active!== false);

  openModal("editPlanModal");
}

async function savePlanEdit() {
  if (!editingPlanId ||!isModalOpen) {
    console.warn("[SAVE PLAN] Aborted - no plan selected or modal closed");
    return;
  }

  const updated = {
    name: el("editPlanName")?.value?.trim(),
    price: el("editPlanPrice")?.value? Number(el("editPlanPrice").value) : null,
    regular_price: el("editPlanUserPrice")?.value? Number(el("editPlanUserPrice").value) : null,
    top_price: el("editPlanTopPrice")?.value? Number(el("editPlanTopPrice").value) : null,
    cost: el("editPlanCost")?.value? Number(el("editPlanCost").value) : null,
    validity: el("editPlanValidity")?.value?.trim(),
    restricted:!!el("editPlanRestricted")?.checked,
    provider: el("editPlanProvider")?.value?.trim(),
    network_id: el("editPlanNetworkId")?.value? Number(el("editPlanNetworkId").value) : null,
    api_plan_id: el("editPlanApiId")?.value?.trim(),
    is_active:!!el("editPlanActive")?.checked
  };

  if (!updated.name ||!updated.price ||!updated.cost ||!updated.provider ||!updated.network_id ||!updated.api_plan_id) {
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
    showMsg(data.message, res.ok? "success" : "error");
    if (res.ok) {
      loadAdminPlans();
      loadPlans();
      broadcastTopUserUpdate(currentUser.company);
    }
  } catch(e) {
    console.error("[SAVE PLAN] Fetch error:", e);
    hideLoader();
    showMsg("Server error", "error");
  }
}

// Modal helpers
function openModal(id) {
  document.getElementById(id).style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
  document.body.style.overflow = "";
  editingPlanId = null;
  isModalOpen = false;
}

// Attach button listeners for mobile compatibility
document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("savePlanBtn");
  if (saveBtn) {
    saveBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      savePlanEdit();
    });
  }

  const addBtn = document.getElementById("addPlanBtn");
  if (addBtn) {
    addBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addPlan();
    });
  }
});
/* ================= ADMIN: WITHDRAWALS ================= */
const NIGERIAN_BANKS = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank", "FCMB",
  "GTBank", "Heritage Bank", "Keystone Bank", "Polaris Bank", "Stanbic IBTC",
  "Standard Chartered", "Sterling Bank", "Union Bank", "UBA", "Unity Bank",
  "Wema Bank", "Zenith Bank", "Kuda", "Opay", "Palmpay", "Moniepoint",
  "VFD Microfinance", "Carbon", "Rubies MFB", "Sparkle"
];

function populateBankDropdown() {
  const bankSelect = el("withdrawBank");
  if (!bankSelect) return;

  bankSelect.innerHTML = '<option value="">Select Bank</option>';
  NIGERIAN_BANKS.forEach(bank => {
    bankSelect.innerHTML += `<option value="${bank}">${bank}</option>`;
  });
}

async function loadWithdrawals() {
  try {
    const res = await fetch(API + "/admin/withdrawals", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) throw new Error("Failed to fetch");

    const wds = await res.json();
    const list = el("withdrawalsList");
    if (!list) return;

    list.innerHTML = "";

    if (!wds.length) {
      list.innerHTML = `<p style="text-align:center;color:#888">No withdrawal requests yet</p>`;
      return;
    }

    wds.forEach(w => {
      const statusColor = w.status === "PAID"? "#00c853" : w.status === "PENDING"? "#ffa000" : "#ff4d4d";
      const transferInfo = w.transfer_code? `<br><small>Transfer ID: ${w.transfer_code}</small>` : '';
      const dateStr = new Date(w.created_at).toLocaleString('en-NG', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });

      const approveBtn = w.status === "PENDING"
       ? `<button onclick="approveWithdrawal('${w.reference}')" class="successBtn" style="margin-top:8px">Approve & Send to Bank</button>`
        : '';

      list.innerHTML += `<div class="withdrawCard">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <strong style="font-size:18px">${formatNaira(w.amount)}</strong><br>
            ${w.bank_name}<br>
            ${w.account_number} - ${w.account_name}<br>
            <span style="color:${statusColor};font-weight:600">${w.status}</span>
            ${transferInfo}<br>
            <small style="color:#888">${dateStr}</small><br>
            <small>Ref: ${w.reference}</small>
          </div>
        </div>
        ${approveBtn}
      </div>`;
    });
  } catch (err) {
    console.log("Load withdrawals error:", err);
    showMsg("Failed to load withdrawals", "error");
  }
}

async function requestWithdrawal() {
  const amount = el("withdrawAmount")?.value;
  const bank_name = el("withdrawBank")?.value;
  const account_number = el("withdrawAccountNumber")?.value;
  const account_name = el("withdrawAccountName")?.value;

  if (!amount ||!bank_name ||!account_number ||!account_name) {
    return showMsg("Fill all fields", "error");
  }

  if (Number(amount) < 100) {
    return showMsg("Minimum withdrawal is ₦100", "error");
  }

  if (account_number.length!== 10) {
    return showMsg("Account number must be 10 digits", "error");
  }

  showLoader("Creating withdrawal request...");
  try {
    const res = await fetch(API + "/admin/withdraw-request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({
        amount: Number(amount),
        bank_name,
        account_number,
        account_name
      })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok? "success" : "error");
    if (res.ok) {
      el("withdrawAmount").value = '';
      el("withdrawBank").value = '';
      el("withdrawAccountNumber").value = '';
      el("withdrawAccountName").value = '';
      loadWithdrawals();
      loadDashboard();
    }
  } catch (err) {
    hideLoader();
    console.log("Request withdrawal error:", err);
    showMsg("Network error. Check connection", "error");
  }
}

async function approveWithdrawal(reference) {
  if (!confirm("Send money to bank? This cannot be reversed.")) return;

  showLoader("Processing withdrawal...");
  try {
    const res = await fetch(API + "/admin/withdraw/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ reference })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok? "success" : "error");
    if (res.ok) {
      loadWithdrawals();
      loadDashboard();
    }
  } catch (err) {
    hideLoader();
    console.log("Approve withdrawal error:", err);
    showMsg("Network error during transfer", "error");
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
  showLoader("Creating your dedicated account...");
  try {
    const res = await fetch(API + "/api/generate-account", {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok? "success" : "error");
    if (res.ok) {
      if (el("generateAccountBtn")) el("generateAccountBtn").style.display = "none";
      await loadAccount();
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
  if (!oldPin ||!newPin) return showMsg("Fill fields", "error");

  showLoader("Updating...");
  const res = await fetch(API + "/api/change-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify({ oldPin, newPin })
  });
  const data = await res.json();
  hideLoader();
  showMsg(data.message, res.ok ? "success" : "error");
}

/* ================= ADMIN DATA LOADER ================= */
function loadAdminData() {
  loadProfitDashboard();
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
  if (ws) ws.close();
  localStorage.clear();
  window.location.href = "login.html";
}

/* ================= START ================= */
document.addEventListener("DOMContentLoaded", loadDashboard);