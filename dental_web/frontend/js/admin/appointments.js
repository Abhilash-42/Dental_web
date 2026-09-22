/* =========================================================
   ADMIN DASHBOARD — APPOINTMENTS
   ========================================================= */

const adminOverlay = document.getElementById('adminOverlay');
const adminList = document.getElementById('adminList');
const adminDbNote = document.getElementById('adminDbNote');
const adminRefresh = document.getElementById('adminRefresh');
const adminSearch = document.getElementById('adminSearch');
const adminStatusFilter = document.getElementById('adminStatusFilter');
const adminDoctorFilter = document.getElementById('adminDoctorFilter');
const adminDateFilter = document.getElementById('adminDateFilter');
const adminClearFilters = document.getElementById('adminClearFilters');
const adminResultsCount = document.getElementById('adminResultsCount');
const adminResultsHint = document.getElementById('adminResultsHint');

const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statConfirmed = document.getElementById('statConfirmed');
const statCompleted = document.getElementById('statCompleted');

const detailsOverlay = document.getElementById('appointmentDetailsOverlay');
const detailsClose = document.getElementById('appointmentDetailsClose');
const detailsContent = document.getElementById('appointmentDetailsContent');

const rescheduleOverlay = document.getElementById('rescheduleOverlay');
const rescheduleClose = document.getElementById('rescheduleClose');
const rescheduleCancel = document.getElementById('rescheduleCancel');
const rescheduleForm = document.getElementById('rescheduleForm');
const rescheduleDate = document.getElementById('rescheduleDate');
const rescheduleTime = document.getElementById('rescheduleTime');
const rescheduleSubmit = document.getElementById('rescheduleSubmit');
const rescheduleSummary = document.getElementById('rescheduleSummary');
const rescheduleMessage = document.getElementById('rescheduleMessage');
const rescheduleSlotHint = document.getElementById('rescheduleSlotHint');

let reschedulingAppointmentId = null;
let reschedulingAppointment = null;

let adminPollTimer = null;
let allAppointments = [];
let lastPendingCount = 0;
let firstLoadComplete = false;

function statusLabel(status){
  return {
    pending:'Pending',
    confirmed:'Confirmed',
    declined:'Declined',
    completed:'Completed'
  }[status] || 'Pending';
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function normalizeAppointmentDate(value){
  if(!value) return '';
  return String(value).split('T')[0];
}

function formatDate(dateString){
  const normalized = normalizeAppointmentDate(dateString);
  if(!normalized) return '—';

  const date = new Date(`${normalized}T12:00:00`);
  if(Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleDateString('en-IN', {
    weekday:'short',
    year:'numeric',
    month:'short',
    day:'numeric'
  });
}

function formatTime(value){
  if(!value) return '—';

  const raw = String(value).slice(0,5);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);

  if(!match) return String(value);

  const hours = Number(match[1]);
  const minutes = match[2];

  if(hours > 23) return String(value);

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutes} ${suffix}`;
}

function formatCreatedAt(value){
  if(!value) return '—';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    dateStyle:'medium',
    timeStyle:'short'
  });
}

function updateStats(rows){
  const total = rows.length;
  const pending = rows.filter(a => a.status === 'pending').length;
  const confirmed = rows.filter(a => a.status === 'confirmed').length;
  const completed = rows.filter(a => a.status === 'completed').length;

  statTotal.textContent = total;
  statPending.textContent = pending;
  statConfirmed.textContent = confirmed;
  statCompleted.textContent = completed;

  if(firstLoadComplete && pending > lastPendingCount){
    adminDbNote.innerHTML = '<span class="connection-dot live"></span> New appointment request received.';
  }

  lastPendingCount = pending;
}

function populateDoctorFilter(rows){
  const current = adminDoctorFilter.value;
  const doctors = [...new Set(rows.map(a => a.doctor).filter(Boolean))].sort();

  adminDoctorFilter.innerHTML = '<option value="all">All doctors</option>';

  doctors.forEach(doctor => {
    const option = document.createElement('option');
    option.value = doctor;
    option.textContent = doctor;
    adminDoctorFilter.appendChild(option);
  });

  if(doctors.includes(current)){
    adminDoctorFilter.value = current;
  }
}

function getFilteredAppointments(){
  const search = adminSearch.value.trim().toLowerCase();
  const status = adminStatusFilter.value;
  const doctor = adminDoctorFilter.value;
  const date = adminDateFilter.value;

  return allAppointments.filter(a => {
    if(status !== 'all' && (a.status || 'pending') !== status) return false;
    if(doctor !== 'all' && (a.doctor || '') !== doctor) return false;
    if(date && normalizeAppointmentDate(a.appt_date) !== date) return false;

    if(search){
      const haystack = [
        a.name,
        a.phone,
        a.email,
        a.service,
        a.doctor,
        a.notes,
        a.appt_date,
        a.appt_time
      ].join(' ').toLowerCase();

      if(!haystack.includes(search)) return false;
    }

    return true;
  });
}

function updateResultsHeader(rows){
  const count = rows.length;
  adminResultsCount.textContent = `${count} appointment${count === 1 ? '' : 's'}`;

  const hasFilters =
    adminSearch.value.trim() ||
    adminStatusFilter.value !== 'all' ||
    adminDoctorFilter.value !== 'all' ||
    adminDateFilter.value;

  adminResultsHint.textContent = hasFilters
    ? `Showing ${count} matching request${count === 1 ? '' : 's'}`
    : 'All appointment requests';
}

function renderAppointments(rows){
  updateResultsHeader(rows);

  if(rows.length === 0){
    adminList.innerHTML = `
      <div class="admin-empty enhanced-empty">
        <div class="empty-icon">◌</div>
        <strong>No matching appointments</strong>
        <span>Try changing your filters or wait for a new booking request.</span>
      </div>`;
    return;
  }

  adminList.innerHTML = '';

  rows.forEach(a => {
    const card = document.createElement('article');
    card.className = 'appt-card';
    card.dataset.id = a.id;

    const status = a.status || 'pending';
    const emailMarkup = a.email
      ? `<span class="appt-contact">${escapeHtml(a.email)}</span>`
      : '<span class="appt-contact muted">No email</span>';

    card.innerHTML = `
      <div class="appt-main">
        <div class="appt-topline">
          <div class="appt-name">${escapeHtml(a.name || 'Unnamed patient')}</div>
          <span class="status-tag ${escapeHtml(status)}">${statusLabel(status)}</span>
        </div>

        <div class="appt-visit-row">
          <div class="visit-date">
            <span class="visit-date-day">${escapeHtml(formatDate(a.appt_date))}</span>
            <strong>${escapeHtml(formatTime(a.appt_time))}</strong>
          </div>
          <div class="visit-info">
            <strong>${escapeHtml(a.service || 'Service not specified')}</strong>
            <span>${escapeHtml(a.doctor || 'Doctor not specified')}</span>
          </div>
        </div>

        <div class="appt-contact-row">
          <span class="appt-contact">${escapeHtml(a.phone || 'No phone')}</span>
          ${emailMarkup}
        </div>

        ${a.notes ? `<div class="appt-notes-preview"><span>Note</span> ${escapeHtml(a.notes)}</div>` : ''}
      </div>

      <div class="appt-actions-column">
        <button class="appt-view-btn" type="button" data-view-id="${escapeHtml(a.id)}">View details</button>
        <div class="appt-actions"></div>
      </div>
    `;

    const actions = card.querySelector('.appt-actions');
    const viewButton = card.querySelector('[data-view-id]');
    viewButton.addEventListener('click', () => openAppointmentDetails(a.id));

    if(status === 'pending'){
      actions.appendChild(makeActionBtn('Accept','accept',() => updateAppointment(a.id,'confirmed')));
      actions.appendChild(makeActionBtn('Reschedule','reschedule',() => openReschedule(a.id)));
      actions.appendChild(makeActionBtn('Decline','decline',() => updateAppointment(a.id,'declined')));
    }else if(status === 'confirmed'){
      actions.appendChild(makeActionBtn('Reschedule','reschedule',() => openReschedule(a.id)));
      actions.appendChild(makeActionBtn('Mark complete','complete',() => updateAppointment(a.id,'completed')));
      actions.appendChild(makeActionBtn('Decline','decline',() => updateAppointment(a.id,'declined')));
    }

    adminList.appendChild(card);
  });
}

function makeActionBtn(label, cls, onClick){
  const btn = document.createElement('button');
  btn.className = cls;
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function applyFilters(){
  const filtered = getFilteredAppointments();
  renderAppointments(filtered);
}

function clearFilters(){
  adminSearch.value = '';
  adminStatusFilter.value = 'all';
  adminDoctorFilter.value = 'all';
  adminDateFilter.value = '';
  applyFilters();
}

function openAppointmentDetails(id){
  const appointment = allAppointments.find(a => String(a.id) === String(id));
  if(!appointment) return;

  const status = appointment.status || 'pending';

  detailsContent.innerHTML = `
    <div class="details-status-row">
      <span class="status-tag ${escapeHtml(status)}">${statusLabel(status)}</span>
      <span class="details-id">Request #${escapeHtml(appointment.id)}</span>
    </div>

    <div class="details-grid">
      <div class="details-block details-wide">
        <span>Patient</span>
        <strong>${escapeHtml(appointment.name || '—')}</strong>
      </div>
      <div class="details-block">
        <span>Phone</span>
        <strong>${escapeHtml(appointment.phone || '—')}</strong>
      </div>
      <div class="details-block">
        <span>Email</span>
        <strong>${escapeHtml(appointment.email || 'Not provided')}</strong>
      </div>
      <div class="details-block">
        <span>Doctor</span>
        <strong>${escapeHtml(appointment.doctor || '—')}</strong>
      </div>
      <div class="details-block">
        <span>Service</span>
        <strong>${escapeHtml(appointment.service || '—')}</strong>
      </div>
      <div class="details-block">
        <span>Appointment</span>
        <strong>${escapeHtml(formatDate(appointment.appt_date))} · ${escapeHtml(formatTime(appointment.appt_time))}</strong>
      </div>
      <div class="details-block">
        <span>Requested</span>
        <strong>${escapeHtml(formatCreatedAt(appointment.created_at))}</strong>
      </div>
    </div>

    <div class="details-notes">
      <span>Patient notes</span>
      <p>${escapeHtml(appointment.notes || 'No notes were provided.')}</p>
    </div>

    ${status === 'pending' || status === 'confirmed' ? `
      <div class="details-action-row">
        <button type="button" class="reschedule-submit" id="detailsRescheduleBtn">Reschedule appointment</button>
      </div>
    ` : ''}
  `;

  detailsOverlay.hidden = false;
  requestAnimationFrame(() => detailsOverlay.classList.add('open'));

  const detailsRescheduleBtn = document.getElementById('detailsRescheduleBtn');
  if(detailsRescheduleBtn){
    detailsRescheduleBtn.addEventListener('click', () => openReschedule(appointment.id));
  }
}

function closeAppointmentDetails(){
  detailsOverlay.classList.remove('open');
  setTimeout(() => { detailsOverlay.hidden = true; }, 180);
}

function showRescheduleMessage(message, type='error'){
  rescheduleMessage.hidden = false;
  rescheduleMessage.className = `reschedule-message ${type}`;
  rescheduleMessage.textContent = message;
}

function clearRescheduleMessage(){
  rescheduleMessage.hidden = true;
  rescheduleMessage.textContent = '';
  rescheduleMessage.className = 'reschedule-message';
}

function setRescheduleTimeOptions(slots, currentTime=''){
  rescheduleTime.innerHTML = '<option value="">Select a time</option>';

  slots.forEach(slot => {
    if(!slot.available) return;
    const option = document.createElement('option');
    option.value = slot.time;
    option.textContent = formatTime(slot.time);
    rescheduleTime.appendChild(option);
  });

  rescheduleTime.disabled = rescheduleTime.options.length <= 1;

  if(currentTime && [...rescheduleTime.options].some(option => option.value === currentTime)){
    rescheduleTime.value = currentTime;
  }
}

async function loadRescheduleSlots(){
  clearRescheduleMessage();
  rescheduleTime.disabled = true;
  rescheduleTime.innerHTML = '<option value="">Loading available times…</option>';

  if(!reschedulingAppointment || !rescheduleDate.value) return;

  try{
    const query = `?doctor=${encodeURIComponent(reschedulingAppointment.doctor)}&date=${encodeURIComponent(rescheduleDate.value)}`;
    const data = await apiFetch('/api/availability' + query);

    if(!data.working){
      rescheduleTime.innerHTML = '<option value="">No slots available</option>';
      rescheduleSlotHint.textContent = data.message || 'The doctor is not available on this date.';
      return;
    }

    setRescheduleTimeOptions(data.slots || [], normalizeAppointmentDate(reschedulingAppointment.appt_date) === rescheduleDate.value ? reschedulingAppointment.appt_time : '');

    const count = (data.slots || []).filter(slot => slot.available).length;
    rescheduleSlotHint.textContent = count
      ? `${count} available slot${count === 1 ? '' : 's'} for ${reschedulingAppointment.doctor}.`
      : 'No available slots on this date.';
  }catch(err){
    console.error('Could not load reschedule availability:', err);
    rescheduleTime.innerHTML = '<option value="">Could not load slots</option>';
    rescheduleSlotHint.textContent = 'Please try another date.';
    showRescheduleMessage(err.message || 'Could not load available times.');
  }
}

function openReschedule(id){
  const appointment = allAppointments.find(a => String(a.id) === String(id));
  if(!appointment) return;

  if(!['pending','confirmed'].includes(appointment.status || 'pending')) return;

  reschedulingAppointmentId = appointment.id;
  reschedulingAppointment = appointment;
  clearRescheduleMessage();

  rescheduleSummary.innerHTML = `
    <strong>${escapeHtml(appointment.name || 'Patient')}</strong>
    <span>${escapeHtml(appointment.doctor || 'Doctor not specified')} · ${escapeHtml(appointment.service || 'Service not specified')}</span>
    <small>Current: ${escapeHtml(formatDate(appointment.appt_date))} · ${escapeHtml(formatTime(appointment.appt_time))}</small>
  `;

  rescheduleDate.value = normalizeAppointmentDate(appointment.appt_date);
  rescheduleTime.innerHTML = '<option value="">Loading available times…</option>';
  rescheduleTime.disabled = true;
  rescheduleSlotHint.textContent = 'Loading available slots…';
  rescheduleSubmit.disabled = false;

  rescheduleOverlay.hidden = false;
  requestAnimationFrame(() => rescheduleOverlay.classList.add('open'));
  loadRescheduleSlots();
}

function closeReschedule(){
  rescheduleOverlay.classList.remove('open');
  setTimeout(() => { rescheduleOverlay.hidden = true; }, 180);
  reschedulingAppointmentId = null;
  reschedulingAppointment = null;
  clearRescheduleMessage();
}

async function submitReschedule(){
  if(!reschedulingAppointmentId) return;

  const date = rescheduleDate.value;
  const time = rescheduleTime.value;

  if(!date || !time){
    showRescheduleMessage('Please select a new date and available time.');
    return;
  }

  const token = getAdminToken();
  if(!token){
    closeReschedule();
    showAdminLogin();
    return;
  }

  try{
    rescheduleSubmit.disabled = true;
    rescheduleSubmit.textContent = 'Rescheduling…';
    clearRescheduleMessage();

    await apiFetch('/api/appointments/' + encodeURIComponent(reschedulingAppointmentId) + '/reschedule', {
      method:'POST',
      headers:adminAuthHeaders(),
      body:JSON.stringify({date, time})
    });

    closeReschedule();
    closeAppointmentDetails();
    await loadAppointments();
  }catch(err){
    console.error('Could not reschedule appointment:', err);

    if(err.message && (err.message.includes('401') || err.message === 'unauthorized')){
      clearAdminToken();
      closeReschedule();
      closeAdmin();
      showAdminLogin('Your admin session has expired. Please sign in again.');
      return;
    }

    showRescheduleMessage(err.message || 'Could not reschedule the appointment.');
  }finally{
    rescheduleSubmit.disabled = false;
    rescheduleSubmit.textContent = 'Reschedule appointment';
  }
}

async function loadAppointments(){
  const token = getAdminToken();

  if(!token){
    adminDbNote.innerHTML = '<span class="connection-dot"></span> Please sign in to access appointments.';
    return;
  }

  try{
    adminRefresh.disabled = true;
    adminRefresh.textContent = 'Refreshing…';

    const data = await apiFetch('/api/appointments', {
      headers:adminAuthHeaders()
    });

    allAppointments = Array.isArray(data.appointments)
      ? data.appointments
      : [];

    updateStats(allAppointments);
    populateDoctorFilter(allAppointments);
    applyFilters();

    adminDbNote.innerHTML = '<span class="connection-dot live"></span> Connected · updates every 10 seconds';
    firstLoadComplete = true;

  }catch(err){
    console.error('Could not load appointments:', err);

    if(err.message && (err.message.includes('401') || err.message === 'unauthorized')){
      clearAdminToken();
      adminDbNote.innerHTML = '<span class="connection-dot error"></span> Your admin session has expired.';
      showAdminLogin('Your admin session has expired. Please sign in again.');
      return;
    }

    adminDbNote.innerHTML = '<span class="connection-dot error"></span> Couldn\'t reach the appointment system: ' + escapeHtml(err.message);
  }finally{
    adminRefresh.disabled = false;
    adminRefresh.textContent = 'Refresh';
  }
}

async function updateAppointment(id, status){
  const token = getAdminToken();

  if(!token){
    showAdminLogin();
    return;
  }

  try{
    await apiFetch('/api/appointments/' + encodeURIComponent(id), {
      method:'PATCH',
      headers:adminAuthHeaders(),
      body:JSON.stringify({status})
    });

    await loadAppointments();

  }catch(err){
    console.error('Could not update appointment', err);

    if(err.message && (err.message.includes('401') || err.message === 'unauthorized')){
      clearAdminToken();
      closeAdmin();
      showAdminLogin('Your admin session has expired. Please sign in again.');
      return;
    }

    adminDbNote.innerHTML = '<span class="connection-dot error"></span> Could not update the appointment: ' + escapeHtml(err.message);
  }
}

async function openAdmin(){
  const authenticated = await adminSessionIsValid();

  if(!authenticated){
    showAdminLogin();
    return;
  }

  adminOverlay.classList.add('open');
  adminDbNote.innerHTML = '<span class="connection-dot"></span> Connecting to the appointment store…';
  loadAppointments();

  if(!adminPollTimer){
    adminPollTimer = setInterval(() => {
      if(adminOverlay.classList.contains('open') && getAdminToken()){
        loadAppointments();
      }
    },10000);
  }
}

function closeAdmin(){
  adminOverlay.classList.remove('open');
  closeAppointmentDetails();
}

document.getElementById('adminLink').addEventListener('click', openAdmin);
document.getElementById('adminClose').addEventListener('click', closeAdmin);
document.getElementById('adminLogout').addEventListener('click', logoutAdmin);
adminOverlay.addEventListener('click', e => {
  if(e.target === adminOverlay) closeAdmin();
});

adminRefresh.addEventListener('click', loadAppointments);
adminSearch.addEventListener('input', applyFilters);
adminStatusFilter.addEventListener('change', applyFilters);
adminDoctorFilter.addEventListener('change', applyFilters);
adminDateFilter.addEventListener('change', applyFilters);
adminClearFilters.addEventListener('click', clearFilters);
detailsClose.addEventListener('click', closeAppointmentDetails);
detailsOverlay.addEventListener('click', e => {
  if(e.target === detailsOverlay) closeAppointmentDetails();
});

rescheduleClose.addEventListener('click', closeReschedule);
rescheduleCancel.addEventListener('click', closeReschedule);
rescheduleDate.addEventListener('change', loadRescheduleSlots);
rescheduleForm.addEventListener('submit', e => {
  e.preventDefault();
  submitReschedule();
});
rescheduleOverlay.addEventListener('click', e => {
  if(e.target === rescheduleOverlay) closeReschedule();
});

document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    closeAppointmentDetails();
  }
});
