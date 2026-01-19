/*---------------------------------------------------------------------------------------------
 *  Message - 单条消息组件
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ChatMessage, ToolCall } from '../types.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { ToolCallCard } from './ToolCallCard.js';
import { MarkdownContent } from './MarkdownContent.js';

interface MessageProps {
	message: ChatMessage;
	isStreaming?: boolean;
	onCopyCode: (code: string) => void;
	onApplyCode: (code: string, filename?: string, language?: string) => void;
}

export const Message: React.FC<MessageProps> = ({
	message,
	isStreaming,
	onCopyCode,
	onApplyCode
}) => {
	const isUser = message.role === 'user';
	const isAssistant = message.role === 'assistant';

	return (
		<div className={`message ${message.role}`}>
			{/* 用户头像/助手头像 */}
			<div className="message-avatar">
				{isUser ? '👤' : '🤖'}
			</div>

			<div className="message-content">
				{/* 用户消息 */}
				{isUser && (
					<div className="message-text user-text">
						{message.content}
						{message.attachments && message.attachments.length > 0 && (
							<div className="message-attachments">
								{message.attachments.map((att, i) => (
									<span key={i} className="attachment-tag">
										📄 {att.name}
									</span>
								))}
							</div>
						)}
					</div>
				)}

				{/* 助手消息 */}
				{isAssistant && (
					<>
						{/* 思考指示器 */}
						{message.thinking && (
							<ThinkingIndicator content={message.thinking} />
						)}

						{/* 工具调用卡片 */}
						{message.toolCalls && message.toolCalls.length > 0 && (
							<div className="tool-calls">
								{message.toolCalls.map(toolCall => (
									<ToolCallCard key={toolCall.id} toolCall={toolCall} />
								))}
							</div>
						)}

						{/* Markdown 内容 */}
						{message.content && (
							<MarkdownContent
								content={message.content}
								isStreaming={isStreaming}
								onCopyCode={onCopyCode}
								onApplyCode={onApplyCode}
							/>
						)}

						{/* 流式光标 */}
						{isStreaming && !message.content && (
							<span className="streaming-cursor" />
						)}
					</>
				)}

				{/* 时间戳 */}
				<div className="message-time">
					{new Date(message.timestamp).toLocaleTimeString('zh-CN', {
						hour: '2-digit',
						minute: '2-digit'
					})}
				</div>
			</div>
		</div>
	);
};
