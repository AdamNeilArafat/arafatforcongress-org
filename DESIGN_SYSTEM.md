# Arafat for Congress — Design System

> Reference guide for the `arafatforcongress.org` website. Covers color tokens,
> typography, component patterns, and the per-page UX layout decisions.

---

## 1. Color Palette

All colors are defined as CSS custom properties on `:root` inside `index.html`
and shared via the external `styles.css` stylesheet.

| Token | Hex / Value | Usage |
|---|---|---|
| `--navy` | `#05101e` | Primary text, headings, brand name |
| `--navy-2` | `#091b36` | Secondary headings, bold labels, icon text |
| `--ink` | `#05101e` | Body copy default (same as `--navy`) |
| `--muted` | `#4b5568` | Supporting body copy, card paragraphs |
| `--brand` | `#1d4fa8` | Primary brand blue (buttons, links, accents) |
| `--brand-dark` | `#143480` | Button gradient end, hover states |
| `--gold` | `#b8860d` | Gold accent (PAC strip, fundraising, dividers) |
| `--gold-light` | `rgba(184,134,13,0.12)` | Gold tinted chip/badge backgrounds |
| `--radius` | `12px` | Global border-radius token for all cards/panels |

**Page background** — not a flat color; uses a subtle radial gradient:
```css
--bg: radial-gradient(
  1200px 700px at 20% -10%,
  rgba(29,79,168,0.08),   /* brand-blue wash, top-left */
  transparent 55%
), #f0f4fa;               /* light steel-blue base */
```

---

## 2. Typography

**Font stack** — system-native, no external font dependency:
```css
font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter,
             "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
```

| Role | Size | Weight |
|---|---|---|
| Hero H1 | `clamp(2.1rem, 4.6vw, 3.15rem)` | 900 |
| Section H2 | `clamp(1.65rem, 3vw, 2rem)` | 800 |
| Card H3 | `1.06rem` | 800 |
| Nav links | `0.9rem` | 700 |
| Body copy | `1rem` (base) | 500 |
| Small labels / meta | `0.78–0.88rem` | 700–800 |
| Brand name lockup | `1.06rem` | 900 |
| Brand tagline | `0.85rem` | 700 |

---

## 3. Site Header (every page)

Sticky, glassmorphism bar — present identically on all pages.

```
┌──────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│  3px gradient bar: --navy → --brand → gold(0.9)                  │
├──────────────────────────────────────────────────────────────────┤
│  [flag icon] ADAM NEIL ARAFAT        About  Issues  Endorsements │
│              Democrat · WA-10        Events  Contact  [Volunteer] │
└──────────────────────────────────────────────────────────────────┘
  bg: rgba(255,255,255,0.92) + backdrop-filter:blur(14px)
```

- **Top accent bar** — 3 px, `linear-gradient(90deg, --navy, --brand, gold 0.9)`
- **Background** — `rgba(255,255,255,0.92)` with `backdrop-filter: blur(14px)` (glassmorphism)
- **Volunteer CTA button** — navy/brand pill, always visible far right
- **Mobile** (`< 980px`) — hamburger toggle collapses nav; PAC disclaimer strip shown below header

---

## 4. Buttons

| Class | Style | Use |
|---|---|---|
| `.btn-primary` | `linear-gradient(160deg, --brand, --brand-dark)` white text | Primary donate / volunteer CTA |
| `.btn-ghost` | `rgba(5,16,30,0.06)` navy text | Secondary actions |
| `.btn-record` | `rgba(29,79,168,0.08)` navy-2 text | Tertiary / soft blue tint |

All buttons share: `border-radius: var(--radius)`, `font-weight: 800`, and a
`transform / filter` hover micro-interaction (`transition: 0.06s / 0.15s ease`).

---

## 5. Per-Page UX Breakdown

### 5.1 Home (`/index.html`)

**Layout: Split-column hero → stacked content sections**

```
┌─────────────────────────┬──────────────────────────┐
│  HERO TEXT              │   HERO IMAGE             │
│  H1 headline            │   (candidate photo)      │
│  Tagline paragraph      │                          │
│  [Volunteer] [Issues]   │                          │
│  [Record]               │                          │
├─────────────────────────┴──────────────────────────┤
│  About card (white panel, --radius)                │
│  H2 + bio paragraph                                │
├────────────────────────────────────────────────────┤
│  Fundraising / donate block (gold accent strip)    │
├────────────────────────────────────────────────────┤
│  Endorsement teaser strip                          │
├────────────────────────────────────────────────────┤
│  Issues preview — 2-column card grid               │
│  [Card] [Card]                                     │
│  [Card] [Card]                                     │
└────────────────────────────────────────────────────┘
```

Key patterns:
- `two-col` CSS Grid for hero (text left, image right)
- `copy-block` white card with `--radius` for bio/about sections
- `fundraising-block` with gold border-left accent
- `endorsement-strip` horizontal scroller or condensed list

---

### 5.2 About (`/about.html`)

Full-width editorial layout. Single column with:
- Large candidate photo (full-bleed or float)
- Long-form bio in `copy-block` panels
- Pull-quote or highlight boxes (`--gold-light` background)

---

### 5.3 Issues (`/issues.html`)

Policy topic grid:
- Section heading per topic area
- `card` components (`white bg`, `--radius`, subtle box-shadow)
- Bullet lists via `.bullet-lines` (CSS Grid gap, `--muted` color)
- Each card: `h3` (navy-2, 800 weight) + `p` (muted, 500 weight)

---

### 5.4 Endorsements (`/endorsements.html`)

Tiered endorser display:
- Prominent individual endorsers with name + title
- Organization logos or name chips
- Status chips using semantic colors:
  - **Confirmed** → green tint background
  - **Pending** → amber / `--gold-light` background
  - **Outreach** → neutral gray

---

### 5.5 Events (`/events.html`)

Event listing:
- Card per event with date, location, description
- Consistent `--radius` card style
- CTA link / RSVP button per event

---

### 5.6 Contact (`/contact.html`)

Single-column form page:
- Contact form (name, email, message)
- Social links
- Office/mailing info

---

### 5.7 Why I'm Running (`/why-im-running.html`)

Long-form editorial, similar to About:
- `copy-block` sections
- Pull quotes with gold accent
- Personal narrative tone

---

### 5.8 Record & Contrast (`/record-contrast.html`)

Comparison layout:
- Side-by-side or alternating contrast panels
- Issue-by-issue record comparison
- `two-col` or stacked card grid

---

### 5.9 Plan (`/plan.html`)

Policy platform detail:
- Numbered or sectioned policy pillars
- Card grid or accordion pattern
- Supporting data / bullet lists

---

### 5.10 Volunteer Dashboard (`/admin/volunteer-dashboard.html`)

PIN-gated internal CRM view (not public-facing):
- 2×2 team grid (area tiles per district)
- Status chips per volunteer record (green / amber / neutral)
- Admin-only layout, no public nav

---

### 5.11 Regional Landing Pages (`/r/*/index.html`)

Hyper-local pages for each district area:
- Lacey, Lakewood, Olympia, Puyallup-South Hill, Tacoma Central, Tacoma South,
  Tumwater, University Place, Yard Signs, Events
- Shared header/footer; localized headline and map/event content

---

### 5.12 Spanish / Bilingual (`/es/*.html`)

Full Spanish translations of all primary pages:
- `lang="es"` on `<html>`
- `hreflang` alternates pointing back to English equivalents
- Same design system and layout; translated copy only

---

## 6. Global Layout Tokens

| Token | Value | Notes |
|---|---|---|
| `--radius` | `12px` | All cards, panels, buttons |
| Max content width | `~1160px` (inferred) | Centered via `.header-inner` / section wrappers |
| Header height | `~60–68px` | Sticky; content offset accordingly |
| Mobile breakpoint | `< 980px` | Nav collapses to hamburger |

---

## 7. Visitor Journey

```
Landing (/) ──► Issues ──► Endorsements
     │                          │
     ▼                          ▼
Volunteer CTA              Contact/Donate
     │
     ▼
Volunteer Dashboard (PIN-gated)
```

1. **Discovery** — Hero with candidate photo + headline, immediate PAC
   compliance chip, donate/volunteer CTAs above the fold.
2. **Trust-building** — About bio, endorsement strip, issues preview all on
   homepage to reduce clicks to conviction.
3. **Conversion** — Volunteer and Donate buttons persistent in sticky header on
   every page.
4. **Localization** — `/r/*` regional pages and `/es/*` Spanish pages meet
   voters where they are.
5. **Operations** — Volunteer Dashboard provides internal campaign team with
   CRM-style contact tracking behind a PIN gate.

---

## 8. File Structure (design-relevant)

```
/
├── index.html            # Home + embedded :root CSS tokens
├── styles.css            # Shared stylesheet
├── about.html
├── issues.html
├── endorsements.html
├── events.html
├── contact.html
├── why-im-running.html
├── record-contrast.html
├── plan.html
├── 404.html
├── es/                   # Spanish translations
│   ├── index.html
│   ├── about.html
│   ├── issues.html
│   ├── contact.html
│   ├── endorsements.html
│   ├── events.html
│   ├── why-im-running.html
│   └── record-contrast.html
├── r/                    # Regional landing pages
│   ├── lacey/
│   ├── lakewood/
│   ├── olympia/
│   ├── puyallup-southhill/
│   ├── tacoma-central/
│   ├── tacoma-south/
│   ├── tumwater/
│   ├── university-place/
│   ├── yard-signs/
│   └── events/
└── admin/
    └── volunteer-dashboard.html  # PIN-gated CRM view
```


---

## 6. Reuse Inventory (Core Pages)

Audit scope: `index.html`, `issues.html`, `contact.html`, `events.html`, `about.html`.

### Repeated classes/components
- **Header shell**: `.site-header`, `.header-inner`, `.brand`, `.site-nav`, `.nav-link`, `.header-cta`, `.mobile-drawer`
- **CTA buttons**: `.btn`, `.btn-primary`, `.btn-ghost`
- **Section rhythm**: `.section`, `.section-intro`
- **Card surfaces**: `.card`, `.info-card`, `.copy-block`, `.event-card`
- **Footer block**: `.footer-tagline` with repeated nav/legal/spanish-link patterns

### Repeated design tokens
- `--navy`, `--navy-2`, `--muted`, `--brand`, `--brand-dark`, `--gold`
- `--border-soft`, `--shadow-soft`, `--radius`

### Shared CSS source of truth
- `styles.css` remains base global stylesheet.
- `assets/site.css` now holds shared cross-page modules for:
  - footer nav/legal/spanish-language pill (`.site-footer-nav`, `.site-footer-legal`, `.lang-pill`)
  - repeated CTA rows (`.inline-cta-row`, modifiers)
  - reusable card/chip helpers (`.section-shell`, `.chip-btn`)
  - repeated text helpers (`.brand-accent`, `.link-inherit`, `.text-link-strong`)
