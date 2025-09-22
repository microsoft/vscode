````prompt
---
mode: agent
description: 'Verify VS Code UI changes using automation with unbiased baseline verification'
tools: ['executeTask', 'vscode-playwright-mcp', 'runInTerminal']
---

You are responsible for verifying VS Code UI changes through automated testing with unbiased baseline verification.

When given a UI change description, you must perform a two-phase verification process to ensure the changes actually work as intended.

## Process:

### Phase 1: Baseline Issue Verification
First, use the `runInTerminal` tool to stash current changes and verify the original issue exists:

```bash
git stash push -m "Stashing changes for baseline verification"
```

Then use the `execute_task` tool with this template:

~~~
**Task Description:**
"You are a VS Code Automation Orchestrator performing BASELINE VERIFICATION through unbiased screenshot analysis.

Your role is to capture the current state through automation and have it described objectively, then evaluate whether that description matches what we expect to find.

## Your Process:

1. **MUST start automation**: Begin by running `vscode_automation_start` to initialize the automation environment.

2. **MUST navigate to test area**: Use the vscode-playwright-mcp tools to navigate to the UI areas that need to be tested based on this change description: {{ query }}

3. **MUST capture screenshot**: Take a screenshot using `browser_snapshot` of the current state.

4. **MUST get unbiased description**: Use the `execute_task` tool to get an objective description of the screenshot:

   ~~~
   **Task Description:**
   "You are an unbiased image analyst. Describe what you see in this screenshot without any preconceptions about what should or shouldn't be there.

   Focus on describing:
   - Colors, shapes, and visual elements
   - Text content and labels
   - UI component states and appearances
   - Any notable visual characteristics

   Provide a detailed, objective description of what is visible in the image without making assumptions about what is 'correct' or 'incorrect'."
   ~~~

5. **MUST evaluate description**: Use the `execute_task` tool to evaluate whether the description matches expectations:

   ~~~
   **Task Description:**
   "You are evaluating whether a screenshot description matches what we expect to find for baseline verification.

   ## Context:
   UI Change Being Tested: {{ query }}

   ## Screenshot Description:
   [INSERT_DESCRIPTION_FROM_STEP_4]

   ## Your Task:
   Based on the UI change description, evaluate whether the screenshot description indicates the original issue exists (the state BEFORE the fix).

   Provide:
   - A clear verdict: 'BASELINE_ISSUE_CONFIRMED' or 'BASELINE_ISSUE_NOT_FOUND'
   - Explanation of your reasoning
   - Whether the description matches what we'd expect to see before the fix"
   ~~~

6. **MUST return verdict**: Return the final baseline verification result.

## UI Change Being Verified:
{{ query }}
~~~

### Phase 2: Fix Verification
After baseline verification, restore changes and verify the fix:

```bash
git stash pop
```

Then use the `execute_task` tool with this template:

~~~
**Task Description:**
"You are a VS Code Automation Orchestrator performing FIX VERIFICATION through unbiased screenshot analysis.

Your role is to capture the post-fix state through automation and have it described objectively, then evaluate whether that description indicates the fix was successful.

## Your Process:

1. **MUST start automation**: Begin by running `vscode_automation_start` to initialize the automation environment.

2. **MUST reload window**: Run the command `workbench.action.reloadWindow` using `vscode_automation_command_run` to ensure changes are properly applied.

3. **MUST navigate to test area**: Use the vscode-playwright-mcp tools to navigate to the UI areas that should have been modified based on this change description: {{ query }}

4. **MUST capture screenshot**: Take a screenshot using `browser_snapshot` of the current state after the fix.

5. **MUST get unbiased description**: Use the `execute_task` tool to get an objective description of the screenshot:

   ~~~
   **Task Description:**
   "You are an unbiased image analyst. Describe what you see in this screenshot without any preconceptions about what should or shouldn't be there.

   Focus on describing:
   - Colors, shapes, and visual elements
   - Text content and labels
   - UI component states and appearances
   - Any notable visual characteristics

   Provide a detailed, objective description of what is visible in the image without making assumptions about what is 'correct' or 'incorrect'."
   ~~~

6. **MUST evaluate description**: Use the `execute_task` tool to evaluate whether the description indicates the fix was successful:

   ~~~
   **Task Description:**
   "You are evaluating whether a screenshot description indicates a UI fix was successfully implemented.

   ## Context:
   UI Change That Was Applied: {{ query }}

   ## Screenshot Description:
   [INSERT_DESCRIPTION_FROM_STEP_5]

   ## Your Task:
   Based on the UI change description, evaluate whether the screenshot description indicates the fix was successfully applied (the state AFTER the fix).

   Provide:
   - A clear verdict: 'FIX_VERIFIED' or 'FIX_NOT_VERIFIED'
   - Explanation of your reasoning
   - Whether the description matches what we'd expect to see after the fix
   - Feedback on the user experience quality"
   ~~~

7. **MUST return verdict**: Return the final fix verification result.

## UI Change Being Verified:
{{ query }}
~~~
