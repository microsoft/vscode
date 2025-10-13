# AI Browser User Guide

## Getting Started

### 1. Build and Run VS Code

First, you need to build and run the modified VS Code with the AI Browser feature:

```bash
# Run the build script
./scripts/code.sh
```

This will compile the VS Code fork with the AI Browser editor integration.

### 2. Open AI Browser

Once VS Code is running:

1. Press `F1` or `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux)
2. Type "aiBrowser" in the command palette
3. Select "AI Browser: Open" from the dropdown
4. The AI Browser editor will open in a new tab

### 3. Configure API Key

Before you can use the AI chat functionality, you need to configure your API key. There are several ways to do this:

#### Settings JSON
1. Press `F1` or `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Type "Preferences: Open User Settings (JSON)"
3. Add the following configuration:

```json
{
    "aiBrowser.apiKey": "your-openai-api-key-here",
    "aiBrowser.apiProvider": "openai",
    "aiBrowser.model": "gpt-3.5-turbo"
}
```

**Getting an OpenAI API Key:**
- Go to [OpenAI Platform](https://platform.openai.com/)
- Sign in or create an account
- Navigate to API Keys section
- Create a new secret key
- Copy the key (starts with `sk-`)

### 4. Using the AI Browser

#### Loading Websites
1. In the URL input field (top left), enter a website URL
2. Press Enter or click "Go" to load the website
3. The website will appear in the browser panel (left side)

#### Chatting with AI
1. In the chat panel (right side), type your question about the loaded website
2. Press Enter to send your message
3. The AI will analyze the webpage content and respond

#### Supported Features
- **Web Browsing**: Load and view websites in the integrated browser
- **AI Analysis**: Ask questions about webpage content
- **Multi-Provider Support**: Works with OpenAI and Anthropic APIs
- **Content Extraction**: Automatically extracts page content for AI analysis

### 5. Configuration Options

You can customize the AI Browser behavior through VS Code settings:

| Setting | Description | Default |
|---------|-------------|---------|
| `aiBrowser.apiKey` | Your API key for the selected provider | Required |
| `aiBrowser.apiProvider` | API provider: "openai" or "anthropic" | "openai" |
| `aiBrowser.model` | Model name (e.g., "gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o") | "gpt-3.5-turbo" |

### 6. Troubleshooting

#### Common Issues:

**"API key not configured" error:**
- Make sure you've added the `aiBrowser.apiKey` setting
- Verify the API key is correct and has sufficient credits

**"Model does not exist or you do not have access to it":**
- This usually means your OpenAI account doesn't have access to the requested model
- Try using 'gpt-3.5-turbo' (most accessible) or 'gpt-4o-mini' (newer, more capable)
- Ensure your OpenAI account has sufficient credits and is on a paid plan
- The system will automatically try fallback models if the primary model fails

**"Cannot extract page content due to CORS restrictions":**
- This is normal for cross-origin websites
- The AI will still work with the URL context

**Command not found:**
- Make sure you've built the project with `./scripts/code.sh`
- Restart VS Code after building

#### Getting Help:
- Check the VS Code Developer Console for error messages
- Verify your API key has sufficient credits
- Ensure you're using a supported model name

### 7. Tips for Best Results

- **Load the website first** before asking questions
- **Be specific** in your questions about the webpage content
- **Use clear language** when asking the AI to analyze content
- **Check your API usage** to avoid hitting rate limits

Enjoy using the AI Browser to analyze and discuss web content with AI assistance!
