# Stellar Chat Webview - Quick Start Guide

## 🚀 Getting Started (5 minutes)

### Step 1: Install Dependencies
```bash
cd /Users/iftatbhuiyan/Visuals/src/vs/workbench/contrib/stellarRightBar/browser/webview
npm install
```

### Step 2: Build the Webview
```bash
npm run build
```
This creates `dist/index.js` which will be loaded by VS Code.

### Step 3: Development Mode (Optional)
For live rebuilding during development:
```bash
npm run watch
```
Leave this running in a separate terminal while you work.

## 🧪 Testing the Message Flow

Once integrated with the VS Code extension, you should see:

1. **Empty State:**
   - ⭐ icon
   - "Welcome to Stellar" heading
   - Input field at bottom

2. **Send a Message:**
   - Type "Hello Stellar"
   - Click "Send" or press Enter
   - See your message appear (right-aligned, blue background)
   - See "Stellar is thinking…" placeholder (left-aligned, gray)
   - After 2 seconds, placeholder updates to mock response

3. **Clear Conversation:**
   - Click "Clear" button
   - Confirm dialog appears
   - All messages removed, back to empty state

## 📁 Key Files to Know

| File | Purpose |
|------|---------|
| `types.ts` | Data models (Message, Conversation) |
| `conversationStore.ts` | State management (Zustand) |
| `components/ChatPanel.tsx` | Main UI component |
| `components/ChatPanel.css` | Styling |
| `index.tsx` | React entry point |
| `dist/index.js` | **Built output** (load this in webview) |

## 🔧 Customization Points

### Change Mock Response Delay
In `ChatPanel.tsx`, line ~58:
```typescript
await new Promise(resolve => setTimeout(resolve, 2000)); // Change 2000 to desired ms
```

### Modify Mock Response
In `ChatPanel.tsx`, line ~61:
```typescript
const mockResponse = `Your custom response here`;
```

### Add More Message Metadata
In `conversationStore.ts`, when calling `addAssistantReply`:
```typescript
addAssistantReply(content, { 
  isPlaceholder: true,
  customField: 'value'  // Add your own metadata
});
```

## 🎨 Styling

All styles use VS Code CSS variables for automatic theme support:
- `--vscode-editor-background`
- `--vscode-foreground`
- `--vscode-button-background`
- `--vscode-input-background`
- etc.

To customize, edit `components/ChatPanel.css`.

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### TypeScript Errors
Check that `tsconfig.json` has correct paths and all `.tsx` files are in the `include` array.

### Webview Not Loading
Ensure the extension host is correctly loading `dist/index.js` from the webview directory.

## 📊 State Structure

```typescript
{
  conversations: [
    {
      id: "1234-5678",
      title: "New Conversation",
      messages: [
        { id: "msg-1", role: "user", content: "Hello", timestamp: 1234567890 },
        { id: "msg-2", role: "assistant", content: "Hi!", timestamp: 1234567891 }
      ],
      createdAt: 1234567890,
      updatedAt: 1234567891
    }
  ],
  activeConversationId: "1234-5678"
}
```

## ✅ Verification Checklist

- [ ] `npm install` completed without errors
- [ ] `npm run build` creates `dist/index.js`
- [ ] File size of `dist/index.js` is reasonable (should be ~500KB-1MB)
- [ ] No TypeScript compilation errors
- [ ] Webpack bundle created successfully

## 🔜 Next Steps (STEP 2)

After verifying this works:
1. Update `stellarRightView.ts` to create a webview
2. Load `dist/index.js` into the webview
3. Set up message passing between extension and webview
4. Begin API integration

---

**Need Help?** Check the main `README.md` for detailed architecture information.

