/* =========================================================
   RAG CHAT
   ========================================================= */

async function queryRAGEngine(userQuery){

  try{

    return await apiFetch(
      '/api/rag-chat',
      {
        method:'POST',

        body:JSON.stringify({
          query:userQuery
        })
      }
    );

  }catch(err){

    return {
      text:
        "I couldn't reach our system just now — please call 090522 09930, or try again in a moment.",

      action:null
    };

  }

}


/* =========================================================
   CHAT UI
   ========================================================= */

const chatMessages =
  document.getElementById('chatMessages');

const chatForm =
  document.getElementById('chatForm');

const chatInput =
  document.getElementById('chatInput');

const chatPanel =
  document.getElementById('chatPanel');

const chatLauncher =
  document.getElementById('chatLauncher');

let greeted = false;


function openChat(){

  chatPanel.classList.add('open');

  chatLauncher.style.display = 'none';

  if(!greeted){

    greeted = true;

    addMessage(
      'bot',
      "Hi, I'm Dr. Chandu AI 👋 Ask me about treatments, pricing, hours, or say \"book appointment\" and I'll help you get started."
    );

  }

  chatInput.focus();

}


function closeChat(){

  chatPanel.classList.remove('open');

  chatLauncher.style.display = 'flex';

}


chatLauncher.addEventListener(
  'click',
  openChat
);


document
  .getElementById('chatClose')
  .addEventListener(
    'click',
    closeChat
  );


function addMessage(role,text){

  const div =
    document.createElement('div');

  div.className =
    'msg ' + role;

  div.textContent = text;

  chatMessages.appendChild(div);

  chatMessages.scrollTop =
    chatMessages.scrollHeight;

  return div;

}


function addTyping(){

  const div =
    document.createElement('div');

  div.className =
    'msg bot typing';

  div.innerHTML =
    '<span></span><span></span><span></span>';

  chatMessages.appendChild(div);

  chatMessages.scrollTop =
    chatMessages.scrollHeight;

  return div;

}


function addActionButton(action){

  const wrap =
    document.createElement('div');

  wrap.className = 'msg-action';

  const btn =
    document.createElement('button');

  btn.textContent =
    action.label;

  btn.addEventListener(
    'click',
    () => {

      prefillAndScrollToBooking(
        action.service,
        action.doctor
      );

    }
  );

  wrap.appendChild(btn);

  chatMessages.appendChild(wrap);

  chatMessages.scrollTop =
    chatMessages.scrollHeight;

}


let pendingDoctorName = '';


function prefillAndScrollToBooking(
  serviceName,
  doctorName
){

  if(serviceName){

    const opt =
      Array.from(
        svcSelect.options
      ).find(
        o => o.value === serviceName
      );

    if(opt){

      svcSelect.value =
        serviceName;

    }

  }


  if(doctorName){

    const opt =
      Array.from(
        doctorSelect.options
      ).find(
        o => o.value === doctorName
      );

    if(opt){

      doctorSelect.value =
        doctorName;

      doctorSelect.dispatchEvent(
        new Event('change')
      );

      pendingDoctorName = '';

    }else{

      pendingDoctorName =
        doctorName;

    }

  }


  closeChat();

  document
    .getElementById('booking')
    .scrollIntoView({
      behavior:'smooth'
    });

  document
    .getElementById('pName')
    .focus({
      preventScroll:true
    });

}


async function submitToChat(text){

  addMessage(
    'user',
    text
  );

  const typingEl =
    addTyping();

  const {
    text:replyText,
    action
  } =
    await queryRAGEngine(text);

  typingEl.remove();

  addMessage(
    'bot',
    replyText
  );

  if(action)
    addActionButton(action);

}


chatForm.addEventListener(
  'submit',
  e => {

    e.preventDefault();

    const val =
      chatInput.value.trim();

    if(!val)
      return;

    chatInput.value = '';

    submitToChat(val);

  }
);


document
  .getElementById('quickChips')
  .addEventListener(
    'click',
    e => {

      const chip =
        e.target.closest('.chip');

      if(!chip)
        return;

      submitToChat(
        chip.dataset.q
      );

    }
  );


