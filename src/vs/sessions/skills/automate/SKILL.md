---
name: automate
description: Turn the work done in the current conversation into a reusable Automation that can be run again later, on demand or on a schedule. Use only when the user explicitly invokes /automate or asks to save this conversation as an automation.
argument-hint: Optional name, schedule, or notes, e.g. "weekdays at 9am" or "only the reporting part"
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Automate This Conversation

The user wants to repeat what was accomplished in this conversation later, against fresh data, without re-explaining it. Distill the conversation into a single self-contained Automation and save it with the `configureAutomation` tool. Any text after `/automate` contains the user's overrides, such as a name, a schedule, or which part of the work to keep. Overrides always take precedence over the defaults below.

## 1. Check availability

Call `listAutomations`. If the automation tools are unavailable, the result says Automations are disabled, or no provider reports `canCreateAutomation: true`, stop and tell the user why. Mention the `chat.automations.enabled` setting or connecting an Agent Host that supports Automations, as appropriate. Do not attempt another way to persist the work.

## 2. Distill the reusable prompt

Review the whole conversation, not only the last turn. The prompt runs in a brand-new session with no memory of this one, so it must stand on its own.

- **Goal**: State the outcome in one or two sentences.
- **Inputs that change per run**: Identify what will differ next time, such as the latest data, today's date, new files, or open pull requests. Instruct the run to fetch or discover these fresh rather than hard-coding values from this conversation. Keep stable identifiers such as repository paths, URLs, query names, dashboards, and file locations.
- **Steps that worked**: Record the final working approach in order, with the specific commands, tools, scripts, queries, and files used. Omit dead ends, but add a short "Avoid" note for any pitfall that cost time, so the run does not repeat it.
- **Output**: Describe exactly what the run should produce and where, such as a file path, a report format, a comment, a commit, or a summary in the chat.
- **Done criteria and safety**: Say how to verify success. Preserve any constraints the user stated, such as not pushing, asking before deleting, or which branch to use. Never embed secrets, tokens, or credentials. If the work needs them, tell the run where they come from.

Write the prompt in second person, as direct instructions to the agent. Keep it as short as the task allows, and prefer concrete commands to prose.

If the conversation contains several unrelated tasks and the user's overrides do not say which one to automate, ask the user which one to keep before continuing.

## 3. Choose the remaining values

- **name**: Choose a short, descriptive title-style name, such as "Weekly Telemetry Report", unless the user provided one.
- **schedule**: Use `{ "interval": "manual" }` unless the user requested a cadence. Map phrases such as "every weekday at 9" to the schedule fields, and follow the `configureAutomation` schema rules for the selected provider.
- **target**: Omit it. The automation then targets the current session's workspace and agent.
- **sessionTemplate**: Omit it unless the user asked for a specific model or configuration that `listAutomations` reports as available for this provider. Never invent identifiers.
- **enabled**: Omit it. A requested schedule should start running, and a manual automation only runs when the user starts it.

## 4. Show the proposal, then create it

Before calling the tool, show the user the proposed name, the schedule, and the full prompt in a fenced block, so they can review it alongside the confirmation. Then call `configureAutomation` with `name`, `prompt`, and `schedule`.

If the user declines or cancels the confirmation, do not retry. Ask what they would like to change.

## 5. Confirm

After the automation is created, say how to use it: run it from the Automations view whenever it is needed, or let the schedule start it. Also mention that the prompt, model, and other settings can be edited from that view. Do not run the automation unless the user asks.
