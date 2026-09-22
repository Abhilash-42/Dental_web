/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

const ADMIN_TOKEN_KEY = 'dental_admin_token';

const adminLoginOverlay =
  document.getElementById('adminLoginOverlay');

const adminLoginForm =
  document.getElementById('adminLoginForm');

const adminLoginUsername =
  document.getElementById('adminLoginUsername');

const adminLoginPassword =
  document.getElementById('adminLoginPassword');

const adminLoginMessage =
  document.getElementById('adminLoginMessage');

const adminLoginSubmit =
  document.getElementById('adminLoginSubmit');

const adminLoginClose =
  document.getElementById('adminLoginClose');


function getAdminToken(){
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}


function saveAdminToken(token){
  if(token){
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  }
}


function clearAdminToken(){
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}


function adminAuthHeaders(){
  const token = getAdminToken();

  if(!token)
    return {};

  return {
    Authorization: `Bearer ${token}`
  };
}


function setAdminLoginMessage(message = ''){
  adminLoginMessage.textContent = message;
  adminLoginMessage.hidden = !message;
}


function showAdminLogin(message = ''){
  if(!adminLoginOverlay)
    return;

  setAdminLoginMessage(message);
  adminLoginOverlay.classList.add('open');

  setTimeout(() => {
    if(adminLoginUsername)
      adminLoginUsername.focus();
  }, 50);
}


function hideAdminLogin(){
  if(!adminLoginOverlay)
    return;

  adminLoginOverlay.classList.remove('open');
  setAdminLoginMessage('');
}


async function adminSessionIsValid(){
  const token = getAdminToken();

  if(!token)
    return false;

  try{
    await apiFetch('/api/admin/me', {
      headers: adminAuthHeaders()
    });

    return true;

  }catch(err){
    clearAdminToken();
    return false;
  }
}


async function loginAdmin(username, password){
  const data = await apiFetch('/api/admin/login', {
    method:'POST',
    body:JSON.stringify({
      username,
      password
    })
  });

  if(!data.token){
    throw new Error('The server did not return an admin session token.');
  }

  saveAdminToken(data.token);
  return data;
}


async function logoutAdmin(){
  try{
    if(getAdminToken()){
      await apiFetch('/api/admin/logout', {
        method:'POST',
        headers:adminAuthHeaders()
      });
    }
  }catch(err){
    // The token is cleared locally even if the optional logout endpoint fails.
    console.warn('Admin logout request failed:', err);
  }

  clearAdminToken();
  hideAdminLogin();

  if(typeof closeAdmin === 'function'){
    closeAdmin();
  }
}


if(adminLoginForm){
  adminLoginForm.addEventListener('submit', async e => {
    e.preventDefault();

    const username = adminLoginUsername.value.trim();
    const password = adminLoginPassword.value;

    if(!username || !password){
      setAdminLoginMessage('Enter both username and password.');
      return;
    }

    adminLoginSubmit.disabled = true;
    adminLoginSubmit.textContent = 'Signing in…';
    setAdminLoginMessage('');

    try{
      await loginAdmin(username, password);

      adminLoginPassword.value = '';
      hideAdminLogin();

      if(typeof openAdmin === 'function'){
        openAdmin();
      }

    }catch(err){
      console.error('Admin login failed:', err);
      setAdminLoginMessage(
        err.message || 'Could not sign in. Please try again.'
      );

    }finally{
      adminLoginSubmit.disabled = false;
      adminLoginSubmit.textContent = 'Sign in';
    }
  });
}


if(adminLoginClose){
  adminLoginClose.addEventListener('click', hideAdminLogin);
}


if(adminLoginOverlay){
  adminLoginOverlay.addEventListener('click', e => {
    if(e.target === adminLoginOverlay){
      hideAdminLogin();
    }
  });
}
