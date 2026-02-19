# Security Analysis & Design

This document captures the full security analysis of the browser automation system,
including threat modeling, options considered, their trade-offs, and architectural decisions.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Threat Model](#threat-model)
- [Risk Analysis of the Current System](#risk-analysis-of-the-current-system)
- [The Trust Anchor Problem](#the-trust-anchor-problem)
- [Solution: Session Codes with User Approval](#solution-session-codes-with-user-approval)
- [MCP Timeout Constraint](#mcp-timeout-constraint)
- [Session Code Flow — Detailed Design](#session-code-flow--detailed-design)
- [Browser Extension as the UX Layer](#browser-extension-as-the-ux-layer)
- [Extension Architecture Options](#extension-architecture-options)
- [Content Scripts Deep Dive](#content-scripts-deep-dive)
- [CSP Constraints](#csp-constraints)
- [Service Worker Lifecycle](#service-worker-lifecycle)
- [Final Architecture](#final-architecture)
- [Threat: Role Impersonation on the Broker](#threat-role-impersonation-on-the-broker)
- [Open Questions](#open-questions)

---

## Problem Statement

The current browser automation system (connection broker + MCP server + browser tab clients)
works as a POC but has no security model. Any WebSocket client can connect to the broker,
discover all tabs, read their metadata, and execute arbitrary JavaScript on them.

We need a security model that:

1. Prevents information leaks (tab URLs, domains, titles) to unauthorized parties
2. Prevents unauthorized code execution on browser tabs
3. Remains usable — doesn't drown the user in approval prompts
4. Works within the constraints of MCP (near-synchronous calls with small timeouts)

---

## Threat Model

### What Are We Protecting?

- **Tab metadata** (URLs, domains, titles) — leaking which sites a user has open
  can assist social engineering attacks (e.g., attacker learns user has bank tabs open)
- **Tab content and sessions** — arbitrary JS execution means full access to cookies,
  localStorage, DOM, session tokens on the tab's origin

### Threat: Rogue Client on a Legitimate Broker

An attacker connects a WebSocket client to the same broker the user is running.
The broker is legitimate (user started it), but the attacker is an unauthorized client.

**What the attacker can currently do (no security):**

- `list_by_role("browser-tab")` — get all tab UUIDs
- Open channels to any tab
- Send `execute_js` commands — full session hijack

### Threat: Broker Impersonation

The attacker starts a fake broker on the expected port before the user starts theirs.

**Mitigating factor:** The user launches the legitimate broker themselves. Only one server
can bind a port. If the attacker takes the port first, the user's broker fails to start —
the user notices the error and doesn't proceed. So the real concern is only what a fake
broker can learn/do **without** user approval (i.e., before any session is established).

If the protocol requires explicit user approval before any metadata is shared or commands
are accepted, a fake broker gets nothing — tabs don't talk to it, and the user never
approves sessions on it.

### Threat: Role Impersonation on the Broker

An attacker connects to the legitimate broker and registers with the same role as a
real participant — e.g., `"browser-tab"` or `"browser-extension"`. The broker is
role-agnostic: it doesn't validate who claims which role. Any client can register as
anything.

**What the attacker gains:** When anyone calls `list_by_role`, the attacker's connection
appears alongside legitimate ones. If someone opens a channel to the attacker (thinking
it's a real tab or extension), the attacker receives whatever messages are sent —
including session codes, JS code, or other sensitive payloads. The attacker can also
send fake responses.

This is analyzed in detail in
[Threat: Role Impersonation on the Broker](#threat-role-impersonation-on-the-broker)
after the architecture options are established.

### Threat: Compromised Local Machine

If the attacker has full access to the machine, no in-browser defense helps.
This is out of scope.

### Threat: Man-in-the-Middle on WebSocket

Prevented by using `wss://` (TLS). Not a protocol-level concern.

---

## Risk Analysis of the Current System

### 1. No Authentication on the Broker — CRITICAL

Any WebSocket client can connect, register with any role, and interact with any tab.
There's no verification of who is connecting.

### 2. Arbitrary JavaScript Execution — CRITICAL

The `execute_js` action runs whatever code is sent through the channel with full access
to the tab's origin: DOM, cookies, localStorage, IndexedDB, credentials.

### 3. No Authorization Between Clients — HIGH

The broker is role-agnostic and payload-agnostic by design. Any registered client can
open a channel to any other client by UUID. There's no concept of "this client is allowed
to talk to this tab."

### 4. UUID Enumeration — MEDIUM

`list_by_role` lets any connected client list all tab UUIDs. While UUIDs don't directly
contain sensitive information, they enable targeting specific tabs.

### 5. No Transport Security — HIGH (on non-localhost)

Plain `ws://` means traffic including JS code and execution results is unencrypted.

---

## The Trust Anchor Problem

We explored many options for establishing trust. Each failed for a specific reason:

### Option: Shared Secret / Token Auth

Broker requires a token in the `register` message. Token is generated at broker startup.

**Why it fails:** If the attacker controls the broker (impersonation scenario), they accept
any token. Even in the rogue-client scenario, where do you store the token? If it's in
the browser tab's JavaScript, it's readable from DevTools.

### Option: Origin Allowlist on the Broker

Broker checks the `Origin` HTTP header on WebSocket upgrade and only allows known origins.

**Why it fails:** Only stops cross-origin browser connections. Doesn't stop non-browser
WebSocket clients (e.g., `wscat`, scripts). These don't send `Origin` headers or can
fake them.

### Option: Capability Tokens per Tab

When a tab registers, the broker issues a signed token. The MCP server must present
this token to open a channel.

**Why it fails:** Same fundamental problem — who issues the token? If the broker, then
a fake broker issues fake tokens. The tab can't verify the token's legitimacy.

### Option: Public Key Signing (Bluetooth-Pairing-Style)

MCP server signs commands with a private key. Tab has the public key and verifies.

**Why it fails:** Where does the tab get the public key? It's JavaScript in a browser —
any key stored in the tab is readable. And the key must travel through the broker to reach
the tab, so a MITM broker can substitute its own key.

To do this properly, you'd need a full Diffie-Hellman key exchange with visual
confirmation (like Bluetooth pairing). The user would compare codes displayed on both
sides. But this requires the broker to be a passive relay during the exchange, and if
the broker is the MITM, it can relay messages transparently. You'd need an out-of-band
channel, which is exactly what visual confirmation provides — but implementing a full
cryptographic pairing protocol is disproportionate complexity.

### Option: `postMessage` from a Trusted Origin

Instead of broker communication, use `postMessage` with origin verification.

**Why it fails:** `postMessage` origin verification tells the tab "this message came from
`https://foo.com`" but doesn't answer why the tab should trust `https://foo.com`.
The attacker can run their own page at a different origin. There's no unforgeable identity
in the browser that solves this.

### Option: Browser Extension as Trust Anchor

Extension is installed by the user, runs in a privileged context.

**Why it fails as a sole trust anchor:** What makes the extension "legitimate"?
The user installed it — but an attacker could publish their own extension.
The extension is just another piece of software the user chose to run, same as the broker.

### The Fundamental Constraint

**There is no secret storage in a browser tab.** Anything the tab knows (tokens, keys, URLs),
an attacker can read from DevTools or from compromised page scripts. There is no
cryptographic primitive in the browser that provides unforgeable identity for arbitrary
WebSocket clients.

### The Answer: The User IS the Trust Anchor

The only entity that can distinguish legitimate from malicious is the **user themselves**.
The user knows they just asked Claude to do something. If an approval prompt appears that
they didn't initiate, they deny it. The user's conscious approval is the one thing an
attacker cannot forge without social engineering.

---

## Solution: Session Codes with User Approval

### Core Idea

Separate the system into two phases:

1. **Session setup** (async, involves user) — user explicitly approves which tabs
   participate in an automation session
2. **Session execution** (sync, fast) — agent operates on pre-approved tabs with
   pre-shared metadata

### How It Works

1. User tells Claude: "Close all my Microsoft tabs"
2. Agent calls MCP tool `start_session` — broker creates a session, returns a
   **human-readable session code** (e.g., `BLUE-FISH-42`)
3. Claude displays to user: "Session: BLUE-FISH-42. Enter this code in the tabs
   you want me to use."
4. User goes to their Outlook tab. The tab client UI has an input field:
   "Enter session code." User types `BLUE-FISH-42`, hits Enter.
5. Tab sends session code to broker, joins the session, shares its metadata
   (URL, title) within that session.
6. User repeats for their Teams and OneDrive tabs.
7. User returns to Claude: "Done, I've connected them."
8. Agent calls `list_tabs` — broker returns only the 3 tabs in this session,
   with metadata. This is a fast, synchronous MCP call.
9. Agent operates on the tabs. Each MCP call is fast — tabs are pre-approved.

### Security Properties

- **No metadata leak:** Tabs only share URL/title after the user explicitly enters
  the session code on that tab. Unapproved tabs share nothing.
- **No unauthorized execution:** Only tabs that joined the session accept commands
  from that session.
- **Session-scoped:** Each session has its own code. An attacker would need to guess
  the code (large code space + broker rate-limits join attempts).
- **User is the gatekeeper:** The user physically goes to each tab and enters the code.
  No automated process can do this on their behalf.

### Attack Flow Analysis

**Rogue client attack:**

1. Attacker connects to broker, calls `start_session` — gets their own session code
2. Attacker can't make any tab join their session — that requires the user to type
   the attacker's code into tabs
3. Attacker guesses legitimate session code? Code space is large, broker rate-limits.
4. Result: attacker gets nothing.

**Broker impersonation attack:**

1. Attacker runs fake broker on the port before user
2. User's broker fails to start (port taken) — user notices, doesn't proceed
3. Even if user doesn't notice: agent connects to fake broker, gets a session code,
   shows it to user. User might enter it in tabs. But user's tabs connect to the
   fake broker too (same port). The fake broker now has metadata for approved tabs.
4. Mitigation: user notices their broker didn't start. Further mitigation: MCP server
   can launch the broker as a subprocess (controls the port, smaller attack window).

### The "I'm Done Approving" Problem

After the user approves some tabs, the agent doesn't know when the user is finished.
The agent can't distinguish "user is still approving more tabs" from "user is done."

**Accepted solution:** The user explicitly signals completion by returning to Claude
and saying "done" (or similar). This is unavoidable friction — the agent cannot infer
the user's intent without explicit communication.

---

## MCP Timeout Constraint

MCP tool calls have small timeouts — they're meant to be near-synchronous.
User approval is inherently async and slow (user switches tabs, types codes, clicks).

**These are fundamentally incompatible.** Approval cannot happen during an MCP tool call.

This is why the session code model works: approval happens **before** any MCP tool call.
The `start_session` call is fast (just creates a session). The user approval happens
out-of-band. Subsequent `list_tabs` and `execute_js` calls are fast because tabs are
pre-approved.

---

## Session Code Flow — Detailed Design

### Happy Path Step-by-Step

**State:** 10 tabs connected to broker. 3 are on Microsoft domains. User is in Claude UI.

1. User types to Claude: "Close all my Microsoft tabs"
2. Agent calls `start_session` MCP tool
3. Broker creates session, generates code `BLUE-FISH-42`, returns it
4. Agent responds to user: "Session: BLUE-FISH-42. Please enter this code in the
   Microsoft tabs you want me to close, then tell me when you're done."
5. User switches to browser. They know where their Microsoft tabs are.
6. User clicks on Outlook tab, enters `BLUE-FISH-42` in the tab client UI, submits.
7. Tab client sends to broker: "join session BLUE-FISH-42, here's my metadata"
8. Broker adds tab to session.
9. User repeats for Teams tab and OneDrive tab.
10. User returns to Claude, types: "done"
11. Agent calls `list_tabs` — broker returns 3 tabs with metadata (URL, title).
    This is a fast synchronous MCP call.
12. Agent identifies them as Microsoft tabs, proceeds with automation.
13. Each `execute_js` call targets a specific tab UUID, executes fast.

### Cleanup

- When the session ends (agent disconnects, or explicit `end_session` call),
  the session code is invalidated.
- Tabs that joined the session return to their default state (not sharing metadata,
  not accepting commands).
- Unapproved banners/prompts on other tabs: auto-dismiss when session ends,
  or timeout after a period. (N/A with session codes — tabs without the code
  never show anything.)

---

## Browser Extension as the UX Layer

### Why an Extension?

Typing a session code into each tab individually is workable but has friction,
especially with many tabs. A browser extension can improve the UX:

- Extension popup shows **all browser tabs** with checkboxes
- User enters the session code once in the extension popup
- User checks the tabs they want to approve
- Extension delivers the session code to those tabs

This turns N code entries into 1 code entry + N checkbox clicks, all in one UI.

### What the Extension Does NOT Do

The extension is a UX convenience layer. It does not change the security model:

- The session code is still the authorization mechanism
- The tab still connects to the broker itself
- The extension doesn't maintain the broker connection

---

## Extension Architecture Options

### Option A: Extension as the Only Broker Client

Tabs never connect to the broker. Extension owns the WebSocket. Extension executes
commands on tabs via `chrome.scripting.executeScript`.

**Initial concerns and how they resolved:**

1. **`chrome.scripting.executeScript` and JS execution.**
   Initially we thought this was a major limitation: by default it runs in an isolated
   context that can't access the page's JavaScript variables or functions. However,
   using `world: 'MAIN'` solves this — the function executes in the page's JS context
   with full access to page variables. Key capabilities discovered:
    - **Return values come back directly** through the `chrome.scripting` API to the
      service worker. No `postMessage`, no content script relay, no insecure channel.
    - **Async functions are supported.** Chrome automatically awaits Promises returned
      by the injected function and returns the resolved value.
    - **No timeout is applied** by Chrome itself — the extension must implement its
      own timeout (e.g., `Promise.race` with a timer).
    - **The injection mechanism itself is not subject to page CSP.** The browser's
      extension infrastructure injects the function, not the page's JS engine. However,
      code _inside_ the injected function is still subject to page CSP — so `eval()`
      and `new Function()` within the injected code will fail on pages with strict CSP.
      But direct function execution (not eval) works fine on any page.
    - Source: https://developer.chrome.com/docs/extensions/reference/api/scripting

    **This means `chrome.scripting.executeScript` with `world: 'MAIN'` is essentially
    a full replacement for the current `execute_js` flow** — async support, return
    values, and no need for any page-side library or insecure communication channel.

2. **Service worker lifecycle in MV3.** The extension's background service worker
   is terminated after ~30 seconds of inactivity. The WebSocket connection dies
   with it. The extension cannot maintain a persistent broker connection.
   See [Service Worker Lifecycle](#service-worker-lifecycle) for details.
   This can be worked around with an offscreen document (see that section).

3. **Site opt-in is lost.** The current model has sites explicitly embedding
   `BrowserTabClient` to opt into automation. With extension-only, the extension
   can automate any site without the site's knowledge. This is a different trust
   model — may be desired, but it's a design choice.

**Verdict (revised):** JS execution limitations are NOT a blocker — `world: 'MAIN'`
with `func` parameter provides full page-context execution with return values.
The remaining blocker is service worker lifecycle, which is solvable via offscreen
document. This is a viable architecture for non-cooperating sites.

### Option B: Tabs Connect Directly, Extension Manages Approval

Tabs embed `BrowserTabClient` and connect to broker as before (cooperating sites).
The extension handles session approval UX — user picks tabs in the extension popup,
extension delivers session codes to the approved tabs.

**How extension-to-tab communication works:**

1. Extension injects a content script (isolated world) into the page
2. Content script communicates with extension service worker via
   `chrome.runtime.sendMessage` — this is **secure**, origin-verified by the browser
3. Content script communicates with the page's `BrowserTabClient` via
   `window.postMessage` — this is **not secure** against other scripts on the page

**Why `postMessage` insecurity is acceptable here:** The page already opted in by
embedding `BrowserTabClient`. If the page is compromised (malicious third-party script),
`BrowserTabClient` itself is already compromised regardless of the extension.
The `postMessage` bridge doesn't create a new attack surface.

**Important:** The content script must never relay secrets from the extension
(like data from other tabs) to the page via `postMessage`. Each tab should only
receive information about itself (its own session code).

**Service worker lifecycle is not a problem here:** The extension only needs to be
active during the approval phase (user interacting with the popup). The tab maintains
its own broker connection. The service worker can sleep between sessions.

**Verdict:** This is the viable architecture for cooperating sites.

### Two Models for Two Use Cases

|                   | Extension-only (Option A)                          | Tab client (Option B)               |
| ----------------- | -------------------------------------------------- | ----------------------------------- |
| Use case          | Automate any site                                  | Site opts into automation           |
| Tab code needed   | None                                               | Site bundles `BrowserTabClient`     |
| Trust model       | Extension is trusted                               | Site is cooperating                 |
| Capabilities      | DOM access only (isolated) or full JS (main world) | Whatever the site exposes           |
| Security boundary | Extension <-> browser API                          | Tab <-> broker (with session codes) |
| Service worker    | Fatal — can't maintain connection                  | Not a problem — tab connects        |

These aren't mutually exclusive. Option B is the primary model for cooperating sites.
Option A is viable for non-cooperating sites, with the service worker lifecycle
managed via offscreen document.

---

## Content Scripts Deep Dive

### What Content Scripts Are

A content script is JavaScript that the extension injects into web pages.
It runs automatically on pages matching a URL pattern (declared in manifest),
or on demand via `chrome.scripting.executeScript`.

### The Two Worlds

**Isolated World (default):**

- Shares the DOM with the page — can read/modify HTML elements
- Does NOT share JavaScript variables — the page's `window.myVar` is invisible,
  and vice versa. Separate JS heaps.
- Page cannot see, access, or tamper with the content script's code or variables
- Content script cannot call functions defined by the page
- Has its own CSP: `script-src 'self' 'wasm-unsafe-eval' ...`
- `eval()` is blocked by the isolated world's own CSP

**Main World (`world: "MAIN"`):**

- Runs in the page's JS context — full access to page variables and functions
- Page can also see and tamper with the injected code
- Runs under the **page's CSP**, not the extension's
- If the page blocks `eval()` or inline scripts, the injected code is constrained

### What Content Scripts CAN Access

- Full DOM of the page (read, write, listen for events)
- Subset of Chrome extension APIs: `chrome.runtime.sendMessage`, `chrome.runtime.connect`,
  `chrome.storage`, `chrome.i18n`
- Standard web APIs (fetch, XHR, WebSocket) — but for network requests, content scripts
  are subject to the page's origin policies

### What Content Scripts CANNOT Access

- Page's JavaScript variables, functions, objects (in isolated world)
- Most Chrome extension APIs (no `chrome.tabs`, `chrome.scripting`, etc.)
- Variables/state from content scripts of other extensions

### Communication Channels

**Content Script <-> Extension Service Worker:**

- `chrome.runtime.sendMessage` / `chrome.runtime.connect`
- Secure — browser verifies extension ID internally
- Page cannot intercept or spoof these messages

**Content Script <-> Page:**

- Only via shared DOM or `window.postMessage`
- NOT secure — any script on the page can read and spoof messages
- `event.source` can be checked but doesn't identify which script sent it

**Isolated World <-> Main World (two content scripts in same page):**

- No secure channel exists
- Only `window.postMessage` or DOM manipulation
- `chrome.runtime` is only available in isolated world, not main world —
  if it were available in main world, the page's own JS could access it too
  (since main world shares the page's JS context), which would be a security hole.
  Source: Chrome docs confirm content scripts access `chrome.runtime` APIs directly,
  but main world shares the host page's execution environment.
  (https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

### User Experience

There is **no additional prompt, warning, or confirmation** for main world injection.
The user sees no difference between an extension using isolated or main world.
Permission prompts are determined by manifest permissions (`activeTab`, `scripting`,
host permissions), not by which world scripts execute in.

---

## CSP Constraints

### The Problem

Content Security Policy can block two things critical to browser automation:

1. WebSocket connections to the broker (`connect-src` directive)
2. `eval()` / `new Function()` for arbitrary code execution (`script-src` directive)

### WebSocket Connections

**Isolated world content scripts** are subject to the page's CSP for network requests,
despite having their own JS CSP. If the page's CSP blocks WebSocket connections to the
broker's address, the isolated world can't connect.

**Extension service worker** runs in the extension's own context, completely outside any
page's CSP. Can connect to any host declared in manifest `host_permissions`.

**Conclusion:** WebSocket connections to the broker should NOT originate from content
scripts. They should either come from the service worker (but see lifecycle issues)
or from the page's own `BrowserTabClient` (cooperating site model, where the site
chose to allow the connection).

### `eval()` and Arbitrary Code Execution

**Initial (incorrect) analysis:**

We initially concluded there was no way to run arbitrary JS on pages with strict CSP.
This turned out to be too pessimistic. Here's the full picture:

- **Isolated world:** `eval()` blocked by the isolated world's own CSP
- **Main world content script:** `eval()` blocked if the page's CSP doesn't include
  `'unsafe-eval'`
- **`<script>` tag injection:** Governed by page's `script-src` CSP — blocked if
  page disallows inline scripts

**However: `chrome.scripting.executeScript` with `func` parameter is different.**

The browser's extension infrastructure handles the injection — it's not `eval()`, not
an inline script, not a dynamically loaded script. The function reference is serialized
and injected by Chrome itself. This works even on pages with strict CSP.

The constraint is narrower than we thought: only code _inside_ the injected function
that itself calls `eval()` or `new Function()` is subject to page CSP. Direct function
execution works on any page.

**Revised conclusion:** For the extension-only model (Option A), arbitrary code execution
via `chrome.scripting.executeScript({ world: 'MAIN', func: ... })` works on any page,
as long as the injected function doesn't internally use `eval()`. This is sufficient for
browser automation — the agent sends function references, not eval strings.

For the cooperating site model (Option B), the site controls its own CSP and can allow
whatever connections and execution it needs.

---

## Service Worker Lifecycle

### The Problem

In Manifest V3, extension service workers are **terminated after ~30 seconds of
inactivity**. Any WebSocket connection living in the service worker dies when the
worker sleeps.

### Workarounds Considered

1. **Reconnect on wake:** Service worker reconnects to broker each time it wakes up
   (triggered by `chrome.runtime` message from content script or popup). Works for
   on-demand operations but can't maintain persistent state.

2. **Offscreen document:** MV3 extensions can create a hidden offscreen document via
   `chrome.offscreen.createDocument`. This can maintain a persistent WebSocket.
   Content scripts can't talk to it directly — service worker relays messages.
   This is the official MV3 workaround for persistent connections.

3. **Don't put the WebSocket in the extension at all:** In the cooperating site model
   (Option B), tabs maintain their own broker connections. The extension only needs
   to be active during session approval. The service worker lifecycle is irrelevant.

### Decision

For cooperating sites (primary use case), the tab owns the broker connection.
The extension is only a UX convenience for session approval. Service worker lifecycle
is not a blocker.

---

## Final Architecture

### Model A: Non-Cooperating Sites (Extension-Driven)

For automating any site, without the site embedding any library.

```
User (Claude UI)
  │
  │ "Close my Microsoft tabs"
  │
  ▼
MCP Server (BrowserAutomationClient)
  │
  │ start_session → session code
  │ list_tabs → approved tab metadata
  │ execute_js → results
  │
  │ WebSocket (on-demand, ephemeral)
  ▼
Connection Broker
  │
  │ WebSocket (persistent, via offscreen document)
  ▼
Browser Extension
  │
  ├─ Offscreen Document ── WebSocket to broker (persistent, immune to SW lifecycle)
  ├─ Service Worker ─────── relays messages between offscreen doc and chrome.scripting
  ├─ Popup ──────────────── session code input + tab selection UI
  │
  │ chrome.scripting.executeScript({ world: 'MAIN', func: ... })
  ▼
Browser Tab (any site, no library needed)
  │
  │ Function runs in page JS context
  │ Return value goes back to service worker via chrome.scripting API
  │ No postMessage, no content script relay
```

**Execution flow for a single command:**

1. MCP server sends `execute_js` command through broker
2. Broker routes to extension's offscreen document (WebSocket)
3. Offscreen document relays to service worker via `chrome.runtime`
4. Service worker calls `chrome.scripting.executeScript({ world: 'MAIN', func, tabId })`
5. Function executes in page's JS context, can access page variables
6. Return value (including resolved Promises) comes back to service worker
7. Service worker relays result back through offscreen document → broker → MCP server
8. No page-side code involved at any step

### Model B: Cooperating Sites (Tab Client)

For sites that explicitly opt into automation by embedding `BrowserTabClient`.

```
User (Claude UI)
  │
  │ "Close my Microsoft tabs"
  │
  ▼
MCP Server (BrowserAutomationClient)
  │
  │ start_session → session code
  │ list_tabs → approved tab metadata
  │ execute_js → results
  │
  │ WebSocket (on-demand, ephemeral)
  ▼
Connection Broker
  │
  │ WebSocket (persistent, per tab)
  ▼
Browser Tab (BrowserTabClient)          Browser Extension (optional UX layer)
  │                                       │
  │ Joins session with code               │ User enters code once
  │ Shares metadata only in session       │ Selects tabs via checkboxes
  │ Accepts commands only in session      │ Delivers code to selected tabs
  │                                       │ via content script → postMessage
```

### Session Code Flow (Common to Both Models)

Both models use the same session code mechanism for authorization:

1. Agent calls `start_session` → gets session code
2. User enters code in extension popup (Model A) or in tab UI (Model B)
3. User selects/approves specific tabs
4. Agent operates only on approved tabs

### Security Guarantees

1. **No metadata without session code:** Tabs don't share URL/title until user
   enters a valid session code on that tab (Model B) or selects them in the
   extension popup (Model A).
2. **No execution without session:** Only approved tabs accept commands.
3. **Session codes are user-entered:** No automated process can approve tabs —
   requires physical user action.
4. **Broker impersonation is detectable:** User's broker fails to start if port
   is taken. User notices and doesn't proceed.
5. **Rogue clients are locked out:** Without guessing the session code (large code
   space, rate-limited), a rogue client can't interact with any tab.

### What This Does NOT Protect Against

- Social engineering (user tricked into approving malicious sessions)
- Compromised local machine (attacker has full system access)
- Compromised cooperating site (Model B only — if the page has XSS,
  `BrowserTabClient` is compromised regardless)
- Code inside injected functions that uses `eval()` on pages with strict CSP
  (Model A only — the injection itself works, but `eval` within it doesn't)

---

## Threat: Role Impersonation on the Broker

### Background: Who Creates the Session Code?

Before analyzing the attack, we need to clarify who generates the session code.

**The broker cannot generate it.** The broker is a dumb proxy — it routes messages and
doesn't understand sessions, codes, or authorization. If the broker generated codes,
a fake broker would generate fake codes, and we're back to the broker impersonation
problem.

**The extension cannot generate it.** If the extension generates the code, the attacker
who impersonates the extension role on the broker would also generate codes. The code
would carry no trust.

**The agent generates it.** The agent runs in Claude's UI — a completely separate channel
from the broker. The user sees the code in their conversation with Claude, which they
trust because they initiated it. The code proves: "the entity that gave you this code
is the same entity you're chatting with in Claude." This is the only channel the
attacker cannot access.

### Analysis: Model A (Extension-Driven)

**Actors on the broker:** MCP server (agent-side), extension (via offscreen document).
Browser tabs are NOT on the broker — the extension controls them via `chrome.scripting`.

**Attacker registers as the extension's role** (e.g., `"browser-extension"`):

1. Agent generates code `BLUE-FISH-42`, displays it to user in Claude UI
2. Agent's MCP server connects to broker, calls `list_by_role("browser-extension")`
3. Broker returns two UUIDs: real extension and attacker
4. MCP server picks one to open a channel to — say it picks the attacker
5. MCP server sends: `{action: "start_session", code: "BLUE-FISH-42"}`
6. **Attacker now knows the session code.** It traveled through the broker to reach
   what the agent thought was the extension.

The session code — the one secret that was supposed to stay between user and agent —
is leaked the moment the agent sends it through the broker to the wrong connection.
The agent has no way to distinguish the real extension from the impersonator because
the broker doesn't authenticate roles.

**Attacker registers as `"browser-tab"` role:**

Nobody queries `"browser-tab"` in Model A. The extension discovers tabs via
`chrome.tabs` API, not through the broker. The attacker's fake tab sits idle —
nobody contacts it, nobody sends it anything. **No impact.**

### Analysis: Model B (Cooperating Sites, Tab Client)

**Actors on the broker:** MCP server (agent-side), browser tabs (via BrowserTabClient).

**Attacker registers as `"browser-tab"` role:**

1. Agent generates code `BLUE-FISH-42`, displays to user in Claude UI
2. User enters code into real tabs — tabs send join messages to broker. The attacker
   doesn't see these messages (they're between each tab and the broker, not broadcast).
3. Agent's MCP server calls `list_by_role("browser-tab")` — gets all UUIDs, including
   the attacker's fake tab
4. MCP server needs to know which tabs are in the session. Two sub-cases:

**Sub-case: Agent asks each tab if it's in the session.**
MCP server opens channels to each UUID and asks "are you in session BLUE-FISH-42?"
Real tabs say yes. Attacker also says yes (lying). **Agent sends the session code to
the attacker** as part of the verification question. Even if the attacker already
knew the code wasn't needed — the agent is now treating the attacker as a session
member and will send `execute_js` commands to it.

**Sub-case: Broker tracks session membership.**
This contradicts the principle that the broker is a dumb proxy. If the broker
understands sessions, it's no longer generic infrastructure — and a fake broker
can fake session membership.

**Sub-case: Tabs announce session membership unprompted.**
After joining, tabs could broadcast "I'm in session X." But the attacker broadcasts
the same claim. The agent can't verify it.

In all sub-cases, the attacker either receives the session code through a channel,
or successfully impersonates a session member. The broker provides no mechanism to
distinguish real tabs from fake ones.

### The Core Problem

In both models, the agent must communicate through the broker to reach its
counterpart (extension in Model A, tabs in Model B). Any message the agent sends
through the broker — including the session code — can be received by an attacker
who registered with the target role.

**Session codes work as a secret between user and agent via Claude UI.** But the
moment the code (or any session-identifying information) needs to travel through
the broker, it's exposed to role impersonators. The broker is an untrusted,
unauthenticated message bus where anyone can claim any role.

### What This Means for the Architecture

This attack doesn't invalidate session codes as a concept — the user approval
step is still necessary. But it reveals that **the broker alone cannot be the
communication channel between the agent and the trusted endpoint** (extension or
tab). The agent needs a way to reach the real extension/tab without the broker
being able to route that message to an impersonator.

### The Fundamental Constraint (Revisited)

The extension and the MCP server have **no private channel**. Every available
transport — WebSocket (broker), localhost HTTP, filesystem — is equally accessible
to any local process. A Chrome extension cannot prove it's a Chrome extension over
a generic transport. The one mechanism where Chrome itself authenticates the
extension (native messaging) requires installing OS-specific software and
pre-configuring installation paths — unacceptable friction.

**Some user involvement is unavoidable.** The only private channel is:
Claude UI → user's eyes → user's hands → keyboard.

The question is how to minimize that involvement.

### Mitigation Options for Model A

#### Option 1: Session Code via Out-of-Band Channel

The session code never travels through the broker. Instead:

1. Agent generates code, displays in Claude UI
2. User enters code into the extension popup (one input, one place)
3. Extension connects to broker with a role derived from the code
   (e.g., `"session-BLUE-FISH-42"`)
4. Agent calls `list_by_role("session-BLUE-FISH-42")` — finds the extension
5. Agent opens channel, performs HMAC challenge-response using the code as
   shared secret to verify the extension actually knows the code
6. After mutual authentication, all subsequent communication on this channel
   is trusted

The code space must be large enough to prevent brute-force discovery of the
role name (e.g., `WORD-WORD-NN` ≈ 1M combinations). The broker can apply
generic rate limiting on `list_by_role` without understanding sessions.

**Friction:** User copies one short code from Claude UI into the extension popup.
This is the minimum achievable friction — one action, in a UI the user is
already interacting with.

**Handles multiple legitimate extensions:** If the user has multiple browser
profiles and enters the code into multiple extension instances, the agent
finds multiple connections with the session role, all pass HMAC verification,
and the agent works with all of them.

#### Option 2: Reject Multiple Connections with Extension Role

Instead of authenticating the right extension, prevent the ambiguity:

1. Extension connects to broker with its role (e.g., `"browser-extension"`)
2. Agent calls `list_by_role("browser-extension")`
3. If exactly 1 result → proceed (legitimate case)
4. If more than 1 result → **stop and report a potential attack to the user**.
   Do not open channels to any of them.

The agent refuses to operate when the situation is ambiguous. The user is
informed and can investigate (e.g., check for suspicious processes, restart
the broker).

**Friction:** Zero in the happy path (no attacker present). High friction when
an attack is detected — but that's appropriate, because something is wrong.

**Limitation:** Breaks legitimate multi-profile/multi-browser scenarios. If
the user has two browser profiles with the extension, this reports a false
positive. Could be mitigated by making the expected count configurable, but
that adds complexity.

**Limitation:** A sophisticated attacker could wait for the real extension to
disconnect (e.g., service worker lifecycle) and then connect in its place.
The count would be 1 — the attacker. The agent would trust it.

#### Options Considered and Rejected

**Native messaging (Chrome's authenticated extension ↔ native app channel):**
Provides exactly what we need — Chrome verifies the extension identity, no
impersonation possible. But requires the user to install a native host
executable and register a manifest file in an OS-specific location
(`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` on macOS,
Windows registry on Windows). This is unacceptable installation friction.

**Clipboard:** Agent puts a token on the clipboard, extension reads it.
Extensions can only read the clipboard in response to a user paste gesture —
can't read it silently. Also overwrites the user's clipboard. Bad UX.

### Recommendation

**Option 1 (session code + HMAC) is the primary solution.** It provides strong
security guarantees with minimal friction (one copy-paste).

**Option 2 (reject multiple connections) is a complementary defense.** Even with
session codes, the agent should check whether the number of extension-role
connections is suspicious and warn the user if so. This doesn't replace session
codes but adds defense in depth.

---

## Open Questions

1. **Session code format:** What code space is large enough to prevent brute force
   but short enough for users to type? (e.g., `WORD-WORD-NN` gives ~1M combinations)

2. **Session expiry:** How long should a session live? Should it auto-expire after
   inactivity? Should the user be able to revoke it?

3. **Multi-session support:** Can a tab be in multiple sessions simultaneously?
   Should it be?

4. **Model A implementation details:** The offscreen document approach for persistent
   WebSocket needs prototyping. How does the service worker ↔ offscreen document ↔
   broker message relay perform in practice? What happens when the service worker
   sleeps mid-operation?

   **Resolved:** Implemented and working. The offscreen document holds the persistent
   WebSocket via `ExtensionTabClient`. The service worker handles `chrome.tabs.query`
   and `chrome.scripting.executeScript` on demand; it wakes in response to
   `chrome.runtime.sendMessage` from the offscreen document and returns to sleep after
   responding. This is not a problem — the offscreen document keeps the broker connection
   alive regardless of the service worker lifecycle.

5. **Model A: `func` parameter limitations.** `chrome.scripting.executeScript` takes
   a function reference, not a string. The MCP server sends code as a string from the
   agent. How do we bridge this? Options: `new Function(code)` in the service worker
   (which runs under extension CSP, not page CSP — need to verify if this works),
   or redesigning the protocol to send structured commands instead of raw JS strings.

   **Resolved:** The injected function wraps `eval(code)` where `code` is passed as
   an `args` parameter. `eval` runs inside the page's main world (not the extension
   context), so it is subject to the page's CSP. Pages with strict `script-src`
   (e.g., WhatsApp) return an `EvalError` with the relevant policy violation message —
   this is reported back as a structured error with `name`/`message`/`stack`. If
   strict-CSP support becomes a requirement, the protocol would need to send structured
   commands instead of raw JS strings.

6. **Protocol changes needed:** The broker protocol needs new message types for
   session management: `create_session`, `join_session`, `end_session`. The broker
   needs to scope `list_by_role` and channel operations to sessions.

7. **Which model to prioritize?** Model A (extension-driven, any site) and Model B
   (cooperating sites) serve different use cases. Should we build both, or focus on
   one first? Model B is closer to the current architecture. Model A is more
   generally useful but requires the extension to be more than a UX layer.

   **Resolved:** Model A was prioritized and is now implemented as the primary path.
   Model B (`BrowserTabClient`) remains in the codebase for the cooperating-site demo
   but is not the primary automation mechanism.

8. **Role impersonation mitigation.** Two options identified:
   (a) Session code as out-of-band shared secret + code-derived broker role +
   HMAC challenge-response — primary solution, minimal friction (one copy-paste).
   (b) Reject ambiguous connections (multiple extensions) — complementary defense,
   zero friction in happy path but breaks multi-profile scenarios.
   Need to decide: use both together? Make multi-extension count configurable?
