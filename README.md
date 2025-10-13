# VSCode with AI Browser

This is a fork of VS Code that includes an integrated AI Browser feature, allowing you to browse websites and chat with AI about their content directly within the editor.

## Features

- **AI Browser Editor**: Browse websites and chat with AI about their content
- **Multi-Provider Support**: Works with OpenAI and Anthropic APIs
- **Content Analysis**: AI can analyze webpage content and answer questions
- **Integrated Experience**: Seamlessly integrated into VS Code's editor interface

## Prerequisites

- **Install Git** - [GitHub](https://github.com)
- **Install Node.js (>= 22.x)** - [GitHub](https://github.com)
- **Install Python (for node-gyp)** - [GitHub](https://github.com)
- **C/C++ build toolchain** appropriate for your OS (e.g. Visual Studio Build Tools on Windows, build-essential etc on Linux, Xcode CLI tools on macOS) - [GitHub](https://github.com)
- **Clone repository** into a path without spaces - [GitHub](https://github.com)
- **API Key**: OpenAI or Anthropic API key for AI functionality

## Build & Run

### Fork + clone:

```bash
git clone https://github.com/your-username/vscode.git
cd vscode
```

### Install dependencies:

```bash
npm install
```

### Compile the code:

```bash
npm run compile
```

### Run development build:

#### On macOS / Linux:

```bash
./scripts/code.sh
./scripts/code-cli.sh
```

#### On Windows:

```cmd
.\scripts\code.bat
.\scripts\code-cli.bat
```

## Using AI Browser

### 1. Open AI Browser

1. Press `F1` or `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux)
2. Type "aiBrowser" in the command palette
3. Select "AI Browser: Open" from the dropdown
4. The AI Browser editor will open in a new tab

### 2. Configure API Key

Add your API key to VS Code settings:

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

### 3. Using the AI Browser

#### Loading Websites
1. In the URL input field (top left), enter a website URL
2. Press Enter or click "Go" to load the website
3. The website will appear in the browser panel (left side)

#### Chatting with AI
1. In the chat panel (right side), type your question about the loaded website
2. Press Enter to send your message
3. The AI will analyze the webpage content and respond

### Screen Record

- Screen Record
https://drive.google.com/file/d/1fC-f7oehjQGbhdD1cmMQnr9d_r4GQev5/view?usp=sharing

