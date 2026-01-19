/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chatWebviewPane.css';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService, IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ViewPane, IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWebviewService, IWebviewElement } from '../../../webview/browser/webview.js';
import { IChatModeService } from '../../../../services/aiCore/browser/chatModeService.js';
import { ChatModeType } from '../../../../services/aiCore/common/chatModeTypes.js';
import { IGLMChatService, GLMMessage, GLMStreamEvent } from '../../../../services/aiCore/browser/glmChatService.js';
import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

export const CHAT_WEBVIEW_ID = 'workbench.view.chatWebview';

interface ExtensionMessage {
	type: string;
	payload?: unknown;
}

export class ChatWebviewPane extends ViewPane {
	static readonly Id = CHAT_WEBVIEW_ID;

	private _container!: HTMLElement;
	private _webview: IWebviewElement | undefined;
	private _webviewContainer!: HTMLElement;

	private readonly _disposables = new DisposableStore();
	private _messages: GLMMessage[] = [];

	constructor(
		options: IViewPaneOptions,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IGLMChatService private readonly glmChatService: IGLMChatService,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.logService.info('[ChatWebviewPane] Initializing...');

		// 监听模式变化
		this._disposables.add(this.chatModeService.onDidChangeMode((mode) => {
			this._postMessage({ type: 'modeChanged', payload: { mode } });
		}));

		// 监听主题变化
		this._disposables.add(this.themeService.onDidColorThemeChange((theme) => {
			this._postMessage({ type: 'themeChanged', payload: { theme: this._getThemeType(theme) } });
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = dom.append(container, dom.$('.chat-webview-pane'));
		this._webviewContainer = dom.append(this._container, dom.$('.chat-webview-container'));

		this._createWebview();
	}

	private _createWebview(): void {
		this._webview = this.webviewService.createWebviewElement({
			providedViewType: 'chatWebview',
			title: 'AI Chat',
			options: {
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowScripts: true,
			},
			extension: undefined
		});

		// 挂载 webview
		const targetWindow = getActiveWindow();
		this._webview.mountTo(this._webviewContainer, targetWindow);

		// 设置 HTML 内容
		this._setWebviewContent();

		// 监听 webview 消息
		this._disposables.add(this._webview.onMessage((event) => {
			this._handleWebviewMessage(event.message as ExtensionMessage);
		}));
	}

	private _setWebviewContent(): void {
		if (!this._webview) {
			return;
		}

		const theme = this._getThemeType(this.themeService.getColorTheme());

		// 使用内联 HTML 和 CSS，避免资源加载问题
		const html = this._generateHTML(theme);
		this._webview.setHtml(html);
	}

	private _generateHTML(theme: 'dark' | 'light' | 'high-contrast'): string {
		return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chat</title>
    <style>
        ${this._getStyles()}
    </style>
</head>
<body class="${theme}">
    <div id="root">
        <div class="chat-container">
            <div class="chat-header">
                <div class="chat-title">AI Chat</div>
                <div class="chat-mode" id="mode-indicator">${this.chatModeService.getCurrentMode()}</div>
            </div>
            <div class="messages" id="messages">
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-text">开始与 AI 对话</div>
                    <div class="empty-hint">输入消息开始聊天</div>
                </div>
            </div>
            <div class="input-container">
                <textarea id="input" placeholder="输入消息..." rows="3"></textarea>
                <button id="send-btn" class="send-button">发送</button>
            </div>
        </div>
    </div>
    <script>
        ${this._getScript()}
    </script>
</body>
</html>`;
	}

	private _getStyles(): string {
		return `
:root {
    --bg-primary: #1e1e1e;
    --bg-secondary: #252526;
    --bg-tertiary: #2d2d2d;
    --text-primary: #cccccc;
    --text-secondary: #888888;
    --accent: #0e639c;
    --accent-hover: #1177bb;
    --border: #3c3c3c;
    --success: #4ec9b0;
    --error: #f14c4c;
}

body.light {
    --bg-primary: #ffffff;
    --bg-secondary: #f3f3f3;
    --bg-tertiary: #e8e8e8;
    --text-primary: #333333;
    --text-secondary: #666666;
    --accent: #0066b8;
    --accent-hover: #0078d4;
    --border: #d4d4d4;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
}

.chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
}

.chat-title {
    font-size: 14px;
    font-weight: 600;
}

.chat-mode {
    font-size: 12px;
    padding: 4px 8px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    text-transform: uppercase;
}

.messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.empty-text {
    font-size: 18px;
    margin-bottom: 8px;
}

.empty-hint {
    font-size: 14px;
}

.message {
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    max-width: 85%;
}

.message.user {
    background: var(--accent);
    color: white;
    margin-left: auto;
}

.message.assistant {
    background: var(--bg-tertiary);
}

.message-content {
    white-space: pre-wrap;
    word-break: break-word;
}

.input-container {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
}

#input {
    flex: 1;
    padding: 10px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 14px;
    resize: none;
    font-family: inherit;
}

#input:focus {
    outline: none;
    border-color: var(--accent);
}

.send-button {
    padding: 10px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.2s;
}

.send-button:hover {
    background: var(--accent-hover);
}

.send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.streaming-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--accent);
    border-radius: 50%;
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}
`;
	}

	private _getScript(): string {
		return `
(function() {
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    let isStreaming = false;
    let messages = [];

    // 发送消息到 extension
    function sendToExtension(type, payload) {
        vscode.postMessage({ type, payload });
    }

    // 渲染消息
    function renderMessages() {
        if (messages.length === 0) {
            messagesEl.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-text">开始与 AI 对话</div>
                    <div class="empty-hint">输入消息开始聊天</div>
                </div>
            \`;
            return;
        }

        messagesEl.innerHTML = messages.map(msg => \`
            <div class="message \${msg.role}">
                <div class="message-content">\${escapeHtml(msg.content)}\${msg.isStreaming ? '<span class="streaming-indicator"></span>' : ''}</div>
            </div>
        \`).join('');

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 发送消息
    function sendMessage() {
        const content = inputEl.value.trim();
        if (!content || isStreaming) return;

        messages.push({ role: 'user', content });
        inputEl.value = '';
        renderMessages();

        sendToExtension('sendMessage', { content });
    }

    // 事件监听
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 接收来自 extension 的消息
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'init':
                if (message.payload.history) {
                    messages = message.payload.history.map(m => ({
                        role: m.role,
                        content: m.content
                    }));
                }
                modeIndicator.textContent = message.payload.mode;
                renderMessages();
                break;

            case 'streamStart':
                isStreaming = true;
                sendBtn.disabled = true;
                messages.push({ role: 'assistant', content: '', isStreaming: true });
                renderMessages();
                break;

            case 'streamContent':
                const lastMsg = messages[messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content = message.payload.fullContent;
                    renderMessages();
                }
                break;

            case 'streamComplete':
                isStreaming = false;
                sendBtn.disabled = false;
                const completedMsg = messages[messages.length - 1];
                if (completedMsg) {
                    completedMsg.isStreaming = false;
                }
                renderMessages();
                break;

            case 'error':
                isStreaming = false;
                sendBtn.disabled = false;
                messages.push({ role: 'assistant', content: '错误: ' + message.payload.error });
                renderMessages();
                break;

            case 'modeChanged':
                modeIndicator.textContent = message.payload.mode;
                break;
        }
    });

    // 通知 extension 已准备就绪
    sendToExtension('ready');
})();
`;
	}

	private _getThemeType(theme: IColorTheme): 'dark' | 'light' | 'high-contrast' {
		if (theme.type === 'hcDark' || theme.type === 'hcLight') {
			return 'high-contrast';
		}
		return theme.type === 'dark' ? 'dark' : 'light';
	}

	private _postMessage(message: ExtensionMessage): void {
		this._webview?.postMessage(message);
	}

	private async _handleWebviewMessage(message: ExtensionMessage): Promise<void> {
		switch (message.type) {
			case 'ready':
				// Webview 准备就绪，发送初始化数据
				this._postMessage({
					type: 'init',
					payload: {
						mode: this.chatModeService.getCurrentMode(),
						theme: this._getThemeType(this.themeService.getColorTheme()),
						history: this._messages
					}
				});
				break;

			case 'sendMessage':
				await this._handleSendMessage(message.payload as { content: string });
				break;

			case 'changeMode': {
				const { mode } = message.payload as { mode: ChatModeType };
				this.chatModeService.setMode(mode);
				break;
			}
		}
	}

	private async _handleSendMessage(payload: { content: string }): Promise<void> {
		const { content } = payload;
		const messageId = `assistant-${Date.now()}`;

		// 添加用户消息到历史
		this._messages.push({
			role: 'user',
			content
		});

		// 通知开始流式响应
		this._postMessage({
			type: 'streamStart',
			payload: { messageId }
		});

		try {
			// 调用 GLM 服务
			let fullContent = '';

			const stream = this.glmChatService.streamChat(
				this._messages,
				{
					files: []
				},
				{}
			);

			for await (const event of stream) {
				this._handleStreamEvent(event, messageId, fullContent);
				if (event.type === 'content') {
					fullContent += event.content;
				}
			}

			// 添加助手消息到历史
			this._messages.push({
				role: 'assistant',
				content: fullContent
			});

			this._postMessage({
				type: 'streamComplete',
				payload: { messageId }
			});
		} catch (error) {
			this.logService.error('[ChatWebviewPane] Error:', error);
			this._postMessage({
				type: 'error',
				payload: { error: error instanceof Error ? error.message : String(error) }
			});
		}
	}

	private _handleStreamEvent(event: GLMStreamEvent, messageId: string, currentContent: string): void {
		switch (event.type) {
			case 'thinking':
				this._postMessage({
					type: 'streamThinking',
					payload: { messageId, thinking: event.content }
				});
				break;

			case 'content':
				this._postMessage({
					type: 'streamContent',
					payload: {
						messageId,
						content: event.content,
						fullContent: currentContent + event.content
					}
				});
				break;

			case 'tool_call':
				this._postMessage({
					type: 'toolCallStart',
					payload: {
						messageId,
						toolCall: {
							id: event.toolCall?.id,
							name: event.toolCall?.function.name,
							arguments: event.toolCall?.function.arguments,
							status: 'running'
						}
					}
				});
				break;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._container) {
			this._container.style.height = `${height}px`;
			this._container.style.width = `${width}px`;
		}
		if (this._webviewContainer) {
			this._webviewContainer.style.height = `${height}px`;
			this._webviewContainer.style.width = `${width}px`;
		}
	}

	override dispose(): void {
		this._disposables.dispose();
		this._webview?.dispose();
		super.dispose();
	}
}
