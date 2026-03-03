// ========================================
// CONFIG
// ========================================

const API = "https://mayconnect-backend-1.onrender.com/api"
const token = localStorage.getItem("token")

// ========================================
// PAGE GUARD
// ========================================

const currentPage = window.location.pathname

if (!token && !currentPage.includes("index.html")) {
  window.location.href = "index.html"
}

if (token && currentPage.includes("index.html")) {
  window.location.href = "dashboard.html"
}

// ========================================
// SPLASH LOADER
// ========================================

window.addEventListener("load", () => {
  const loader = document.getElementById("splashLoader")
  if (loader) {
    setTimeout(() => {
      loader.style.display = "none"
    }, 1500)
  }
})

// ========================================
// SOUNDS
// ========================================

const welcomeSound = new Audio("sounds/welcome.mp3")
const successSound = new Audio("sounds/success.mp3")

function playWelcomeSound() {
  welcomeSound.play().catch(() => {})
}

// ========================================
// AUTH FUNCTIONS
// ========================================

async function login() {
  const username = document.getElementById("loginUsername").value
  const password = document.getElementById("loginPassword").value

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  })

  const data = await res.json()
  if (!res.ok) return alert(data.message)

  localStorage.setItem("token", data.token)
  window.location.href = "dashboard.html"
}

async function signup() {
  const username = document.getElementById("signupUsername").value
  const email = document.getElementById("signupEmail").value
  const password = document.getElementById("signupPassword").value

  const res = await fetch(`${API}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password })
  })

  const data = await res.json()
  if (!res.ok) return alert(data.message)

  localStorage.setItem("token", data.token)
  window.location.href = "dashboard.html"
}

async function forgotPassword() {
  const email = document.getElementById("forgotEmail").value

  const res = await fetch(`${API}/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  })

  const data = await res.json()
  alert(data.message)
}

async function changePassword() {
  const oldPassword = document.getElementById("oldPassword").value
  const newPassword = document.getElementById("newPassword").value

  const res = await fetch(`${API}/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ oldPassword, newPassword })
  })

  const data = await res.json()
  alert(data.message)
}

// ========================================
// PIN FUNCTIONS
// ========================================

async function setPin() {
  const pin = document.getElementById("setPinInput").value

  const res = await fetch(`${API}/set-pin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ pin })
  })

  const data = await res.json()
  alert(data.message)
}

async function changePin() {
  const oldPin = document.getElementById("oldPin").value
  const newPin = document.getElementById("newPin").value

  const res = await fetch(`${API}/change-pin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ oldPin, newPin })
  })

  const data = await res.json()
  alert(data.message)
}

// ========================================
// DASHBOARD LOAD
// ========================================

async function loadDashboard() {
  if (!token) return

  const res = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  const user = await res.json()
  if (!res.ok) return

  const usernameDisplay = document.getElementById("usernameDisplay")
  if (usernameDisplay) {
    usernameDisplay.innerText = `Hello 👋 ${user.username}`
  }

  const wallet = document.getElementById("walletBalance")
  if (wallet) {
    wallet.innerText = `₦${Number(user.wallet_balance).toLocaleString()}`
  }

  // ADMIN ONLY
  if (user.is_admin) {
    const adminTab = document.getElementById("adminWithdrawTab")
    if (adminTab) adminTab.style.display = "block"
  }

  playWelcomeSound()
  loadTransactions()
}

loadDashboard()

// ========================================
// LOAD TRANSACTIONS
// ========================================

async function loadTransactions() {
  if (!token) return

  const res = await fetch(`${API}/transactions`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  const transactions = await res.json()
  const container = document.getElementById("transactionHistory")
  if (!container) return

  container.innerHTML = ""

  if (!transactions.length) {
    container.innerHTML = "<p>No transactions yet</p>"
    return
  }

  transactions.reverse().forEach(tx => {
    container.innerHTML += `
      <div class="transaction-card">
        <h4>${tx.network || ""} - ${tx.type}</h4>
        <p>₦${Number(tx.amount).toLocaleString()}</p>
        <small>Status: ${tx.status}</small><br>
        <small>${new Date(tx.created_at).toLocaleString()}</small>
      </div>
    `
  })
}

// ========================================
// LOAD DATA PLANS
// ========================================

async function loadPlans(network) {

  const res = await fetch(`${API}/plans?network=${network}`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  const plans = await res.json()
  const container = document.getElementById("plansContainer")
  if (!container) return

  container.innerHTML = ""

  plans.forEach(plan => {
    container.innerHTML += `
      <div class="plan-card">
        <h4>${plan.name}</h4>
        <p>₦${Number(plan.price).toLocaleString()}</p>
        <button onclick="openPinModal(${plan.plan_id}, 'data')">Buy</button>
      </div>
    `
  })
}

// ========================================
// BUY DATA & AIRTIME
// ========================================

let selectedPlan = null
let purchaseType = null

function openPinModal(id, type) {
  selectedPlan = id
  purchaseType = type
  document.getElementById("pinModal").style.display = "flex"
}

function closePinModal() {
  document.getElementById("pinModal").style.display = "none"
}

async function confirmPurchase() {

  const phone = document.getElementById("phoneInput").value
  const pin = document.getElementById("pinInput").value

  let endpoint = ""
  let body = {}

  if (purchaseType === "data") {
    endpoint = "/buy-data"
    body = { plan_id: selectedPlan, phone, pin }
  }

  if (purchaseType === "airtime") {
    endpoint = "/buy-airtime"
    const amount = document.getElementById("airtimeAmount").value
    body = { network: selectedPlan, phone, amount, pin }
  }

  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })

  const data = await res.json()
  if (!res.ok) return alert(data.message)

  successSound.play().catch(() => {})
  alert("Purchase successful")
  closePinModal()
  loadDashboard()
}

// ========================================
// ADMIN WITHDRAW
// ========================================

async function adminWithdraw() {

  const bank = document.getElementById("bankName").value
  const account_number = document.getElementById("accountNumber").value
  const account_name = document.getElementById("accountName").value
  const amount = document.getElementById("withdrawAmount").value

  const res = await fetch(`${API}/admin/withdraw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ bank, account_number, account_name, amount })
  })

  const data = await res.json()
  if (!res.ok) return alert(data.message)

  alert("Withdrawal successful")
  loadDashboard()
}

// ========================================
// TAB NAVIGATION
// ========================================

function openTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(tab => {
    tab.style.display = "none"
  })

  const active = document.getElementById(tabId)
  if (active) active.style.display = "block"
}

// ========================================
// LOGOUT
// ========================================

function logout() {
  localStorage.removeItem("token")
  window.location.href = "index.html"
}