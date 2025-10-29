# Stellar Chat Webview - Testing Guide

## 🧪 STEP 1 Testing Checklist

### Build & Setup Tests

- [ ] **Dependencies Install**
  ```bash
  cd src/vs/workbench/contrib/stellarRightBar/browser/webview
  npm install
  ```
  - Should complete without errors
  - Should create `node_modules/` directory
  - Should create `package-lock.json`

- [ ] **TypeScript Compilation**
  ```bash
  npx tsc --noEmit
  ```
  - Should show no TypeScript errors
  - All types should resolve correctly

- [ ] **Webpack Build**
  ```bash
  npm run build
  ```
  - Should create `dist/` directory
  - Should create `dist/index.js`
  - Should create `dist/index.js.map`
  - File size should be ~500KB-1MB

- [ ] **Watch Mode**
  ```bash
  npm run watch
  ```
  - Should start without errors
  - Should rebuild on file changes
  - Press Ctrl+C to stop

### Code Quality Tests

- [ ] **No Console Errors**
  - Check browser console when webview loads
  - Should have no errors or warnings

- [ ] **Type Safety**
  - All functions have proper return types
  - No `any` types (except in designated places)
  - Interfaces properly exported/imported

- [ ] **Code Organization**
  - Types in `types.ts`
  - State logic in `conversationStore.ts`
  - UI in `components/ChatPanel.tsx`
  - Styles in `components/ChatPanel.css`

### Functional Tests

#### Empty State
- [ ] Webview loads successfully
- [ ] Shows ⭐ icon
- [ ] Shows "Welcome to Stellar" heading
- [ ] Shows "Start a conversation..." text
- [ ] Input field is visible and enabled
- [ ] Send button is disabled (no input)
- [ ] Clear button is disabled (no messages)

#### Sending Messages
- [ ] Type text in input field
- [ ] Send button becomes enabled
- [ ] Click Send button
  - [ ] User message appears (right-aligned, blue background)
  - [ ] Shows "👤 You" label
  - [ ] Shows timestamp
  - [ ] Input field clears immediately
  - [ ] Send button becomes disabled
  - [ ] Placeholder message appears: "Stellar is thinking…"
  - [ ] Placeholder has italic, pulsing animation
  - [ ] After ~2 seconds, placeholder updates to mock response
  - [ ] Mock response shows user's input
  - [ ] Messages auto-scroll to bottom

#### Enter Key
- [ ] Type text in input field
- [ ] Press Enter key
- [ ] Message sends (same as clicking Send button)
- [ ] Shift+Enter does NOT send (for future multi-line support)

#### Multiple Messages
- [ ] Send first message
- [ ] Wait for response
- [ ] Send second message
- [ ] Both user messages and responses visible
- [ ] Messages in correct chronological order
- [ ] Scrollbar appears if needed
- [ ] Auto-scroll works for new messages

#### Clear Conversation
- [ ] Send at least one message
- [ ] Clear button becomes enabled
- [ ] Click Clear button
- [ ] Confirmation dialog appears
- [ ] Click "OK"
  - [ ] All messages removed
  - [ ] Back to empty state
  - [ ] Input field still works
- [ ] Send another message
  - [ ] New conversation starts
  - [ ] Previous messages don't reappear

#### Visual Tests
- [ ] **User Messages**
  - Right-aligned
  - Blue background (button color)
  - White text
  - Rounded corners
  - Max-width 85%
  - Shows "👤 You"

- [ ] **Assistant Messages**
  - Left-aligned
  - Gray background (quote background)
  - Normal text color
  - Rounded corners
  - Max-width 85%
  - Shows "⭐ Stellar"

- [ ] **Timestamps**
  - Visible on all messages
  - Format: HH:MM AM/PM
  - Right-aligned in header
  - Slightly transparent

- [ ] **Placeholder Animation**
  - Italic text
  - Pulsing opacity effect
  - Smooth animation

#### Interaction Tests
- [ ] **Button States**
  - Send button hover effect
  - Clear button hover effect
  - Disabled buttons have reduced opacity
  - Disabled buttons don't respond to clicks
  - Cursor changes to pointer on hover (enabled)
  - Cursor shows not-allowed (disabled)

- [ ] **Input Field**
  - Focus border color changes
  - Placeholder text visible when empty
  - Text wraps properly
  - Can select and edit text
  - Can paste text
  - Disabled during processing

- [ ] **Scrolling**
  - Smooth scroll to bottom on new messages
  - Can manually scroll up
  - Scrollbar styled to match VS Code theme
  - Scrollbar hover effect

### Theme Integration Tests
- [ ] **Light Theme**
  - Switch VS Code to light theme
  - Webview updates automatically
  - All colors readable
  - Proper contrast

- [ ] **Dark Theme**
  - Switch VS Code to dark theme
  - Webview updates automatically
  - All colors readable
  - Proper contrast

- [ ] **High Contrast Theme**
  - Switch to high contrast theme
  - All elements visible
  - Borders clearly defined

### State Management Tests
- [ ] **Store Initialization**
  - One default conversation created
  - Active conversation ID set
  - Messages array empty

- [ ] **Add User Message**
  - Message added to store
  - Correct role ('user')
  - Unique ID generated
  - Timestamp set
  - Conversation updatedAt changed

- [ ] **Add Assistant Reply**
  - Message added to store
  - Correct role ('assistant')
  - Unique ID generated
  - Returns message ID
  - Metadata stored if provided

- [ ] **Replace Placeholder**
  - Finds correct message by ID
  - Updates content
  - Updates timestamp
  - Doesn't affect other messages

- [ ] **Clear Conversation**
  - Removes all messages
  - Keeps conversation object
  - Updates updatedAt
  - Doesn't affect conversation ID

### Edge Cases
- [ ] **Empty Input**
  - Send button disabled
  - Clicking does nothing
  - Enter key does nothing

- [ ] **Whitespace Only**
  - Input with only spaces
  - Send button disabled
  - Trimming works correctly

- [ ] **Very Long Message**
  - Type 500+ character message
  - Message wraps properly
  - Doesn't break layout
  - Scrolling works

- [ ] **Rapid Clicking**
  - Click Send multiple times quickly
  - Only one message sent
  - Processing state prevents duplicates

- [ ] **Clear During Processing**
  - Send message
  - Click Clear while "thinking"
  - Clear button disabled during processing

### Performance Tests
- [ ] **Initial Load**
  - Webview loads in < 1 second
  - No visible lag

- [ ] **Message Rendering**
  - New messages appear instantly
  - No flickering
  - Smooth animations

- [ ] **Many Messages**
  - Send 20+ messages
  - Scrolling remains smooth
  - No memory leaks
  - UI remains responsive

### Browser Console Tests
- [ ] No errors in console
- [ ] No warnings in console
- [ ] No unhandled promise rejections
- [ ] React DevTools shows proper component tree

## 🐛 Known Limitations (STEP 1)

These are intentional and will be addressed in future steps:

- ❌ No markdown rendering (plain text only)
- ❌ No code syntax highlighting
- ❌ No message editing
- ❌ No message deletion
- ❌ No conversation persistence (lost on reload)
- ❌ No multiple conversation switching
- ❌ No real AI responses (mock only)
- ❌ No streaming responses
- ❌ No context awareness
- ❌ No file attachments

## ✅ Success Criteria

STEP 1 is complete when:

1. ✅ All build tests pass
2. ✅ All functional tests pass
3. ✅ No console errors
4. ✅ Theme integration works
5. ✅ State management works correctly
6. ✅ UI is responsive and smooth
7. ✅ Code is clean and well-organized

## 📝 Test Report Template

```markdown
# Stellar Chat STEP 1 Test Report

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** macOS / Windows / Linux

## Build Tests
- [ ] Dependencies: PASS / FAIL
- [ ] TypeScript: PASS / FAIL
- [ ] Webpack: PASS / FAIL

## Functional Tests
- [ ] Empty State: PASS / FAIL
- [ ] Send Messages: PASS / FAIL
- [ ] Clear Conversation: PASS / FAIL
- [ ] Visual Appearance: PASS / FAIL

## Issues Found
1. [Description of issue]
2. [Description of issue]

## Overall Status
- [ ] READY FOR STEP 2
- [ ] NEEDS FIXES

## Notes
[Any additional observations]
```

---

**Ready to test?** Follow this checklist top to bottom and mark each item as you verify it! 🚀

