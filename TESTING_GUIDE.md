# Testing Guide: Agent Session Input Needed Notification

## Prerequisites

1. VS Code built with these changes
2. Agent sessions feature enabled
3. Command center enabled (`window.commandCenter: true`)

## Test Scenarios

### Basic Functionality

#### Test 1: Badge Appears When Session Needs Input
**Steps:**
1. Create an agent session
2. Trigger a flow that sets the session to `NeedsInput` status
3. Ensure the chat widget for this session is not open

**Expected:**
- Badge appears in command center with report icon (⚠️)
- Badge shows count "1"
- Tooltip shows "Session needs input" or session description

**Pass/Fail:** ☐

---

#### Test 2: Badge Click Opens Session
**Steps:**
1. With badge visible from Test 1
2. Click the notification badge

**Expected:**
- Session opens in chat view
- Badge disappears (session now has open widget)

**Pass/Fail:** ☐

---

#### Test 3: Multiple Sessions Needing Input
**Steps:**
1. Create 3 sessions that need input
2. Ensure none have open widgets

**Expected:**
- Badge shows count "3"
- Tooltip shows "3 sessions need input"
- Clicking opens the most recently started session

**Pass/Fail:** ☐

---

#### Test 4: Badge Disappears When Session Opened
**Steps:**
1. Have a session needing input (badge visible)
2. Open the session manually (not via badge)

**Expected:**
- Badge disappears immediately
- Context key `chatHasAgentSessionsNeedingInput` becomes false

**Pass/Fail:** ☐

---

### Configuration

#### Test 5: Disable Setting
**Steps:**
1. Have sessions needing input (badge visible)
2. Set `chat.agentSessions.inputNeeded.notification` to `false`

**Expected:**
- Badge disappears immediately
- Remains hidden even when more sessions need input

**Pass/Fail:** ☐

---

#### Test 6: Re-enable Setting
**Steps:**
1. With setting disabled from Test 5
2. Ensure there are still sessions needing input
3. Set `chat.agentSessions.inputNeeded.notification` to `true`

**Expected:**
- Badge reappears immediately
- Shows correct count

**Pass/Fail:** ☐

---

### AI Feature Gating

#### Test 7: Disable AI Features
**Steps:**
1. Have badge visible
2. Set `chat.disableAIFeatures` to `true`

**Expected:**
- Badge disappears immediately
- Context key `chatHasAgentSessionsNeedingInput` becomes false

**Pass/Fail:** ☐

---

#### Test 8: No Badge When ChatContextKeys.enabled is False
**Steps:**
1. Disable chat entirely (make `ChatContextKeys.enabled` false)
2. Create sessions needing input

**Expected:**
- Badge never appears
- Menu item not visible in command center

**Pass/Fail:** ☐

---

### Edge Cases

#### Test 9: Archived Session
**Steps:**
1. Create session needing input
2. Archive the session

**Expected:**
- Badge disappears (archived sessions excluded)

**Pass/Fail:** ☐

---

#### Test 10: Session Status Change
**Steps:**
1. Have session needing input (badge visible)
2. Session status changes to `InProgress` or `Completed`

**Expected:**
- Badge disappears immediately
- Count decrements if multiple sessions

**Pass/Fail:** ☐

---

#### Test 11: Command Center Disabled
**Steps:**
1. Have sessions needing input
2. Disable command center (`window.commandCenter: false`)

**Expected:**
- Badge not visible (command center hidden)
- Feature should gracefully handle this

**Pass/Fail:** ☐

---

### Visual & UX

#### Test 12: Tooltip Content
**Steps:**
1. Create session with `description` property set
2. Badge appears
3. Hover over badge

**Expected:**
- Tooltip shows: "Click to open session: {description}"
- If multiple sessions: "{count} sessions need input"

**Pass/Fail:** ☐

---

#### Test 13: Theme Integration
**Steps:**
1. Test with Light theme
2. Test with Dark theme
3. Test with High Contrast theme

**Expected:**
- Badge uses command center colors correctly
- Report icon uses `notificationsWarningIcon.foreground` color
- Hover state visible and appropriate
- Focus state has visible outline

**Pass/Fail:** ☐

---

#### Test 14: Badge Position
**Steps:**
1. Open VS Code with various command center states
2. Verify badge position

**Expected:**
- Badge appears at order 10003 (right of agents control)
- Does not overlap with other UI elements
- Respects command center layout

**Pass/Fail:** ☐

---

### Performance

#### Test 15: Many Sessions
**Steps:**
1. Create 50+ agent sessions
2. Have 10 needing input

**Expected:**
- Badge updates promptly
- No noticeable performance impact
- Clicking opens correct session

**Pass/Fail:** ☐

---

#### Test 16: Rapid Status Changes
**Steps:**
1. Programmatically change session statuses rapidly
2. Observe badge updates

**Expected:**
- Badge updates correctly
- No flickering or rendering issues
- Context key updates tracked correctly

**Pass/Fail:** ☐

---

## Debugging Tips

### Check Context Key Value
Open command palette and run "Developer: Inspect Context Keys"
Look for `chatHasAgentSessionsNeedingInput` - should be true when badge visible

### Check Configuration
```javascript
// In Debug Console
vscode.workspace.getConfiguration('chat').get('agentSessions.inputNeeded.notification')
```

### Check Sessions Status
```javascript
// In extension debug
const sessions = agentSessionsService.model.sessions;
const needingInput = sessions.filter(s => 
  s.status === 3 && // NeedsInput
  !s.isArchived()
);
console.log('Sessions needing input:', needingInput.length);
```

### Verify Menu Item Registration
Look in **View > Command Palette** and search for "Inspect Context Keys"
Check that menu item for `workbench.action.chat.openInputNeededSession` exists

## Known Limitations

1. Badge only shows in command center (requires command center enabled)
2. No notification sound/alert for urgent sessions
3. Description text not shown inline (only in tooltip)
4. No filtering by session type
5. Clicking always opens most recent, not a choice

## Success Criteria

All tests pass (☑ in Pass/Fail checkboxes)
- ☐ Basic functionality (Tests 1-4)
- ☐ Configuration (Tests 5-6)
- ☐ AI gating (Tests 7-8)
- ☐ Edge cases (Tests 9-11)
- ☐ Visual/UX (Tests 12-14)
- ☐ Performance (Tests 15-16)

## Reporting Issues

When reporting issues, include:
1. Test number that failed
2. Expected vs actual behavior
3. Screenshots/screen recording
4. Console errors (if any)
5. Context key value at time of issue
6. Configuration settings
