/*---------------------------------------------------------------------------------------------
 *  Chat Hook - 管理 Chat 状态和与 Extension 的通信
 *--------------------------------------------------------------------------------------------*/

import { useReducer, useEffect, useCallback, useRef } from 'react';
import {
	ChatState,
	ChatAction,
	ChatMessage,
	ChatMode,
	ExtensionMessage,
	WebviewMessage,
	VSCodeAPI
} from './types.js';

// ============================================================================
// Reducer
// ============================================================================

const initialState: ChatState = {
	mode: 'vibe',
	theme: 'dark',
	messages: [],
	isStreaming: false,
	streamingMessageId: undefined,
	error: undefined
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'SET_MODE':
			return { ...state, mode: action.mode };

		case 'SET_THEME':
			return { ...state, theme: action.theme };

		case 'ADD_MESSAGE':
			return { ...state, messages: [...state.messages, action.message] };

		case 'UPDATE_MESSAGE':
			return {
				...state,
				messages: state.messages.map(msg =>
					msg.id === action.messageId ? { ...msg, ...action.updates } : msg
				)
			};

		case 'STREAM_START':
			return {
				...state,
				isStreaming: true,
				streamingMessageId: action.messageId,
				messages: [
					...state.messages,
					{
						id: action.messageId,
						role: 'assistant',
						content: '',
						timestamp: Date.now(),
						isStreaming: true
					}
				]
			};

		case 'STREAM_CONTENT':
			return {
				...state,
				messages: state.messages.map(msg =>
					msg.id === action.messageId
						? { ...msg, content: action.fullContent }
						: msg
				)
			};

		case 'STREAM_COMPLETE':
			return {
				...state,
				isStreaming: false,
				streamingMessageId: undefined,
				messages: state.messages.map(msg =>
					msg.id === action.messageId
						? { ...msg, isStreaming: false, isComplete: true }
						: msg
				)
			};

		case 'ADD_TOOL_CALL':
			return {
				...state,
				messages: state.messages.map(msg =>
					msg.id === action.messageId
						? { ...msg, toolCalls: [...(msg.toolCalls || []), action.toolCall] }
						: msg
				)
			};

		case 'UPDATE_TOOL_CALL':
			return {
				...state,
				messages: state.messages.map(msg =>
					msg.id === action.messageId
						? {
							...msg,
							toolCalls: msg.toolCalls?.map(tc =>
								tc.id === action.toolCallId ? { ...tc, ...action.updates } : tc
							)
						}
						: msg
				)
			};

		case 'SET_ERROR':
			return { ...state, error: action.error, isStreaming: false };

		case 'CLEAR_ERROR':
			return { ...state, error: undefined };

		case 'CLEAR_MESSAGES':
			return { ...state, messages: [] };

		case 'LOAD_HISTORY':
			return { ...state, messages: action.messages };

		default:
			return state;
	}
}

// ============================================================================
// Hook
// ============================================================================

export function useChat() {
	const [state, dispatch] = useReducer(chatReducer, initialState);
	const vscodeRef = useRef<VSCodeAPI | null>(null);

	// 初始化 VSCode API
	useEffect(() => {
		try {
			vscodeRef.current = acquireVsCodeApi();

			// 发送 ready 消息
			vscodeRef.current.postMessage({ type: 'ready' });
		} catch (e) {
			console.error('Failed to acquire VSCode API:', e);
		}
	}, []);

	// 监听来自 Extension 的消息
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data;

			switch (message.type) {
				case 'init':
					dispatch({ type: 'SET_MODE', mode: message.payload.mode });
					dispatch({ type: 'SET_THEME', theme: message.payload.theme });
					if (message.payload.history.length > 0) {
						dispatch({ type: 'LOAD_HISTORY', messages: message.payload.history });
					}
					break;

				case 'streamStart':
					dispatch({ type: 'STREAM_START', messageId: message.payload.messageId });
					break;

				case 'streamContent':
					dispatch({
						type: 'STREAM_CONTENT',
						messageId: message.payload.messageId,
						content: message.payload.content,
						fullContent: message.payload.fullContent
					});
					break;

				case 'streamThinking':
					dispatch({
						type: 'UPDATE_MESSAGE',
						messageId: message.payload.messageId,
						updates: { thinking: message.payload.thinking }
					});
					break;

				case 'streamComplete':
					dispatch({ type: 'STREAM_COMPLETE', messageId: message.payload.messageId });
					break;

				case 'toolCallStart':
					dispatch({
						type: 'ADD_TOOL_CALL',
						messageId: message.payload.messageId,
						toolCall: message.payload.toolCall
					});
					break;

				case 'toolCallComplete':
					dispatch({
						type: 'UPDATE_TOOL_CALL',
						messageId: message.payload.messageId,
						toolCallId: message.payload.toolCallId,
						updates: {
							status: message.payload.status,
							result: message.payload.result,
							error: message.payload.error
						}
					});
					break;

				case 'error':
					dispatch({ type: 'SET_ERROR', error: message.payload.error });
					break;

				case 'modeChanged':
					dispatch({ type: 'SET_MODE', mode: message.payload.mode });
					break;

				case 'themeChanged':
					dispatch({ type: 'SET_THEME', theme: message.payload.theme });
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// Actions
	const sendMessage = useCallback((content: string, attachments?: any[]) => {
		// 添加用户消息到本地状态
		const userMessage: ChatMessage = {
			id: `user-${Date.now()}`,
			role: 'user',
			content,
			timestamp: Date.now(),
			attachments
		};
		dispatch({ type: 'ADD_MESSAGE', message: userMessage });

		// 发送到 Extension
		const message: WebviewMessage = {
			type: 'sendMessage',
			payload: { content, attachments }
		};
		vscodeRef.current?.postMessage(message);
	}, []);

	const changeMode = useCallback((mode: ChatMode) => {
		dispatch({ type: 'SET_MODE', mode });
		const message: WebviewMessage = {
			type: 'changeMode',
			payload: { mode }
		};
		vscodeRef.current?.postMessage(message);
	}, []);

	const cancelRequest = useCallback(() => {
		vscodeRef.current?.postMessage({ type: 'cancelRequest' });
	}, []);

	const attachFile = useCallback(() => {
		vscodeRef.current?.postMessage({ type: 'attachFile', payload: { action: 'pick' } });
	}, []);

	const copyCode = useCallback((code: string) => {
		vscodeRef.current?.postMessage({ type: 'copyCode', payload: { code } });
		// 同时使用 Clipboard API
		navigator.clipboard.writeText(code).catch(() => { });
	}, []);

	const applyCode = useCallback((code: string, filename?: string, language?: string) => {
		vscodeRef.current?.postMessage({
			type: 'applyCode',
			payload: { code, filename, language: language || 'text' }
		});
	}, []);

	const clearHistory = useCallback(() => {
		dispatch({ type: 'CLEAR_MESSAGES' });
		vscodeRef.current?.postMessage({ type: 'clearHistory' });
	}, []);

	const retryMessage = useCallback((messageId: string) => {
		vscodeRef.current?.postMessage({ type: 'retryMessage', payload: { messageId } });
	}, []);

	return {
		// State
		mode: state.mode,
		theme: state.theme,
		messages: state.messages,
		isStreaming: state.isStreaming,
		streamingMessageId: state.streamingMessageId,
		error: state.error,

		// Actions
		sendMessage,
		changeMode,
		cancelRequest,
		attachFile,
		copyCode,
		applyCode,
		clearHistory,
		retryMessage
	};
}
