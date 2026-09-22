
/* =========================================================
   BACKEND CONFIG
   ========================================================= */

const API_BASE =
  "https://dental-web-backend.onrender.com";

async function apiFetch(path, options = {}) {

  const res = await fetch(API_BASE + path, {
    ...options,

    headers:{
      "Content-Type":"application/json",
      ...(options.headers || {})
    }

  });

  if (!res.ok){

    const body =
      await res.json().catch(() => ({}));

    throw new Error(
      body.error || `Request failed (${res.status})`
    );

  }

  return res.json();

}
