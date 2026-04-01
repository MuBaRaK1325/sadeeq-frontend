const backendUrl="https://mayconnect-backend-1.onrender.com";

async function signup(){

const username=document.getElementById("username").value.trim();
const email=document.getElementById("email").value.trim();
const password=document.getElementById("password").value.trim();
const pin=document.getElementById("pin").value.trim();

if(!username || !email || !password || !pin){
alert("All fields required");
return;
}

if(pin.length < 4){
alert("PIN must be at least 4 digits");
return;
}

try{

const res=await fetch(`${backendUrl}/api/signup`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
username,
email,
password,
pin
})

});

const data=await res.json();

if(!res.ok){
alert(data.message || "Signup failed");
return;
}

alert("Account created successfully");

location.href="login.html";

}catch(err){

alert("Server error");

}

}