/* =========================================================
   BOOKING SUBMIT
   ========================================================= */

document
  .getElementById('bookingForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const service =
        svcSelect.value;

      const doctor =
        doctorSelect.value;

      const date =
        apptDate.value;

      const time =
        apptTime.value;

      const name =
        document
          .getElementById('pName')
          .value
          .trim();

      const phone =
        document
          .getElementById('pPhone')
          .value
          .trim();

      const email =
        document
          .getElementById('pEmail')
          .value
          .trim();

      const notes =
        document
          .getElementById('pNotes')
          .value
          .trim();


      const box =
        document.getElementById(
          'confirmBox'
        );


      const readableDate =
        date
          ? new Date(
              date + 'T00:00:00'
            ).toLocaleDateString(
              'en-IN',
              {
                weekday:'long',
                year:'numeric',
                month:'long',
                day:'numeric'
              }
            )
          : '';


      /* Required fields */

      if(
        !service ||
        !doctor ||
        !date ||
        !time
      ){

        box.classList.remove(
          'pending'
        );

        box.classList.add(
          'show'
        );

        document
          .getElementById(
            'confirmText'
          )
          .textContent =
          'Please select a service, doctor, date, and an available time slot.';

        return;

      }


      /* Phone validation */

      if(
        !/^\d{10}$/.test(
          phone.replace(
            /\D/g,
            ''
          )
        )
      ){

        box.classList.remove(
          'pending'
        );

        box.classList.add(
          'show'
        );

        document
          .getElementById(
            'confirmText'
          )
          .textContent =
          'Please enter a valid 10-digit phone number.';

        return;

      }


      bookingSubmit.disabled =
        true;

      bookingSubmit.textContent =
        'Checking slot…';

      box.classList.remove(
        'show',
        'pending'
      );


      /* Double-check availability */

      try{

        const stillAvailable =
          await verifySlotStillAvailable();


        if(!stillAvailable){

          bookingSubmit.disabled =
            false;

          bookingSubmit.textContent =
            'Request appointment';

          box.classList.add(
            'show'
          );

          document
            .getElementById(
              'confirmText'
            )
            .textContent =
            'That time slot is no longer available. Please choose another available slot.';

          await loadAvailability();

          return;

        }

      }catch(err){

        bookingSubmit.disabled =
          false;

        bookingSubmit.textContent =
          'Request appointment';

        box.classList.add(
          'show'
        );

        document
          .getElementById(
            'confirmText'
          )
          .textContent =
          'We could not verify the slot right now. Please try again in a moment or call 090522 09930.';

        return;

      }


      bookingSubmit.textContent =
        'Sending request…';


      try{

        await apiFetch(
          '/api/appointments',
          {
            method:'POST',

            body:JSON.stringify({

              name,

              phone:
                phone.replace(
                  /\D/g,
                  ''
                ),

              email,

              service,

              doctor,

              date,

              time,

              notes

            })

          }
        );


        /* Success */

        box.classList.add(
          'show',
          'pending'
        );


        document
          .getElementById(
            'confirmText'
          )
          .innerHTML =

          `<strong>${name}</strong>, your request for <strong>${service}</strong> with <strong>${doctor}</strong> on <strong>${readableDate}</strong> at <strong>${formatTime(time)}</strong> is <strong>pending confirmation</strong>.<br>Our front desk reviews it from the admin panel and will call ${phone.replace(/\D/g,'')} once it's accepted. You can also ask the chat assistant to check its status using your phone number.`;


        /* Clear patient fields */

        document
          .getElementById(
            'pName'
          )
          .value = '';

        document
          .getElementById(
            'pPhone'
          )
          .value = '';

        document
          .getElementById(
            'pEmail'
          )
          .value = '';

        document
          .getElementById(
            'pNotes'
          )
          .value = '';


        apptTime.value = '';


        /* Refresh slots */

        await loadAvailability();


      }catch(err){

        box.classList.add(
          'show'
        );


        if(
          err.message &&
          err.message
            .toLowerCase()
            .includes('slot')
        ){

          document
            .getElementById(
              'confirmText'
            )
            .textContent =
            'That time slot was just taken by another request. Please choose another available slot.';

          await loadAvailability();

        }else{

          document
            .getElementById(
              'confirmText'
            )
            .innerHTML =

            `<strong>${name}</strong>, we couldn't reach our booking system just now. Please call <strong>090522 09930</strong> directly for <strong>${service}</strong> with <strong>${doctor}</strong> on <strong>${readableDate}</strong> at <strong>${formatTime(time)}</strong>.`;

        }

      }finally{

        bookingSubmit.disabled =
          false;

        bookingSubmit.textContent =
          'Request appointment';

      }

    }
  );


/* Start loading doctors */

loadDoctors();


