import * as React from 'react';
import { useEffect } from 'react';

/**
 * Diff data interface matching Rao's structure
 */
interface DiffItem {
	type: 'added' | 'deleted' | 'unchanged';
	content: string;
	old_line?: number;
	new_line?: number;
}

interface DiffHighlighterProps {
	content: string;
	diffData?: {
		diff_data: DiffItem[];
		added?: number;
		deleted?: number;
		clean_filename?: string;
	};
	filename?: string;
	isReadOnly?: boolean;
	onContentChange?: (content: string) => void;
	onContentElementReady?: (element: HTMLElement | null) => void;
}

/**
 * Diff highlighting component using simple HTML/CSS highlighting
 * Replicates Rao's ACE editor diff highlighting functionality
 */
export const DiffHighlighter: React.FC<DiffHighlighterProps> = ({
	content,
	diffData,
	filename,
	isReadOnly = true,
	onContentChange,
	onContentElementReady
}) => {
	const [currentContent, setCurrentContent] = React.useState(content);

	// Update content when prop changes
	useEffect(() => {
		setCurrentContent(content);
	}, [content]);

	const handleContentChange = (newContent: string) => {
		setCurrentContent(newContent);
		if (onContentChange) {
			onContentChange(newContent);
		}
	};

	// Render content with diff highlighting (like Rao's approach)
	const renderContentWithDiffHighlighting = () => {
		if (!diffData || !diffData.diff_data || diffData.diff_data.length === 0) {
			// No diff data, show plain content
			return (
				<pre ref={(el) => onContentElementReady?.(el)} className="diff-content-plain">
					<code>{currentContent}</code>
				</pre>
			);
		}

		// Render with diff highlighting - exactly like Rao shows it
		return (
			<div ref={(el) => onContentElementReady?.(el)} className="diff-content-highlighted">
				{diffData.diff_data.map((diffItem: any, index: number) => {
					// Use the actual line numbers from the diff data
					const lineNumber = diffItem.new_line || diffItem.old_line || (index + 1);
					let className = 'diff-line';
					
					switch (diffItem.type) {
						case 'added':
							className += ' diff-line-added';
							break;
						case 'deleted':
							className += ' diff-line-deleted';
							break;
						case 'unchanged':
						default:
							className += ' diff-line-unchanged';
							break;
					}

					return (
						<div key={index} className={className}>
							<span className="diff-line-number">{lineNumber}</span>
							<span className="diff-line-content">{diffItem.content || ''}</span>
						</div>
					);
				})}
			</div>
		);
	};


	return (
		<div className="diff-highlighter">
			<div className="diff-editor-container">
				{isReadOnly ? (
					renderContentWithDiffHighlighting()
				) : (
					<textarea
						ref={(el) => onContentElementReady?.(el)}
						className="diff-editor-textarea"
						value={currentContent}
						onChange={(e) => handleContentChange(e.target.value)}
						style={{
							width: '100%',
							height: '300px',
							fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
							fontSize: '13px',
							lineHeight: '18px',
							border: 'none',
							outline: 'none',
							resize: 'none',
							padding: '8px'
						}}
					/>
				)}
			</div>
		</div>
	);
};
