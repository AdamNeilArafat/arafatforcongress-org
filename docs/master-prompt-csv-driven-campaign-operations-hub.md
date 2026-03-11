# MASTER PROMPT — CSV-DRIVEN CAMPAIGN OPERATIONS HUB

This prompt incorporates the latest dashboard review and closes remaining scope gaps by defining the platform as a **single CSV-driven campaign operations hub** where every module reads and writes to one shared voter record.

---

You are an expert full-stack engineer and product designer. Build a **free or near-free, self-hosted, open-source campaign field operations hub** that uses an **imported CSV as the main source dataset** and turns that data into a unified system for:

* mapping
* route optimization
* flyer distribution
* text banking
* email banking
* phone banking
* canvassing
* follow-up tracking
* volunteer assignments
* reporting and analytics

The system must be simple enough for non-technical volunteers, fast enough for large voter files, and visually clean like modern campaign software, but easier to use.

---

## PRIMARY PRODUCT GOAL

The app is a **central command dashboard** for campaign outreach.
An imported CSV populates all modules automatically.

If a voter has:

* a valid address → map, flyer, canvass
* a phone number → phone bank, text bank
* an email → email bank
* contact history → follow-up and reporting
* support status or tags → prioritization and routing

All actions must update the same master voter profile.

---

## CSV AS MASTER DATA SOURCE

The imported CSV must populate and normalize the full system.

Supported source columns may include fields like:

* StateVoterID
* FName
* MName
* LName
* Birthyear
* Gender
* RegStNum
* RegStFrac
* RegStName
* RegStType
* RegUnitType
* RegStPreDirection
* RegStPostDirection
* RegStUnitNum
* RegCity
* RegState
* RegZipCode
* Address
* CountyCode
* PrecinctCode
* PrecinctPart
* LegislativeDistrict
* CongressionalDistrict
* Mail1
* Mail2
* Mail3
* MailCity
* MailZip
* MailState
* MailCountry
* RegistrationDate
* LastVoted
* StatusCode
* Phone
* Email

The system must:

* ingest CSV files
* map source columns to internal schema
* clean and standardize addresses
* detect duplicate voters
* geocode addresses
* generate map pins
* detect phones and emails
* assign records into phone, text, email, canvass, and flyer workflows automatically

If imported data changes, the system should support re-import and merge without destroying prior contact history.

---

## LANDING PAGE / DASHBOARD HUB

The home page must be the **campaign command center**.

### Top section

Show high-level performance cards:

* total records imported
* mapped addresses
* valid phones
* valid emails
* texts sent
* opt-outs
* calls completed
* emails sent
* doors knocked
* flyers delivered
* follow-ups needed
* supporters identified
* undecided voters
* volunteers active
* routes assigned
* routes completed

### Main section

Interactive district map using imported CSV addresses.

Map features:

* clustered pins for scale
* color-coded voter or household status
* filter by precinct, city, district, support level, volunteer status, contact status, follow-up, and outreach type
* draw/select area on map
* click pin to open profile
* heatmap overlays for concentration and targeting
* optional territory outlines

Pin/status examples:

* green = supporter
* blue = contacted
* yellow = follow-up needed
* red = opposed
* gray = untouched
* purple = flyer priority
* orange = high-value undecided

---

## VOTER / HOUSEHOLD PROFILE PANEL

Clicking a pin or row opens a full profile.

Include:

* full name
* address
* map location
* age / birthyear
* district / precinct
* household grouping if multiple voters share address
* phone numbers
* email addresses
* source file / import metadata
* tags
* support level
* issue interests
* volunteer notes
* contact history timeline
* assigned volunteer
* follow-up due date
* suppression flags

Action buttons:

* send text
* make call
* send email
* assign canvass
* assign flyer drop
* mark follow-up
* mark supporter / undecided / oppose
* add note
* opt out / do not contact

---

## MAPPING

Build robust mapping from imported CSV addresses.

Requirements:

* geocode all valid addresses
* household-level grouping option
* clustering for large files
* pin filtering
* polygons or turf selection tools
* route launch from selected list
* support heatmap
* turnout heatmap
* follow-up heatmap
* flyer priority heatmap

Support both:

* individual voter view
* household/address view

---

## ROUTE OPTIMIZATION

The system must generate optimized routes for:

* canvassing
* flyer delivery
* volunteer driving
* walking turfs

Use free/open tools where possible:

* OpenStreetMap
* OSRM
* Leaflet

Features:

* optimize for walking or driving
* shortest practical sequence
* cluster nearby homes
* start/end point selection
* estimated distance and time
* printable walk lists
* mobile route view
* assign route to volunteer
* mark route complete
* re-optimize after houses are completed or skipped

---

## FLYER DISTRIBUTION INTELLIGENCE

Build a dedicated flyer distribution system, not just a simple drop marker.

The system should score **best places to prioritize flyer placement or delivery** based on imported address data plus map logic.

### Flyer scoring logic should estimate:

* foot traffic likelihood
* vehicle visibility
* corner lot or high-exposure position
* apartment / multi-unit density
* ease of access
* parking ease for volunteer
* likely visual exposure
* proximity to major roads, arterials, schools, transit stops, commercial nodes, parks, and community gathering areas
* repeat visibility opportunity
* whether the location is safe and practical for volunteer access

Create a **flyer priority score** and categorize addresses/areas:

* premium visibility
* strong visibility
* standard drop
* low priority
* inaccessible / skip

Allow admins to tune the scoring weights.

Flyer workflow:

* map layer for flyer targets
* assign route
* mark delivered
* mark inaccessible
* mark refused
* add notes on placement quality
* photo upload optional
* report completion stats

Also provide a separate mode for identifying **general high-visibility flyer zones** even beyond voter addresses, such as near busy intersections, community boards, apartment clusters, transit corridors, and commercial areas.

---

## TEXT BANKING

Build a full text banking page tied to imported phone data.

### Must include:

* list building from CSV records
* segmentation by precinct, support level, age, tags, turnout likelihood, issue interest, and follow-up status
* script panel
* send panel
* preview panel
* result buttons
* response inbox
* auto logging

### Text sending requirements

Support free or low-cost sending approaches with modular backends:

1. email-to-SMS gateways where available
2. API provider plug-in architecture for future providers
3. admin-selectable sending method by campaign size

The UI must feel easy and volunteer friendly.

### Text banking interface

Include:

* script shown on screen
* first name merge fields
* send button
* skip button
* wrong number
* no response
* supporter
* undecided
* opposed
* follow-up
* donation interest
* volunteer interest
* needs callback

This should feel similar to DNC-style or major campaign relational/text tools.

### Opt-out / compliance

Text banking must include:

* required opt-out language option in scripts
* STOP / UNSUBSCRIBE / END / QUIT detection
* automatic suppression list
* do-not-text flag
* no further sends to opted-out numbers
* opt-out reporting
* manual override only for admins with audit log
* compliance note on each contact record

### Reply handling

Incoming replies should be:

* logged
* threaded per voter
* auto-classified using rules and optional AI
* surfaced to volunteers/admins for response

---

## EMAIL BANKING

Build an email banking module using imported email addresses.

Features:

* create and save templates
* personalization tokens
* segmentation
* send individually or in batches
* volunteer or admin send modes
* reply tracking if connected later
* report opens/clicks if provider supports it
* bounce logging
* unsubscribe / do-not-email support
* follow-up tagging

Actions:

* sent
* bounced
* replied
* unsubscribed
* supporter
* undecided
* opposed
* donation interest
* volunteer interest

---

## PHONE BANKING

Build a full phone banking page using imported phone numbers.

The interface should mimic modern campaign calling tools.

Include:

* voter queue
* click-to-call integration placeholder or manual dial workflow
* on-screen call script
* issue talking points
* rebuttal notes
* result buttons
* follow-up scheduling
* note field
* call timer
* next contact button

Result buttons should include:

* no answer
* left voicemail
* bad number
* supporter
* lean supporter
* undecided
* lean oppose
* oppose
* follow-up required
* wants yard sign
* wants volunteer info
* wants donation link
* deceased
* moved
* do not call

All actions must update the master profile and reporting.

---

## CANVASSING

Build a canvassing page from imported address-based data.

Features:

* map/list toggle
* route creation
* walk packets
* household grouping
* door script
* issue prompts
* result buttons
* notes
* supporter ID
* yard sign interest
* literature left
* no one home
* inaccessible
* hostile / do not return
* follow-up requested

Canvassing results should update the central voter file immediately.

---

## REPORTING BUTTONS / CAMPAIGN ACTION CODING

Every outreach module should use standardized result buttons so data stays consistent across text, call, email, canvass, and flyer actions.

Build a common action taxonomy for reporting:

* contacted
* no contact
* supporter
* undecided
* opposed
* follow-up
* opt-out
* bad data
* moved
* wrong number
* bad email
* needs volunteer follow-up
* donation lead
* yard sign lead
* event invite target

This should make reporting easy across all outreach types.

---

## REPORTING AND ANALYTICS

Provide campaign manager analytics.

Dashboards should show:

* outreach by type
* contact rates
* supporter identification rate
* opt-out rate
* response rate
* route completion
* flyer completion
* volunteer productivity
* by-precinct breakdown
* by-city breakdown
* by-script breakdown
* by-date breakdown

Visualizations:

* map heatmaps
* trend charts
* funnel views
* volunteer leaderboard
* support concentration map
* follow-up concentration map

---

## ASSIGNMENTS AND VOLUNTEER WORKFLOW

Roles:

* admin
* organizer/coordinator
* volunteer

Volunteer tools:

* assigned route list
* assigned text list
* assigned call list
* scripts visible at all times
* one-click result buttons
* simple note entry
* mobile-friendly layout

Coordinator tools:

* assign batches
* monitor progress live
* reassign stale work
* review notes
* export reports

Admin tools:

* full data import/export
* suppression management
* script management
* scoring model settings
* audit logs
* analytics and system settings

---

## DATA MODEL

Design the database so imported CSV data flows into these linked entities:

* voters
* households
* addresses
* phones
* emails
* contact attempts
* outreach results
* volunteer assignments
* flyer scores
* routes
* scripts
* suppression lists
* tags
* notes
* imports

Every contact attempt must be logged with:

* who did it
* when
* which module
* which script/template
* outcome
* follow-up status

---

## FREE / OPEN-SOURCE ARCHITECTURE

Prefer tools that are free and self-hosted where possible.

Suggested stack:

* React or Next.js frontend
* Tailwind UI
* Node.js backend
* PostgreSQL database
* Prisma or equivalent ORM
* Leaflet + OpenStreetMap for map
* Nominatim or geocoding abstraction
* OSRM for route optimization
* queue/job system for imports and geocoding
* modular sender architecture for text/email/call integrations

Avoid locking the design into expensive providers.

---

## PERFORMANCE

The system must support large imported CSV files and remain fast.

Requirements:

* 100k+ records supported
* background import jobs
* map clustering
* pagination
* filter caching
* deduping
* retry logic for geocoding
* audit-safe data merge on re-import

---

## UX REQUIREMENTS

The platform must be:

* clean
* obvious
* mobile-friendly
* fast
* volunteer-proof
* map-first
* action-first

Volunteers should be able to understand their next step within seconds.

---

## WHAT TO BUILD

Generate:

1. full product architecture
2. database schema
3. CSV import pipeline
4. map and geocoding workflow
5. flyer scoring system
6. route optimization workflow
7. text banking module with opt-out support
8. email banking module
9. phone banking module with script and result buttons
10. canvassing module
11. analytics dashboard
12. volunteer/admin role system
13. UI page structure
14. API routes
15. recommended free/open-source services
16. seed data examples
17. suggested folder structure
18. implementation plan by phase

Build it as a real working app, not a concept mockup.

---

## PRODUCT STANDARD

This should feel like a better, easier, cheaper alternative to traditional campaign software, with the dashboard home page acting as the central operations hub powered by imported CSV data.

---

## Optional Enhancements

* Add **household mode** so one door/flyer visit updates everyone at that address.
* Add **territory drawing tools** so organizers can build turfs visually on the map.
* Add **priority scores** that combine turnout, persuasion value, contactability, and flyer visibility.
* Add **suppression lists** across phone, text, and email so compliance is automatic.
* Add **script testing** so the campaign can compare which call/text/email scripts perform best.
* Add **offline/mobile canvass mode** for volunteers in weak-signal areas.
* Add **unified follow-up queue** so every undecided, donor lead, yard-sign request, or volunteer interest gets surfaced in one place.
