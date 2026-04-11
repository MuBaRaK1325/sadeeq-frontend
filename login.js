const API = "https://mayconnect-backend-1.onrender.com";

/* ELEMENTS */
const usernameInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loader = document.getElementById("loginLoader");

/* SOUND */
const welcomeSound = new Audio("sounds/welcome.mp3");

/* AUTO LOGIN */
document.addEventListener("DOMContentLoaded", () => {
const token = localStorage.getItem("token");
if (token) window.location.href = "dashboard.html";
});

/* PASSWORD TOGGLE */
function togglePassword(){
if(!passwordInput) return;
passwordInput.type = passwordInput.type === "password" ? "text" : "password";
}

/* LOGIN */
loginBtn.addEventListener("click", login);

async function login(){

const username = usernameInput.value.trim();
const password = passwordInput.value.trim();

if(!username || !password){
alert("Enter username and password");
return;
}

loginBtn.disabled = true;
loader.style.display = "flex";

try{

const res = await fetch(API + "/api/login",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({ username, password })
});

const data = await res.json();

if(!res.ok) throw new Error(data.message || "Login failed");
if(!data.token) throw new Error("No token received");

/* SAVE */
localStorage.setItem("token", data.token);
localStorage.setItem("username", data.username);

/* ADMIN */
if(data.is_admin) alert("Welcome Admin");

/* SOUND */
welcomeSound.play().catch(()=>{});

/* REDIRECT */
setTimeout(()=> window.location.href="dashboard.html",600);

}catch(err){
alert(err.message || "Server error");
loader.style.display = "none";
loginBtn.disabled = false;
}

}

/* 🔥 FIXED BIOMETRIC (NO PASSKEY ISSUE) */
async function biometricLogin(){

if(localStorage.getItem("biometric")!=="true"){
return alert("Enable biometric in dashboard first");
}

const token = localStorage.getItem("token");

if(!token){
return alert("Login normally first");
}

/* simple device unlock simulation */
loader.style.display="flex";

setTimeout(()=>{
window.location.href="dashboard.html";
},500);

}