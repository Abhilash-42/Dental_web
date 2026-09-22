/* =========================================================
   ADMIN PANEL
   ========================================================= */

const adminOverlay =
  document.getElementById(
    'adminOverlay'
  );

const adminList =
  document.getElementById(
    'adminList'
  );

const adminDbNote =
  document.getElementById(
    'adminDbNote'
  );

let adminPollTimer = null;


function statusLabel(s){

  return {
    pending:'Pending',
    confirmed:'Confirmed',
    declined:'Declined',
    completed:'Completed'
  }[s] || 'Pending';

}


function renderAppointments(rows){

  if(rows.length === 0){

    adminList.innerHTML =
      '<div class="admin-empty">No appointment requests yet. New bookings will appear here.</div>';

    return;

  }


  adminList.innerHTML = '';


  rows.forEach(
    a => {

      const id =
        a.id;


      const readableDate =
        a.appt_date
          ? new Date(
              a.appt_date
            ).toLocaleDateString(
              'en-IN',
              {
                year:'numeric',
                month:'short',
                day:'numeric'
              }
            )
          : '—';


      const card =
        document.createElement(
          'div'
        );


      card.className =
        'appt-card';


      card.innerHTML = `

        <div class="appt-main">

          <div class="appt-name">

            ${a.name || 'Unnamed patient'}

            <span class="status-tag ${a.status || 'pending'}">
              ${statusLabel(a.status)}
            </span>

          </div>

          <div class="appt-meta">

            ${a.service || 'Service not specified'}
            ·
            ${a.doctor ? a.doctor + ' · ' : ''}
            ${readableDate}
            at
            ${a.appt_time || '—'}

            <br>

            ${a.phone || '—'}
            ${a.email ? ' · ' + a.email : ''}

            ${a.notes
              ? '<br>Notes: ' + a.notes
              : ''}

          </div>

        </div>

        <div class="appt-actions"></div>

      `;


      const actions =
        card.querySelector(
          '.appt-actions'
        );


      const status =
        a.status || 'pending';


      if(status === 'pending'){

        actions.appendChild(
          makeActionBtn(
            'Accept',
            'accept',
            () =>
              updateAppointment(
                id,
                'confirmed'
              )
          )
        );

        actions.appendChild(
          makeActionBtn(
            'Decline',
            'decline',
            () =>
              updateAppointment(
                id,
                'declined'
              )
          )
        );

      }else if(
        status === 'confirmed'
      ){

        actions.appendChild(
          makeActionBtn(
            'Mark complete',
            'complete',
            () =>
              updateAppointment(
                id,
                'completed'
              )
          )
        );

        actions.appendChild(
          makeActionBtn(
            'Decline',
            'decline',
            () =>
              updateAppointment(
                id,
                'declined'
              )
          )
        );

      }


      adminList.appendChild(
        card
      );

    }
  );

}


function makeActionBtn(
  label,
  cls,
  onClick
){

  const btn =
    document.createElement(
      'button'
    );

  btn.className =
    cls;

  btn.textContent =
    label;

  btn.addEventListener(
    'click',
    onClick
  );

  return btn;

}


async function loadAppointments(){

  const token = getAdminToken();

  if(!token){
    adminDbNote.textContent =
      'Please sign in to access appointments.';
    return;
  }

  try{

    const data =
      await apiFetch(
        '/api/appointments',
        {
          headers:adminAuthHeaders()
        }
      );

    adminDbNote.textContent =
      'Connected. Refreshes automatically every 10 seconds.';

    renderAppointments(
      Array.isArray(data.appointments)
        ? data.appointments
        : []
    );

  }catch(err){

    console.error(
      'Could not load appointments:',
      err
    );

    if(
      err.message &&
      (err.message.includes('401') ||
       err.message === 'unauthorized')
    ){

      clearAdminToken();

      adminDbNote.textContent =
        'Your admin session has expired. Please sign in again.';

      showAdminLogin();
      return;

    }

    adminDbNote.textContent =
      "Couldn't reach the appointment system: " +
      err.message;

  }

}

async function updateAppointment(
  id,
  status
){

  const token = getAdminToken();

  if(!token){
    showAdminLogin();
    return;
  }

  try{

    await apiFetch(
      '/api/appointments/' + id,
      {
        method:'PATCH',

        headers:adminAuthHeaders(),

        body:JSON.stringify({
          status
        })

      }
    );

    loadAppointments();

  }catch(err){

    console.error(
      'Could not update appointment',
      err
    );

    if(
      err.message &&
      (err.message.includes('401') ||
       err.message === 'unauthorized')
    ){
      clearAdminToken();
      closeAdmin();
      showAdminLogin('Your admin session has expired. Please sign in again.');
      return;
    }

    adminDbNote.textContent =
      'Could not update the appointment: ' + err.message;

  }

}

async function openAdmin(){

  const authenticated =
    await adminSessionIsValid();

  if(!authenticated){
    showAdminLogin();
    return;
  }

  adminOverlay.classList.add(
    'open'
  );

  adminDbNote.textContent =
    'Connecting to the appointment store…';

  loadAppointments();

  if(!adminPollTimer){

    adminPollTimer =
      setInterval(
        () => {

          if(
            adminOverlay.classList.contains(
              'open'
            ) &&
            getAdminToken()
          ){
            loadAppointments();
          }

        },
        10000
      );

  }

}

function closeAdmin(){

  adminOverlay.classList.remove(
    'open'
  );

}


document
  .getElementById('adminLink')
  .addEventListener(
    'click',
    openAdmin
  );


document
  .getElementById('adminClose')
  .addEventListener(
    'click',
    closeAdmin
  );


document
  .getElementById('adminLogout')
  .addEventListener(
    'click',
    logoutAdmin
  );


adminOverlay.addEventListener(
  'click',
  e => {

    if(
      e.target ===
      adminOverlay
    ){

      closeAdmin();

    }

  }
);


