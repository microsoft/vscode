/*---------------------------------------------------------------------------------------------
 *  Chat Webview Types
 *--------------------------------------------------------------------------------------------*/

// ============================================================================
// VSCode API 类型
// ============================================================================

export interface VSCodeAPI {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare global {
	function acquireVsCodeApi(): VSCodeAPI;
}

// ============================================================================
// 消息类型
// ============================================================================

export type ChatMode = 'vibe' | 'spec';
export type ThemeType = 'light' | 'dark' | 'high-contrast';
export type ToolStatus = 'pending' | 'running' | 'success' | 'error';
export type MessageRole = 'user' | 'assistant' | 'system';

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
	status: ToolStatus;
	result?: string;
	error?: string;
}

export interface CodeBlock {
	id: string;
	language: string;
	code: string;
	filename?: string;
	canApply?: boolean;
}

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	attachments?: FileReference[];
	thinking?: string;
	toolCalls?: ToolCall[];
	codeBlocks?: CodeBlock[];
	isStreaming?: boolean;
	isComplete?: boolean;
}

// ============================================================================
// 通信消息
// ============================================================================

// Extension → Webview
export type ExtensionMessage =
	| { type: 'init'; payload: { mode: ChatMode; sessionId: string; history: ChatMessage[]; theme: ThemeType } }
	| { type: 'streamStart'; payload: { messageId: string } }
	| { type: 'streamContent'; payload: { messageId: string; content: string; fullContent: string } }
	| { type: 'streamThinking'; payload: { messageId: string; thinking: string } }
	| { type: 'streamComplete'; payload: { messageId: string } }
	| { type: 'toolCallStart'; payload: { messageId: string; toolCall: ToolCall } }
	| { type: 'toolCallComplete'; payload: { messageId: string; toolCallId: string; status: 'success' | 'error'; result?: string; error?: string } }
	| { type: 'error'; payload: { messageId?: string; error: string } }
	| { type: 'modeChanged'; payload: { mode: ChatMode } }
	| { type: 'themeChanged'; payload: { theme: ThemeType } };

// Webview → Extension
export type WebviewMessage =
	| { type: 'ready' }
	| { type: 'sendMessage'; payload: { content: string; attachments?: FileReference[] } }
	| { type: 'cancelRequest' }
	| { type: 'changeMode'; payload: { mode: ChatMode } }
	| { type: 'attachFile'; payload: { action: 'pick' | 'pickFolder' } }
	| { type: 'applyCode'; payload: { code: string; filename?: string; language: string } }
	| { type: 'copyCode'; payload: { code: string } }
	| { type: 'clearHistory' }
	| { type: 'retryMessage'; payload: { messageId: string } };

// ============================================================================
// 组件 Props
// ============================================================================

export interface ChatHeaderProps {
	mode: ChatMode;
	onModeChange: (mode: ChatMode) => void;
}

export interface MessageListProps {
	messages: ChatMessage[];
	streamingMessageId?: string;
}

export interface MessageProps {
	message: ChatMessage;
	isStreaming?: boolean;
}

export interface ChatInputProps {
	onSend: (content: string, attachments?: FileReference[]) => void;
	onAttach: () => void;
	disabled?: boolean;
	placeholder?: string;
}

export interface ToolCallCardProps {
	toolCall: ToolCall;
}

export interface CodeBlockProps {
	block: CodeBlock;
	onCopy: (code: string) => void;
	onApply?: (code: string, filename?: string, language?: string) => void;
}

export interface ThinkingIndicatorProps {
	content?: string;
}

// ============================================================================
// Chat State
// ============================================================================

export interface ChatState {
	mode: ChatMode;
	theme: ThemeType;
	messages: ChatMessage[];
	isStreaming: boolean;
	streamingMessageId?: string;
	error?: string;
}

export type ChatAction =
	| { type: 'SET_MODE'; mode: ChatMode }
	| { type: 'SET_THEME'; theme: ThemeType }
	| { type: 'ADD_MESSAGE'; message: ChatMessage }
	| { type: 'UPDATE_MESSAGE'; messageId: string; updates: Partial<ChatMessage> }
	| { type: 'STREAM_START'; messageId: string }
	| { type: 'STREAM_CONTENT'; messageId: string; content: string; fullContent: string }
	| { type: 'STREAM_COMPLETE'; messageId: string }
	| { type: 'ADD_TOOL_CALL'; messageId: string; toolCall: ToolCall }
	| { type: 'UPDATE_TOOL_CALL'; messageId: string; toolCallId: string; updates: Partial<ToolCall> }
	| { type: 'SET_ERROR'; error: string }
	| { type: 'CLEAR_ERROR' }
	| { type: 'CLEAR_MESSAGES' }
	| { type: 'LOAD_HISTORY'; messages: ChatMessage[] };
