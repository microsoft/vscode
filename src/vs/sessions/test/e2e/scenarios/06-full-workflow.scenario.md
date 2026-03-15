# Scenario: Full workflow

## Steps
1. Type "build the project" in the chat input
2. Press Enter to submit
3. Verify there is a response in the chat
4. Toggle the secondary side bar
5. Verify the changes view shows "CHANGES" with a badge
6. Verify "package.json" is visible in the changes list
7. Verify "build.ts" is visible in the changes list
8. Verify "index.ts" is visible in the changes list
9. Click on "index.ts" in the changes list
10. Verify a diff editor opens with modified content
11. Press Escape to close the diff editor
12. Verify "Merge" button is visible in changes view header
13. Verify the "Open Terminal" button is visible
14. Click the "Open Terminal" button
15. Verify the terminal panel becomes visible
16. Verify the terminal tab shows "session-1" in its label
17. Click "New Session" to create a new session
18. Type "fix the bug" in the chat input
19. Press Enter to submit
20. Verify the terminal tab label changes to show "session-2"
21. Click back on the first session in the sessions list
22. Verify the terminal tab label changes back to show "session-1"
