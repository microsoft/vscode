/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ErdosAiMarkdownRenderer } from '../markdown/erdosAiMarkdownRenderer.js';

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
}

/**
 * React component that renders markdown content using VS Code's proven markdown renderer
 * This approach uses VS Code's MarkdownRenderer directly and safely manages DOM updates
 */
export const ErdosAiMarkdownComponent: React.FC<ErdosAiMarkdownProps> = ({ 
	content, 
	isStreaming = false, 
	renderer, 
	className 
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const renderResultRef = useRef<{ element: HTMLElement; dispose: () => void }>();
	const [renderError, setRenderError] = useState<string | null>(null);

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		
		// If no content, clear container but don't exit early - allow renderer setup
		if (!content.trim()) {
			// Clear container if no content
			while (containerRef.current.firstChild) {
				containerRef.current.removeChild(containerRef.current.firstChild);
			}
			return;
		}

		const container = containerRef.current;

		try {
			// Dispose previous render result
			if (renderResultRef.current) {
				renderResultRef.current.dispose();
			}

			// Create markdown string with proper VS Code options
			const markdownString = new MarkdownString(content, {
				isTrusted: true,
				supportHtml: true, // Enable HTML support for thinking blocks
				supportThemeIcons: true
			});

			// Render using VS Code's MarkdownRenderer
			const renderResult = renderer.render(markdownString, {
				// Enable code block syntax highlighting
				fillInIncompleteTokens: isStreaming
			}, {
				// Enable GitHub Flavored Markdown features and line breaks
				gfm: true,
				breaks: true
			});

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
			console.error('Failed to render markdown:', error);
			setRenderError(error instanceof Error ? error.message : 'Unknown error');
			
			// Fallback to plain text if markdown rendering fails
			container.textContent = content;
		}
	}, [content, renderer, isStreaming]);

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
