# Localization QA Checklist (EN/ES)

Use this checklist before **every content push** that modifies any public-facing page in English (`/`) or Spanish (`/es/`).

## Publish gate (required)

- [ ] Every EN/ES page pair is green across all five parity checks.
- [ ] Any failed check has a tracked fix and the page pair is blocked from publish until resolved.
- [ ] Final pre-publish reviewer signs off with date.

> **Gate rule:** No English or Spanish page ships unless parity checklist is green.

---

## 1) Message parity

Confirm both language versions communicate the same:

- [ ] Commitments/promises
- [ ] Status statements (e.g., bill status, endorsements, event states)
- [ ] CTA intent (donate, volunteer, contact, events)

**Pass condition:** Meaning is equivalent (translation may differ in wording, but not in intent or factual claims).

## 2) Structural parity

- [ ] Navigation depth is equivalent (same key destinations available)
- [ ] Same key sections appear in each page pair
- [ ] Critical in-page modules appear in both versions (hero, key cards, footer CTA)

**Pass condition:** A user can complete the same journey in EN and ES with comparable effort.

## 3) Metadata parity

For each page pair verify:

- [ ] `<title>` aligned in intent
- [ ] Meta description aligned in intent
- [ ] Open Graph metadata present and equivalent in purpose
- [ ] Canonical tags correct for EN and ES URLs
- [ ] `hreflang` alternates correctly link EN/ES variants

**Pass condition:** Search/social metadata exists and points to the correct language pair.

## 4) Functional parity

- [ ] Forms are present and submit-equivalent
- [ ] Donate links are present and route to intended destination
- [ ] Menu behavior works on desktop/mobile in both locales
- [ ] Analytics tags/scripts are present in both locales

**Pass condition:** Core conversion and tracking behavior is available in both languages.

---

## 5) Paired page checklist (run on each content push)

Mark each row only after validating all five checks above.

| Page pair | Message parity | Structural parity | Metadata parity | Functional parity | Publish gate |
|---|---|---|---|---|---|
| `index.html` ↔ `es/index.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `about.html` ↔ `es/about.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `issues.html` ↔ `es/issues.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `endorsements.html` ↔ `es/endorsements.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `events.html` ↔ `es/events.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `contact.html` ↔ `es/contact.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `why-im-running.html` ↔ `es/why-im-running.html` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `record-contrast.html` ↔ `es/record-contrast.html` | [ ] | [ ] | [ ] | [ ] | [ ] |

### Sign-off

- Reviewer: ____________________
- Date (UTC): __________________
- Notes / follow-ups: ________________________________________________
