# 08 — Trinoris voice control

## Purpose

Specify optional voice commands for the Trinoris Coordination panel from [spec 05](05-trinoris-coordination-panel.md). A developer should be able to inspect coordination state and operate supported panel actions without typing, while retaining the panel's existing CLI authority, workspace trust rules, and mutation confirmations.

This is command-and-control for the coordination panel. It does not launch agents, dictate arbitrary code, send prompts to Codex/Claude, or turn the panel into a general-purpose voice assistant.

## Product boundary and reuse

The current Copilot Voice Mode is not a suitable controller to enable wholesale. It is coupled to Copilot entitlement, a realtime voice backend, Chat session context, and a broad chat tool dispatcher. Enabling it would violate the focused build's Copilot boundary and provide more authority than coordination commands need.

Reuse and extract only generic pieces where their contracts support it:

- Use the existing speech provider interface (`ISpeechService` / `ISpeechToTextSession`) for transcription when a provider is registered. Show the provider name and whether it sends audio off-device before the user starts.
- Reuse push-to-talk, microphone state, transcript display, keyboard accessibility, cancellation, and error-state patterns from Agents Voice. Candidate UI modules are `agentsVoiceWidget.ts`, `components/headerComponent.ts`, `components/voiceBarComponent.ts`, `components/transcriptComponent.ts`, and `components/tokens.ts`; adapt them into general components without Copilot icons, entitlement, telemetry, session awareness, or chat-service imports.
- Reuse `IMicCaptureService` only if it can be separated from the realtime voice client without introducing a Copilot or chat dependency. Prefer the existing generic speech service when it meets latency and platform requirements.
- Do **not** reuse `IVoiceSessionController`, Copilot voice endpoint/authentication, `IVoiceToolDispatchService`, auto-approval, agent-mode tools, session transcript context, or Copilot telemetry.

The Trinoris command controller is a new, narrow service. It calls the typed coordination service and the existing `trinoris-agent` CLI adapter from spec 05. It never executes a language-model tool call or arbitrary command text.

## Screen design

Place the microphone control in the Trinoris Coordination panel header. It is hidden unless `trinorisVoiceControl` is enabled and a speech-to-text provider is available.

```text
Trinoris Coordination       [Hold Space to speak] [Mic: off] [⋯]
Repository: vscode · Agent: codex / dev-session

Voice input: ready · Speech provider: <provider name>

You said: “show active handoffs”
Command: Open Handoffs → Active
Result: 2 active handoffs · refreshed just now
```

While the key/button is held, show a prominent **Listening** state, a visible stop/cancel action, and a live transcript if the provider supplies one. After release, show the recognized text and parsed command before dispatch. Keep a short-lived command/result transcript in the panel only; do not persist it.

For a mutation, replace the command preview with a confirmation card:

```text
Claim “review-auth-flow.md” for claude / reviewer-2?
This moves the addressed note into that instance’s active handoffs.
[Confirm claim] [Cancel]
```

The confirmation must be a visible click or a new, explicit push-to-talk confirmation after the complete prompt has been presented. Never treat continued listening, silence, “okay” from the prior utterance, or an ambiguous recognition as approval. A user can always complete the same operation with the panel's keyboard/mouse controls.

## Command model

### Read-only commands

The initial grammar supports bounded commands such as:

| Example utterance | Parsed action |
| --- | --- |
| “Open scopes” / “Show scopes” | Focus Scopes tab |
| “Show held scopes” | Apply a state filter |
| “Show active handoffs” / “Open my inbox” | Open the corresponding Handoffs filter |
| “Refresh coordination” | Run the panel's normal read refresh |
| “What is holding the API scope?” | Read the selected scope's current holder from the latest CLI snapshot |
| “Open handoff review auth flow” | Select a unique matching visible handoff; ask the user to choose if ambiguous |
| “Read the selected handoff summary” | Read a bounded summary only if TTS is available and the user has enabled it |

Read-only actions may run after the user releases push-to-talk and the utterance maps to exactly one supported action. If the panel is stale, refresh before answering. Read results aloud only on an explicit request; keep the visible result available as the authoritative presentation.

### Mutating commands

Voice may prepare, but must not silently execute, supported mutations:

- Acquire, renew, or release a named scope.
- Validate or publish a named draft.
- Claim an addressed handoff for the explicitly selected agent class and instance.
- Complete an active handoff with a clearly recognized outcome.
- Run `verify` after an explicit confirmation because it performs bounded filesystem activity.

The controller resolves names against the current panel snapshot. It must not invent scope names, note filenames, recipient identities, task text, outcomes, generations, or break reasons. If a phrase is incomplete, ambiguous, or does not match the registered data, ask the user to clarify in the panel; do not guess.

Voice does not offer `break`, `recover`, setup, force, delete, arbitrary CLI invocation, or shell/terminal actions in the initial release. Recovery stays a deliberate visual workflow with the additional safeguards defined in spec 05.

Before confirmation, refresh the relevant state and show the exact action, repository, selected class/instance, target scope/note, and consequence. The CLI still enforces generation, recipient, lease, and protocol rules. On success or refusal, refresh and show the CLI result; never report success based solely on speech recognition or a submitted process request.

## Architecture

```text
Push-to-talk UI ──► speech provider ──► transcript
       │                                  │
       │                         deterministic intent parser
       │                                  │
       │                     read-only query or action preview
       │                                  │
       └── cancel                    explicit confirmation
                                          │
                               Trinoris command controller
                                          │
                           coordination service / CLI adapter
                                          │
                             fresh typed result and snapshot
```

### Components

1. **Voice control UI**: header microphone, listening/transcribing/confirming/error states, transcript/intent preview, confirmation card, and keyboard/mouse fallback. Built with native workbench UI; it does not require the generic Chat panel.
2. **Speech session adapter**: starts and cancels one speech-to-text session via `ISpeechService`, applies the configured language, and normalizes provider events. It does not connect to a realtime assistant endpoint.
3. **Intent parser**: maps a small, versioned grammar to typed commands. Phase one uses deterministic parsing and visible clarification; no model prompt or free-form tool dispatch. Parser inputs are bounded in length and control characters are normalized.
4. **Trinoris voice controller**: owns one active recording/intent/confirmation state machine, applies explicit selections and workspace trust, and calls only typed coordination service methods.
5. **Coordination service and CLI adapter**: remain the sole data/mutation path from spec 05. Every write runs through `trinoris-agent` with JSON output and existing protocol checks.

Do not introduce a second polling loop. The voice UI reads the coordination service's latest snapshot and uses its refresh method. While the panel is hidden, no speech session or voice polling remains active.

## State and interaction rules

States: `unavailable`, `ready`, `requesting-microphone`, `listening`, `transcribing`, `interpreting`, `awaiting-confirmation`, `executing`, `result`, `cancelled`, and `error`.

- Only one voice session can be active per window. A second activation cancels or focuses the existing session; it never opens a parallel microphone capture.
- Push-to-talk is the default. No always-on microphone, wake word, or background recording.
- Releasing the key ends capture. Escape, closing the panel, changing workspace, losing trust, or revoking microphone permission cancels the session and any unsubmitted intent.
- A confirmation is bound to the exact parsed command, selected workspace, selected agent identity, and fresh snapshot version. Any change invalidates it and requires a new review.
- Recognition confidence is not authorization. Low-quality or partial results require correction; do not display fabricated confidence percentages.
- Never auto-retry a mutation after timeout or uncertain CLI I/O. Show “outcome unknown,” refresh read-only state, and let the user decide what to do next.
- Audio/transcripts are not written to `.trinoris/`, settings, workspace files, terminal history, or persistent telemetry. In-memory text is cleared when the panel closes or the user presses Clear.

## Data, privacy, and security

- Before first use, explain microphone access and identify the speech provider. If speech is handled remotely, say so before capture; do not imply local processing.
- The user explicitly starts every capture. Show a persistent listening indicator and a one-action cancel/mute control.
- Do not send workspace contents, handoff bodies, scope task strings, file paths, or agent transcripts to the speech provider. Speech input contains only the user's utterance; the provider receives no panel context.
- The parser may use the local, already-loaded list of scope names and visible handoff titles to disambiguate only after transcription. Never upload those values for recognition or interpretation.
- Command text and coordination output are untrusted. Escape and bound what is shown or spoken. Do not follow instructions embedded in handoff text.
- Respect workspace trust. In an untrusted workspace, disable process-backed voice commands and show the trust requirement; do not launch the CLI.
- Never put CLI arguments into a shell string. Use the existing adapter's argument array, timeout/output caps, environment redaction, and workspace containment.
- Do not log utterances, transcript text, handoff content, scope task text, or audio. Aggregate usage telemetry is off unless a separate explicit product decision defines privacy-safe events and consent.
- No dependency, speech extension, model, or provider is installed automatically. A missing provider gives an explanatory unavailable state and leaves keyboard/mouse operation available.

## Feature-flag integration

Propose a new optional build flag, `trinorisVoiceControl`, independent of `copilotChat`, `chatPanel`, and the existing Copilot Voice contribution. It requires the Trinoris coordination UI (`coordinationUI`, proposed in spec 05) and the shared speech service APIs, but not a Copilot entitlement or voice backend. Default it off in upstream/default builds; enable it only in a Trinoris product profile after the feature is implemented and the user has explicitly selected a speech provider. This proposal does not change the current count of 16 build feature controls until the flag is added to `build/features.json`.

The existing `copilotChat`/Agents Voice feature remains independently disabled. Extracting generic voice UI or speech-session helpers must not make Copilot-specific services, assets, endpoint configuration, or session context reachable from the Trinoris contribution.

## Delivery phases

1. **Read-only MVP**: push-to-talk, provider disclosure, transcript preview, deterministic parser for navigation, refresh, and snapshot queries; no TTS required.
2. **Guarded mutations**: add one operation at a time with explicit confirmation, fresh-snapshot binding, CLI execution, and visible result. Begin with claim/release; add publish/complete only after outcome parsing is reliable.
3. **Accessibility and language support**: keyboard-only operation, screen reader announcements, configurable speech language, high contrast, and non-voice fallback for every action.
4. **Optional TTS**: spoken summaries only on user request, with a setting and immediate stop control.

## Acceptance criteria

- The feature builds and runs with Copilot Chat and Copilot Agents Voice disabled.
- Voice control is visibly separate from Chat and appears only inside Trinoris Coordination.
- Microphone capture is user-initiated, visibly indicated, cancellable, and disclosed as local or remote according to the selected provider.
- Navigation and read queries map to the same typed data and refresh state as the panel.
- Ambiguous targets and unsupported commands produce a clarification, never a guessed action.
- Every voice mutation has an exact preview and a separate explicit confirmation; the CLI remains the authority and supplies the result.
- Break/recover, setup, arbitrary CLI, terminal, agent launch, and code-edit actions cannot be reached from voice commands.
- No audio, transcript, handoff text, or scope task data is persisted or sent as context to an AI model.
- Missing speech support, permission denial, stale data, workspace trust denial, provider failure, and uncertain CLI outcomes have distinct, actionable UI states.
- Every action remains available through keyboard and pointer controls.
