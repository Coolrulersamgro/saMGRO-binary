require('dotenv').config();
const express=require('express');
const session=require('express-session');
const SQLiteStore=require('connect-sqlite3')(session);
const Database=require('better-sqlite3');
const bcrypt=require('bcryptjs');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const app=express();
const PORT=process.env.PORT||3000;
if(process.env.NODE_ENV==='production'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)){throw new Error('Set a SESSION_SECRET of at least 32 characters in production.');}
const dataDir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data'); fs.mkdirSync(dataDir,{recursive:true});
const db=new Database(path.join(dataDir,'samgro-binary.sqlite'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'trader',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(user_id INTEGER PRIMARY KEY,balance REAL NOT NULL DEFAULT 10000,closed_pl REAL NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'USD',FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS trades(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,pair TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('Buy','Sell')),units INTEGER NOT NULL,entry REAL NOT NULL,exit REAL,stop_loss REAL,take_profit REAL,status TEXT NOT NULL DEFAULT 'Open',pl REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,closed_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS password_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,used_at INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));`);
app.disable('x-powered-by'); if(process.env.NODE_ENV==='production') app.set('trust proxy',1); app.use(helmet()); app.use(express.json({limit:'20kb'}));
app.use(session({store:new SQLiteStore({db:'sessions.sqlite',dir:dataDir}),secret:process.env.SESSION_SECRET||'CHANGE_THIS_SESSION_SECRET_BEFORE_DEPLOYMENT',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*12}}));
const authLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});
const quotes={'EUR/USD':1.08425,'GBP/USD':1.26740,'USD/JPY':154.820,'AUD/USD':0.65310,'USD/CHF':0.88760,'USD/CAD':1.39720};
const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.created_at});
function requireAuth(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Please sign in first.'});next()}
function requireAdmin(req,res,next){const u=db.prepare('SELECT role FROM users WHERE id=?').get(req.session.userId);if(!u||u.role!=='admin')return res.status(403).json({error:'Administrator access required.'});next()}
app.post('/api/auth/register',authLimit,async(req,res)=>{try{const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(name.length<2||name.length>70)return res.status(400).json({error:'Name must be between 2 and 70 characters.'});if(!/^\S+@\S+\.\S+$/.test(email)||email.length>160)return res.status(400).json({error:'Enter a valid email address.'});if(password.length<10||password.length>100)return res.status(400).json({error:'Password must be at least 10 characters.'});const hash=await bcrypt.hash(password,12);const create=db.transaction(()=>{const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email,hash);db.prepare('INSERT INTO accounts(user_id,balance) VALUES(?,10000)').run(info.lastInsertRowid);return db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)});const user=create();await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));req.session.userId=user.id;res.status(201).json({user:safeUser(user),message:'Demo account created with $10,000 virtual funds.'})}catch(e){if(String(e).includes('UNIQUE'))return res.status(409).json({error:'An account with that email already exists.'});res.status(500).json({error:'Could not create account.'})}});
app.post('/api/auth/login',authLimit,async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Email or password is incorrect.'});await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));req.session.userId=user.id;res.json({user:safeUser(user)})});
const resetLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false});
app.post('/api/auth/forgot-password',resetLimit,async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>160)return res.status(400).json({error:'Enter a valid email address.'});
  const generic='If an account exists for that email, a password reset link will be sent shortly.';
  const user=db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if(!user)return res.json({message:generic});
  if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM)return res.status(503).json({error:'Password reset email is not configured yet. Please contact the site administrator.'});
  const token=crypto.randomBytes(32).toString('hex');
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt=Date.now()+30*60*1000;
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);
  db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)').run(user.id,tokenHash,expiresAt);
  const base=(process.env.PUBLIC_APP_URL||`${req.protocol}://${req.get('host')}`).replace(/\\/$/,'');
  const resetUrl=`${base}/?resetToken=${token}`;
  try{
    const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[email],subject:'Reset your saMGRO Binary password',text:`Use this link to reset your password within 30 minutes: ${resetUrl}\\n\\nIf you did not request this, ignore this email.`})});
    if(!mail.ok)throw new Error('Email provider rejected the request');
    res.json({message:generic});
  }catch(err){db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);res.status(502).json({error:'Could not send the reset email. Please try again later.'});}
});
app.post('/api/auth/reset-password',resetLimit,async(req,res)=>{
  const token=String(req.body.token||''),password=String(req.body.password||'');
  if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'This reset link is invalid or expired.'});
  if(password.length<10||password.length>100)return res.status(400).json({error:'Password must be at least 10 characters.'});
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const record=db.prepare('SELECT id,user_id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL').get(tokenHash,Date.now());
  if(!record)return res.status(400).json({error:'This reset link is invalid or expired.'});
  const hash=await bcrypt.hash(password,12);
  const complete=db.transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,record.user_id);db.prepare('UPDATE password_resets SET used_at=? WHERE id=?').run(Date.now(),record.id);db.prepare('DELETE FROM password_resets WHERE user_id=? AND id<>?').run(record.user_id,record.id);});
  complete();
  res.json({message:'Password updated. You can now sign in with your new password.'});
});
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/healthz',(req,res)=>res.status(200).json({ok:true,service:'saMGRO Binary'}));
app.get('/api/auth/me',requireAuth,(req,res)=>{const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);res.json({user:safeUser(user)})});
app.get('/api/account',requireAuth,(req,res)=>{const account=db.prepare('SELECT balance,closed_pl,currency FROM accounts WHERE user_id=?').get(req.session.userId);const open=db.prepare("SELECT COUNT(*) AS count FROM trades WHERE user_id=? AND status='Open'").get(req.session.userId).count;res.json({account,openPositions:open,environment:'DEMO'})});
app.get('/api/quotes',requireAuth,(req,res)=>res.json({quotes,notice:'Illustrative demo quotes only. Not live market data.'}));
app.get('/api/trades',requireAuth,(req,res)=>res.json({trades:db.prepare('SELECT id,pair,direction,units,entry,exit,stop_loss AS stopLoss,take_profit AS takeProfit,status,pl,created_at AS createdAt,closed_at AS closedAt FROM trades WHERE user_id=? ORDER BY id DESC').all(req.session.userId)}));
app.post('/api/trades',requireAuth,(req,res)=>{const {pair,direction,units,stopLoss,takeProfit}=req.body;const size=Number(units);if(!Object.hasOwn(quotes,pair))return res.status(400).json({error:'Unsupported currency pair.'});if(!['Buy','Sell'].includes(direction))return res.status(400).json({error:'Choose Buy or Sell.'});if(!Number.isInteger(size)||size<100||size>1000000)return res.status(400).json({error:'Position size must be 100 to 1,000,000 whole units.'});const sl=stopLoss===''||stopLoss==null?null:Number(stopLoss),tp=takeProfit===''||takeProfit==null?null:Number(takeProfit);if((sl!==null&&(!Number.isFinite(sl)||sl<=0))||(tp!==null&&(!Number.isFinite(tp)||tp<=0)))return res.status(400).json({error:'Stop-loss and take-profit must be positive valid prices.'});if(sl!==null&&((direction==='Buy'&&sl>=quotes[pair])||(direction==='Sell'&&sl<=quotes[pair])))return res.status(400).json({error:'Stop-loss must be below the current quote for Buy and above it for Sell.'});if(tp!==null&&((direction==='Buy'&&tp<=quotes[pair])||(direction==='Sell'&&tp>=quotes[pair])))return res.status(400).json({error:'Take-profit must be above the current quote for Buy and below it for Sell.'});const info=db.prepare('INSERT INTO trades(user_id,pair,direction,units,entry,stop_loss,take_profit) VALUES(?,?,?,?,?,?,?)').run(req.session.userId,pair,direction,size,quotes[pair],sl,tp);res.status(201).json({id:info.lastInsertRowid,message:'Demo position opened. No broker order was sent.'})});
app.post('/api/trades/:id/close',requireAuth,(req,res)=>{const t=db.prepare("SELECT * FROM trades WHERE id=? AND user_id=? AND status='Open'").get(req.params.id,req.session.userId);if(!t)return res.status(404).json({error:'Open position not found.'});const exit=quotes[t.pair];const directionFactor=t.direction==='Buy'?1:-1;const quoteCurrency=t.pair.split('/')[1];const usdConversion=quoteCurrency==='USD'?1:quoteCurrency==='JPY'?1/exit:quoteCurrency==='CHF'?1/quotes['USD/CHF']:quoteCurrency==='CAD'?1/quotes['USD/CAD']:1;const pl=Number((t.units*(exit-t.entry)*directionFactor*usdConversion).toFixed(2));const tx=db.transaction(()=>{db.prepare("UPDATE trades SET exit=?,status='Closed',pl=?,closed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(exit,pl,t.id,req.session.userId);db.prepare('UPDATE accounts SET balance=balance+?,closed_pl=closed_pl+? WHERE user_id=?').run(pl,pl,req.session.userId)});tx();res.json({message:'Demo position closed.',pl})});
app.get('/api/admin/summary',requireAuth,requireAdmin,(req,res)=>{const users=db.prepare('SELECT id,name,email,role,created_at AS createdAt FROM users ORDER BY id DESC LIMIT 200').all();const totals=db.prepare('SELECT COUNT(*) AS users FROM users').get();const trades=db.prepare('SELECT COUNT(*) AS trades FROM trades').get();res.json({totals:{...totals,...trades},users})});
// Serve only the public website assets. Never expose the project root,
// database files, environment files, or server-side source through static hosting.
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/index.html',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/style.css',(req,res)=>res.sendFile(path.join(__dirname,'style.css')));
app.get('/app.js',(req,res)=>res.sendFile(path.join(__dirname,'app.js')));
app.get('/auth.js',(req,res)=>res.sendFile(path.join(__dirname,'auth.js')));
app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
app.use((req,res)=>res.status(404).send('Page not found.'));
app.listen(PORT,()=>console.log(`saMGRO Binary running at http://localhost:${PORT}`));