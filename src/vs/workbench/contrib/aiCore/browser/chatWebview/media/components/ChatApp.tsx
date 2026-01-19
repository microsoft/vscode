/*---------------------------------------------------------------------------------------------
 *  Chat App - Kiro 风格主应用组件
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { useChat } from '../useChat.js';
import { ChatHeader } from './ChatHeader.js';
import { MessageList } from './MessageList.js';
import { ChatInput } from './ChatInput.js';
import './styles.css';

export const ChatApp: React.FC = () => {
	const {
		mode,
		theme,
		messages,
		isStreaming,
		streamingMessageId,
		error,
		sendMessage,
		changeMode,
		cancelRequest,
		attachFile,
		copyCode,
		applyCode
	} = useChat();

	// 更新主题
	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);

	return (
		<div className="chat-app">
			<ChatHeader
				mode={mode}
				onModeChange={changeMode}
			/>

			<MessageList
				messages={messages}
				streamingMessageId={streamingMessageId}
				onCopyCode={copyCode}
				onApplyCode={applyCode}
			/>

			{error && (
				<div className="error-banner">
					<span className="error-icon">⚠️</span>
					<span className="error-text">{error}</span>
				</div>
			)}

			<ChatInput
				onSend={sendMessage}
				onAttach={attachFile}
				onCancel={cancelRequest}
				disabled={isStreaming}
				isStreaming={isStreaming}
				placeholder={mode === 'spec' ? '描述你想要构建的功能...' : '输入消息...'}
			/>
		</div>
	);
};
