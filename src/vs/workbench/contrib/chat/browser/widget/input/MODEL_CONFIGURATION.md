# Model picker configuration and data flow

The picker presents a configuration; it is not the authority for policy or execution. These principles apply to workbench chats, Agents Window drafts and conversations, and automation configuration.

## Distinguish the values

| Value | Owner | Lifetime |
| --- | --- | --- |
| Catalog default and offered options | Provider/runtime | Current model catalog |
| Personal preference | Client preference store | Future chats in its documented scope |
| Conversation selection | The particular chat | That chat, including restoration |
| Managed default or lock | Runtime policy resolver | Current policy and applicable model |
| Applied value | Runtime session | What the runtime accepted for execution |

Equal values do not imply equal intent. A displayed default is not an explicit selection, even when the user could select the same value. Preserve provenance when serializing a draft or restoring a conversation.

Separate authoring syntax from the delivered contract. The [enterprise authoring guide](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/use-managed-settings/override-settings-for-teams) uses `overridable` for team specialization, and server composition can remove that wrapper before delivery. A native-file test that retains wrappers is not evidence of server-delivered behavior. Never infer an end-user lock solely from a normalized bare value or its composition metadata.

Copilot Agent Host consumes model controls as startup defaults: it enables managed settings but does not opt into the SDK's separate `enforceManagedModelDefaults` mode. Explicit selections and existing conversation state remain mutable. This mode choice concerns model configuration only; it does not disable permission or sandbox enforcement. Other hosts may advertise genuinely read-only schema properties; those still require normal read-only handling. A future strict model-policy integration needs an explicit delivered contract and its own compatibility validation.

## Ownership and flow

```text
Provider catalog + applicable runtime policy + personal preferences
                             |
                 Chat/draft configuration owner
                    /                    \
              Picker reads          Request assembly
                    \                    /
                      Explicit selection
                             |
                 Runtime validates and applies
                             |
                Chat-scoped authoritative report
```

- **One owner per scope.** Picker writes and request assembly must use the same configuration owner. Eager session creation must not freeze a separate snapshot that ignores later picker edits. Automations remain isolated from one another even when explicit edits also update personal defaults.
- **Runtime is the source of truth.** Schema, source composition, model capability validation, lock enforcement, and resume reconciliation belong in the shared runtime/SDK path. A CLI-specific startup helper does not establish SDK parity. Do not duplicate policy parsing or bypass a runtime rejection in the picker.
- **Defaults are not locks.** A startup default must not erase an explicit choice. A genuinely mandatory value advertised by a host may change the effective configuration without replacing the saved preference beneath it. Removing such a lock must not make the formerly locked value a new personal preference.
- **Restore the conversation, not the editor.** A reused input may still hold another chat's values. Preserve the restored chat's own effective values in memory, including default-sourced values; excluding them from durable preferences must not discard them from conversation state. Runtime readback may correct implicit values, not an unrelated chat's accidentally promoted explicit value.
- **Respect capabilities and version skew.** A model may be absent or lack an effort/context option. Only offered options belong in the picker. Standard schema `readOnly` behavior must work without optional provenance extensions. Missing extensions must not disable ordinary model selection.
- **Host reports are observations, not client settings.** Scope them to the exact advertised chat identity, including peer chats. Protect host-owned values at the host write boundary, preserve them across client replacements, and omit them from client replacement payloads. Schema `readOnly` alone is not write protection.
- **Ordering is part of correctness.** Attach event listeners before asynchronous discovery or readback. Bound refreshes and discard superseded results. Disposing an older session must not remove a successor's report, and stale client state must not resurrect a removed report.
- **A label is not execution proof.** The selected control, outgoing request, and runtime-applied value are distinct observations. Test the boundary relevant to the claim rather than inferring runtime behavior from a screenshot.

## Regression scenarios

Cover these transitions at their owning boundary. Default-only integration tests should serve plain scalar payloads after server composition, omit the strict SDK opt-in, and verify runtime-applied values or outgoing model requests as well as picker state. Keep raw authoring/composition tests and strict-mode defect characterizations separate; a passing characterization reproduces a known defect, not a fix.

1. Eagerly create a draft, change effort/context in the ordinary picker, then send the first request.
2. Restore a default-sourced chat after another chat selected an explicit value, including before model registration finishes.
3. Apply and remove a lock while retaining the personal preference, both with and without optional provenance metadata.
4. Switch to a different concrete model; do not transfer model-specific locks or unsupported options.
5. Replace client settings while the host publishes a newer report or removes a chat; preserve other peers and reject report writes.
6. Resume a session after changing server-shaped scalar defaults; its choices and history must survive. Test strict SDK mode separately rather than using its results to describe default-only behavior.
7. Verify keyboard/accessible selected and disabled states agree with the effective configuration.

## Implementation entry points

- [Configuration resolution and provenance](chatModelConfigurationLogic.ts)
- [Workbench per-chat store](chatModelConfigurationStore.ts)
- [Shared picker configuration access](modelPicker/modelPickerModelConfig.ts)
- [Agents draft/automation preferences](../../../../../../sessions/contrib/automations/browser/automationModelConfiguration.ts)
- [Agents picker selection adapter](../../../../../../sessions/contrib/chat/browser/sessionModelSelection.ts)
