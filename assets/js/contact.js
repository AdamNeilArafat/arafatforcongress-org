document.addEventListener('DOMContentLoaded', () => {
  const yrEl = document.getElementById('yr');
  if (yrEl) yrEl.textContent = new Date().getFullYear();

  const nameInput = document.getElementById('name');
  const contactInput = document.getElementById('contact');
  const topicInput = document.getElementById('topic');
  const messageInput = document.getElementById('message');
  const errorEl = document.getElementById('messageError');
  const generalBtn = document.getElementById('generalEmailButton');
  const volunteerBtn = document.getElementById('volunteerEmailButton');
  const form = document.getElementById('contactForm');

  function validateMessage() {
    if (messageInput.value.trim().length < 15) {
      messageInput.classList.add('is-invalid');
      if (errorEl) errorEl.textContent = 'Please enter at least 15 characters.';
      return false;
    }
    messageInput.classList.remove('is-invalid');
    if (errorEl) errorEl.textContent = '';
    return true;
  }

  function buildGeneralBody() {
    const n = nameInput.value.trim();
    const c = contactInput.value.trim();
    const t = topicInput.value;
    const m = messageInput.value.trim();
    const lines = [];
    if (n) lines.push(`Name: ${n}`);
    if (c) lines.push(`Contact: ${c}`);
    lines.push(`Topic: ${t}`);
    lines.push('');
    lines.push('Message:');
    lines.push(m);
    return lines.join('\n');
  }

  function buildVolunteerBody() {
    const n = nameInput.value.trim();
    const c = contactInput.value.trim();
    const m = messageInput.value.trim();
    const lines = [];
    if (n) lines.push(`Name: ${n}`);
    if (c) lines.push(`Contact: ${c}`);
    lines.push('How I can help:');
    lines.push(m);
    return lines.join('\n');
  }

  if (generalBtn) {
    generalBtn.addEventListener('click', e => {
      if (!validateMessage()) { e.preventDefault(); return; }
      const n = nameInput.value.trim();
      const href = `mailto:info@arafatforcongress.org?subject=${encodeURIComponent('General question from ' + (n || 'supporter'))}&body=${encodeURIComponent(buildGeneralBody())}`;
      generalBtn.href = href;
    });
  }

  if (volunteerBtn) {
    volunteerBtn.addEventListener('click', e => {
      if (!validateMessage()) { e.preventDefault(); return; }
      const n = nameInput.value.trim();
      const href = `mailto:volunteer@arafatforcongress.org?subject=${encodeURIComponent('Volunteer sign-up from ' + (n || 'supporter'))}&body=${encodeURIComponent(buildVolunteerBody())}`;
      volunteerBtn.href = href;
    });
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validateMessage()) return;
      const n = nameInput.value.trim();
      const t = topicInput.value;
      const c = contactInput.value.trim();
      const m = messageInput.value.trim();
      const lines = [];
      if (n) lines.push(`Name: ${n}`);
      if (c) lines.push(`Best contact: ${c}`);
      lines.push(`Topic: ${t}`);
      lines.push('');
      lines.push('Story:');
      lines.push(m);
      const subject = `Story: ${t}${n ? ' - ' + n : ''}`;
      const body = lines.join('\n');
      const href = `mailto:info@arafatforcongress.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = href;
    });
  }
});
