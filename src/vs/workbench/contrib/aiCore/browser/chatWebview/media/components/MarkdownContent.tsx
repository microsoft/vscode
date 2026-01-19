/*---------------------------------------------------------------------------------------------
 *  Markdown Content - Markdown 渲染组件
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';
import { CodeBlock } from './CodeBlock.js';

interface MarkdownContentProps {
	content: string;
	isStreaming?: boolean;
	onCopyCode: (code: string) => void;
	onApplyCode: (code: string, filename?: string, language?: string) => void;
}

interface ParsedContent {
	type: 'text' | 'code';
	content: string;
	language?: string;
	filename?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
	content,
	isStreaming,
	onCopyCode,
	onApplyCode
}) => {
	// 解析 Markdown 内容，分离代码块
	const parsedContent = useMemo(() => {
		const parts: ParsedContent[] = [];
		const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

		let lastIndex = 0;
		let match;

		while ((match = codeBlockRegex.exec(content)) !== null) {
			// 添加代码块之前的文本
			if (match.index > lastIndex) {
				parts.push({
					type: 'text',
					content: content.slice(lastIndex, match.index)
				});
			}

			// 添加代码块
			parts.push({
				type: 'code',
				content: match[2],
				language: match[1] || 'text'
			});

			lastIndex = match.index + match[0].length;
		}

		// 添加剩余文本
		if (lastIndex < content.length) {
			parts.push({
				type: 'text',
				content: content.slice(lastIndex)
			});
		}

		return parts;
	}, [content]);

	// 简单的 Markdown 转 HTML
	const renderText = (text: string) => {
		let html = text
			// 粗体
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// 斜体
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')
			// 行内代码
			.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
			// 链接
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
			// 标题
			.replace(/^### (.+)$/gm, '<h3>$1</h3>')
			.replace(/^## (.+)$/gm, '<h2>$1</h2>')
			.replace(/^# (.+)$/gm, '<h1>$1</h1>')
			// 无序列表
			.replace(/^- (.+)$/gm, '<li>$1</li>')
			// 有序列表
			.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
			// 换行
			.replace(/\n/g, '<br/>');

		// 包装列表项
		html = html.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');

		return html;
	};

	return (
		<div className="markdown-content">
			{parsedContent.map((part, index) => (
				<React.Fragment key={index}>
					{part.type === 'text' ? (
						<div
							className="markdown-text"
							dangerouslySetInnerHTML={{ __html: renderText(part.content) }}
						/>
					) : (
						<CodeBlock
							id={`code-${index}`}
							language={part.language || 'text'}
							code={part.content}
							onCopy={() => onCopyCode(part.content)}
							onApply={() => onApplyCode(part.content, undefined, part.language)}
						/>
					)}
				</React.Fragment>
			))}

			{/* 流式光标 */}
			{isStreaming && <span className="streaming-cursor" />}
		</div>
	);
};
