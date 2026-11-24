---
name: automate
description: 'Propose an automation from a completed task or a new idea, then create it after approval. Use when the user asks to create an automation or wants scheduled local or cloud agent work.'
argument-hint: Describe a task, schedule, and where it should run
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Propose an Automation

## Infer the task

- After completed work, bare `/automate` repeats its relevant goal, inputs, scope, and result, not the whole chat.
- Brief `/automate` guidance refines the relevant prior task; fill gaps from that context.
- In a fresh chat, build a concrete reusable task from the explanation without inventing prior work.
- With no useful context, offer two or three examples, including a local file/report task, before discovering tools or providers. Invite a custom goal; suggestions are not choices.

Establish task and result before setup/discovery. Ask what success should produce or do only when unclear; reuse known answers.

For an explicit one-time request with a clear prompt, time, and destination, use the one-time workflow below rather than requiring a separate proposal acceptance. Bare `/automate`, recurring work, and incomplete requests still use the proposal workflow.

Ask one concept per question, titled by the missing input, such as "Repositories to check". Batch related questions in the same turn or form instead of serial follow-ups. Suggest answers; mark unresolved choices as undecided. Read discovery output with file/search tools, not shell. Do not inspect task files, execute tasks, or request permissions merely to draft.

## Shape the draft

Use `listAutomations` to verify capabilities and duplicates before configuration; mention only relevant matches. Missing, loading, or partial information is unverified, not an empty catalog. Retry usefully, never an unchanged authentication failure. Explain blocked verification; use only ready-catalog cloud tool IDs and fields supported by the current creation tool.

For work centered on a supplied folder, prefer that folder; otherwise suggest Chat. Prefer the current harness, or Copilot if unknown. Preserve explicit target, isolation, provider, model, reasoning, and permission choices. Explain unsupported choices rather than substituting them.

Focus on user decisions, not discovery results, provider counts, machine requirements, or confirmation reassurances. Discuss limitations only when requested or blocking; mention unavailable cloud only for a cloud request. Validate repository access through supported tools before creation.

Request no optional tools or customizations, using explicit empty selections only where the current tool supports them. Add only what the task needs; do not invent parameters or claim unavailable customization controls were applied. Keep read-only work read-only. Separate task instructions from enforced settings: use verified permission labels, or identify provider defaults without promising which actions will prompt. Never invent controls or imitate unavailable guarantees with chat approval questions; explain the limitation and let the user choose.

Write the saved prompt for a person to skim: a short goal, then short paragraphs or bullets for steps, output, and necessary limits. Use headings only when useful. Preserve exact filenames, commands, thresholds, and stated constraints without setup narration or unrelated boilerplate. Use paths relative to a configured folder; Chat tasks need sufficient absolute inputs. Do not invent consequential behavior: offer assumptions as suggestions or clarify them.

Preserve explicit schedule times and zones. Otherwise infer the time zone from reliable conversation or available environment context, and show the inferred zone in the proposal. Ask only when the intended zone cannot be inferred reliably or is ambiguous; do not guess a time zone from language or a UTC offset alone.

Use only schedules supported by the current tool. Explain unsupported event triggers rather than approximating them or silently converting times.

## Propose, then wait

Show an ordinary-chat draft: name; **Runs** with plain location, full folder path in code, and direct-folder/worktree distinction; **When**; decision-relevant verified settings, ownership, or costs; and the exact prompt. For local runs, use the selected agent's display name followed by "on this computer", such as "Copilot on this computer" or "Claude on this computer", not "Copilot SDK", "folder isolation", or "Local Agent Host". Separate suggestions and unresolved choices from verified settings.

Complete the proposal without an acceptance form. End: "Say Create it when ready, or tell me what to change." Ask only for missing facts. Never use `configureAutomation` as a preview: it saves. Invoking the skill or supplying an idea is not acceptance.

If the user accepts with a rename or unambiguous edit, save the reviewed draft plus only that edit without another round. If resolving a change requires judgment, conflicting choices, or consequential assumptions, show the resolved draft and wait for acceptance. Add no new task behavior while saving.

## Schedule a clear one-time request

Use `listAutomations` to check one-time availability and obtain the current time and device time zone. Resolve an unambiguous requested time to `schedule: { interval: "once", runAt: "<absolute UTC instant>" }`; ask about ambiguous wall-clock times or missing task details rather than guessing. A date-specific request is not a recurring cron schedule.

Default to `target: { kind: "currentChat" }`, which sends into this exact conversation, including a peer chat. Only choose a new session when requested: `currentSession` copies the current session's environment but creates a new conversation; `workspace` and `quickChat` also create new conversations. A new-session prompt must include its necessary context; it does not inherit chat history or unsent input. Existing-chat requests use the conversation's execution settings when they run, so do not supply configuration overrides.

Call `configureAutomation` directly for a fully specified, explicitly requested one-time send. Normal tool approval still applies; this does not authorize future tool actions. Initial support is text-only on a supported local desktop Agent Host with Send Later enabled. Do not copy attachments or silently substitute another provider or destination. The host queues once when available; it cannot wake the computer or start a stopped host.

Report the accepted destination and local send time with its time zone. Accepted means scheduled, not executed; an existing-chat run completing means queued, not that the requested work finished. Reschedule with `runAt`, cancel a pending request with `enabled: false`, and use the existing run tool only for an explicitly requested Send Now. Never create autonomous follow-ups or self-rescheduling. On an uncertain result, inspect the saved identity with `listAutomations` and direct the user to Reconcile Schedule if unresolved; do not create a replacement.

## Create only after acceptance

For the proposal workflow, after acceptance, resolve remaining blockers and call `configureAutomation` with the reviewed configuration and the same prompt, retaining its line breaks. Preserve explicit creation-state requests; otherwise omit `enabled` and retain existing tool defaults. Do not claim confirmation choices the tool does not offer. Respect tool approval and organization policy; never bypass them through shell, HTTP, or repository edits. Chat targets omit workspace, isolation, and branch fields. Never guess settings or widen permissions.

Report saved identity, state, and accepted prompt edits. Reconcile uncertain results before retrying. Do not enable, run, change, or delete an automation without explicit authorization. Creating does not authorize a run.
