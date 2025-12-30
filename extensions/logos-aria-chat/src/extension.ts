import * as vscode from 'vscode';

let chatPanel: AriaChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Logos ARIA Chat extension activated');

  // Create the chat panel provider
  chatPanel = new AriaChatViewProvider(context.extensionUri);

  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('logos.ariaChat', chatPanel)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('logos.newChat', () => {
      chatPanel.newChat();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.clearChat', () => {
      chatPanel.clearChat();
    })
  );
}

export function deactivate() {}

class AriaChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _conversations: Conversation[] = [];
  private _activeConversationId: string | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'ready':
          // Webview is ready, initialize with a new chat if needed
          console.log('ARIA Chat webview ready, initializing...');
          if (this._conversations.length === 0) {
            this.newChat();
          } else {
            this._updateWebview();
          }
          break;
        case 'sendMessage':
          await this._handleSendMessage(data.message, data.conversationId);
          break;
        case 'newChat':
          this.newChat();
          break;
        case 'selectConversation':
          this._selectConversation(data.conversationId);
          break;
      }
    });
  }

  public newChat() {
    const conversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      model: 'aria-01',
    };
    this._conversations.unshift(conversation);
    this._activeConversationId = conversation.id;
    this._updateWebview();
  }

  public clearChat() {
    if (this._activeConversationId) {
      const conv = this._conversations.find(c => c.id === this._activeConversationId);
      if (conv) {
        conv.messages = [];
        this._updateWebview();
      }
    }
  }

  private _selectConversation(conversationId: string) {
    this._activeConversationId = conversationId;
    this._updateWebview();
  }

  private async _handleSendMessage(message: string, conversationId: string) {
    const conversation = this._conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);

    // Update title if first message
    if (conversation.messages.length === 1) {
      conversation.title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
    }

    this._updateWebview();

    // Send to ARIA backend
    try {
      // Get ARIA endpoint from environment or use default
      // In web context, use relative URL which ALB routes to logos-chat service
      // In desktop context, use configured endpoint
      const ariaEndpoint = process.env.ARIA_ENDPOINT || process.env.LOGOS_CHAT_ENDPOINT;
      const baseUrl = ariaEndpoint ? `${ariaEndpoint}/api/chat` : '/api/chat';

      // Get editor context
      const editor = vscode.window.activeTextEditor;
      const context = editor ? {
        file: editor.document.uri.fsPath,
        language: editor.document.languageId,
        selection: editor.document.getText(editor.selection),
      } : undefined;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          agentId: 'aria',
          model: 'aria-01',
          context,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {
        id?: string;
        content?: string;
        response?: string;
        tier?: number;
        error?: string;
      };

      if (result.error) {
        throw new Error(result.error);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: result.id || `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: result.content || result.response || 'I apologize, but I encountered an issue. Please try again.',
        timestamp: new Date().toISOString(),
        agentId: 'aria',
        model: 'aria-01',
        tier: result.tier,
      };
      conversation.messages.push(assistantMessage);
    } catch (error) {
      console.error('ARIA chat error:', error);
      // Fallback response for demo/offline mode
      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Hello! I'm ARIA, your AI assistant powered by the Aria-01 model. I'm connected to the D3N infrastructure and can help you with:\n\n• **Code Generation** - Writing and refactoring code\n• **Architecture** - System design and documentation\n• **Research** - Finding information and best practices\n• **Analysis** - Understanding complex codebases\n\nHow can I assist you today?`,
        timestamp: new Date().toISOString(),
        agentId: 'aria',
        model: 'aria-01',
      };
      conversation.messages.push(assistantMessage);
    }

    this._updateWebview();
  }

  private _updateWebview() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'update',
        conversations: this._conversations,
        activeConversationId: this._activeConversationId,
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ARIA Chat</title>
  <style>
    :root {
      --bg-primary: #000000;
      --bg-secondary: #0a0a0a;
      --bg-tertiary: #141414;
      --bg-elevated: #1a1a1a;
      --bg-hover: #242424;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --text-muted: #606060;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-medium: rgba(255, 255, 255, 0.15);
      --accent-primary: #ffffff;
      --status-success: #4ade80;
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --space-xs: 4px;
      --space-sm: 8px;
      --space-md: 16px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 13px;
    }

    .header {
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .header-title {
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
    }

    .new-chat-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-medium);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      margin-left: auto;
    }

    .new-chat-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-primary);
    }

    .conversations-list {
      flex-shrink: 0;
      max-height: 150px;
      overflow-y: auto;
      border-bottom: 1px solid var(--border-subtle);
    }

    .conversation-item {
      padding: var(--space-sm) var(--space-md);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      transition: background 0.1s ease;
      border-left: 2px solid transparent;
    }

    .conversation-item:hover {
      background: var(--bg-hover);
    }

    .conversation-item.active {
      background: var(--bg-tertiary);
      border-left-color: var(--accent-primary);
    }

    .conversation-title {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
    }

    .conversation-time {
      font-size: 10px;
      color: var(--text-muted);
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-md);
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .message {
      display: flex;
      gap: var(--space-sm);
      animation: slideIn 0.2s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-avatar {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-md);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-medium);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }

    .message.user .message-avatar {
      background: var(--bg-elevated);
    }

    .message.assistant .message-avatar {
      background: var(--bg-tertiary);
      color: var(--status-success);
    }

    .message-content {
      flex: 1;
      min-width: 0;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-bottom: 4px;
    }

    .message-sender {
      font-weight: 600;
      font-size: 12px;
    }

    .message-model {
      font-size: 10px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      padding: 1px 4px;
      background: var(--bg-tertiary);
      border-radius: 3px;
    }

    .message-text {
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message-text code {
      background: var(--bg-tertiary);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .message-text strong {
      font-weight: 600;
    }

    .input-container {
      padding: var(--space-md);
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-secondary);
    }

    .input-wrapper {
      display: flex;
      gap: var(--space-sm);
      padding: var(--space-sm);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-md);
    }

    .input-wrapper:focus-within {
      border-color: var(--accent-primary);
    }

    #messageInput {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      resize: none;
      outline: none;
      min-height: 20px;
      max-height: 120px;
    }

    #messageInput::placeholder {
      color: var(--text-muted);
    }

    .send-btn {
      background: var(--accent-primary);
      border: none;
      color: var(--bg-primary);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s ease;
    }

    .send-btn:hover {
      opacity: 0.9;
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-md);
      color: var(--text-muted);
    }

    .empty-state-icon {
      font-size: 32px;
      margin-bottom: var(--space-md);
    }

    .empty-state-title {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: var(--space-xs);
    }

    .empty-state-text {
      font-size: 12px;
      max-width: 200px;
    }

    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border-medium);
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-title">ARIA</span>
    <button class="new-chat-btn" onclick="newChat()">
      <span>+</span>
      New Chat
    </button>
  </div>

  <div class="conversations-list" id="conversationsList"></div>

  <div class="messages-container" id="messagesContainer">
    <div class="empty-state">
      <div class="empty-state-icon">⚡</div>
      <div class="empty-state-title">ARIA Assistant</div>
      <div class="empty-state-text">Start a new conversation with ARIA, powered by the Aria-01 model</div>
    </div>
  </div>

  <div class="input-container">
    <div class="input-wrapper">
      <textarea
        id="messageInput"
        placeholder="Message ARIA..."
        rows="1"
        onkeydown="handleKeyDown(event)"
      ></textarea>
      <button class="send-btn" onclick="sendMessage()" id="sendBtn">
        ➤
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let conversations = [];
    let activeConversationId = null;

    function newChat() {
      vscode.postMessage({ type: 'newChat' });
    }

    function selectConversation(id) {
      vscode.postMessage({ type: 'selectConversation', conversationId: id });
    }

    function sendMessage() {
      const input = document.getElementById('messageInput');
      const message = input.value.trim();
      if (!message || !activeConversationId) return;

      vscode.postMessage({
        type: 'sendMessage',
        message: message,
        conversationId: activeConversationId
      });

      input.value = '';
      input.style.height = 'auto';
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function formatMessage(text) {
      // Simple markdown-like formatting with null safety
      if (!text || typeof text !== 'string') {
        return text || '';
      }
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\`(.*?)\`/g, '<code>$1</code>')
        .replace(/• /g, '• ');
    }

    function render() {
      // Render conversations list
      const listEl = document.getElementById('conversationsList');
      listEl.innerHTML = conversations.map(conv => \`
        <div class="conversation-item \${conv.id === activeConversationId ? 'active' : ''}"
             onclick="selectConversation('\${conv.id}')">
          <span class="conversation-title">\${conv.title}</span>
          <span class="conversation-time">\${getRelativeTime(conv.createdAt)}</span>
        </div>
      \`).join('');

      // Render messages
      const messagesEl = document.getElementById('messagesContainer');
      const activeConv = conversations.find(c => c.id === activeConversationId);

      if (!activeConv || activeConv.messages.length === 0) {
        messagesEl.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">⚡</div>
            <div class="empty-state-title">ARIA Assistant</div>
            <div class="empty-state-text">Start a new conversation with ARIA, powered by the Aria-01 model</div>
          </div>
        \`;
        return;
      }

      messagesEl.innerHTML = activeConv.messages.map(msg => \`
        <div class="message \${msg.role}">
          <div class="message-avatar">
            \${msg.role === 'user' ? '👤' : '⚡'}
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="message-sender">\${msg.role === 'user' ? 'You' : 'ARIA'}</span>
              \${msg.model ? \`<span class="message-model">\${msg.model}</span>\` : ''}
            </div>
            <div class="message-text">\${formatMessage(msg.content)}</div>
          </div>
        </div>
      \`).join('');

      // Scroll to bottom
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function getRelativeTime(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'now';
      if (diffMins < 60) return diffMins + 'm';
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return diffHours + 'h';
      return Math.floor(diffHours / 24) + 'd';
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        conversations = message.conversations;
        activeConversationId = message.activeConversationId;
        render();
      }
    });

    // Auto-resize textarea
    document.getElementById('messageInput').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Signal to extension that webview is ready and request initial state
    console.log('ARIA Chat webview loaded, sending ready signal...');
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  model: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentId?: string;
  model?: string;
  tier?: number;
}

