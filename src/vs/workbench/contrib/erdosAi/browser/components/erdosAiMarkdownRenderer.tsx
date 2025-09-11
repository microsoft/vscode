/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ErdosAiMarkdownRenderer } from '../markdown/erdosAiMarkdownRenderer.js';
import { CodeLinkProcessor } from '../../../../services/erdosAiConversation/browser/codeLinkProcessor.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

export interface ErdosAiMarkdownProps {
	/**
	 * The markdown content to render
	 */
	content: string;

	/**
	 * Whether this content is still being streamed (affects rendering behavior)
	 */
	isStreaming?: boolean;

	/**
	 * The markdown renderer instance
	 */
	renderer: ErdosAiMarkdownRenderer;

	/**
	 * Additional CSS class name
	 */
	className?: string;

	/**
	 * Message ID for linking storage
	 */
	messageId?: number;
}

/**
 * React component that renders markdown content using VS Code's proven markdown renderer
 * This approach uses VS Code's MarkdownRenderer directly and safely manages DOM updates
 */
export const ErdosAiMarkdownComponent: React.FC<ErdosAiMarkdownProps> = ({ 
	content, 
	isStreaming = false, 
	renderer, 
	className,
	messageId 
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const renderResultRef = useRef<{ element: HTMLElement; dispose: () => void }>();
	const [renderError, setRenderError] = useState<string | null>(null);
	const [processedContent, setProcessedContent] = useState(content);

	// Process code links when content changes
	useEffect(() => {
		if (!content.trim() || !messageId) {
			setProcessedContent(content);
			return;
		}

		// Process code links asynchronously (handles caching internally)
		CodeLinkProcessor.processCodeLinks(content, messageId).then(links => {
			// Create processed content with clickable links using command protocol
			let processed = content;
			for (const link of links) {
				const pattern = new RegExp(`\`${escapeRegExp(link.text)}\``, 'g');
				const replacement = `[\`${link.text}\`](command:erdosAi.openFile?${encodeURIComponent(JSON.stringify([link.filePath]))})`;
				processed = processed.replace(pattern, replacement);
			}
			setProcessedContent(processed);
		}).catch(error => {
			console.error('[ErdosAiMarkdownComponent] Error processing code links:', error);
			setProcessedContent(content);
		});
	}, [content, messageId]);

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		
		// Create disposable store for this render lifecycle
		const disposableStore = new DisposableStore();
		
		// If no content, clear container but don't exit early - allow renderer setup
		if (!processedContent.trim()) {
			// Clear container if no content
			while (containerRef.current.firstChild) {
				containerRef.current.removeChild(containerRef.current.firstChild);
			}
			return () => disposableStore.dispose();
		}

		const container = containerRef.current;

		try {
			// Dispose previous render result
			if (renderResultRef.current) {
				renderResultRef.current.dispose();
			}

			// Create markdown string with proper VS Code options
			const markdownString = new MarkdownString(processedContent, {
				isTrusted: true,
				supportHtml: true, // Enable HTML support for thinking blocks
				supportThemeIcons: true
			});

			// Render using VS Code's MarkdownRenderer with actionHandler for code links
			const renderResult = disposableStore.add(renderer.render(markdownString, {
				// Enable code block syntax highlighting
				fillInIncompleteTokens: isStreaming,
				// Handle clicks on code links
				actionHandler: {
					callback: (content: string) => {
						if (content.startsWith('command:erdosAi.openFile?')) {
							try {
								const queryString = content.substring('command:erdosAi.openFile?'.length);
								const args = JSON.parse(decodeURIComponent(queryString));
								const filePath = args[0];
								CodeLinkProcessor.openFile(filePath);
							} catch (error) {
								console.error(`[ErdosAiMarkdownComponent] Error parsing command arguments:`, error);
							}
						}
					},
					disposables: disposableStore
				}
			}, {
				// Enable GitHub Flavored Markdown features and line breaks
				gfm: true,
				breaks: true,
				// Ensure proper inline parsing
				pedantic: false
			}));

			// Clear container and append the properly rendered element
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			
			// VS Code's MarkdownRenderer returns a properly sanitized DOM element
			container.appendChild(renderResult.element);

			// Store render result for cleanup
			renderResultRef.current = renderResult;

			// Clear any previous errors
			setRenderError(null);

		} catch (error) {
			console.error(`[ErdosAiMarkdownComponent] Error during markdown rendering:`, error);
			setRenderError(error instanceof Error ? error.message : 'Unknown error');
			
			// Fallback to plain text if markdown rendering fails
			container.textContent = processedContent;
		}

		// Return cleanup function to dispose all resources
		return () => {
			disposableStore.dispose();
		};
	}, [processedContent, renderer, isStreaming]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (renderResultRef.current) {
				renderResultRef.current.dispose();
			}
		};
	}, []);

	if (renderError) {
		return (
			<div className={className}>
				<div className="erdos-ai-markdown-error">
					Markdown render error: {renderError}
				</div>
				<pre className="erdos-ai-markdown-fallback">{content}</pre>
			</div>
		);
	}

	return (
		<div 
			ref={containerRef} 
			className={`erdos-ai-markdown ${className || ''} ${isStreaming ? 'streaming' : ''}`}
		/>
	);
};

/**
 * Escape special regex characters
 */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
