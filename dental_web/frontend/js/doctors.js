/* =========================================================
   BOOKING FORM + LIVE SLOT AVAILABILITY
   ========================================================= */

const doctorSelect =
  document.getElementById('doctorSelect');

const doctorNote =
  document.getElementById('doctorNote');

const apptDate =
  document.getElementById('apptDate');

const apptTime =
  document.getElementById('apptTime');

const slotGrid =
  document.getElementById('slotGrid');

const slotStatus =
  document.getElementById('slotStatus');

const bookingSubmit =
  document.getElementById('bookingSubmit');

let doctors = [];

let availabilityRequestId = 0;


/* Local date helper */

function getTodayLocal(){

  const d =
    new Date();

  const offset =
    d.getTimezoneOffset();

  return new Date(
    d.getTime() -
    offset * 60000
  )
  .toISOString()
  .slice(0,10);

}


apptDate.min =
  getTodayLocal();


/* Convert HH:MM to readable time */

function formatTime(time){

  if(!time)
    return '';

  const [
    h,
    m
  ] =
    time
      .split(':')
      .map(Number);

  const suffix =
    h >= 12
      ? 'PM'
      : 'AM';

  const hour =
    h % 12 || 12;

  return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;

}


/* Doctor working days */

function formatDoctorDays(days){

  if(
    !Array.isArray(days) ||
    days.length === 0
  ){

    return 'No working days configured';

  }

  if(days.length === 7)
    return 'Works daily';

  const names = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat'
  ];

  return 'Works ' +
    days
      .sort((a,b) => a-b)
      .map(d => names[d])
      .join(', ');

}


/* Clear slots */

function clearSlots(
  message =
    'Select a doctor and date to see available slots.'
){

  slotGrid.innerHTML = '';

  slotStatus.textContent =
    message;

  apptTime.value = '';

}


/* Load doctors */

async function loadDoctors(){

  try{

    const data =
      await apiFetch(
        '/api/doctors'
      );

    doctors =
      Array.isArray(data.doctors)
        ? data.doctors
        : [];

    doctorSelect.innerHTML =
      '<option value="">Select a doctor</option>';

    doctors.forEach(
      doctor => {

        const opt =
          document.createElement(
            'option'
          );

        opt.value =
          doctor.name;

        opt.textContent =
          `${doctor.name} — ${doctor.specialization}`;

        doctorSelect.appendChild(opt);

      }
    );


    /* Apply doctor requested before
       doctor list finished loading */

    if(pendingDoctorName){

      const match =
        doctors.find(
          d =>
            d.name ===
            pendingDoctorName
        );

      if(match){

        doctorSelect.value =
          match.name;

        pendingDoctorName = '';

        doctorSelect.dispatchEvent(
          new Event('change')
        );

      }

    }

  }catch(err){

    doctorSelect.innerHTML =
      '<option value="">Unable to load doctors</option>';

    doctorNote.textContent =
      'Please refresh the page or call 090522 09930 if the doctor list does not load.';

    clearSlots(
      'Doctor availability is temporarily unavailable.'
    );

  }

}


