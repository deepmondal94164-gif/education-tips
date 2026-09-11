const $=s=>document.querySelector(s);
async function api(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Something went wrong");return d}
async function load(){
 const m=await api("/api/me"); const box=$("#accountBox");
 if(!m.loggedIn){
  box.innerHTML=`<div class="form"><h3>Login</h3><input id="le" placeholder="Email"><input id="lp" type="password" placeholder="Password"><button onclick="login()">Login</button><p>New user? <a href="#" onclick="registerForm();return false">Create account</a></p></div>`;
  $("#pdfList").innerHTML="<p class='muted'>Login first. Subscription is ₹2 for 30 days.</p>"; return;
 }
 let sub=m.subscription;
 box.innerHTML=`<p>Welcome, <b>${escapeHtml(m.user.name)}</b>!</p>
 ${sub?`<p>Subscription active until <b>${new Date(sub.expires_at).toLocaleString()}</b></p><button onclick="logout()">Logout</button>`:
 `<p>Your account has no active subscription.</p><button onclick="pay()">Subscribe for ₹2 / 30 days</button> <button onclick="logout()">Logout</button>`}`;
 if(sub) loadPDFs(); else $("#pdfList").innerHTML="<p>Subscribe for ₹2 to unlock the PDF library.</p>";
}
function registerForm(){$("#accountBox").innerHTML=`<div class="form"><h3>Create account</h3><input id="rn" placeholder="Full name"><input id="re" placeholder="Email"><input id="rp" type="password" placeholder="Password (6+ characters)"><button onclick="register()">Register</button></div>`}
async function login(){try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#le").value,password:$("#lp").value})});load()}catch(e){alert(e.message)}}
async function register(){try{await api("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#rn").value,email:$("#re").value,password:$("#rp").value})});load()}catch(e){alert(e.message)}}
async function logout(){await api("/api/logout",{method:"POST"});load()}
async function pay(){
 try{
  const order=await api("/api/create-order",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
  if(!window.Razorpay){alert("Razorpay checkout script is not loaded. Add the Razorpay script to index.html.");return}
  const r=new Razorpay({key:order.key_id||"YOUR_KEY_ID",amount:order.amount,currency:order.currency,name:"Education Tips",description:"30-day PDF access",order_id:order.id,
   handler:async response=>{try{await api("/api/payment-success",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(response)});alert("Subscription activated!");load()}catch(e){alert(e.message)}}});
  r.open();
 }catch(e){alert(e.message)}
}
async function loadPDFs(){try{const ps=await api("/api/pdfs");$("#pdfList").innerHTML=ps.length?ps.map(p=>`<div class="pdf"><div><b>${escapeHtml(p.title)}</b><p class="muted">${escapeHtml(p.description||"")}</p></div><a class="btn" href="/api/pdfs/${p.id}" target="_blank">Open PDF</a></div>`).join(""):"<p>No PDFs uploaded yet.</p>"}catch(e){$("#pdfList").innerHTML="<p>"+e.message+"</p>"}}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
load();