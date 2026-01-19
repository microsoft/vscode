/*---------------------------------------------------------------------------------------------
 *  Chat Input - 输入框组件
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { FileReference } from '../types.js';

interface ChatInputProps {
	onSend: (content: string, attachments?: FileReference[]) => void;
	onAttach: () => void;
	onCancel?: () => void;
	disabled?: boolean;
	isStreaming?: boolean;
	placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
	onSend,
	onAttach,
	onCancel,
	disabled,
	isStreaming,
	placeholder = '输入消息...'
}) => {
	const [content, setContent] = useState('');
	const [attachments, setAttachments] = useState<FileReference[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// 自动调整高度
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
		}
	}, [content]);

	// 聚焦输入框
	useEffect(() => {
		if (!disabled && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [disabled]);

	const handleSend = () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || disabled) return;

		onSend(trimmedContent, attachments.length > 0 ? attachments : undefined);
		setContent('');
		setAttachments([]);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter 发送，Shift+Enter 换行
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const removeAttachment = (index: number) => {
		setAttachments(prev => prev.filter((_, i) => i !== index));
	};

	return (
		<div className="chat-input-container">
			{/* 附件列表 */}
			{attachments.length > 0 && (
				<div className="attachments-list">
					{attachments.map((att, index) => (
						<div key={index} className="attachment-item">
							<span className="attachment-icon">📄</span>
							<span className="attachment-name">{att.name}</span>
							<button
								className="attachment-remove"
								onClick={() => removeAttachment(index)}
							>
								×
							</button>
						</div>
					))}
				</div>
			)}

			{/* 输入区域 */}
			<div className={`chat-input-wrapper ${disabled ? 'disabled' : ''}`}>
				<textarea
					ref={textareaRef}
					className="chat-textarea"
					value={content}
					onChange={e => setContent(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					rows={1}
				/>

				<div className="chat-actions">
					{/* 附件按钮 */}
					<button
						className="chat-btn attach"
						onClick={onAttach}
						disabled={disabled}
						title="添加文件 (#File)"
					>
						📎
					</button>

					{/* 发送/取消按钮 */}
					{isStreaming ? (
						<button
							className="chat-btn cancel"
							onClick={onCancel}
							title="取消生成"
						>
							⏹
						</button>
					) : (
						<button
							className="chat-btn send"
							onClick={handleSend}
							disabled={!content.trim() || disabled}
							title="发送 (Enter)"
						>
							➤
						</button>
					)}
				</div>
			</div>

			{/* 提示 */}
			<div className="chat-input-hint">
				<span>按 <kbd>Enter</kbd> 发送，<kbd>Shift</kbd> + <kbd>Enter</kbd> 换行</span>
				<span>使用 <kbd>#</kbd> 引用文件</span>
			</div>
		</div>
	);
};
