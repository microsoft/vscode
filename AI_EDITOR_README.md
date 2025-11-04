# VS Code AI Editor - Modified Fork

## Overview

This is a modified fork of Microsoft VS Code that adds an **AI Editor** feature directly into the core workbench. The AI Editor provides a split-screen interface combining web browsing with AI-powered content analysis.

## Features

### 🌐 Embedded Browser (Left Pane - 80%)
- **URL Input**: Enter any website URL (supports both http and https)
- **Load Button**: Navigate to websites directly within VS Code
- **Full Website Support**: Loads external sites like vnexpress.net without proxy requirements
- **Webview Integration**: Uses Electron's webview technology for secure sandboxed browsing

### 🤖 AI Chat Interface (Right Pane - 20%)
- **OpenAI API Integration**: Connect using your own OpenAI API key
- **Page Content Extraction**: Extract text content from loaded web pages
- **Contextual Chat**: Ask questions about the currently loaded webpage
- **Conversation History**: Maintain chat history within the session
- **Error Handling**: Graceful handling of API errors and rate limits

## Installation & Setup

### Prerequisites
- Node.js 18.x or higher
- Python 3.x (for native module compilation)
- Git
- An OpenAI API key (get one at https://platform.openai.com/api-keys)

### Build Instructions

1. **Clone the Repository**
   ```bash
   git clone <your-fork-url>
   cd vscode-ai-editor
   git checkout feature/ai-editor
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # OR using yarn
   yarn install
   ```

3. **Build and Watch**
   ```bash
   # Start the build watch task (runs in background)
   npm run watch
   
   # OR using yarn
   yarn watch
   ```

4. **Run Development Instance**
   ```bash
   # In a separate terminal, start VS Code development instance
   ./scripts/code.sh
   # On Windows:
   .\scripts\code.bat
   ```

## Usage Guide

### Opening the AI Editor

1. **Command Palette Method**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Open AI Editor"
   - Press Enter

2. **Keyboard Shortcut**:
   - Press `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac)

### Setting up OpenAI API

1. In the right pane, locate the "OpenAI API Key" field
2. Enter your API key (format: `sk-...`)
3. The key will be stored locally and securely

⚠️ **Security Note**: API keys are stored in VS Code's user settings. Never commit your API key to version control.

### Browsing and Analyzing Web Content

1. **Load a Website**:
   - Enter URL in the left pane's input field (e.g., `https://vnexpress.net`)
   - Click "Load" or press Enter
   - Wait for the page to load completely

2. **Extract Page Content**:
   - Click "Extract Page Content" button in the right pane
   - This captures the page title and text content for AI analysis

3. **Chat with AI about the Page**:
   - Type your question in the message input box
   - Example questions:
     - "Summarize this page"
     - "What are the main topics discussed?"
     - "Find information about [specific topic]"
   - Press Enter or click "Send"
   - The AI will respond based on the extracted page content

### Example Workflow

1. Open AI Editor (`Ctrl+Shift+A`)
2. Enter your OpenAI API key in the right pane
3. Load `https://vnexpress.net` in the left pane
4. Click "Extract Page Content"
5. Ask: "Tóm tắt các tin tức chính trên trang này"
6. Receive AI-generated summary in Vietnamese

## Technical Implementation

### Architecture

The AI Editor is implemented as a native VS Code editor pane, registered in the workbench's editor registry:

- **AiEditorInput**: Represents the AI Editor tab/input in the editor system
- **AiEditorPane**: Main UI component with split layout implementation
- **Webview Integration**: Uses Electron's `<webview>` tag for secure browser embedding
- **OpenAI API Client**: Direct REST API calls to OpenAI's chat completions endpoint

### File Structure

```
src/vs/workbench/contrib/aiEditor/
├── browser/
│   ├── aiEditorInput.ts          # Editor input class
│   ├── aiEditorPane.ts           # Main editor pane component
│   ├── aiEditor.css              # Styling for the AI Editor
│   └── aiEditor.contribution.ts  # Registration and commands
└── common/
    └── (reserved for shared interfaces)
```

### Content Extraction Method

Page content is extracted using JavaScript injection into the webview:

```javascript
const result = await webview.executeJavaScript(`
  (function() {
    const title = document.title;
    const bodyText = document.body ? document.body.innerText : '';
    return {
      title: title,
      content: bodyText.substring(0, 50000) // Limit to prevent huge payloads
    };
  })()
`);
```

### Security Considerations

1. **API Key Storage**: Keys are stored in VS Code's secure storage, scoped to user profile
2. **Content Limits**: Page content is truncated to 50,000 characters to prevent excessive API costs
3. **Webview Sandboxing**: Uses Electron's webview which runs in a separate, sandboxed process
4. **HTTPS Enforcement**: Automatically prepends `https://` to URLs without protocol

## Troubleshooting

### Common Issues

1. **Website won't load**: 
   - Some sites block embedding (X-Frame-Options)
   - Try the direct URL in a regular browser first
   - Check console for specific error messages

2. **OpenAI API errors**:
   - Verify your API key is correct and active
   - Check your OpenAI account has sufficient credits
   - Rate limits may cause temporary failures

3. **Build/compilation errors**:
   - Ensure Node.js version compatibility
   - Run `npm clean-install` to refresh dependencies
   - Check the build output for specific TypeScript errors

### Development Debugging

1. **Open DevTools**: Press `F12` in the development VS Code instance
2. **Check Console**: Look for JavaScript errors or network issues
3. **Monitor Network**: Verify API calls are being made correctly

## Privacy & Data Usage

- **Local Processing**: Web page content is processed locally before sending to OpenAI
- **API Usage**: Only explicitly extracted content is sent to OpenAI's servers
- **No Tracking**: This implementation doesn't include any analytics or tracking
- **User Consent**: Users must provide their own API key, acknowledging data sharing with OpenAI

## Acknowledgments

This implementation is built on top of Microsoft's VS Code open source project. The AI Editor feature adds web browsing and AI integration capabilities while maintaining compatibility with the existing VS Code architecture and extension ecosystem.

## Sample Email Template

**Subject: VS Code AI Editor Implementation - Completed**

Hi Billy,

I've successfully implemented the AI Editor feature as requested. Here are the key deliverables:

🎯 **Repository**: [Your Private Fork URL]
- Branch: `feature/ai-editor`
- Access: Added `visopsys` as collaborator

✅ **Features Implemented**:
- Split layout (80% browser + 20% chat) in main editor area
- Embedded browser with URL bar (loads vnexpress.net successfully)
- OpenAI API integration with user-provided API keys
- Page content extraction and AI-powered Q&A
- VS Code-themed UI with proper error handling

🔧 **Setup Instructions**:
1. Clone repo and checkout `feature/ai-editor` branch
2. Run `npm install` && `npm run watch`
3. Execute `./scripts/code.sh` to launch dev instance
4. Use `Ctrl+Shift+A` to open AI Editor

📱 **Test Verification**:
- Successfully loads vnexpress.net without proxy
- Extracts page content and provides AI summaries
- Maintains conversation history within session

The implementation follows VS Code's contribution patterns and integrates seamlessly with the existing workbench architecture.

Best regards,
[Your Name]

---

**Next Steps**: Test the implementation, provide feedback, and let me know if any adjustments are needed.