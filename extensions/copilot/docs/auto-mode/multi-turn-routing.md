# Auto Mode Multi-Turn Routing

**Area:** VS Code Copilot Chat — Auto mode model selection
**Status:** Implemented (client); gated behind the `copilotchat.autoMultiTurnRouting` treatment variable (default off)
**Code:** [`multiTurnRouting.ts`](../../src/platform/endpoint/node/multiTurnRouting.ts), [`automodeService.ts`](../../src/platform/endpoint/node/automodeService.ts), [`routerDecisionFetcher.ts`](../../src/platform/endpoint/node/routerDecisionFetcher.ts)

## Overview

When a user selects the **Auto** model, Copilot Chat asks a server-side Model Router ("hydra",
`RequestType.ModelRouter`) which model to use. Historically Auto routed **once on the first turn**
and then stayed **sticky** for the rest of the conversation (until a `/compact` summarization).

Multi-turn routing makes Auto **re-evaluate the model as a conversation evolves**: when the user's
demand *increases* mid-session (e.g. a trivial edit turns into a hard debugging/reasoning task),
Auto upgrades the model — while staying cheap and low-latency when the conversation stays on-topic
by checking the router less and less often.

The **client owns the decision** (drift, backoff schedule, escalation, resets); the **server
provides the raw scores and the tuning knobs** and stays stateless per call. The decision must live
on the client because the core saving is *not making a network call* on skipped turns — something
only the client can decide.

## Concepts

- **Capability vector (`v_t`)** — the per-turn `hydra_scores` from the router: a map of capability
  dimension → probability in `[0, 1]`. Dimensions: `reasoning`, `code_gen`, `debugging`, `tool_use`.
- **Anchor** — the capability vector that caused the *current* model to be chosen. Set at
  conversation start, on each escalation, and after a compaction reset; it is **not** updated on a
  non-escalating check, so demand accumulates against a fixed reference until the model changes.
- **Drift** — a one-sided, σ-normalized L2 distance measuring how much *more demanding* the current
  turn is versus the anchor. Decreases contribute 0, so drift only ever triggers upgrades:

  ```
  drift = sqrt( Σ_d ( max(v_t[d] − anchor[d], 0) / σ_d )² )
  ```

- **Skip window / backoff** — after a non-escalating check the client skips an exponentially growing
  number of turns (no router call), capped by `max_skip`. `skipWindow` is the *next* gap size;
  `skipRemaining` is how many turns are being skipped right now.

## How it works (client state machine)

Per user turn, per conversation:

```text
state per conversation: { anchor, skipWindow, skipRemaining }

- Full reset (first turn / post-compaction):
    call router → anchor = hydra_scores; adopt the router's pick;
    skipWindow = initial_skip; skipRemaining = 0   (so the next turn always checks)

- Skipped turn (skipRemaining > 0):
    reuse the current model; skipRemaining -= 1     (NO router call)

- Check turn (skipRemaining == 0):
    call router → drift = f(hydra_scores, anchor, sigma)
    if drift >= escalate_threshold:
        escalate: adopt the router's pick; anchor = hydra_scores;
                  skipWindow = initial_skip; skipRemaining = 0
    else:
        stay: keep the current model;
              skipRemaining = skipWindow; skipWindow = min(skipWindow × coefficient, max_skip)
```

The "router's pick" is `chosen_model` when present (the authoritative choice after any server-side
re-ranking), otherwise the first `candidate_models` entry that maps to a known endpoint. A vision
fallback still applies when the request has an image and the picked model lacks vision support.

### Example schedule (`initial_skip = 2`, `coefficient = 2`)

Checks land on turns **0, 1, 4, 9, 18, …**; the model stays put in between:

| Turn | Router call? | Notes |
|---|---|---|
| 0 | yes | anchor + route; window → 2 |
| 1 | yes | always checks; low drift → skip 2, 3; window → 4 |
| 2–3 | no | reuse model |
| 4 | yes | low drift → skip 5–8; window → 8 |
| 9 | yes | window → 16 |
| … | | doubles until `max_skip`, then constant |

An escalation resets the window to `initial_skip` and re-anchors (the next turn checks again). A
`/compact` fully resets the schedule (turn index → 0) and re-anchors.

## Router response the client consumes

The client depends on the ModelRouter response carrying:

| Field | Type | Used for |
|---|---|---|
| `hydra_scores` | `{ [dim]: number }` | The capability vector `v_t`; probabilities in `[0, 1]` over the fixed dimensions. |
| `chosen_model` / `candidate_models` | string / string[] | The router's pick (escalation target) and the ordered fallback list. |
| `multi_turn` | object | The policy config (below). **Absent ⇒ the client stays on legacy turn-0-sticky behavior.** |

### `multi_turn` config

| Field | Type | Meaning |
|---|---|---|
| `enabled` | boolean | Server kill switch; `false` ⇒ legacy behavior. |
| `schedule_version` | string | Config version id (emitted in telemetry for tuning/rollback). |
| `sigma` | `{ [dim]: number }` | Per-dimension σ for drift normalization; same keys as `hydra_scores`. |
| `escalate_threshold` | number | Drift threshold in σ units (e.g. `1.0` vigilant, `2.0` economical). |
| `initial_skip` | integer | First backoff window. |
| `backoff_coefficient` | number | Window growth multiplier per non-escalating check. |
| `max_skip` | integer | Cap on the skip window (avoids over-skipping in long, high-context sessions). |

Missing/invalid scalar knobs fall back to client defaults (`initial_skip = 2`,
`backoff_coefficient = 2`, `max_skip = 32`, `escalate_threshold = 2`). An absent or empty `sigma`
disables the feature for that turn (drift cannot be normalized).

> **Anchoring-turn requirement:** multi-turn only activates when a valid `multi_turn` config **and**
> `hydra_scores` are present on an *anchoring* turn (the first turn, or the first turn after a
> `/compact`). If the server only starts sending config on a later turn, that conversation stays on
> the legacy sticky path and never activates. A turn-0 absence is observable via
> `automode.multiTurnAbort` (`reason: noConfig`).

The client additionally sends context signals on each router request for server-side analysis:
`routing_intent` (`anchor` | `drift_check`), `turns_since_anchor`, `current_skip_window`, and
`anchor_cap_vector`.

### Contract the client relies on

- **Monotonic ranking** — for a strictly more-demanding prompt, the router's pick is at least as
  capable as the anchor's model. This is what makes "escalate-only" correct without the client
  tracking model tiers.
- **Key parity** — `sigma` covers every `hydra_scores` dimension; drift is computed over the
  intersection and any dimension missing a positive σ is ignored.
- **Same units** — `hydra_scores` and `sigma` are both in `[0, 1]` space.

## Rollout & A/B

The feature is gated behind the ExP treatment variable **`copilotchat.autoMultiTurnRouting`**
(default **off**). The client randomizes the arm; the server supplies config and eligibility.
Because the treatment is read on the first router call, the ExP assignment auto-attaches to
telemetry (`abexp.assignmentcontext`), and `automode.routerModelSelection` also carries a
`multiTurnEnabled` flag so the control arm is identifiable. Each per-turn decision is reported via
`automode.multiTurnRouting` (drift, decision, skip window, `schedule_version`, and per-dimension
drift contributions).

Either an absent / `enabled: false` server `multi_turn` block **or** a `false` treatment falls back
to the legacy turn-0 sticky behavior. For GA, promote the flag to an experiment-based config and
flip the default to `true`, keeping the treatment as a kill switch.

## Tests

- [`multiTurnRouting.spec.ts`](../../src/platform/endpoint/node/test/multiTurnRouting.spec.ts) — the
  pure drift math and schedule state machine.
- [`automodeService.spec.ts`](../../src/platform/endpoint/node/test/automodeService.spec.ts) — the
  `multi-turn routing` suite, including an end-to-end pipeline trace (anchor → backoff → escalation +
  re-anchor → compaction reset) and the A/B gate.
