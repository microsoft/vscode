---
name: validation
description: Validates changes in the VS Code repository by launching VS Code with the vscode-playwright-mcp tools, testing functionality, capturing screenshots and videos, and providing feedback on whether changes work as expected. Use when you need to verify that code changes produce the intended user-facing behavior.
---

# Validation Skill

This skill validates that code changes in the VS Code repository work as intended by using the vscode-playwright-mcp tools to launch VS Code, interact with the UI, and verify functionality.

## When to Use This Skill

Use this skill when:
- You've made code changes that affect the UI or user-facing functionality
- You need to verify that new features work as described in the requirements
- You want to validate that commands, dialogs, menus, or other UI elements behave correctly
- You need visual proof (screenshots/videos) that changes work
- You want feedback on improvements or issues before finalizing your work

## Core Workflow

### 1. Setup Phase

Before validating, gather context about what needs to be tested:

1. **Understand the changes**: Review the plan, commit messages, or diff to understand what functionality was added or modified
2. **Identify test scenarios**: Determine what specific user interactions need to be tested based on the requirements
3. **Prepare test data**: If needed, create sample files, projects, or configurations for testing

### 2. Automation Setup

1. **Start VS Code automation**: Use `vscode_automation_start` to launch VS Code
   - This starts a headless browser with VS Code running
   - The automation session will be recorded as a video
   
2. **Configure VS Code**: Set up any required settings using `vscode_automation_settings_add_user_settings`
   - Always set `"chat.allowAnonymousAccess": true` if testing chat-related features
   - Add any other settings needed for testing your feature

3. **Wait for initialization**: Ensure VS Code is fully loaded before proceeding
   - Use `browser_snapshot` to verify the UI is ready
   - Check that expected elements are present in the accessibility tree

### 3. Testing Phase

Execute the test scenarios systematically:

1. **Take baseline snapshot**: Capture the initial state with `browser_snapshot`
2. **Perform user interactions**: 
   - Use `vscode_automation_*` tools when available (preferred)
   - Fall back to `browser_*` tools for general interactions
   - Execute commands using `vscode_automation_execute_command`
   - Type text using `vscode_automation_editor_type_text` or `vscode_automation_chat_send_message`
3. **Capture evidence**:
   - Take screenshots with `playwright-browser_take_screenshot` after each significant action
   - The entire session is automatically recorded as a video
4. **Verify behavior**:
   - Use `browser_snapshot` to check that expected elements appear
   - Verify text content, UI states, and visual changes
   - Test edge cases and error conditions if applicable

### 4. Analysis and Feedback

After testing, provide comprehensive feedback:

1. **Summary of results**:
   - Did the functionality work as described in the requirements?
   - What specific behaviors were tested?
   - Were there any unexpected behaviors or errors?

2. **Visual evidence**:
   - Reference the screenshots taken during testing
   - Note the video recording location
   - Highlight key moments in the video that demonstrate the feature

3. **Suggestions for improvement**:
   - UI/UX improvements (better labels, clearer icons, improved layout)
   - Additional functionality that would enhance the feature
   - Edge cases that should be handled
   - Accessibility considerations

4. **Issues found**:
   - Clear description of any problems encountered
   - Steps to reproduce issues
   - Expected vs. actual behavior
   - Suggestions for fixes

### 5. Cleanup

Always clean up the automation session:

1. **Stop automation**: Call `vscode_automation_stop` to end the session and save the recording
   - This is REQUIRED whether testing succeeded or failed
   - The video will be saved automatically

## Important Guidelines for VS Code Automation

### Using Monaco Editors

Monaco editors (used throughout VS Code) require special handling:

**DO NOT** use standard Playwright methods like `.click()` on textareas or `.fill()` / `.type()` on Monaco editors. These will timeout or fail.

**ALWAYS follow this sequence:**

1. Take a `browser_snapshot` to identify the editor structure
2. Find the parent `code` role element that wraps the Monaco editor
3. Click on the `code` element (not textarea or textbox elements)
4. Verify focus by checking that the nested textbox has the `[active]` attribute
5. Use `page.keyboard.press()` for EACH character individually

Example:
```js
// ❌ WRONG - will fail
await page.locator('textarea').click();
await page.locator('textarea').fill('text');

// ✅ CORRECT
await page.locator('[role="code"]').click();
await page.keyboard.press('H');
await page.keyboard.press('e');
await page.keyboard.press('l');
await page.keyboard.press('l');
await page.keyboard.press('o');
```

### Tool Preferences

- **Prefer `vscode_automation_*` tools** over `browser_*` tools when available
  - `vscode_automation_chat_send_message` for chat interactions
  - `vscode_automation_editor_type_text` for editor input
  - `vscode_automation_execute_command` for running commands
  - `vscode_automation_settings_add_user_settings` for changing settings

- **Use `browser_*` tools for general interactions**:
  - `browser_snapshot` to view the accessibility tree
  - `browser_click` to click on elements
  - `browser_take_screenshot` to capture visual evidence
  - `browser_wait_for` to wait for elements or text

### Focusing Elements

When you need to focus or interact with an element:

1. Use `browser_snapshot` to see the accessibility tree
2. Identify the correct element by its role and accessible name
3. Use the `ref` attribute from the snapshot to click or interact with it
4. Verify the action succeeded by taking another snapshot

## Testing Checklist

Before concluding validation, ensure you've covered:

- [ ] Launched VS Code with automation
- [ ] Configured any necessary settings
- [ ] Executed the primary test scenario from the requirements
- [ ] Captured screenshots showing the feature working
- [ ] Tested any edge cases or variations mentioned in the requirements
- [ ] Verified error handling if applicable
- [ ] Checked that UI elements have proper labels and are accessible
- [ ] Stopped the automation session to save the video
- [ ] Provided clear feedback on what works and what doesn't
- [ ] Suggested improvements if applicable

## Example Test Scenarios

### Scenario 1: Testing a New Dialog

**Requirements**: "Add a dialog that says 'Hello World' with an OK button"

**Validation steps**:
1. Start automation
2. Execute command to open the dialog
3. Take snapshot to verify dialog appears
4. Check that dialog contains "Hello World" text
5. Verify OK button is present and clickable
6. Click OK button
7. Verify dialog closes
8. Take screenshot of each step
9. Stop automation

**Feedback template**:
- ✅ Dialog appears when command is executed
- ✅ "Hello World" message is displayed correctly
- ✅ OK button is present and functional
- 💡 Suggestion: Add keyboard shortcut (Enter) to close dialog
- 💡 Suggestion: Add aria-label to dialog for screen reader users

### Scenario 2: Testing a New Command

**Requirements**: "Add a 'Hello World' command that shows a notification"

**Validation steps**:
1. Start automation
2. Open command palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Search for "Hello World" command
4. Execute the command
5. Verify notification appears with correct text
6. Take screenshots of command palette and notification
7. Stop automation

**Feedback template**:
- ✅ Command appears in command palette
- ✅ Command executes successfully
- ✅ Notification shows expected message
- 💡 Suggestion: Add icon to command for better visibility
- ❌ Issue: Command doesn't appear when searching for "hello" (lowercase)

## Validation Output Format

Structure your validation feedback as follows:

```markdown
## Validation Results

### Test Environment
- VS Code Version: [from automation]
- Platform: [detected from automation]
- Test Date: [timestamp]

### Test Scenarios Executed

#### Scenario 1: [Name]
**Status**: ✅ Pass / ⚠️ Partial / ❌ Fail

**Steps Executed**:
1. [Step 1 with outcome]
2. [Step 2 with outcome]
...

**Evidence**:
- Screenshot 1: [description]
- Screenshot 2: [description]
- Video timestamp: [X:XX - Y:YY]

**Observations**:
- [What worked well]
- [What didn't work]
- [Edge cases tested]

#### Scenario 2: [Name]
[Same structure]

### Summary

**What Works**:
- [Feature 1 works as expected]
- [Feature 2 works as expected]

**Issues Found**:
- [Issue 1 with reproduction steps]
- [Issue 2 with reproduction steps]

**Suggestions for Improvement**:
- [Suggestion 1 with rationale]
- [Suggestion 2 with rationale]

**Accessibility Notes**:
- [Keyboard navigation observations]
- [Screen reader considerations]
- [ARIA labels present/missing]

### Conclusion

[Overall assessment: Ready to merge / Needs fixes / Needs improvements]
```

## Advanced Techniques

### Testing Multiple Variations

If your feature has multiple modes or options:

1. Test each variation separately
2. Document which variation is being tested in each screenshot
3. Compare behaviors across variations
4. Suggest which variation works best for users

### Performance Testing

For features that might impact performance:

1. Note loading times and responsiveness
2. Test with larger data sets if applicable
3. Report any lag or delays
4. Suggest optimizations if needed

### Error Scenario Testing

Don't just test the happy path:

1. Test with invalid inputs
2. Test without required permissions or settings
3. Test edge cases (empty states, maximum values, etc.)
4. Verify error messages are helpful and actionable

### Regression Testing

When validating fixes or changes:

1. Test that the reported issue is fixed
2. Test that related functionality still works
3. Test that the fix doesn't break other features
4. Verify that edge cases from the original issue are handled

## Common Pitfalls to Avoid

1. **Don't skip the cleanup**: Always call `vscode_automation_stop` even if testing fails
2. **Don't assume things work**: Verify every aspect with snapshots and screenshots
3. **Don't test in isolation**: Consider how the feature interacts with existing functionality
4. **Don't forget accessibility**: Check keyboard navigation and screen reader support
5. **Don't provide vague feedback**: Be specific about what works and what doesn't
6. **Don't over-test**: Focus on the requirements, don't test unrelated features

## Key Files and References

- **Demonstrate agent**: `.github/agents/demonstrate.md` - Similar agent for demonstrating features
- **Accessibility skill**: `.github/skills/accessibility/SKILL.md` - Guidelines for accessibility testing
- **VS Code Copilot Instructions**: `.github/copilot-instructions.md` - General coding guidelines

## Tool Reference

### vscode-playwright-mcp tools

Core automation tools:
- `vscode_automation_start` - Start VS Code automation session
- `vscode_automation_stop` - Stop automation and save recording
- `vscode_automation_execute_command` - Execute VS Code command
- `vscode_automation_settings_add_user_settings` - Add user settings
- `vscode_automation_editor_type_text` - Type in editor
- `vscode_automation_chat_send_message` - Send chat message

### playwright-browser tools

General browser automation:
- `playwright-browser_snapshot` - Capture accessibility tree
- `playwright-browser_take_screenshot` - Take screenshot
- `playwright-browser_click` - Click element
- `playwright-browser_type` - Type text
- `playwright-browser_wait_for` - Wait for condition
- `playwright-browser_navigate` - Navigate to URL

Note: The exact tool names may vary based on the MCP server version. Use the tools that are available in your environment.
