/* Render slots */

function renderAvailability(data){

  slotGrid.innerHTML = '';

  apptTime.value = '';

  const slots =
    Array.isArray(data.slots)
      ? data.slots
      : [];

  if(!slots.length){

    slotStatus.textContent =
      'No appointment slots are available for this date.';

    return;

  }


  const availableCount =
    slots.filter(
      s => s.available
    ).length;


  slotStatus.textContent =
    availableCount
      ? `${availableCount} slot${availableCount === 1 ? '' : 's'} available. Select a time below.`
      : 'No slots are currently available for this date.';


  slots.forEach(
    slot => {

      const btn =
        document.createElement(
          'button'
        );

      btn.type = 'button';

      btn.className =
        'slot-btn';

      btn.textContent =
        formatTime(slot.time);

      btn.dataset.time =
        slot.time;


      if(!slot.available){

        btn.disabled = true;

        btn.classList.add(
          slot.reason === 'booked'
            ? 'booked'
            : 'past'
        );

        btn.title =
          slot.reason === 'booked'
            ? 'Already booked'
            : 'Unavailable';

      }else{

        btn.addEventListener(
          'click',
          () =>
            selectTimeSlot(
              btn,
              slot.time
            )
        );

      }


      slotGrid.appendChild(btn);

    }
  );

}


/* Select slot */

function selectTimeSlot(
  button,
  time
){

  slotGrid
    .querySelectorAll(
      '.slot-btn.selected'
    )
    .forEach(
      b =>
        b.classList.remove(
          'selected'
        )
    );

  button.classList.add(
    'selected'
  );

  apptTime.value =
    time;

  slotStatus.textContent =
    `${formatTime(time)} selected. This slot will be verified again before your request is saved.`;

}


/* Load availability */

async function loadAvailability(){

  const doctor =
    doctorSelect.value;

  const date =
    apptDate.value;

  apptTime.value = '';

  if(!doctor || !date){

    clearSlots();

    return;

  }


  const requestId =
    ++availabilityRequestId;

  slotGrid.innerHTML = '';

  slotStatus.textContent =
    'Checking live availability…';


  try{

    const data =
      await apiFetch(
        `/api/availability?doctor=${encodeURIComponent(doctor)}&date=${encodeURIComponent(date)}`
      );

    if(
      requestId !==
      availabilityRequestId
    )
      return;

    renderAvailability(data);

  }catch(err){

    if(
      requestId !==
      availabilityRequestId
    )
      return;

    clearSlots(
      'Could not load availability. Please try again.'
    );

  }

}


/* Doctor changed */

doctorSelect.addEventListener(
  'change',
  () => {

    const doctor =
      doctors.find(
        d =>
          d.name ===
          doctorSelect.value
      );


    if(doctor){

     doctorNote.textContent =
  `${doctor.specialization || ''} · ${doctor.qualification || ''}${doctor.experience ? ' · ' + doctor.experience : ''} · ${formatTime(doctor.startTime)}–${formatTime(doctor.endTime)} · ${formatDoctorDays(doctor.workingDays)}`;

    }else{

      doctorNote.textContent =
        '';

    }


    loadAvailability();

  }
);


/* Date changed */

apptDate.addEventListener(
  'change',
  loadAvailability
);


/* Verify selected slot one more time */

async function verifySlotStillAvailable(){

  const doctor =
    doctorSelect.value;

  const date =
    apptDate.value;

  const time =
    apptTime.value;

  if(
    !doctor ||
    !date ||
    !time
  )
    return false;


  const data =
    await apiFetch(
      `/api/availability?doctor=${encodeURIComponent(doctor)}&date=${encodeURIComponent(date)}`
    );


  const slot =
    (data.slots || [])
      .find(
        s =>
          s.time ===
          time
      );


  return !!(
    slot &&
    slot.available
  );

}


