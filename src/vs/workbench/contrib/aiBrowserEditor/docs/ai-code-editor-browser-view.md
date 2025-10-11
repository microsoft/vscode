# AI Browser View Implementation

## Overview

The `AiBrowserView` class is a VS Code extension component that provides an integrated web browser with AI-powered chat functionality. It allows users to load websites and interact with an AI assistant to analyze and discuss web content.

## Architecture

### Main Components

The view is split into two main panels:

1. **Browser Panel (80% width)** - Contains the web browser functionality
2. **Chat Panel (20% width)** - Contains the AI assistant interface

### Key Features

- **Web Browser**: Load and display websites in an iframe
- **AI Chat**: Interactive chat with AI assistant for content analysis
- **Content Extraction**: Attempts to extract page content for AI analysis
- **Multi-Provider Support**: Supports OpenAI and Anthropic APIs
- **Real-time UI**: Responsive interface with loading states

## Implementation Details

### Class Structure

```typescript
export class AiBrowserView extends Disposable {
    // Main containers
    private mainContainer!: HTMLElement;
    private browserPanel!: HTMLElement;
    private chatPanel!: HTMLElement;

    // Browser components
    private urlInputBox!: InputBox;
    private webviewFrame!: HTMLIFrameElement;
    private urlContainer!: HTMLElement;
    private webviewContainer!: HTMLElement;

    // Chat components
    private chatMessagesContainer!: HTMLElement;
    private chatInputContainer!: HTMLElement;
    private chatInputBox!: InputBox;
    private sendButton!: Button;
    private messages: ChatMessage[] = [];

    // State
    private currentUrl: string = '';
    private currentPageContent: string = '';
    private isLoadingResponse: boolean = false;
}
```

### Dependencies

- `IThemeService` - For VS Code theme integration
- `IConfigurationService` - For API configuration management
- `INotificationService` - For user notifications
- `InputBox` - VS Code input component
- `Button` - VS Code button component
- `KeyCode` - For keyboard event handling

## Core Functionality

### 1. Browser Panel Implementation

#### URL Input
- Text input field for entering website URLs
- Automatic protocol addition (https:// if missing)
- URL validation before loading
- Enter key support for quick loading

#### Web Content Display
- Iframe-based web content rendering
- Placeholder message when no URL is loaded
- CORS-aware content extraction attempts
- Loading state management

### 2. Chat Panel Implementation

#### Message Display
- Scrollable message container
- User and assistant message differentiation
- Welcome message on initialization
- Loading indicators during AI processing

#### Input Handling
- Multi-line text input support
- Enter key to send (Shift+Enter for new lines)
- Send button with enabled/disabled states
- Input validation and state management

### 3. AI Integration

#### API Configuration
The system supports multiple AI providers through configuration:

```typescript
// Configuration keys
'aiBrowser.apiKey'      // API key for the selected provider
'aiBrowser.apiProvider' // 'openai' or 'anthropic'
'aiBrowser.model'        // Model name (e.g., 'gpt-4', 'claude-3')
```

#### Supported Providers

**OpenAI Integration:**
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Authentication: Bearer token
- Message format: Standard chat completions API

**Anthropic Integration:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Authentication: x-api-key header
- Message format: Anthropic messages API

#### Content Analysis
- Extracts page content (limited by CORS policies)
- Includes URL context in AI prompts
- Truncates content to 3000 characters for API efficiency
- Provides structured context to AI models

### 4. Event Handling

#### Keyboard Events
```typescript
// URL input - Enter key to load
if (e.keyCode === KeyCode.Enter) {
    this.loadUrl();
}

// Chat input - Enter to send, Shift+Enter for new line
if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
    e.preventDefault();
    this.sendMessage();
}
```

#### UI State Management
- Loading states during API calls
- Button enable/disable based on input state
- Error handling with user notifications
- Message history management

## Technical Considerations

### CORS Limitations
The implementation faces CORS restrictions when extracting content from cross-origin websites:

```typescript
try {
    const iframeDoc = this.webviewFrame.contentDocument || this.webviewFrame.contentWindow?.document;
    if (iframeDoc) {
        this.currentPageContent = iframeDoc.body.innerText || iframeDoc.body.textContent || '';
    }
} catch (error) {
    // CORS restriction - can't access cross-origin iframe content
    console.warn('Cannot extract page content due to CORS restrictions');
    this.currentPageContent = `Content from: ${this.currentUrl}\n[Content extraction blocked by CORS policy]`;
}
```

### Error Handling
- API key validation
- Network error handling
- Invalid URL validation
- User-friendly error messages

### Performance Optimizations
- Content truncation for API efficiency
- Loading state management
- Efficient DOM manipulation
- Memory management through proper disposal

## Usage Example

```typescript
// Create the AI Browser View
const aiBrowserView = new AiBrowserView(
    { container: document.getElementById('container') },
    themeService,
    configurationService,
    notificationService
);

// The view automatically handles:
// - URL loading and validation
// - Content extraction (where possible)
// - AI chat interactions
// - UI state management
```

## Configuration Requirements

Users need to configure the following settings:

```json
{
    "aiBrowser.apiKey": "your-api-key-here",
    "aiBrowser.apiProvider": "openai", // or "anthropic"
    "aiBrowser.model": "gpt-4" // or "claude-3-sonnet-20240229"
}
```

## Future Enhancements

Potential improvements could include:

1. **Enhanced Content Extraction**: Proxy-based content extraction
2. **Multiple Tab Support**: Browser-like tab management
3. **Bookmark System**: Save and organize frequently visited sites
4. **Advanced AI Features**: Image analysis, code extraction
5. **Custom Themes**: Visual customization options
6. **Export Functionality**: Save chat conversations and analysis

## Security Considerations

- API keys are stored in VS Code configuration
- No sensitive data is logged or exposed
- CORS policies are respected
- User input is sanitized before API calls
- Error messages don't expose sensitive information
