const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cookieSession = require("cookie-session");
const multer = require("multer");
const Razorpay = require("razorpay");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("education.db");
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 is_admin INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscriptions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 payment_id TEXT UNIQUE,
 started_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 status TEXT DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS pdfs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 filename TEXT NOT NULL,
 description TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieSession({
  name:"session",
  keys:[process.env.SESSION_SECRET || "dev-secret-change-me"],
  maxAge: 1000*60*60*24*30,
  httpOnly:true,
  sameSite:"lax",
  secure:false
}));
app.use(express.static(path.join(__dirname,"public")));

const upload = multer({dest: uploadDir});
const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
 ? new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET}) : null;

function user(req){ return req.session.userId ? db.prepare("SELECT id,name,email,is_admin FROM users WHERE id=?").get(req.session.userId) : null; }
function auth(req,res,next){ const u=user(req); if(!u) return res.status(401).json({error:"Login required"}); req.user=u; next(); }
function activeSubscription(uid){
  return db.prepare("SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
    .get(uid,new Date().toISOString());
}
function subscriptionRequired(req,res,next){
  if(!activeSubscription(req.user.id)) return res.status(403).json({error:"Active subscription required"});
  next();
}

app.post("/api/register", async (req,res)=>{
  const {name,email,password}=req.body;
  if(!name || !email || !password || password.length<6) return res.status(400).json({error:"Name, valid email and password (6+ chars) required"});
  try{
    const hash=await bcrypt.hash(password,12);
    const info=db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)").run(name,email.toLowerCase(),hash);
    req.session.userId=info.lastInsertRowid;
    res.json({ok:true});
  }catch(e){ res.status(400).json({error:"Email already registered"}); }
});

app.post("/api/login", async (req,res)=>{
  const u=db.prepare("SELECT * FROM users WHERE email=?").get((req.body.email||"").toLowerCase());
  if(!u || !(await bcrypt.compare(req.body.password||"",u.password))) return res.status(401).json({error:"Invalid email or password"});
  req.session.userId=u.id; res.json({ok:true});
});
app.post("/api/logout",(req,res)=>{req.session=null;res.json({ok:true})});
app.get("/api/me",(req,res)=>{
  const u=user(req); if(!u) return res.json({loggedIn:false});
  const s=activeSubscription(u.id);
  res.json({loggedIn:true,user:u,subscription:s||null});
});

app.get("/api/pdfs",auth,subscriptionRequired,(req,res)=>{
  res.json(db.prepare("SELECT id,title,description,created_at FROM pdfs ORDER BY id DESC").all());
});

app.get("/api/pdfs/:id",auth,subscriptionRequired,(req,res)=>{
  const p=db.prepare("SELECT * FROM pdfs WHERE id=?").get(req.params.id);
  if(!p) return res.status(404).send("PDF not found");
  const file=path.join(uploadDir,p.filename);
  if(!fs.existsSync(file)) return res.status(404).send("File missing");
  res.sendFile(file);
});

app.post("/api/create-order",auth,(req,res)=>{
  if(!razorpay) return res.status(503).json({error:"Payment gateway is not configured. Add Razorpay keys to .env"});
  razorpay.orders.create({amount:200,currency:"INR",receipt:"edu_"+req.user.id+"_"+Date.now()})
    .then(order=>res.json(order)).catch(()=>res.status(500).json({error:"Could not create payment order"}));
});

app.post("/api/payment-success",auth,(req,res)=>{
  // In production, verify Razorpay signature on the server before activating.
  // This starter endpoint intentionally does not trust a client-provided payment as final.
  const {payment_id,order_id,signature}=req.body;
  if(!razorpay || !payment_id || !order_id || !signature) return res.status(400).json({error:"Payment verification data missing"});
  const crypto=require("crypto");
  const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(order_id+"|"+payment_id).digest("hex");
  if(expected!==signature) return res.status(400).json({error:"Payment verification failed"});
  const start=new Date(), end=new Date(start.getTime()+30*24*60*60*1000);
  db.prepare("INSERT INTO subscriptions(user_id,payment_id,started_at,expires_at) VALUES(?,?,?,?)")
    .run(req.user.id,payment_id,start.toISOString(),end.toISOString());
  res.json({ok:true,expires_at:end.toISOString()});
});

app.post("/api/admin/upload",auth,(req,res,next)=>{
  if(!req.user.is_admin) return res.status(403).json({error:"Admin only"}); next();
},upload.single("pdf"),(req,res)=>{
  if(!req.file || !req.body.title) return res.status(400).json({error:"Title and PDF required"});
  db.prepare("INSERT INTO pdfs(title,filename,description) VALUES(?,?,?)").run(req.body.title,req.file.filename,req.body.description||"");
  res.json({ok:true});
});

app.get("/api/admin/users",auth,(req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({error:"Admin only"});
  res.json(db.prepare(`SELECT u.id,u.name,u.email,u.created_at,
    (SELECT expires_at FROM subscriptions s WHERE s.user_id=u.id ORDER BY expires_at DESC LIMIT 1) expires_at
    FROM users u ORDER BY u.id DESC`).all());
});

app.use((req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Education Tips running at http://localhost:${PORT}`));