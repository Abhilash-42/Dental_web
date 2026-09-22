

/* =========================================================
   DATA: SERVICES
   ========================================================= */

const SERVICES = {

  general:[
    "Check-ups",
    "Teeth Cleaning",
    "Fillings & Sealants",
    "Emergency Care",
    "Paediatrics"
  ],

  cosmetic:[
    "Teeth Whitening",
    "Veneers & Crowns",
    "Bonding",
    "Teeth Reshaping",
    "Laser Dentistry"
  ],

  surgical:[
    "Dental Implants",
    "Root Canals",
    "Extractions",
    "Oral Surgery",
    "Dentures & Bridges",
    "Mouth Guards",
    "X-ray"
  ]

};


function renderServiceList(listId, items){

  const ul =
    document.getElementById(listId);

  items.forEach(name => {

    const li =
      document.createElement('li');

    const span =
      document.createElement('span');

    span.textContent = name;

    const btn =
      document.createElement('button');

    btn.className = 'svc-ask';
    btn.textContent = 'Ask about this';

    btn.addEventListener('click', () => {

      openChat();

      submitToChat(
        `Tell me about ${name}`
      );

    });

    li.appendChild(span);
    li.appendChild(btn);

    ul.appendChild(li);

  });

}


renderServiceList(
  'svc-general',
  SERVICES.general
);

renderServiceList(
  'svc-cosmetic',
  SERVICES.cosmetic
);

renderServiceList(
  'svc-surgical',
  SERVICES.surgical
);


/* Populate booking service dropdown */

const svcSelect =
  document.getElementById('svcSelect');

Object.values(SERVICES)
  .flat()
  .forEach(name => {

    const opt =
      document.createElement('option');

    opt.value = name;
    opt.textContent = name;

    svcSelect.appendChild(opt);

  });


