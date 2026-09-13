# MediKIOSK Frontend Documentation

## 1. Overview

The MediKIOSK frontend is a browser-based clinical intake and triage application designed for a hospital or clinic environment. It is not a general-purpose web app; it is a highly focused workflow system that supports the patient-facing intake experience and the clinician-facing review experience.

At a high level, the application provides two major modes:

- Kiosk mode: for patients checking in, reading consent, answering intake questions, and uploading documents
- Dashboard mode: for clinicians, doctors, or operational staff reviewing patient queues, reviewing records, and completing consented intake summaries

The frontend relies on a simple but effective architecture: plain JavaScript modules, a custom hash router, a central state store, and a layered API client. It uses Vite as the bundler and runtime wrapper, and the user interface is composed primarily of generated DOM elements and CSS classes rather than a stateful UI framework. This creates a compact, maintainable SPA that is practical for a healthcare self-service kiosk environment.

The system has a strong clinical orientation. The patient flow is built to feel like guided registration, followed by medical intake, then review by a care provider. The doctor dashboard reviews the output of the intake process and transforms AI-generated material into a structured, editable, clinically meaningful summary. The product is therefore not just a UI layer; it is a bridge between patient interaction, AI-enabled medical intake, and the clinical staff workflow.

---

## 2. Product Purpose and Core User Journeys

The frontend is designed around a few important user journeys.

### 2.1 Patient Journey

A patient begins at the kiosk and is guided through a minimal but clinically complete intake flow. The expected process is:

1. The patient enters their name and optional hospital identifier.
2. The system creates or associates the patient record.
3. A session is initialized for the visit.
4. The patient reads and agrees to the intake and AI-assisted consent notice.
5. The patient answers a set of medical questions through chat.
6. The system may identify urgent symptoms and escalate to priority triage.
7. The patient uploads required documents if relevant.
8. The system completes the patient-side workflow and hands over the case to staff.

This is more than a form. It is a guided clinical intake experience. The patient is not just entering data; the app is participating in a structured health-history collection process that will feed into a clinician review.

### 2.2 Clinical Staff Journey

A doctor or staff member enters the dashboard view and sees a list of all patient sessions. They can:

- monitor queue state
- filter by urgency or status
- open a patient record
- review the transcript generated during intake
- inspect uploaded documents
- review AI-generated structured summary fields
- edit summary content if needed
- finalize treatment and consultation completion

This side of the interface is a clinical operations dashboard and a digital charting helper. It supports triage and review without replacing the hospital’s EHR, but it serves as a tight front-end layer for intake and summary preparation.

### 2.3 Administrative Journey

The admin interface is a system management area for technical or operational staff. It allows them to:

- select the active AI provider
- enable or disable providers
- store or clear API keys
- configure model names
- configure base URLs
- confirm provider health and availability

This layer is separate from typical patient or clinician roles and keeps the app operationally configurable without editing code.

---

## 3. Frontend Architecture at a Glance

The frontend is structured into a few key groups of modules.

### 3.1 Core system modules

The main modules are:

- `src/main.js` — initial app bootstrapping, route registration, app-level state sync, header rendering
- `src/router.js` — custom hash-based router for SPA navigation
- `src/state.js` — pub/sub state container that drives screen updates
- `src/api.js` — thin API layer for backend communication
- `src/components/` — shared UI pieces such as header, modal, toast, accessibility controls, maintenance overlay
- `src/kiosk/` — patient workflow screens and interaction logic
- `src/dashboard/` — queue and doctor review screens
- `src/admin.js` — AI admin configuration interface
- `src/styles/` — CSS theme and section styling

This architecture is intentionally modular and simple. It avoids large component trees or external state-management libraries, but still scales well because each route and screen function is isolated and the state model is centralized.

### 3.2 Why this architecture fits the product

This product demands a lightweight front end that is:

- fast to load
- easy to deploy in a kiosk environment
- robust in offline or degraded conditions
- straightforward for a small team to maintain
- modular enough to support additional patient flow screens later

A framework like React would add overhead for a system that mostly renders screens based on state and API results. This architecture is more surgical and efficient for the use case.

---

## 4. Bootstrap Sequence and App Initialization

The startup flow begins in `src/main.js` and is executed after the DOM is ready.

During startup, the app does the following:

1. Finds the root application element (`#app`).
2. Initializes accessibility features such as contrast tools, font resizing, and keyboard helpers.
3. Creates and injects the global header component.
4. Creates a `main` content container for the active route.
5. Reads the current URL hash and sets the initial app mode.
6. Calls `initRouter(mainContent)` so the route system can render the correct section.

The state is initialized to a default mode, usually kiosk mode, unless the hash indicates dashboard or admin navigation. This means a user opening the app via a direct URL or empty local path will fall into the patient kiosk workflow by default rather than a blank or broken page.

### 4.1 Initial mode logic

The logic in `main.js` checks the current path and hash before deciding which screen to show:

- if the path indicates admin access, it sets the mode to dashboard and navigates to `#/admin`
- if the initial hash is under `#/dashboard` or `#/admin`, it sets dashboard mode
- otherwise it sets kiosk mode and navigates to `#/kiosk`

This is a practical design decision because kiosk mode is the generic default, while the dashboard/admin are more specialized staff access points.

### 4.2 Why this matters

This startup handling ensures the app always loads into a meaningful route and never leaves the user staring at an empty panel. In a kiosk or clinical environment, a system that defaults to the correct entry flow is preferable to one that requires a manual navigation step or has broken route handling.

---

## 5. Routing Model: Hash-Based SPA Gateways

The router is a lightweight custom solution in `src/router.js` rather than a standard framework router.

### 5.1 Router responsibilities

The router supports:

- registering routes with `route(hash, handler)`
- updating the hash with `navigate(hash)`
- reading the current route with `currentRoute()`
- listening for `hashchange` events with `initRouter(container)`

The route system tracks a `currentCleanup` function so that a previous route’s event handlers and side effects are cleaned up before the next route is mounted.

### 5.2 Prefix matching

The router also supports prefix matching by detecting patterns like `#/dashboard/session` when the exact route is not found. This is useful because some routes are nested or near variants of each other. It allows the SPA to resolve the correct route even when a session detail route starts with the same prefix as dashboard routing.

### 5.3 Route list and site boundaries

The major routes are:

- `#/kiosk` — patient-facing intake flow
- `#/dashboard` — queue view for clinicians
- `#/dashboard/session` — patient-specific chart and summary review
- `#/admin` — AI provider configuration and operational settings

Each route is treated as a gateway into a different mode of the software. This is conceptually important because the app is not just a single page; it is a system with multiple user contexts.

### 5.4 Fallback strategy

If no route matches, the app falls back to the default kiosk route. This is an intentional and safe behavior because the patient intake flow is the default primary use case; a broken route or stale hash should not leave the system uninitialized.

---

## 6. Application State Model

The app’s state is defined in `src/state.js` and acts as the central coordination layer for UI rendering and business flow logic. It is intentionally small but broad enough to support the entire frontend.

### 6.1 State object structure

The state includes:

- `mode`: current app mode, usually `kiosk` or `dashboard`
- `health`: backend connectivity status and provider health
- `kioskStep`: current step in patient intake flow
- `patient`: currently active patient representation
- `session`: active session record for the current intake
- `chatMessages`: conversation transcript for the session
- `sessions`: list of all sessions for the queue
- `selectedSession`: patient session selected in dashboard
- `sessionHistory`: transcript and structured history payload
- `sessionDocuments`: files associated with a session
- `sessionSummary`: structured doctor summary
- `filter`: queue view filter state

### 6.2 State mutation and subscription model

The app uses a pub/sub pattern: `setState()` updates data and notifies listeners; `subscribe(keys, callback)` registers watchers for specific state keys. This is a minimal reactive system without a framework. It is enough to allow UI components to respond to state changes without manually wiring every update.

Examples:

- changing `kioskStep` triggers the kiosk route handler to render the next screen
- setting `sessions` triggers the queue list to re-render
- updating `selectedSession` causes detail view data to load
- mutating `health` updates the header status indicator

### 6.3 Why a central state store matters

The app incorporates multiple asynchronous flows across different screens. The patient flow is sequential but API-driven, the queue is polling-based, and the doctor detail page loads multiple datasets. A central state store provides a stable shared memory for all of these independent behaviors. It prevents the app from becoming a pile of disconnected DOM updates and allows each component to draw from a consistent state snapshot.

---

## 7. API Gateway Layer and Data Access Pattern

The frontend communicates with the backend using `src/api.js`, which acts as the API gateway abstraction layer.

### 7.1 Generic request wrapper

The main function is a generic `request(path, options)` wrapper around `fetch()`. It automatically:

- constructs URLs using the base path
- sets `Content-Type: application/json` for JSON requests
- deletes `Content-Type` for `FormData` upload requests
- checks `res.ok`
- parses error responses
- surfaces backend details as exceptions

This means most application code never has to manually call `fetch` and parse responses. It dramatically simplifies the rest of the frontend and centralizes failure handling.

### 7.2 Health and system status calls

The frontend calls `checkHealth()` to query the backend and display connectivity status in the header. This is important because the system must always show whether the backend is reachable and whether the LLM provider is active.

The health object may include:

- general system status
- AI provider name
- reachability boolean

This is rendered as a dynamic indicator dot and displayed text in the header.

### 7.3 Patient and session endpoints

Patient registration and session creation are the first API interactions in the kiosk flow:

- `createPatient({ display_name, external_id, preferred_language })` creates a patient record
- `createSession(patientId)` initializes a new clinical session

Later, the dashboard uses:

- `listSessions()` to fetch queue data
- `getPatient(patientId)` to fetch patient details for display in queue items

This base flow shows how the frontend treats patients and sessions as first-class domain objects.

### 7.4 Clinical history route

The chat workflow is built around `submitMessage(sessionId, message)`, which sends patient text to the backend. The response usually contains:

- an assistant reply
- whether the case has become priority or urgent
- whether intake is complete
- other session metadata for the next UI step

The doctor review page later uses `getHistory(sessionId)` to load the full transcript. This separation is important: the patient chat uses the live intake API, while the clinical review uses the stored history retrieval API.

### 7.5 Documents and summary APIs

Document flow is built around file uploads and listing:

- `uploadDocument(sessionId, file)` uses `FormData`
- `listDocuments(sessionId)` gets attached documents

The summary layer uses:

- `generateSummary(sessionId)`
- `updateSummary(sessionId, structuredJson)`

The actual structured summary is a JSON payload that includes sections such as chief complaint, red flags, medications, allergies, assessment, and plan. The frontend renders them as editable textareas and saves them back to the backend after physician review.

### 7.6 Consent API

Consent is captured through `recordConsent(sessionId, consented)`, which sends a boolean acceptance flag. This ensures the patient’s legal/ethical agreement is recorded at the backend layer, which is critical in a clinical consent scenario.

### 7.7 Why gateway abstraction is important

Keeping all data access in `api.js` gives the rest of the app a clean interface. Instead of each screen manually constructing fetch requests, the screens call domain-level operations. This reduces duplication, ensures consistent error handling, and makes the UI easier to test and maintain.

---

## 8. Kiosk Flow: Detailed Screen-by-Screen Walkthrough

The patient flow is the most important functional part of the app. It is implemented as a step-based UI controlled by the `kioskStep` state.

### 8.1 Step index model

The state value `kioskStep` represents the active screen:

- `0` = registration
- `1` = consent
- `2` = chat intake
- `3` = document upload
- `4` = completion

This is a linear journey, but the app watches the state and re-renders the matching component. This means there is one route (`#/kiosk`) but multiple step states. The route is constant while the content changes.

### 8.2 Registration screen

The first screen is implemented in `src/kiosk/registration.js`.

It asks the patient for:

- full name
- optional registration ID
- preferred language

This is intentionally straightforward and quick. For a hospital kiosk, the initial input needs to be small in volume but high in clarity. The page includes a strong heading, explanatory text, a validation requirement for name, and a registration button.

Upon submit:

1. The app validates the required name field.
2. It creates a patient record through the backend API.
3. It creates a session tied to that patient.
4. It updates global state with both objects.
5. It advances to the consent step.

Importantly, the system does not allow the user to proceed without a valid patient object and a valid session object; this prevents invalid state from entering later steps.

### 8.3 Consent screen

The second step is a consent and disclosure screen. The app explains the scope of AI-assisted intake and shows that the process is not equivalent to diagnosis. It emphasizes that:

- AI collects preliminary information to support the visit
- the process is not an alternate medical opinion
- the data is transmitted to a doctor’s workstation
- urgent symptoms can escalate the case
- the patient may provide supporting documents later

This screen is crucial because it sets the ethical and procedural basis for the rest of the flow. It makes the patient aware before entering sensitive medical information.

If the patient clicks accept, the app records consent and moves forward. If the patient declines, it records the rejection and may stop the process or redirect them to staff.

### 8.4 Chat intake screen

The heart of the patient workflow is the chat assistant in `src/kiosk/chat.js`.

#### UI composition

The chat panel includes:

- a welcome panel
- a transcript area for conversation history
- quick symptom chips
- an input bar for typed responses
- a send button
- a virtual keyboard trigger
- a “done” bar to continue to the upload step

#### Interaction pattern

The chat interface is intentionally designed for touch and kiosk use. Patients can either:

- type a free-form response
- select a symptom chip that pre-fills a common health complaint

This reduces friction and is helpful in hospital environments where text entry speed and readability matter.

#### AI conversation loop

Each patient message is sent to the backend using `submitMessage`. The backend returns the AI’s response, which the frontend then appends to the transcript and speaks aloud if voice support is enabled. The frontend maintains a local `chatMessages` state list and updates it after each exchange.

#### Priority escalation logic

The backend can include metadata such as `is_priority` or `intake_complete`. If `is_priority` is true and the alert has not been shown before, the frontend creates a priority escalation banner and shows a toast warning. This is important for emergency or urgent symptom scenarios.

#### Completion condition

If the backend indicates the intake process is complete, the app disables input and transitions to the next step after a short delay. This is a typical “guided state machine” approach: the backend decides when enough information is collected, and the UI moves along in response.

### 8.5 Document upload screen

The upload step allows patients to attach supporting files such as:

- lab reports
- prescription images
- referral letters
- prior visit documents

The frontend uses a `FormData` object to upload a binary file to the relevant session document endpoint. This is distinct from standard JSON submit calls because files require multipart content handling.

After upload, the files become part of the session record. The doctor dashboard later lists them for review.

### 8.6 Completion screen

The completion step is a simple success state that indicates the patient flow has concluded. It avoids an abrupt end and gives the patient a clear sense that the intake has been registered successfully.

This also marks the transition from patient-facing processing into staff-facing review.

---

## 9. Dashboard and Queue Operations

The doctor dashboard side of the product is implemented in `src/dashboard/queue.js` and `src/dashboard/detail.js`.

### 9.1 Dashboard queue page

The queue page displays all sessions in a neat list. Each session card includes metadata and a status indicator. It is intended to be used on a large monitor or workstation.

The page also includes summary stats:

- in progress count
- awaiting review count
- completed count
- priority count

These cards help clinicians quickly assess workload and emergent cases.

### 9.2 Filter logic

The app supports filters for:

- all patients
- in-progress sessions
- awaiting review sessions
- completed sessions
- priority-only sessions

This is implemented by manipulating the `filter` key in the state and then re-rendering the list. The queue UI is not static; it is a dynamic overview of the current backend state.

### 9.3 Auto-refresh behavior

The queue page refreshes on a polling interval using `setInterval(loadSessions, 15000)`. This keeps the doctor’s screen current without requiring manual refresh. This is useful in a clinical setting where patient intake may be happening continuously.

### 9.4 Queue item click behavior

When a clinician clicks a queue item, the app sets `selectedSession` and navigates to `#/dashboard/session`. This is the transition between overview and deep review.

---

## 10. Session Detail View and EHR Review Experience

The detail page is the doctor-side workbench for the selected session.

### 10.1 Page structure

The detail view includes several sections:

- a back button to return to the queue
- patient identifier banner
- transcript section
- attached document list
- structured clinical summary editor
- action buttons for copy and print
- approval and completion action

This is visually structured as a review page, not as a static form. It is a workspace for verifying and finalizing collected intake data.

### 10.2 Intake transcript section

The transcript displays the raw conversation history from the patient interaction. It shows each message in a user or assistant style block. This is important because the doctor needs to verify the actual wording the patient used and confirm whether the AI generated sensible prompts and answers.

The script is rendered from `history.raw_transcript`, which likely contains the session messages as stored by the backend. This means the UI reuses the backend’s persisted conversation rather than relying on the browser’s ephemeral local state.

### 10.3 Document review section

The document list shows each uploaded file with a filename and upload time. Each file is linked to a route or file path so the doctor can inspect the evidence in a new tab. This is essential in a clinical intake system because supporting materials often drive diagnosis or triage decisions.

### 10.4 Structured summary editor

The summary editor contains fields for structured medical data. It is not a free-form note field; it is designed to map to clinical categories. For example:

- chief complaint
- HPI
- associated symptoms
- medications
- allergies
- red flags
- assessment
- plan

These fields are converted into a JSON object and posted back to the backend using `updateSummary`. The front end does not just show the result; it allows clinically meaningful modification and saves the final result into the patient record.

### 10.5 Copy and print support

The doctor can also copy the summary to the clipboard or print the page. These are highly practical workflow features in a hospital environment, especially when a doctor may want to paste the summary into another system or print a summary for a patient file.

### 10.6 Final completion action

Once the doctor approves the summary, the app calls `updateSummary` and marks the session as completed. It then returns the user to the queue view. This closes the treatment loop in a clean and visible way.

---

## 11. Shared UI Components and Reusable Patterns

The frontend follows a component-style pattern even without a framework. Reusable UI elements are implemented as functions that return DOM nodes or HTML strings.

### 11.1 Header component

The `renderHeader()` function creates a persistent header with these sections:

- brand identity and app title
- accessibility toolbar
- health indicator
- mode switch between kiosk and dashboard
- theme toggle
- admin access button

The header is inserted once and remains consistent across routes, which keeps the app’s structure coherent.

### 11.2 Accessibility controls

The app provides a dedicated accessibility layer with:

- small, default, and large font size controls
- contrast toggling for visually impaired users
- text-to-speech
- virtual keyboard

These are not luxury extras; they are key in a medical kiosk context because users may be older, may have limited dexterity, and may need high readability. The design acknowledges this through large controls and an early-2020s clinical UI approach rather than flashy modern UIs.

### 11.3 Toast notifications

The app also uses a toast system for immediate feedback and warnings. These are shown for actions like:

- registration success
- consent recorded
- AI error or timeout
- flagging urgent case
- summary saved

This is especially important in a kiosk and triage system because it keeps users informed without forcing them into a blocking modal flow.

### 11.4 Maintenance overlay

There is a maintenance component included in the component directory. This suggests the app was designed to support scheduled maintenance windows, downtime, or service degradation states, all of which are likely in clinical operations.

---

## 12. Styling and Design System

Styling is deliberately layered by concern. The files under `src/styles/` are separated by purpose: base layout, reusable components, kiosk layout, dashboard layout, dark mode, and admin mode.

### 12.1 CSS organization

The CSS structure is:

- `index.css`: general page body and foundational tokens
- `components.css`: shared primitives and reusable widget styles
- `kiosk.css`: large-screen kiosk patient experience styling
- `dashboard.css`: staff panel and queue detail styling
- `dark-mode.css`: theme overrides for dark mode
- `admin.css`: configuration and provider card styles

This makes the product easy to maintain and prevents dashboard styling from leaking into patient workflow sections or vice versa.

### 12.2 Design tone

The design language is intentionally professional, clinical, and stable. It uses strong contrast, clean cards, explicit status colors, and clear control hierarchy. It is not designed to be playful or overly consumer-focused. This simply suits a hospital or clinical environment better.

### 12.3 Interaction design decisions

The design includes:

- big buttons for touch interaction
- step indicators for patient progress
- visible status badges and urgency markers
- large readable text in patient modules
- subtle background colors for guidance and success states

These choices reduce confusion and improve speed and clarity during critical workflows.

---

## 13. Accessibility Strategy

Healthcare apps need strong accessibility. The frontend includes accessibility features as first-class behavior rather than late additions.

### 13.1 Font adjustments

The app lets the user select among small, default, and large font sizes, which is useful for older adults or people with eyesight issues. This is especially important in kiosks and hospital reception areas.

### 13.2 High contrast mode

The UI can toggle a high-contrast variant. This addresses situations where readability is poor on standard displays or where the environment has low lighting.

### 13.3 Voice support

The app includes text-to-speech support for chat assistant replies. This can help users who prefer to hear the prompt and response rather than read everything on screen. It is especially useful for public kiosk scenarios or patients with reading challenges.

### 13.4 Virtual keyboard support

The interface includes an on-screen keyboard and triggers for text entry. This is needed because the system may be used on touch terminals where a physical keyboard is absent or not ideal.

### 13.5 Focus and interaction quality

The interface uses accessible HTML controls and a structured flow rather than hidden or forced interactions. Buttons are large, labels are visible, and the patient journey is direct. This helps keep the app usable in environments where the user may be stressed, unfamiliar with technology, or under time pressure.

---

## 14. Error Handling and Operational Resilience

The frontend is built to gracefully handle backend and network failures, which is essential for clinical systems.

### 14.1 API error handling

The `request()` wrapper extracts backend error details and turns them into JavaScript errors with meaningful messages. This prevents “mysterious fetch failed” errors from reaching the user.

### 14.2 Chat timeout handling

The chat module wraps AI requests in an `AbortController` with a timeout of 120 seconds. If the backend or AI assistant hangs, the UI shows a clear timeout message instead of silently failing.

### 14.3 Queue failure handling

The queue page catches failures when loading the session list and shows a toast error to staff. This ensures that the dashboard does not silently fail when the backend is unavailable.

### 14.4 Health indicator

The header checks system health regularly and changes the status indicator based on whether the backend and LLM provider are reachable. This acts as a live operational signal, not just a cosmetic feature.

### 14.5 Graceful degradation

If a route is broken, or a section fails to render, the router falls back to a safe route. Likewise, if an AI provider is unreachable, the health system tells the user instead of crashing the app. These design choices are important in a public healthcare environment where uptime and user trust matter.

---

## 15. Data Flow Across the System

The frontend really behaves like a data bridge between patient-facing intake and clinician-facing review.

### 15.1 Patient registration and session creation

The flow begins when a patient registers. At this point the app creates a patient entity and a clinical session. This is the key piece of linked data that makes the entire rest of the system possible.

### 15.2 AI intake interaction

The patient begins chatting. Their messages are transmitted to the backend, stored as history, and responded to by the AI provider. Each response may include flags about urgency or completeness.

### 15.3 Document capture

Supporting documents are uploaded to the session and stored in the system. These are later reviewed by clinicians in the dashboard.

### 15.4 Staff review and summary verification

The dashboard fetches the current session transcript, documents, and summary metadata. The structured fields are displayed for review and editing. The clinician then saves a clean summary to the backend.

### 15.5 Final completion

Once approved, the session is effectively closed. The dashboard queue and patient workflow no longer treat it as active, and the intake data becomes part of the care record.

This end-to-end flow is what makes the frontend more than just a web form. It is a workflow orchestration layer.

---

## 16. Operational Gateways and the Product Mental Model

The app can be understood as a collection of operational gateways. Each route and each API action is effectively a “gateway” into a different system function.

### 16.1 Patient gateway

`#/kiosk` is the patient gateway. It collects identity, consent, clinical data, and document input.

### 16.2 Queue gateway

`#/dashboard` is the queue gateway. It provides staff with a live view of ongoing cases and triage categories.

### 16.3 Review gateway

`#/dashboard/session` is the review gateway. It allows the doctor to inspect the session and finalize medical documentation.

### 16.4 Admin gateway

`#/admin` is the service-config gateway. It allows operations staff to switch AI providers and manage backend service configuration.

### 16.5 Health gateway

The header health indicator is the operational health gateway. It gives the user a summary of whether the backend or AI subsystem is live.

This conceptual model helps explain why the UI is structured the way it is: the app is not a static product page, but a control surface for several operational functions.

---

## 17. Backend Communication Relationships

The frontend is tightly tied to the backend services installed under the app’s API structure. The backend exposes patient, session, history, documents, consent, and summary endpoints. The frontend acts as the browser-side orchestration layer that calls these endpoints in correct order and uses the results to drive screen transitions.

This relationship creates a clear boundary:

- frontend: presentation, routing, validation, workflow orchestration
- backend: persistence, LLM interaction, session logic, medical data handling, configuration storage

This pattern is important because the browser code should not hold the authoritative record. Instead, it should act as a user interface to backend-managed state.

---

## 18. Strengths of the Frontend Design

This frontend has several important strengths:

- Simplicity: Easy to understand because the structure is straightforward and modular.
- Speed: Lightweight JavaScript and direct DOM updates avoid framework overhead.
- Reliability: Central state and gateway functions reduce inconsistent UI behavior.
- Clinical workflow focus: The steps reflect real clinical intake and review needs.
- Accessibility-minded: Font scaling, contrast, voice, and keyboard support are included.
- Operational awareness: Health checks and triage flags are visible in the interface.
- Maintainability: Each feature is isolated into a module or screen function.

These are all beneficial in health-tech software, where clarity and reliability matter more than purely visual complexity.

---

## 19. Limitations and Trade-Offs

No frontend is perfect, and this one has trade-offs as a result of its simplicity.

### 19.1 No framework abstraction

Because it uses plain JavaScript, the UI logic can become more procedural and harder to scale if the app grows significantly. For a small-to-medium product, this is acceptable; for a large multi-tenant EHR integration, a framework may provide better structure.

### 19.2 Hash-based routing

Hash routing works well in kiosks and local deployment, but it is less modern than history API routing and may be limited in SEO or deep-linking scenarios. That said, this product is not a public marketing site, so the trade-off is acceptable.

### 19.3 Manual DOM management

The app manually creates DOM and attaches listeners. That is manageable for the current scope, but large-scale feature growth could increase complexity unless carefully organized.

### 19.4 Narrow workflow focus

The app is highly optimized for a defined clinical problem. It may not generalize well to a broader healthcare product outside this intake and triage pattern without further abstraction.

These limitations do not invalidate the design; they simply represent the practical trade-offs of building a compact clinical kiosk UI.

---

## 20. Example End-to-End Flow Narrative

The following scenario shows how the frontend behaves in practice:

A patient steps onto the kiosk, enters their name, and selects their language. The registration screen creates a patient record on the backend and creates a session. The app advances to a consent screen where the patient reads the AI intake explanation. Upon acceptance, the app records consent and moves to the chat step. The patient types or taps a symptom chip such as “fever and chills,” and the message is sent to the backend. The backend returns an AI response, the frontend renders it in the chat transcript, and the assistant may flag a case as urgent if there is a red-flag pattern. The patient continues until the intake is complete. The UI then moves them to the upload step, where they can submit lab documents or prescriptions. Once complete, the doctor logs into the dashboard, sees the case in the queue, and opens the session detail view. The doctor reviews both the transcript and documents, checks the structured sections, and updates any necessary summary fields. After approval, the summary is saved and the session is marked complete.

This is the operational core of the entire product.

---

## 21. Practical Summary

The MediKIOSK frontend is a browser-based clinical workflow application built around a patient kiosk, a doctor queue, and an admin configuration screen. It uses a simple hash-based router, a central state store, and a wrapped API layer to orchestrate the complete patient intake and clinical review process. It is designed to support a touch-first healthcare kiosk environment, with strong accessibility options, operational health indicators, alert handling, and rich workflow transitions.

The real value of the frontend is not simply that it renders forms. Its value is that it creates a clear digital path from patient check-in to clinical review. It captures consent, collects intake data, uploads supporting documents, escalates urgent symptoms, and hands everything to a doctor or staff reviewer in a clean and efficient workflow.

In short, MediKIOSK’s frontend is a compact but complete operational frontend for a clinical intake system: patient-facing, staff-facing, and service-configurable, all within a single SPA designed for performance, clarity, and usability in a healthcare environment.

---

## 22. One-Line Product Description

The frontend is a kiosk-first, hash-routed clinical intake and triage SPA that guides patients through registration, consent, AI-assisted history collection, document upload, and doctor-side review, while exposing queue management and AI configuration through dashboard and admin routes.

- system ready
- AI provider offline
- backend offline

This is important because the kiosk depends on both the app and the backend/AI provider being available. The health check acts as a live operational gateway, making system status visible to staff immediately.

---

## 13. Route-to-Function Mapping

The following table summarizes the key route gateways and their responsibilities:

- `#/kiosk` → patient intake flow (registration, consent, chat, upload, completion)
- `#/dashboard` → clinician queue and triage overview
- `#/dashboard/session` → detailed patient review and summary editing
- `#/admin` → AI provider configuration and backend settings
- `#` or fallback → default redirects to kiosk

The app considers the kiosk as the default public entry, while the dashboard and admin routes are staff-only operational sections.

---

## 14. Customer Journey Summary

A typical user journey looks like this:

1. Patient opens the kiosk site.
2. They register with name and language.
3. A backend patient record and session are created.
4. The patient reads and accepts the AI clinical intake consent.
5. The AI asks intake questions.
6. The patient responds using text or symptom shortcuts.
7. If symptoms suggest urgency, the system escalates the case.
8. The patient uploads documents.
9. The intake is marked complete.
10. Clinician staff view the queue.
11. A doctor opens the patient summary and reviews the transcript, docs, and AI-generated clinical summary.
12. The physician edits the summary and approves completion.

This makes the frontend a complete digital front door for clinical intake and staff review.

---

## 15. Security and Operational Notes

The frontend is intentionally thin and delegates important logic to the backend. For example:

- API keys are managed in the admin screen but stored and validated by the backend
- session state is kept server-side and retrieved via API calls
- patient flow is controlled by backend session records
- clinician actions are framed around review and approval rather than raw database edits

This separation ensures the browser interface does not become the single point of trust.

---

## 16. Practical Summary

If you want the shortest functional description of the frontend, it is this:

The MediKIOSK frontend is a hospital intake and review interface built as a hash-routed single-page app. It serves a patient-facing kiosk journey for registration, consent, AI assessment, and document upload, and a staff-facing dashboard for queue management, transcript review, document handling, summary editing, and consultation completion. It connects to the backend through API gateways for health, patients, sessions, history, documents, summary, and consent, and it exposes all major operations through route-based portals such as `/kiosk`, `/dashboard`, `/dashboard/session`, and `/admin`.

That is the system at a high level: a front-end gateway for patient intake, clinical triage, and doctor-side review.# MediKiosk Backend

AI-powered clinical history intake platform for hospital OPDs.

## What This Backend Does

- Register patients
- Start and track kiosk sessions
- Collect patient history through an LLM chat flow
- Upload supporting documents
- Record patient consent
- Generate structured clinical summaries

## Tech Stack

- FastAPI for the API layer
- SQLAlchemy 2.0 and Alembic for database access and migrations
- SQLite by default, PostgreSQL supported via `DATABASE_URL`
- Pydantic v2 and pydantic-settings for validation and config
- OpenAI, Anthropic, Gemini, and Ollama LLM provider support

## Quick Start

### 1. Create a virtual environment

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys and preferred settings
```

### 4. Run database migrations

```bash
alembic upgrade head
```

This creates the SQLite database file (`medikiosk.db`) with all tables.

### 5. Start the server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/health

## Realtime Voice Intake

Voice mode uses Sarvam's realtime speech APIs and the existing history service:

```env
SARVAM_API_KEY=your-sarvam-api-key
SARVAM_STT_MODEL=saaras:v3-realtime
SARVAM_TTS_MODEL=bulbul:v3
SUPPORTED_LANGUAGES=["en-IN","hi-IN","bn-IN","or-IN"]
```

The browser sends mono 16 kHz PCM audio to `ws://localhost:8000/ws/voice/{session_id}`.
Saaras runs with automatic language detection and fast VAD. Only English, Hindi,
Bengali, and Odia turns are accepted for the voice reply. Partial transcripts,
final transcripts, assistant text, and Bulbul audio chunks are returned over the
same socket. STT, LLM, and TTS failures are sent as explicit error events; voice
mode does not generate local fallback replies.

To test locally, install the updated requirements, start the backend and frontend,
create a patient session in the kiosk, accept consent, then allow microphone
access and tap the microphone button. Use the text field when microphone access
or a Sarvam service is unavailable.

## Switching LLM Providers

Change `LLM_PROVIDER` in your `.env` file. No code changes are needed.

### Google Gemini

Recommended for the free tier.

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.7-flash
# Cheaper option: gemini-3.5-flash-lite
```

### Groq

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk-your-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=qwen/qwen3.6-27b
GROQ_MAX_COMPLETION_TOKENS=2048
```

Groq uses an OpenAI-compatible API endpoint, but has separate `GROQ_*`
settings so it can be managed independently from OpenAI. `qwen/qwen3.6-27b`
is the safer default for this text-only intake flow because Groq's GPT-OSS
models can invoke built-in tools, which is not needed for kiosk history-taking.

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

Works with OpenAI-compatible APIs such as Azure OpenAI, vLLM, and LM Studio
by changing `OPENAI_BASE_URL`.

### Anthropic / Claude

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Ollama

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Works with a local Ollama server on your machine.

## Switching to PostgreSQL

1. Install the async Postgres driver:

   ```bash
   pip install asyncpg
   ```

2. Update `DATABASE_URL` in `.env`:

   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/medikiosk
   ```

3. Run migrations:

   ```bash
   alembic upgrade head
   ```

No code changes are required.

## Project Structure

```text
app/
|-- main.py              # FastAPI app factory
|-- config.py            # Settings from .env
|-- database.py          # Async SQLAlchemy engine
|-- dependencies.py      # FastAPI dependency injection
|-- exceptions.py        # Custom errors and handlers
|
|-- models/              # SQLAlchemy ORM models
|   |-- patient.py
|   |-- session.py
|   |-- history_record.py
|   |-- document.py
|   `-- consent_log.py
|
|-- schemas/             # Pydantic request/response schemas
|   |-- patient.py
|   |-- session.py
|   |-- history.py
|   |-- document.py
|   |-- consent.py
|   `-- health.py
|
|-- routers/              # Thin API routers
|   |-- patients.py
|   |-- sessions.py
|   |-- history.py
|   |-- documents.py
|   |-- consent.py
|   `-- health.py
|
|-- services/            # Business logic
|   |-- patient_service.py
|   |-- session_service.py
|   |-- history_service.py
|   |-- document_service.py
|   |-- consent_service.py
|   `-- summary_service.py
|
|-- providers/           # Pluggable provider abstraction
|   |-- llm/             # OpenAI, Anthropic, Gemini, Ollama
|   |   |-- base.py
|   |   |-- factory.py
|   |   |-- openai.py
|   |   |-- anthropic.py
|   |   |-- gemini.py
|   |   `-- ollama.py
|   |-- asr/
|   `-- ocr/
|
`-- placeholders/
    `-- clinical.py      # Prompt building, summary parsing, OCR heuristics
```

## Clinical Helpers

Clinical logic is centralized in
[`app/placeholders/clinical.py`](app/placeholders/clinical.py). The current
implementation provides starter prompt building, JSON summary parsing,
red-flag heuristics, and lightweight OCR structuring. You can tighten or
replace those heuristics later without changing the API layer.

| Function | Purpose | Called from |
|---|---|---|
| `build_history_messages()` | Build the LLM message list for history-taking | `history_service.submit_message()` |
| `build_summary_prompt()` | Build the LLM prompt for structured clinical summarization | `summary_service.generate_summary()` |
| `extract_red_flags()` | Detect clinical red flags in LLM responses to mark sessions as priority | `history_service.submit_message()` |
| `parse_summary_response()` | Parse the LLM's summary output into a structured dict | `summary_service.generate_summary()` |
| `process_ocr_result()` | Structure raw OCR text from uploaded documents | `document_service.upload_document()` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + LLM provider ping |
| `POST` | `/patients` | Register a patient |
| `GET` | `/patients/{id}` | Get patient details |
| `POST` | `/sessions` | Start a new kiosk session |
| `GET` | `/sessions` | List sessions by status or priority |
| `GET` | `/sessions/{id}` | Get session details |
| `POST` | `/sessions/{id}/history` | Submit a message and get an LLM reply |
| `GET` | `/sessions/{id}/history` | Get full transcript and structured data |
| `POST` | `/sessions/{id}/documents` | Upload a file |
| `GET` | `/sessions/{id}/documents` | List session documents |
| `POST` | `/sessions/{id}/summary` | Generate structured summary |
| `PATCH` | `/sessions/{id}/summary` | Doctor edits summary and completes session |
| `POST` | `/sessions/{id}/consent` | Record patient consent |

## License

Private - all rights reserved.
