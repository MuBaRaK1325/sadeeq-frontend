const API = "https://mayconnect-backend-1.onrender.com";

let cachedPlans = [];
let cachedAdminPlans = []; // for admin edit
let currentUser = null;
let ws = null;

let selectedNetwork = null;
let selectedPlan = null;
let airtimeNetwork = null;
let actionType = null; // "DATA" or "AIRTIME"
let editingPlanId = null; // for edit modal

/* ================= HELPERS ================= */
function getToken() { return localStorage.getItem("token"); }
function el(id) { return document.getElementById(id); }
function formatNaira(num) { return "₦" + Number(num || 0).toLocaleString(); }
function formatDate(date) { return new Date(date).toLocaleDateString('en-GB'); }

/* ================= MESSAGE ================= */
function showMsg(msg, type = "info") {
  const color = type === "error" ? "#ff4d4d" : type === "success" ? "#00c853" : "#2196f3";
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <p style="color:${color}">${msg}</p>
      <button onclick="closeModal('msgModal')" class="primaryBtn">OK</button>
    </div>`;
  openModal("msgModal");
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
    const payload = JSON.parse(atob(getToken().split(".")[1]));
    const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
    currentUser = await res.json();
  } catch {
    logout();
    return;
  }

  // Update UI with user info
  if (el("usernameDisplay")) el("usernameDisplay").innerText = "Hello " + currentUser.username;
  if (el("companyBadge")) el("companyBadge").innerText = currentUser.company.toUpperCase();
  
  // Show admin wallet + admin panels
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
  if (id === "withdrawals") loadWithdrawals();
  if (id === "plansManager") loadAdminPlans();
  if (id === "usersManager") loadAdminUsers();
}

/* ================= WALLET ================= */
function updateWallet(balance) {
  if (el("walletBalance")) el("walletBalance").innerText = formatNaira(balance);
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
    const tx = await res.json();

    if (el("transactionHistory")) {
      el("transactionHistory").innerHTML = "";
      tx.slice(0, 5).forEach(t => el("transactionHistory").appendChild(txCard(t)));
    }

    if (el("allTransactions")) {
      el("allTransactions").innerHTML = "";
      tx.forEach(t => el("allTransactions").appendChild(txCard(t)));
    }
  } catch {}
}

function txCard(t) {
  const div = document.createElement("div");
  div.className = "transactionCard";
  const statusColor = t.status === "SUCCESS" ? "#00c853" : t.status === "FAILED" ? "#ff4d4d" : "#ffa000";
  div.innerHTML = `
    <strong>${t.type}</strong> ${formatNaira(t.amount)}<br>
    ${t.phone || t.network || ""}<br>
    <span style="color:${statusColor}">${t.status}</span>
    <small style="float:right">${formatDate(t.created_at)}</small>`;
  return div;
}

/* ================= PLANS - WITH RESTRICTED FILTER ================= */
async function loadPlans() {
  try {
    const res = await fetch(API + "/api/plans", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json();
    cachedPlans = Array.isArray(data) ? data : [];
  } catch (e) {
    console.log("PLANS ERROR", e);
  }
}

/* ================= NETWORK ================= */
function selectNetwork(network, element) {
  selectedNetwork = (network || "").toLowerCase();
  selectedPlan = null;
  document.querySelectorAll(".networkItem").forEach(n => n.classList.remove("active"));
  if (element) element.classList.add("active");
  renderPlans();
}

/* ================= AIRTIME ================= */
function selectAirtimeNetwork(network, element) {
  airtimeNetwork = network;
  document.querySelectorAll(".airtimeNet").forEach(n => n.classList.remove("active"));
  if (element) element.classList.add("active");
}

/* ================= RENDER PLANS - SHOW TOP USER PRICE ================= */
function renderPlans() {
  const list = el("planList");
  if (!list) return;

  list.innerHTML = "";

  const filtered = cachedPlans.filter(p => (p.network || "").toLowerCase().includes(selectedNetwork));

  if (!filtered.length) {
    list.innerHTML = "<p>No plans available for this network</p>";
    return;
  }

  filtered.forEach(p => {
    const div = document.createElement("div");
    div.className = "planItem";
    const priceDisplay = currentUser?.is_top_user && p.top_price ? p.top_price : p.price;
    const badge = currentUser?.is_top_user && p.top_price ? `<span class="topUserBadge">TOP</span>` : "";
    
    div.innerHTML = `
      <strong>${p.name}</strong> ${badge}<br>
      ${p.validity || ""}<br>
      <strong>${formatNaira(priceDisplay)}</strong>
    `;

    div.onclick = () => {
      selectedPlan = {...p, price: priceDisplay}; // use discounted price
      actionType = "DATA";
      openConfirmModal(selectedPlan);
    };

    list.appendChild(div);
  });
}

/* ================= CONFIRM ================= */
function openConfirmModal(plan) {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Confirm Purchase</h3>
      <p>${plan.name}</p>
      <p><strong>${formatNaira(plan.price)}</strong></p>
      <button onclick="proceedToPin()" class="primaryBtn">Continue</button>
    </div>`;
  openModal("msgModal");
}

function proceedToPin() {
  closeModal("msgModal");
  openPinModal();
}

/* ================= PIN MODAL ================= */
function openPinModal() {
  el("pinInput").value = "";
  el("pinModal").style.display = "flex";
  setTimeout(() => el("pinInput").focus(), 100);
}

function confirmPurchase() {
  const pin = el("pinInput").value;
  if (!pin) return showMsg("Enter PIN", "error");
  closeModal("pinModal");
  if (actionType === "DATA") buyData(pin);
  if (actionType === "AIRTIME") buyAirtime(pin);
}

/* ================= BUY DATA ================= */
async function buyData(pin) {
  const phone = el("dataPhone").value;
  if (!phone ||!selectedPlan) return showMsg("Select plan & enter phone", "error");
  showLoader("Purchasing data...");

  try {
    const res = await fetch(API + "/api/buy-data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ phone, plan_id: selectedPlan.id, pin })
    });
    const data = await res.json();
    hideLoader();
    if (res.ok) {
      showMsg("Data purchase successful ✅", "success");
      updateWallet(data.balance);
      fetchTransactions();
    } else showMsg(data.message, "error");
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= BUY AIRTIME ================= */
function openAirtimePin() {
  actionType = "AIRTIME";
  openPinModal();
}

async function buyAirtime(pin) {
  const phone = el("airtimePhone").value;
  const amount = el("airtimeAmount").value;
  if (!phone ||!amount ||!airtimeNetwork) return showMsg("Fill all fields", "error");

  showLoader("Purchasing airtime...");
  try {
    const res = await fetch(API + "/api/buy-airtime", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ phone, amount, network: airtimeNetwork, pin })
    });
    const data = await res.json();
    hideLoader();
    if (res.ok) {
      showMsg("Airtime successful ✅", "success");
      updateWallet(data.balance);
      fetchTransactions();
    } else showMsg(data.message, "error");
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= FUND ================= */
function openFundModal() {
  el("msgBox").innerHTML = `
    <div style="text-align:center">
      <h3>Fund Wallet</h3>
      <input id="fundAmount" type="number" placeholder="Enter amount" />
      <br><br>
      <button onclick="confirmFund()" class="primaryBtn">Pay with Paystack</button>
    </div>`;
  openModal("msgModal");
}

async function confirmFund() {
  const amount = el("fundAmount").value;
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
    if (data.url) window.location.href = data.url;
    else showMsg(data.message || "Payment failed", "error");
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
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

/* ================= ADMIN: TOP USERS ================= */
async function loadTopUsers() {
  try {
    const res = await fetch(API + "/admin/top-users", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const users = await res.json();
    const list = el("topUsersList");
    if (list) {
      list.innerHTML = "";
      users.forEach(u => {
        list.innerHTML += `<div class="userCard">
          <strong>${u.username}</strong> - ${u.email}<br>
          Spent: ${formatNaira(u.total_spent)} | Profit: ${formatNaira(u.total_profit_generated)}
          ${u.is_top_user ? `<button onclick="removeTopUser('${u.email}')" class="dangerBtn">Remove</button>` : ''}
        </div>`;
      });
    }
  } catch {}
}

async function addTopUser() {
  const email = el("topUserEmail").value;
  if (!email) return showMsg("Enter email", "error");

  showLoader("Adding top user...");
  try {
    const res = await fetch(API + "/admin/top-users/add", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) loadTopUsers();
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

async function removeTopUser(email) {
  showLoader("Removing...");
  try {
    const res = await fetch(API + "/admin/top-users/remove", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) loadTopUsers();
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= ADMIN: PLANS MANAGER - FULL CONTROL ================= */
async function loadAdminPlans() {
  try {
    const res = await fetch(API + "/admin/plans", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const plans = await res.json();
    cachedAdminPlans = plans; // cache for editing
    const list = el("adminPlansList");
    if (list) {
      list.innerHTML = "";
      plans.forEach(p => {
        const statusColor = p.is_active ? "#00c853" : "#ff4d4d";
        const restrictBadge = p.restricted ? `<span class="badge badgeWarning">RESTRICTED</span>` : '';
        const providerBadge = p.provider ? `<span class="badge">${p.provider.toUpperCase()}</span>` : '';
        list.innerHTML += `<div class="planCard">
          <strong>${p.name}</strong> - ${p.network} ${restrictBadge} ${providerBadge}<br>
          Price: ${formatNaira(p.price)} | Top: ${formatNaira(p.top_price)} | Cost: ${formatNaira(p.cost)}<br>
          Provider: ${p.provider || 'N/A'} | Net ID: ${p.network_id || 'N/A'} | API ID: ${p.api_plan_id || 'N/A'}<br>
          <span style="color:${statusColor}">${p.is_active ? 'Active' : 'Disabled'}</span>
          <button onclick="editPlan(${p.id})" class="primaryBtn">Edit</button>
          <button onclick="togglePlan(${p.id}, ${!p.is_active})" class="dangerBtn">${p.is_active ? 'Disable' : 'Enable'}</button>
        </div>`;
      });
    }
  } catch {}
}

async function addPlan() {
  const plan = {
    plan_id: el("newPlanId").value,
    network: el("newPlanNetwork").value,
    name: el("newPlanName").value,
    price: el("newPlanPrice").value,
    top_price: el("newPlanTopPrice").value,
    cost: el("newPlanCost").value,
    validity: el("newPlanValidity").value,
    restricted: el("newPlanRestricted").checked,
    provider: el("newPlanProvider").value,
    network_id: el("newPlanNetworkId").value,
    api_plan_id: el("newPlanApiId").value
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
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      loadAdminPlans();
      loadPlans(); // refresh user plans too
      // clear form
      el("newPlanId").value = "";
      el("newPlanName").value = "";
      el("newPlanPrice").value = "";
      el("newPlanTopPrice").value = "";
      el("newPlanCost").value = "";
      el("newPlanValidity").value = "";
      el("newPlanRestricted").checked = false;
      el("newPlanProvider").value = "";
      el("newPlanNetworkId").value = "";
      el("newPlanApiId").value = "";
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
  
  el("editPlanName").value = plan.name || "";
  el("editPlanPrice").value = plan.price || "";
  el("editPlanTopPrice").value = plan.top_price || "";
  el("editPlanCost").value = plan.cost || "";
  el("editPlanValidity").value = plan.validity || "";
  el("editPlanRestricted").checked = plan.restricted || false;
  el("editPlanProvider").value = plan.provider || "";
  el("editPlanNetworkId").value = plan.network_id || "";
  el("editPlanApiId").value = plan.api_plan_id || "";
  el("editPlanActive").checked = plan.is_active !== false;
  
  openModal("editPlanModal");
}

async function savePlanEdit() {
  if (!editingPlanId) return;
  
  const updated = {
    name: el("editPlanName").value,
    price: el("editPlanPrice").value,
    top_price: el("editPlanTopPrice").value,
    cost: el("editPlanCost").value,
    validity: el("editPlanValidity").value,
    restricted: el("editPlanRestricted").checked,
    provider: el("editPlanProvider").value,
    network_id: el("editPlanNetworkId").value,
    api_plan_id: el("editPlanApiId").value,
    is_active: el("editPlanActive").checked
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
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= ADMIN: USERS MANAGER ================= */
async function loadAdminUsers() {
  const search = el("userSearch")?.value || "";
  try {
    const res = await fetch(`${API}/admin/users?search=${search}`, {
      headers: { Authorization: "Bearer " + getToken() }
    });
    const users = await res.json();
    const list = el("adminUsersList");
    if (list) {
      list.innerHTML = "";
      users.forEach(u => {
        list.innerHTML += `<div class="userCard">
          <strong>${u.username}</strong> - ${u.email}<br>
          Wallet: ${formatNaira(u.wallet_balance)} | Phone: ${u.phone || 'N/A'}<br>
          Top User: ${u.is_top_user ? 'Yes' : 'No'}<br>
          <button onclick="toggleUserTop(${u.id}, ${!u.is_top_user})" class="primaryBtn">
            ${u.is_top_user ? 'Remove Top' : 'Make Top'}
          </button>
        </div>`;
      });
    }
  } catch {}
}

async function toggleUserTop(id, is_top_user) {
  showLoader("Updating...");
  try {
    const res = await fetch(`${API}/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ is_top_user })
    });
    const data = await res.json();
    hideLoader();
    showMsg(data.message, res.ok ? "success" : "error");
    if (res.ok) loadAdminUsers();
  } catch {
    hideLoader();
    showMsg("Server error", "error");
  }
}

/* ================= ADMIN: WITHDRAWALS ================= */

// Nigerian Banks List - matches backend codes
const NIGERIAN_BANKS = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank", "FCMB",
  "GTBank", "Heritage Bank", "Keystone Bank", "Polaris Bank", "Stanbic IBTC",
  "Standard Chartered", "Sterling Bank", "Union Bank", "UBA", "Unity Bank",
  "Wema Bank", "Zenith Bank", "Kuda", "Opay", "Palmpay", "Moniepoint",
  "VFD Microfinance", "Carbon", "Rubies MFB", "Sparkle"
];

// Load bank dropdown on page init
function populateBankDropdown() {
  const bankSelect = el("withdrawBank");
  if (!bankSelect) return;
  
  bankSelect.innerHTML = '<option value="">Select Bank</option>';
  NIGERIAN_BANKS.forEach(bank => {
    bankSelect.innerHTML += `<option value="${bank}">${bank}</option>`;
  });
}

// Call this when dashboard loads
// Add populateBankDropdown() inside your showDashboard() function

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

  if (account_number.length !== 10) {
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
      // Clear form
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
  if (!confirm("Send money to bank via Paystack? This cannot be reversed.")) return;
  
  showLoader("Sending money to bank via Paystack...");
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
      loadDashboard(); // Updates admin_wallet balance
    }
  } catch (err) {
    hideLoader();
    console.log("Approve withdrawal error:", err);
    showMsg("Network error during transfer", "error");
  }
}

/* ================= REVERSAL ================= */
async function reverseTransaction() {
  const reference = el("reverseRef").value;
  if (!reference) return showMsg("Enter transaction reference", "error");

  showLoader("Reversing...");
  const res = await fetch(API + "/api/admin/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify({ reference })
  });
  const data = await res.json();
  hideLoader();
  showMsg(data.message, res.ok ? "success" : "error");
  if (res.ok) fetchTransactions();
}

/* ================= ACCOUNT ================= */
async function loadAccount() {
  const res = await fetch(API + "/api/me", { headers: { Authorization: "Bearer " + getToken() } });
  const user = await res.json();

  if (el("bankName")) el("bankName").innerText = user.bank_name || "N/A";
  if (el("accountNumber")) el("accountNumber").innerText = user.account_number || "N/A";
  if (el("accountName")) el("accountName").innerText = user.account_name || "N/A";

  // Show generate button if no account
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
      await loadAccount(); // refresh
    }
  } catch {
    hideLoader();
    showMsg("Server error", "error");
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
  loadTopUsers();
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