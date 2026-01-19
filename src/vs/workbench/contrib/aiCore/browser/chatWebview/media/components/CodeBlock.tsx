/*---------------------------------------------------------------------------------------------
 *  Code Block - 代码块组件
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';

interface CodeBlockProps {
	id: string;
	language: string;
	code: string;
	filename?: string;
	onCopy: () => void;
	onApply?: () => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
	id,
	language,
	code,
	filename,
	onCopy,
	onApply
}) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const getLanguageLabel = () => {
		const labels: Record<string, string> = {
			'typescript': 'TypeScript',
			'javascript': 'JavaScript',
			'python': 'Python',
			'java': 'Java',
			'go': 'Go',
			'rust': 'Rust',
			'cpp': 'C++',
			'c': 'C',
			'csharp': 'C#',
			'ruby': 'Ruby',
			'php': 'PHP',
			'swift': 'Swift',
			'kotlin': 'Kotlin',
			'dart': 'Dart',
			'html': 'HTML',
			'css': 'CSS',
			'scss': 'SCSS',
			'json': 'JSON',
			'yaml': 'YAML',
			'xml': 'XML',
			'sql': 'SQL',
			'bash': 'Bash',
			'shell': 'Shell',
			'markdown': 'Markdown',
			'md': 'Markdown',
			'text': 'Text',
			'diff': 'Diff'
		};
		return labels[language.toLowerCase()] || language;
	};

	return (
		<div className="code-block">
			<div className="code-block-header">
				<div className="code-block-info">
					{filename && <span className="code-filename">📄 {filename}</span>}
					<span className="code-language">{getLanguageLabel()}</span>
				</div>
				<div className="code-block-actions">
					{onApply && (
						<button
							className="code-block-btn apply"
							onClick={onApply}
							title="应用到编辑器"
						>
							✨ 应用
						</button>
					)}
					<button
						className="code-block-btn copy"
						onClick={handleCopy}
						title="复制代码"
					>
						{copied ? '✓ 已复制' : '📋 复制'}
					</button>
				</div>
			</div>
			<pre className="code-block-content">
				<code className={`language-${language}`}>
					{code}
				</code>
			</pre>
		</div>
	);
};
