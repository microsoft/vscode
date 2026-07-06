# Auto Mode Multi-Turn Routing — Server API Specification

**Audience:** Model Router (hydra) / CAPI server team
**Status:** Confirmed by server team (2026-07-06) — ready for implementation
**Owner (client):** VS Code Copilot Chat — Auto Mode
**Version:** 1.1

> **Confirmed contracts (server team, 2026-07-06):** capability dimensions are `reasoning`,
> `code_gen`, `debugging`, `tool_use` (fixed/stable); `hydra_scores` values are **probabilities in
> `[0,1]`**; `sigma` is derived from telemetry + public benchmarks, manually refreshed, mostly
> stable; **`candidate_models` monotonicity is guaranteed** (INV-3); `multi_turn` config is returned
> in the **ModelRouter response**; escalation adopts **`candidate_models[0]`**; no per-check caching
> concerns. See §9 for the full Q&A.

---

## 1. Summary

Today, when a user selects the **Auto** model, the client calls the Model Router
(`RequestType.ModelRouter`, "hydra") **once on the first turn** and then keeps that model
**sticky** for the rest of the conversation (until a `/compact` summarization resets it).

We want to make Auto mode **adaptively re-route within a conversation** so that when a user's
demand *increases* mid-session (e.g. they start on a trivial edit and escalate into a hard
debugging/reasoning task), Auto upgrades the model — while staying cheap and low-latency for
conversations that stay on-topic.

The client will own the full decision state machine (drift, backoff schedule, escalation). **The
only server-side changes required are:**

1. Return the capability vector (`hydra_scores`) **reliably on every call** with a stable,
   documented dimension set.
2. Return a new **`multi_turn` policy-config block** so thresholds are server-tunable without a
   client release.
3. Uphold a **monotonicity contract** on `candidate_models` ranking (so "escalate-only" is
   automatically correct).

No per-session state is required on the server. The router stays stateless per call.

---

## 2. Why this split (client decides, server scores + configures)

The feature's entire cost/latency benefit comes from **not calling the router on "skipped"
turns**. A decision *not to make a network request* can only be made on the client. Therefore the
schedule/drift/escalation logic must live client-side. Given that, the server's job is limited to:

| Concern | Owner | Notes |
|---|---|---|
| Capability vector `v_t` per prompt | **Server** | Already produced as `hydra_scores` |
| Policy config (σ, threshold, skip params) | **Server** | New `multi_turn` block; tunable/kill-switchable |
| `candidate_models` ranking (monotonic) | **Server** | Enables escalate-only correctness |
| Drift computation | Client | Pure math |
| Skip schedule (which turns call at all) | Client | "Skip" == no request |
| Escalation + model adoption | Client | Reuses existing endpoint selection |
| Full reset on compaction | Client | Existing hook |

This keeps server work minimal and avoids making the router stateful per session.

---

## 3. Concepts

- **Capability vector (`v_t`)** — the per-turn `hydra_scores`; a map of capability dimension →
  score (e.g. `reasoning`, `code_gen`, `debugging`, `tool_use`).
- **Anchor** — the capability vector that *caused the currently-selected model to be chosen*. It is
  set at conversation start, on every escalation, and after a compaction reset. It is **not**
  updated on a non-escalating check.
- **Drift** — a one-sided, σ-normalized L2 distance measuring how much *more demanding* the current
  turn is versus the anchor (decreases in demand contribute 0). Escalate-only by construction.
- **Skip window / backoff** — after a non-escalating check, the client skips an exponentially
  growing number of turns (no router calls), capped by `max_skip`.

### 3.1 Drift formula

```
drift = sqrt( Σ_d ( max(v_t[d] − anchor[d], 0) / σ_d )² )
```

- One-sided (`max(..., 0)`): only dimensions where demand **increased** vs the anchor contribute.
- `σ_d` normalizes each dimension so a "1.0 drift unit" means the same statistical surprise across
  different capabilities.
- `escalate_threshold` is expressed in these σ units (e.g. `1.0` = vigilant, `2.0` = economical).

---

## 4. Client algorithm (how your outputs are consumed)

Per **user turn**, per **conversation** (conversation id already sent as `session_id`):

```text
state per conversation: { anchor, skipWindow, skipRemaining }

on user turn:
  # 1) Full reset: first turn, post-compaction, or no anchor yet
  if isFullReset:
      resp    = callRouter(prompt)             # network call
      anchor  = resp.hydra_scores              # v_0
      cfg     = resp.multi_turn
      model   = adopt(resp.candidate_models[0])# full (re)route
      skipWindow    = cfg.initial_skip
      skipRemaining = 0                         # => turn 1 always checks
      return model

  # 2) Skipped turn: reuse model, make NO router call
  if skipRemaining > 0:
      skipRemaining -= 1
      return cachedModel

  # 3) Check turn: call router, measure drift
  resp  = callRouter(prompt)                    # network call
  v_t   = resp.hydra_scores
  cfg   = resp.multi_turn
  drift = sqrt( Σ_d ( max(v_t[d]-anchor[d],0) / cfg.sigma[d] )² )

  if drift >= cfg.escalate_threshold:
      # Escalate — natural stronger model (monotonicity contract, §6.3)
      model         = adopt(resp.candidate_models[0])
      anchor        = v_t
      skipWindow    = cfg.initial_skip
      skipRemaining = 0                          # re-check next turn
  else:
      # Stay; back off exponentially, capped
      skipRemaining = skipWindow
      skipWindow    = min(skipWindow * cfg.backoff_coefficient, cfg.max_skip)

  return model
```

**Worked schedule** with `initial_skip = 2`, `backoff_coefficient = 2`, `max_skip = 32`:

| Turn | Action | Router call? | Notes |
|---|---|---|---|
| 0 | anchor + full route | yes | `anchor = v_0`, window→2 |
| 1 | check | yes | always; drift<thr → skip 2,3; window→4 |
| 2, 3 | skip | no | reuse model |
| 4 | check | yes | drift<thr → skip 5–8; window→8 |
| 5–8 | skip | no | |
| 9 | check | yes | window→16 |
| … | | | doubles until `max_skip`, then constant |

On **escalation** at any check turn: adopt `candidate_models[0]`, reset `anchor = v_t`, window back
to `initial_skip`, and check again next turn.

On **compaction** (`/compact` or background summarization): full reset (turn index → 0), re-anchor,
full reroute.

---

## 5. Required server changes (overview)

1. **`hydra_scores` becomes REQUIRED and stable** — present on every `ModelRouter` response, with a
   fixed, documented dimension key set (see §6.2, §7).
2. **Add the `multi_turn` config block** to the `ModelRouter` response (see §6.2).
3. **Guarantee `candidate_models` monotonicity** (see §6.3) so escalate-only is correct without the
   client storing model tiers.
4. **(Optional) Accept new request signals** for observability / future server-side assist (see
   §6.1).

All additions are backward compatible. If `multi_turn` is absent, the client falls back to today's
turn-0-sticky behavior.

---

## 6. Exact schema

### 6.1 Request additions — `ModelRouter` POST body

All fields below are **optional and additive**; the client already sends `prompt`,
`available_models`, `session_id`, `turn_number`, `previous_model`, `reference_count`,
`prompt_char_count`, `has_image`, `copilot_plan`, `routing_method`.

| Field | Type | Req. | Description |
|---|---|---|---|
| `routing_intent` | `"anchor" \| "drift_check"` | optional | Why the client is calling this turn. `anchor` = full (re)route (turn 0 / post-compaction). `drift_check` = a scheduled check. |
| `turns_since_anchor` | integer ≥ 0 | optional | User turns elapsed since the anchor was set. |
| `current_skip_window` | integer ≥ 0 | optional | Client's current backoff window (for analysis). |
| `anchor_cap_vector` | `{ [dim: string]: number }` | optional | The anchor vector the client is comparing against (lets the server log/validate drift; server remains free to ignore). |

```jsonc
// Example request body (additions shown; existing fields elided)
{
  "prompt": "why is this recursion blowing the stack for n>1000?",
  "available_models": ["gpt-5-mini", "gpt-5", "claude-sonnet-4.5", "o4-mini"],
  "session_id": "vscode-chat://session/abc123",
  "turn_number": 4,
  "previous_model": "gpt-5-mini",
  "routing_method": "hydra",

  // NEW (optional)
  "routing_intent": "drift_check",
  "turns_since_anchor": 4,
  "current_skip_window": 4,
  "anchor_cap_vector": { "reasoning": 0.30, "code_gen": 0.50, "debugging": 0.20, "tool_use": 0.40 }
}
```

### 6.2 Response additions — `ModelRouter` response

```jsonc
{
  // ---- EXISTING (unchanged) ----
  "predicted_label": "needs_reasoning",           // 'needs_reasoning' | 'no_reasoning' | 'fallback'
  "confidence": 0.87,
  "latency_ms": 42,
  "candidate_models": ["gpt-5", "claude-sonnet-4.5", "gpt-5-mini"], // ranked, best-first
  "scores": { "needs_reasoning": 0.87, "no_reasoning": 0.13 },
  "sticky_override": false,
  "routing_method": "hydra",
  "fallback": false,

  // ---- CHANGED: now REQUIRED and dimension-stable ----
  "hydra_scores": {
    "reasoning": 0.65,
    "code_gen": 0.55,
    "debugging": 0.15,
    "tool_use": 0.45
  },

  // ---- NEW: multi-turn policy config (feature gate) ----
  "multi_turn": {
    "enabled": true,
    "schedule_version": "mt-2026-07-06.a",
    "sigma": {
      "reasoning": 0.15,
      "code_gen": 0.20,
      "debugging": 0.15,
      "tool_use": 0.25
    },
    "escalate_threshold": 2.0,
    "initial_skip": 2,
    "backoff_coefficient": 2,
    "max_skip": 32
  }
}
```

#### `multi_turn` field reference

| Field | Type | Req. within block | Range / constraint | Meaning |
|---|---|---|---|---|
| `enabled` | boolean | optional | — | Explicit kill switch. `false` (or block absent) ⇒ client uses legacy turn-0-sticky behavior. |
| `schedule_version` | string | recommended | — | Config version id; echoed in client telemetry for tuning/rollback. |
| `sigma` | `{ [dim]: number }` | **required** | each `> 0` | Per-dimension normalizers. **Keys MUST equal the `hydra_scores` keys** (see INV-1). |
| `escalate_threshold` | number | **required** | `> 0` (typ. `1.0`–`2.0`) | Drift threshold in σ units. Lower = more eager to upgrade. |
| `initial_skip` | integer | **required** | `≥ 0` (typ. `2`) | Skip window after the first non-escalating check. |
| `backoff_coefficient` | number | **required** | `≥ 1` (typ. `2`) | Window growth multiplier per non-escalating check. |
| `max_skip` | integer | **required** | `≥ initial_skip` (typ. `16`–`64`) | Upper bound on the skip window. Prevents over-skipping in long, high-context conversations where compaction happens very late. |

### 6.3 `candidate_models` monotonicity contract (escalate-only correctness)

The client adopts `candidate_models[0]` on escalation and relies on this being an **upgrade**. Because
drift only fires on *increased* demand, the server guarantees:

> **INV-3 (monotonicity) — CONFIRMED:** For a strictly more-demanding prompt (relative to the
> anchor), the top element `candidate_models[0]` is **at least as capable** as the model chosen at
> the anchor. The router does not return a *weaker* top model for a *more*-demanding turn.

Because the server team has confirmed INV-3 and that `candidate_models[0]` is the correct escalation
target (Q4/Q6 in §9), the client does **not** need explicit tiers, an `escalation_model` field, or a
`model_ranks` map. Escalate-only correctness follows directly from the monotonic ranking.

---

## 7. Invariants the server MUST uphold

- **INV-1 (key parity):** `multi_turn.sigma` contains an entry for **every** key in `hydra_scores`,
  with identical key sets. The client computes drift only over the intersection and will log a
  telemetry warning on mismatch.
- **INV-2 (positive σ):** every `sigma[d] > 0` (no divide-by-zero).
- **INV-3 (monotonic ranking):** see §6.3.
- **INV-4 (dimension stability):** the `hydra_scores` dimension set is stable within a conversation.
  Adding/removing dimensions mid-session is tolerated (client intersects keys) but discouraged, as it
  perturbs drift comparisons against an existing anchor.
- **INV-5 (unit consistency):** `hydra_scores[d]` and `sigma[d]` are in the **same linear units**.
  Confirmed: `hydra_scores[d]` are **probabilities in `[0,1]`**, so `sigma[d]` is the standard
  deviation of that probability over representative traffic (also in `[0,1]` space).
- **INV-6 (config freshness):** `multi_turn` may be returned on every response. The client uses the
  most recent values. Keep them stable within a session where possible; large mid-session swings in
  `initial_skip`/`backoff_coefficient` are allowed but will change the schedule.

---

## 8. Backward compatibility, rollout, kill switch

- **Feature gate:** presence of `multi_turn` with `enabled: true` turns the feature on. Absence or
  `enabled: false` ⇒ client keeps today's turn-0-sticky behavior. Safe to ship dark.
- **Server-side rollout:** gate `multi_turn` emission behind your experiment/flag system so you can
  ramp by population and instantly disable.
- **Independent client kill switch:** the client additionally gates on the experiment treatment
  variable `copilotchat.autoMultiTurnRouting` (only an explicit `false` disables), so either side
  can turn the feature off without a deploy.
- **`schedule_version`:** bump on any config change so telemetry can attribute behavior to a config
  generation and support clean rollback.

---

## 9. Resolved Q&A (server team, 2026-07-06)

1. **Q1 — Dimension keys:** ✅ **Resolved.** The capability dimensions are `reasoning`, `code_gen`,
   `debugging`, `tool_use`, and this set is **fixed and stable**.
2. **Q2 — Value range/units:** ✅ **Resolved.** `hydra_scores` values are **probabilities in
   `[0,1]`**.
3. **Q3 — How is `sigma` derived and refreshed?** ✅ **Resolved.** Derived from **telemetry data and
   public benchmarks**, refreshed **manually**, and **mostly stable**.
4. **Q4 — Monotonicity of `candidate_models`?** ✅ **Resolved.** **Guaranteed** (INV-3). No explicit
   `escalation_model` / `model_ranks` needed.
5. **Q5 — Config transport:** ✅ **Resolved.** `multi_turn` is returned in the **ModelRouter
   response**.
6. **Q6 — Escalation target:** ✅ **Resolved.** `candidate_models[0]` **is** the correct upgrade
   target on escalation.
7. **Q7 — Cost/latency of check turns:** ✅ **Resolved.** No concerns; per-check router calls are
   fine, no special caching required on the client.

---

## 10. Observability / correlation

The multi-turn *decision* telemetry is emitted client-side (extends the existing
`automode.routerDecision` event). To correlate client decisions with server behavior, please:

- Include `schedule_version` in your own request/response logs.
- Log the served `multi_turn` config values alongside `hydra_scores` and `candidate_models`.
- (If accepted) log the client-sent `routing_intent`, `turns_since_anchor`, and `current_skip_window`
  request signals.

The client will log, per check turn: `drift`, per-dimension one-sided contributions, the decision
(`escalate` / `stay`), the resulting `skipWindow`, `turns_since_anchor`, `schedule_version`, the
anchor vs. current vector, and the adopted model.

---

## Appendix A — Worked drift example (escalation)

```
dimensions:        reasoning   code_gen   debugging   tool_use
anchor  (v_0):        0.30        0.50        0.20        0.40
current (v_t):        0.65        0.55        0.15        0.45
sigma   (σ):          0.15        0.20        0.15        0.25

one-sided Δ = max(v_t - anchor, 0):
                      0.35        0.05        0.00        0.05
normalized  (Δ / σ):
                      2.333       0.250       0.000       0.200
squared:
                      5.444       0.0625      0.000       0.040
sum = 5.547   →   drift = sqrt(5.547) = 2.355

escalate_threshold = 2.0   →   2.355 ≥ 2.0   →   ESCALATE
```

The `reasoning` spike alone (a hard reasoning question after light edits) drives the upgrade, exactly
as intended. A symmetric *decrease* in demand would contribute `0` and never trigger a downgrade.

---

## Appendix B — Minimal vs. full server scope

- **Minimal (client-driven, recommended):** implement §5.1–§5.3. Router stays stateless. The client
  owns all state and math. Fastest to ship, matches this spec.
- **Full (server-assisted, not required):** additionally consume the §6.1 request signals to compute
  drift server-side for analysis, or to override the client via `sticky_override`. Optional; only if
  you want server-side visibility or control. Not needed for the feature to work.
