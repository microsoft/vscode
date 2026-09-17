# Scenario: Full workflow

## Steps
1. Type "build the project" in the chat input
2. Press Enter to submit
3. Verify there is a response in the chat
4. Verify the changes view shows "CHANGES"
5. Verify "package.json" is visible in the changes list
6. Verify "build.ts" is visible in the changes list
7. Verify "index.ts" is visible in the changes list
8. Click on "index.ts" in the changes list
9. Verify a diff editor opens with modified content
10. Press Escape to close the diff editor
11. Verify "Merge" button is visible in changes view header
12. Verify the "Open Terminal" button is visible
13. Click the "Open Terminal" button
14. Verify the terminal panel becomes visible
15. Verify the terminal tab shows "session-1" in its label
16. Click "New Session" to create a new session
17. Type "fix the bug" in the chat input
18. Press Enter to submit
19. Verify the terminal tab label changes to show "session-2"
20. Click back on the first session in the sessions list
21. Verify the terminal tab label changes back to show "session-1"
