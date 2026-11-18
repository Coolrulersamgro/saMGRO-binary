let authMode='login';
const gate=$('auth-gate'),form=$('auth-form'),msg=$('auth-message');
const forgotForm=$('forgot-form'),resetForm=$('reset-form');
function mode(m){
  authMode=m;
  $('name-field').classList.toggle('hidden',m!=='register');
  $('auth-name').required=m==='register';
  $('auth-password').autocomplete=m==='register'?'new-password':'current-password';
  $('auth-submit').textContent=m==='register'?'Create demo account':'Sign in';
  $('forgot-link').classList.toggle('hidden',m!=='login');
  form.classList.remove('hidden');forgotForm.classList.add('hidden');resetForm.classList.add('hidden');
  msg.textContent='';
}
$('show-login').onclick=()=>mode('login');
$('show-register').onclick=()=>mode('register');
$('forgot-link').onclick=()=>{
  form.classList.add('hidden');$('forgot-link').classList.add('hidden');forgotForm.classList.remove('hidden');
  $('forgot-email').value=$('auth-email').value; $('forgot-message').textContent='';
};
$('back-login').onclick=()=>mode('login');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const body={email:$('auth-email').value,password:$('auth-password').value};
  if(authMode==='register')body.name=$('auth-name').value;
  try{
    msg.textContent='Please wait…';
    const result=await api('/api/auth/'+(authMode==='register'?'register':'login'),{method:'POST',body:JSON.stringify(body)});
    gate.classList.add('hide');$('heading').textContent='Overview';
    if(window.SamGROBinarySync)await window.SamGROBinarySync();
    $('account').querySelector('.profile h3').textContent=result.user.name;
    $('account').querySelector('.profile p').textContent=result.user.email+' · Personal demo account';
  }catch(err){msg.textContent=err.message}
});
forgotForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const out=$('forgot-message');out.textContent='Sending…';
  try{const r=await api('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email:$('forgot-email').value})});out.textContent=r.message||'If the account exists, a reset link will be sent.'}
  catch(err){out.textContent=err.message}
});
const resetToken=new URLSearchParams(location.search).get('resetToken');
if(resetToken){
  form.classList.add('hidden');$('forgot-link').classList.add('hidden');
  $('show-login').classList.add('hidden');$('show-register').classList.add('hidden');
  resetForm.classList.remove('hidden');
  document.querySelector('.auth-dialog h2').textContent='Reset your password';
  document.querySelector('.auth-dialog>p').textContent='Choose a new password for your account.';
}
resetForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const out=$('reset-message'),password=$('reset-password').value;
  if(password!==$('reset-confirm').value){out.textContent='The passwords do not match.';return}
  out.textContent='Updating password…';
  try{
    const r=await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token:resetToken,password})});
    out.textContent=r.message;
    history.replaceState({},'',location.pathname);
    resetForm.classList.add('hidden');$('show-login').classList.remove('hidden');$('show-register').classList.remove('hidden');
    document.querySelector('.auth-dialog h2').textContent='Welcome to saMGRO Binary';
    document.querySelector('.auth-dialog>p').textContent='Create your own secure demo account or sign in to continue.';
    mode('login');
    msg.textContent=r.message;
  }catch(err){out.textContent=err.message}
});
(async()=>{
  if(resetToken){gate.classList.remove('hide');return}
  try{const r=await api('/api/auth/me');gate.classList.add('hide');if(window.SamGROBinarySync)await window.SamGROBinarySync();$('account').querySelector('.profile h3').textContent=r.user.name;$('account').querySelector('.profile p').textContent=r.user.email+' · Personal demo account'}
  catch{gate.classList.remove('hide')}
})();
document.getElementById('logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});location.reload()}catch(err){alert(err.message)}});
