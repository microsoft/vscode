# Mentis x Forge — Architecture

## Overview

**Forge** is a VS Code OSS fork that serves as the development and runtime platform for **Mentis** — a cognitive AI system (Latin: *"of the mind"*). This document maps the relationship between all repos in the ecosystem, defines module boundaries, and tracks open architectural questions.

---

## Ecosystem Map

| Repo | Role | Stack |
|---|---|---|
| `sobomabo/forge` | IDE/platform — the environment where Mentis is built, run, and developed | TypeScript + Python |
| `sobomabo/mentis` | The cognitive AI product itself | TBD |
| `sobomabo/dream-land` | Self-evolving DreamAgent — rewrites its own objectives via imagination/dreaming | Python |
| `sobomabo/diri` | Likely orchestration / interface layer | TypeScript |

---

## Current Structure in Forge

The **CognifactAgent** — a self-improving, test-driven validation kernel — is implemented and fully tested (40/40 passing):

```
forge/
└── cognifact/
    ├── cognifact_agent.py       # Core agent class
    └── test_cognifact_agent.py  # 40-test pytest suite
```

### CognifactAgent API

| Method | Purpose |
|---|---|
| `write_test(spec)` | Generates a live test case (cognifact) from a high-level specification |
| `validate_test(impl)` | Runs the cognifact against a candidate implementation in an isolated namespace |
| `update_test(reason)` | Self-repairs the cognifact when validation fails |
| `compute_loss(output, expected)` | Emits 0/1 loss signal for training loops |
| `get_cognifact()` | Returns the current live test case |

---

## Inferred Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          MENTIS                              │
│                  (cognitive AI product)                      │
│                                                              │
│  ┌─────────────────┐     ┌──────────────────────────────┐   │
│  │   dream-land    │     │       CognifactAgent         │   │
│  │  DreamAgent     │────▶│  test-driven self-           │   │
│  │  (rewrite own   │     │  improvement + loss signal   │   │
│  │   objectives)   │     └──────────────────────────────┘   │
│  └─────────────────┘                ▲                        │
│                                     │                        │
│  ┌─────────────────┐                │                        │
│  │      diri       │────────────────┘                        │
│  │  (orchestration │                                         │
│  │   / interface)  │                                         │
│  └─────────────────┘                                         │
│                                                              │
│                    runs inside / built with                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                      FORGE                           │   │
│  │           (VS Code OSS — the platform)               │   │
│  │      cognifact/ lives here as Mentis's kernel        │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

> **Note:** This diagram is inferred. It must be validated once `sobomabo/mentis` is accessible in this environment.

---

## Open Questions

These must be resolved before the architecture can be solidified and stress tested:

1. **What is Mentis at its core?** — agent framework, training pipeline, cognitive OS, or all three?
2. **Forge's role** — IDE for human interaction, environment Mentis runs inside, or CI/build pipeline?
3. **CognifactAgent placement** — currently in `forge/cognifact/`; should it be a Mentis submodule?
4. **dream-land connection** — does it feed objectives into CognifactAgent, or are they parallel subsystems?
5. **diri's role** — orchestration layer, user interface, or agent routing?
6. **Training loop** — is there a live training signal flowing between these components?

---

## Next Steps

- [ ] Access `sobomabo/mentis` (clone locally or expand session permissions)
- [ ] Validate or correct the architecture diagram above
- [ ] Define clear module boundaries and interfaces between all repos
- [ ] Stress test the architecture — single points of failure, tight coupling, missing contracts
- [ ] Decide canonical home for CognifactAgent (forge vs mentis submodule)
- [ ] Produce final `ARCHITECTURE.md` with confirmed design

---

*Branch: `claude/cognifact-agent-framework-58Gi3`*
