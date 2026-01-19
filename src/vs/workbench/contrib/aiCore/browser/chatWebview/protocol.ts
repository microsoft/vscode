/*---------------------------------------------------------------------------------------------
 *  AI Chat Webview 通信协议
 *  定义 Extension Host ↔ Webview 之间的消息格式
 *--------------------------------------------------------------------------------------------*/

// ============================================================================
// 基础类型
// ============================================================================

export type ChatMode = 'vibe' | 'spec';

export interface FileReference {
	path: string;
	name: string;
	language?: string;
	lineRange?: string;
}

export interface ToolCall {
	id: string;
	name: string;
	displayName: string;
	arguments: Record<string, unknown>;
	status: 'pending' | 'running' | 'success' | 'error';
	result?: string;
	error?: string;
}

export interface CodeBlock {
	language: string;
	code: string;
	filename?: string;
	canApply?: boolean;
}

// ============================================================================
// 消息类型
// ============================================================================

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	// 用户消息附加
	attachments?: FileReference[];
	// 助手消息附加
	thinking?: string;
	toolCalls?: ToolCall[];
	codeBlocks?: CodeBlock[];
	isStreaming?: boolean;
	isComplete?: boolean;
}

// ============================================================================
// Extension → Webview 消息
// ============================================================================

export type ExtensionToWebviewMessage =
	| { type: 'init'; payload: InitPayload }
	| { type: 'streamStart'; payload: StreamStartPayload }
	| { type: 'streamContent'; payload: StreamContentPayload }
	| { type: 'streamThinking'; payload: StreamThinkingPayload }
	| { type: 'streamComplete'; payload: StreamCompletePayload }
	| { type: 'toolCallStart'; payload: ToolCallStartPayload }
	| { type: 'toolCallComplete'; payload: ToolCallCompletePayload }
	| { type: 'error'; payload: ErrorPayload }
	| { type: 'modeChanged'; payload: ModeChangedPayload }
	| { type: 'historyLoaded'; payload: HistoryLoadedPayload }
	| { type: 'themeChanged'; payload: ThemeChangedPayload };

export interface InitPayload {
	mode: ChatMode;
	sessionId: string;
	history: ChatMessage[];
	theme: 'light' | 'dark' | 'high-contrast';
}

export interface StreamStartPayload {
	messageId: string;
}

export interface StreamContentPayload {
	messageId: string;
	content: string;  // 增量内容
	fullContent: string;  // 完整内容
}

export interface StreamThinkingPayload {
	messageId: string;
	thinking: string;
}

export interface StreamCompletePayload {
	messageId: string;
}

export interface ToolCallStartPayload {
	messageId: string;
	toolCall: ToolCall;
}

export interface ToolCallCompletePayload {
	messageId: string;
	toolCallId: string;
	status: 'success' | 'error';
	result?: string;
	error?: string;
}

export interface ErrorPayload {
	messageId?: string;
	error: string;
	code?: string;
}

export interface ModeChangedPayload {
	mode: ChatMode;
}

export interface HistoryLoadedPayload {
	messages: ChatMessage[];
}

export interface ThemeChangedPayload {
	theme: 'light' | 'dark' | 'high-contrast';
}

// ============================================================================
// Webview → Extension 消息
// ============================================================================

export type WebviewToExtensionMessage =
	| { type: 'ready' }
	| { type: 'sendMessage'; payload: SendMessagePayload }
	| { type: 'cancelRequest' }
	| { type: 'changeMode'; payload: ChangeModePayload }
	| { type: 'attachFile'; payload: AttachFilePayload }
	| { type: 'applyCode'; payload: ApplyCodePayload }
	| { type: 'copyCode'; payload: CopyCodePayload }
	| { type: 'openFile'; payload: OpenFilePayload }
	| { type: 'executeCommand'; payload: ExecuteCommandPayload }
	| { type: 'clearHistory' }
	| { type: 'retryMessage'; payload: RetryMessagePayload };

export interface SendMessagePayload {
	content: string;
	attachments?: FileReference[];
}

export interface ChangeModePayload {
	mode: ChatMode;
}

export interface AttachFilePayload {
	action: 'pick' | 'pickFolder';
}

export interface ApplyCodePayload {
	code: string;
	filename?: string;
	language: string;
}

export interface CopyCodePayload {
	code: string;
}

export interface OpenFilePayload {
	path: string;
	lineNumber?: number;
}

export interface ExecuteCommandPayload {
	command: string;
	args?: unknown[];
}

export interface RetryMessagePayload {
	messageId: string;
}
