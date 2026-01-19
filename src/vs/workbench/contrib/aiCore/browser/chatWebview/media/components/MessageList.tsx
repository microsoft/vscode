/*---------------------------------------------------------------------------------------------
 *  Message List - 消息列表组件
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types.js';
import { Message } from './Message.js';

interface MessageListProps {
	messages: ChatMessage[];
	streamingMessageId?: string;
	onCopyCode: (code: string) => void;
	onApplyCode: (code: string, filename?: string, language?: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
	messages,
	streamingMessageId,
	onCopyCode,
	onApplyCode
}) => {
	const listRef = useRef<HTMLDivElement>(null);
	const shouldScrollRef = useRef(true);

	// 自动滚动到底部
	useEffect(() => {
		if (shouldScrollRef.current && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [messages]);

	// 检测用户是否手动滚动
	const handleScroll = () => {
		if (!listRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = listRef.current;
		shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
	};

	if (messages.length === 0) {
		return (
			<div className="message-list" ref={listRef}>
				<div className="empty-state">
					<div className="empty-state-icon">💬</div>
					<div className="empty-state-title">开始对话</div>
					<div className="empty-state-hint">
						<p>⚡ <strong>Vibe 模式</strong>：快速迭代，边聊边做</p>
						<p>📋 <strong>Spec 模式</strong>：先规划，后执行</p>
					</div>
					<div className="empty-state-examples">
						<button className="example-btn">帮我分析这个项目的结构</button>
						<button className="example-btn">优化这段代码的性能</button>
						<button className="example-btn">创建一个登录功能</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="message-list" ref={listRef} onScroll={handleScroll}>
			{messages.map(message => (
				<Message
					key={message.id}
					message={message}
					isStreaming={message.id === streamingMessageId}
					onCopyCode={onCopyCode}
					onApplyCode={onApplyCode}
				/>
			))}
		</div>
	);
};
