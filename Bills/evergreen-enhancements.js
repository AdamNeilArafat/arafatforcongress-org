/* evergreen-enhancements.js
 * Fixes autofill validity, Bootstrap 5 validation UX, and handles submit -> Apps Script
 */
(() => {
  // === CONFIG ===
  const API = "https://script.google.com/macros/s/AKfycbyHPZAWXfICEXJI6ipXLXF5cAh5gQe3U_616AV2y_XROk0vjex_fYG9MmL9aI9TMcgA/exec";
  // If your backend expects other field names, adjust the payload mappers below.

  // --- Helpers ---
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);

  function setMsg(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("text-danger", "text-muted");
    el.classList.add(ok ? "text-success" : "text-danger");
  }

  function toggleBtn(btn, on) {
    if (!btn) return;
    btn.disabled = !on;
    btn.setAttribute("aria-busy", on ? "false" : "true");
    btn.classList.toggle("disabled", !on);
  }

  function formToJSON(form) {
    const data = {};
    $$("input,select,textarea", form).forEach((f) => {
      if (!f.name && f.id) data[f.id] = f.value.trim();
      else if (f.name) data[f.name] = f.value.trim();
    });
    return data;
  }

  function utmFromURL() {
    const p = new URLSearchParams(location.search);
    return {
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || "",
      utm_term: p.get("utm_term") || "",
      utm_content: p.get("utm_content") || ""
    };
  }

  // Autofill can skip 'input' events; force-check values after paint
  function forceValidateAutofill(form) {
    setTimeout(() => validateAllInputs(form), 150);   // after initial paint
    setTimeout(() => validateAllInputs(form), 800);   // after autofill settles
  }

  function validateAllInputs(form) {
    $$("input,textarea,select", form).forEach((inp) => {
      // Trigger browser constraint check
      markValidity(inp);
    });
  }

  function markValidity(input) {
    // Don't apply styles for optional, empty fields
    const optionalEmpty = !input.required && !input.value;
    const valid = optionalEmpty ? true : input.checkValidity();

    input.classList.remove("is-valid", "is-invalid");
    if (!input.form.classList.contains("was-validated")) {
      // Lightweight live feedback before submit
      if (input.value) input.classList.add(valid ? "is-valid" : "is-invalid");
    } else {
      // Bootstrap style after submit attempt
      input.classList.add(valid ? "is-valid" : "is-invalid");
    }
    return valid;
  }

  function clearValidation(form) {
    form.classList.remove("was-validated");
    $$("input,textarea,select", form).forEach((i) => {
      i.classList.remove("is-valid", "is-invalid");
    });
  }

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
      redirect: "follow",
      mode: "cors",
    });
    // Apps Script often returns 200 with JSON. If your script returns text, this handles both.
    const text = await res.text();
    try { return { ok: res.ok, data: JSON.parse(text) }; }
    catch { return { ok: res.ok, data: text }; }
  }

  // Local optimistic counter bump
  function bumpCount(elId) {
    const el = byId(elId);
    if (!el) return;
    const cur = parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
    const next = Number.isFinite(cur) ? cur + 1 : 1;
    el.textContent = String(next);
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 600);
  }

  // Wire a signature form
  function wireSignatureForm({
    formId, type, fields, countElId, msgElId, btnSelector = "button[type=submit]"
  }) {
    const form = byId(formId);
    if (!form) return;

    const msgEl = byId(msgElId);
    const btn = $(btnSelector, form);

    // Add names & autocomplete hints if missing (helps autofill)
    fields.forEach(({ id, name, autocomplete }) => {
      const el = byId(id);
      if (!el) return;
      if (name) el.name = name;
      if (autocomplete) el.setAttribute("autocomplete", autocomplete);
    });

    // Real-time validation feedback (incl. autofill)
    $$("input,textarea,select", form).forEach((inp) => {
      ["input", "change", "blur"].forEach(evt =>
        inp.addEventListener(evt, () => markValidity(inp), { passive: true })
      );
    });
    forceValidateAutofill(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      // Ensure browser validates required fields
      form.classList.add("was-validated");

      // Mark each input and track overall validity
      let allValid = true;
      $$("input,textarea,select", form).forEach((i) => {
        if (!markValidity(i)) allValid = false;
      });
      if (!allValid) {
        setMsg(msgEl, "Please fix the highlighted fields.", false);
        return;
      }

      // Build payload for Apps Script
      const base = formToJSON(form);
      const payload = {
        type,
        timestamp: new Date().toISOString(),
        referrer: document.referrer || "",
        user_agent: navigator.userAgent || "",
        page: location.href,
        ...utmFromURL(),

        // Map known fields to a stable schema your Apps Script can store
        // Candidate fields fallback to voter where applicable
        first_name: base.candidateFirst || base.voterFirst || "",
        last_name:  base.candidateLast  || base.voterLast  || "",
        email:      base.candidateEmail || base.voterEmail || "",
        city:       base.candidateCity  || base.voterCity  || "",
        state:      base.candidateState || base.voterState || "",
        // Explicit flags
        is_candidate: type === "candidate" ? "true" : "false"
      };

      // Candidate confirmation checkbox
      if (type === "candidate") {
        const ok = byId("candidateConfirm");
        if (!ok || !ok.checked) {
          setMsg(msgEl, "You must confirm you are a candidate.", false);
          return;
        }
        payload.candidate_confirm = "true";
      }

      toggleBtn(btn, false);
      setMsg(msgEl, "Submitting…", true);

      try {
        const { ok, data } = await postJSON(API, payload);
        if (!ok) throw new Error(typeof data === "string" ? data : "Request failed");

        // Success UX
        setMsg(msgEl, "Thank you! Your signature was recorded.", true);
        bumpCount(countElId);
        // Reset form cleanly (no leftover red)
        form.reset();
        clearValidation(form);
        // Re-validate (keeps optional blanks neutral)
        forceValidateAutofill(form);
      } catch (err) {
        console.error(err);
        setMsg(msgEl, "Sorry—could not submit. Please try again in a moment.", false);
      } finally {
        toggleBtn(btn, true);
      }
    });
  }

  // On ready
  document.addEventListener("DOMContentLoaded", () => {
    // Candidate form
    wireSignatureForm({
      formId: "candidateForm",
      type: "candidate",
      countElId: "candidateCount",
      msgElId: "candidateMsg",
      fields: [
        { id: "candidateFirst", name: "candidateFirst", autocomplete: "given-name" },
        { id: "candidateLast",  name: "candidateLast",  autocomplete: "family-name" },
        { id: "candidateEmail", name: "candidateEmail", autocomplete: "email" },
        { id: "candidateCity",  name: "candidateCity",  autocomplete: "address-level2" },
        { id: "candidateState", name: "candidateState", autocomplete: "address-level1" },
        { id: "candidateConfirm", name: "candidateConfirm" }
      ]
    });

    // Voter form
    wireSignatureForm({
      formId: "voterForm",
      type: "voter",
      countElId: "voterCount",
      msgElId: "voterMsg",
      fields: [
        { id: "voterFirst", name: "voterFirst", autocomplete: "given-name" },
        { id: "voterLast",  name: "voterLast",  autocomplete: "family-name" },
        { id: "voterEmail", name: "voterEmail", autocomplete: "email" },
        { id: "voterCity",  name: "voterCity",  autocomplete: "address-level2" },
        { id: "voterState", name: "voterState", autocomplete: "address-level1" }
      ]
    });

    // Optional: initialize counts from your backend if available.
    // Uncomment and implement your counts API if you have one.
    /*
    fetch(API + "?fn=counts")
      .then(r => r.json())
      .then(data => {
        if (data && typeof data.candidates === "number") byId("candidateCount").textContent = data.candidates;
        if (data && typeof data.voters === "number") byId("voterCount").textContent = data.voters;
      })
      .catch(() => {});
    */
  });
})();
