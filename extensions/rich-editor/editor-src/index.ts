/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

// Declare VS Code API
declare const acquireVsCodeApi: () => {
	postMessage: (message: unknown) => void;
	getState: () => unknown;
	setState: (state: unknown) => void;
};

// Get VS Code API
const vscode = acquireVsCodeApi();

// Editor instance
let editor: Editor | null = null;

// Current format (markdown or typst)
let currentFormat: 'markdown' | 'typst' = 'markdown';

// Debounce timer for content updates
let updateTimer: ReturnType<typeof setTimeout> | null = null;

// Track last content we sent to avoid echo updates
let lastSentContent: string | null = null;

// Base URI for resolving relative resource paths (images, etc.)
let resourceBaseUri: string | null = null;
// Base URI for absolute paths (workspace root)
let workspaceRootUri: string | null = null;

/**
 * Resolve a relative resource path to an absolute webview URI
 */
function resolveResourcePath(path: string): string {
	// If it's already an absolute URL, return as-is
	if (path.startsWith('http://') || path.startsWith('https://') ||
		path.startsWith('vscode-resource://') || path.startsWith('vscode-webview://') ||
		path.startsWith('file+.vscode-resource')) {
		return path;
	}

	// Determine if path is absolute (starts with /) or relative
	const isAbsolutePath = path.startsWith('/');

	// Choose the appropriate base URI
	let base = isAbsolutePath ? workspaceRootUri : resourceBaseUri;

	if (!base) {
		return path;
	}

	// Remove trailing slash from base if present
	while (base.endsWith('/')) {
		base = base.slice(0, -1);
	}

	// Clean the path
	let cleanPath = path;
	if (cleanPath.startsWith('./')) {
		cleanPath = cleanPath.slice(2);
	}
	// Remove leading slashes for joining
	while (cleanPath.startsWith('/')) {
		cleanPath = cleanPath.slice(1);
	}

	return `${base}/${cleanPath}`;
}

/**
 * Initialize the TipTap editor
 */
function initEditor(): void {
	const editorElement = document.getElementById('editor');
	if (!editorElement) {
		console.error('Editor element not found');
		return;
	}

	// Clear loading message
	editorElement.innerHTML = '';

	// Create TipTap editor
	editor = new Editor({
		element: editorElement,
		extensions: [
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3, 4, 5, 6]
				}
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					target: '_blank',
					rel: 'noopener noreferrer'
				}
			}),
			Image,
			TaskList,
			TaskItem.configure({
				nested: true
			}),
			Table.configure({
				resizable: true,
				HTMLAttributes: {
					class: 'tiptap-table'
				}
			}),
			TableRow,
			TableCell,
			TableHeader,
			Placeholder.configure({
				placeholder: 'Start writing...'
			})
		],
		content: '',
		autofocus: true,
		editable: true,
		onUpdate: ({ editor }) => {
			// Debounce content updates
			if (updateTimer) {
				clearTimeout(updateTimer);
			}
			updateTimer = setTimeout(() => {
				sendContentUpdate(editor);
			}, 300);
		},
		onSelectionUpdate: () => {
			updateToolbarState();
			updateStatusBar();
		}
	});

	// Setup toolbar
	setupToolbar();

	// Setup keyboard shortcuts
	setupKeyboardShortcuts();

	// Setup link click handling
	setupLinkClickHandling();

	console.log('TipTap editor initialized');
}

/**
 * Setup click handling for links
 */
function setupLinkClickHandling(): void {
	const editorElement = document.getElementById('editor');
	if (!editorElement) { return; }

	editorElement.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;
		const link = target.closest('a');

		if (link && editor) {
			e.preventDefault();
			const href = link.getAttribute('href') || '';

			if (e.metaKey || e.ctrlKey) {
				// Cmd+click: Open link in browser
				vscode.postMessage({ type: 'openLink', url: href });
			} else {
				// Regular click: Edit link
				vscode.postMessage({ type: 'editLink', url: href });
			}
		}
	});
}

/**
 * Send content update to extension
 */
function sendContentUpdate(editorInstance: Editor): void {
	const content = serializeContent(editorInstance);
	lastSentContent = content;
	vscode.postMessage({
		type: 'update',
		content
	});
}

/**
 * Serialize editor content to the target format
 */
function serializeContent(editorInstance: Editor): string {
	if (currentFormat === 'markdown') {
		return serializeToMarkdown(editorInstance);
	} else {
		return serializeToTypst(editorInstance);
	}
}

/**
 * Serialize to Markdown
 * TODO: Use prosemirror-markdown for proper serialization
 */
function serializeToMarkdown(editorInstance: Editor): string {
	// For now, use a simple HTML-to-Markdown approach
	// This will be replaced with proper prosemirror-markdown serialization
	const json = editorInstance.getJSON();
	return jsonToMarkdown(json);
}

/**
 * Serialize to Typst
 * TODO: Implement proper Typst serialization
 */
function serializeToTypst(editorInstance: Editor): string {
	const json = editorInstance.getJSON();
	return jsonToTypst(json);
}

/**
 * Convert ProseMirror JSON to Markdown
 */
function jsonToMarkdown(doc: Record<string, unknown>): string {
	const content = doc.content as Array<Record<string, unknown>> | undefined;
	if (!content) { return ''; }

	const results: string[] = [];

	for (const node of content) {
		const nodeType = node.type as string;
		const md = nodeToMarkdown(node);

		// Empty paragraph represents a blank line in the original document
		if (nodeType === 'paragraph' && md.trim() === '') {
			// Only add blank line if we have previous content (avoid leading blank lines)
			if (results.length > 0) {
				results.push('');
			}
			continue;
		}

		// Skip truly empty nodes (no content at all)
		if (md === '') {
			continue;
		}

		// Add separator before this node
		if (results.length > 0) {
			// If last was a blank line (empty string in results), don't add another separator
			if (results[results.length - 1] !== '') {
				results.push(''); // This creates a blank line between blocks
			}
		}

		results.push(md);
	}

	return results.join('\n');
}

/**
 * Convert a single node to Markdown
 */
function nodeToMarkdown(node: Record<string, unknown>): string {
	const type = node.type as string;
	const content = node.content as Array<Record<string, unknown>> | undefined;
	const attrs = node.attrs as Record<string, unknown> | undefined;

	switch (type) {
		case 'paragraph':
			return content ? content.map(n => inlineToMarkdown(n)).join('') : '';

		case 'heading': {
			const level = (attrs?.level as number) || 1;
			const prefix = '#'.repeat(level) + ' ';
			const text = content ? content.map(n => inlineToMarkdown(n)).join('') : '';
			return prefix + text;
		}

		case 'bulletList':
			return content ? content.map(n => nodeToMarkdown(n)).join('\n') : '';

		case 'orderedList':
			return content ? content.map((n, i) => {
				const itemContent = nodeToMarkdown(n);
				// Replace the leading '- ' with numbered prefix
				return itemContent.replace(/^- /, `${i + 1}. `);
			}).join('\n') : '';

		case 'listItem': {
			// Extract text from paragraph children
			const itemText = content ? content.map(n => {
				if ((n.type as string) === 'paragraph') {
					const paraContent = n.content as Array<Record<string, unknown>> | undefined;
					return paraContent ? paraContent.map(c => inlineToMarkdown(c)).join('') : '';
				}
				return nodeToMarkdown(n);
			}).filter(t => t.trim() !== '').join(' ') : '';
			return '- ' + itemText;
		}

		case 'blockquote': {
			// Extract text from paragraph children, prefixing each with >
			const quoteLines = content ? content.map(n => {
				if ((n.type as string) === 'paragraph') {
					const paraContent = n.content as Array<Record<string, unknown>> | undefined;
					return paraContent ? paraContent.map(c => inlineToMarkdown(c)).join('') : '';
				}
				return nodeToMarkdown(n);
			}).filter(t => t.trim() !== '') : [];
			return quoteLines.map(line => '> ' + line).join('\n');
		}

		case 'codeBlock': {
			const language = (attrs?.language as string) || '';
			const code = content ? content.map(n => (n.text as string) || '').join('') : '';
			return '```' + language + '\n' + code + '\n```';
		}

		case 'horizontalRule':
			return '---';

		case 'image': {
			const src = (attrs?.src as string) || '';
			const alt = (attrs?.alt as string) || '';
			// If alt looks like a path (not starting with http/vscode), use it as the path
			// This is where we stored the original path during parsing
			let imagePath = src;
			if (alt && !alt.startsWith('http') && !alt.startsWith('vscode')) {
				imagePath = alt;
			}
			// If src is a webview URI, try to use alt instead
			if (src.includes('vscode-resource') || src.includes('vscode-webview')) {
				if (alt && !alt.startsWith('http') && !alt.startsWith('vscode')) {
					imagePath = alt;
				}
			}
			// Return with empty alt if path was stored there
			const displayAlt = (alt === imagePath) ? '' : alt;
			return `![${displayAlt}](${imagePath})`;
		}

		case 'taskList':
			return content ? content.map(n => nodeToMarkdown(n)).join('\n') : '';

		case 'taskItem': {
			const checked = (attrs?.checked as boolean) || false;
			const checkbox = checked ? '[x] ' : '[ ] ';
			// Extract text from paragraph children
			const itemText = content ? content.map(n => {
				if ((n.type as string) === 'paragraph') {
					const paraContent = n.content as Array<Record<string, unknown>> | undefined;
					return paraContent ? paraContent.map(c => inlineToMarkdown(c)).join('') : '';
				}
				return inlineToMarkdown(n);
			}).filter(t => t.trim() !== '').join(' ') : '';
			return '- ' + checkbox + itemText;
		}

		case 'table': {
			if (!content) { return ''; }
			const rows = content.map(row => tableRowToMarkdown(row));
			// Insert separator row after header (first row)
			if (rows.length > 0) {
				const firstRow = content[0];
				const firstRowContent = firstRow.content as Array<Record<string, unknown>> | undefined;
				const colCount = firstRowContent ? firstRowContent.length : 0;
				const separator = '|' + ' --- |'.repeat(colCount);
				rows.splice(1, 0, separator);
			}
			return rows.join('\n');
		}

		default:
			return content ? content.map(n => inlineToMarkdown(n)).join('') : '';
	}
}

/**
 * Convert a table row to Markdown
 */
function tableRowToMarkdown(row: Record<string, unknown>): string {
	const content = row.content as Array<Record<string, unknown>> | undefined;
	if (!content) { return '|'; }

	const cells = content.map(cell => {
		const cellContent = cell.content as Array<Record<string, unknown>> | undefined;
		if (!cellContent) { return ''; }
		// Extract text from paragraph inside cell
		const cellText = cellContent.map(node => {
			if ((node.type as string) === 'paragraph') {
				const paraContent = node.content as Array<Record<string, unknown>> | undefined;
				return paraContent ? paraContent.map(c => inlineToMarkdown(c)).join('') : '';
			}
			return '';
		}).join('');
		return cellText;
	});

	return '| ' + cells.join(' | ') + ' |';
}

/**
 * Convert inline content to Markdown
 */
function inlineToMarkdown(node: Record<string, unknown>): string {
	if (node.type === 'text') {
		let text = (node.text as string) || '';
		const marks = node.marks as Array<Record<string, unknown>> | undefined;

		if (marks) {
			for (const mark of marks) {
				const markType = mark.type as string;
				switch (markType) {
					case 'bold':
						text = `**${text}**`;
						break;
					case 'italic':
						text = `_${text}_`;
						break;
					case 'strike':
						text = `~~${text}~~`;
						break;
					case 'code':
						text = `\`${text}\``;
						break;
					case 'link': {
						const href = (mark.attrs as Record<string, unknown>)?.href as string || '';
						text = `[${text}](${href})`;
						break;
					}
				}
			}
		}
		return text;
	}

	if (node.type === 'hardBreak') {
		return '\n';
	}

	return '';
}

/**
 * Convert ProseMirror JSON to Typst
 */
function jsonToTypst(doc: Record<string, unknown>): string {
	const content = doc.content as Array<Record<string, unknown>> | undefined;
	if (!content) { return ''; }

	return content.map(node => nodeToTypst(node)).join('\n\n');
}

/**
 * Convert a single node to Typst
 */
function nodeToTypst(node: Record<string, unknown>): string {
	const type = node.type as string;
	const content = node.content as Array<Record<string, unknown>> | undefined;
	const attrs = node.attrs as Record<string, unknown> | undefined;

	switch (type) {
		case 'paragraph':
			return content ? content.map(n => inlineToTypst(n)).join('') : '';

		case 'heading': {
			const level = (attrs?.level as number) || 1;
			const prefix = '='.repeat(level) + ' ';
			const text = content ? content.map(n => inlineToTypst(n)).join('') : '';
			return prefix + text;
		}

		case 'bulletList':
			return content ? content.map(n => '- ' + nodeToTypst(n)).join('\n') : '';

		case 'orderedList':
			return content ? content.map(n => '+ ' + nodeToTypst(n)).join('\n') : '';

		case 'listItem':
			return content ? content.map(n => nodeToTypst(n)).join('\n') : '';

		case 'blockquote':
			return content ? '#quote[' + content.map(n => nodeToTypst(n)).join('\n') + ']' : '';

		case 'codeBlock': {
			const language = (attrs?.language as string) || '';
			const code = content ? content.map(n => (n.text as string) || '').join('') : '';
			return '```' + language + '\n' + code + '\n```';
		}

		case 'horizontalRule':
			return '#line(length: 100%)';

		case 'image': {
			const src = (attrs?.src as string) || '';
			const alt = (attrs?.alt as string) || '';
			// Prefer alt (original path) over src
			let imagePath = src;
			if (alt && !alt.startsWith('http') && !alt.startsWith('vscode')) {
				imagePath = alt;
			}
			// Strip webview URI prefix if present
			if (imagePath.includes('vscode-resource')) {
				const parts = imagePath.split('/');
				imagePath = parts[parts.length - 1];
			}
			return `#image("${imagePath}")`;
		}

		case 'table': {
			if (!content) { return ''; }
			// Get column count from first row
			const firstRow = content[0];
			const firstRowContent = firstRow?.content as Array<Record<string, unknown>> | undefined;
			const colCount = firstRowContent ? firstRowContent.length : 0;

			// Collect all cell contents
			const cells: string[] = [];
			content.forEach(row => {
				const rowContent = row.content as Array<Record<string, unknown>> | undefined;
				if (rowContent) {
					rowContent.forEach(cell => {
						const cellContent = cell.content as Array<Record<string, unknown>> | undefined;
						if (cellContent) {
							const cellText = cellContent.map(node => {
								if ((node.type as string) === 'paragraph') {
									const paraContent = node.content as Array<Record<string, unknown>> | undefined;
									return paraContent ? paraContent.map(c => inlineToTypst(c)).join('') : '';
								}
								return '';
							}).join('');
							cells.push(`[${cellText}]`);
						} else {
							cells.push('[]');
						}
					});
				}
			});

			return `#table(\n  columns: ${colCount},\n  ${cells.join(', ')}\n)`;
		}

		default:
			return content ? content.map(n => inlineToTypst(n)).join('') : '';
	}
}

/**
 * Convert inline content to Typst
 */
function inlineToTypst(node: Record<string, unknown>): string {
	if (node.type === 'text') {
		let text = (node.text as string) || '';
		const marks = node.marks as Array<Record<string, unknown>> | undefined;

		if (marks) {
			for (const mark of marks) {
				const markType = mark.type as string;
				switch (markType) {
					case 'bold':
						text = `*${text}*`;
						break;
					case 'italic':
						text = `_${text}_`;
						break;
					case 'strike':
						text = `#strike[${text}]`;
						break;
					case 'code':
						text = `\`${text}\``;
						break;
					case 'link': {
						const href = (mark.attrs as Record<string, unknown>)?.href as string || '';
						text = `#link("${href}")[${text}]`;
						break;
					}
				}
			}
		}
		return text;
	}

	if (node.type === 'hardBreak') {
		return '\n';
	}

	return '';
}

/**
 * Parse content from source format to TipTap
 */
function parseContent(content: string, format: 'markdown' | 'typst'): void {
	if (!editor) { return; }

	if (format === 'markdown') {
		// For now, set as HTML - TipTap will parse it
		// TODO: Use prosemirror-markdown parser
		editor.commands.setContent(markdownToHtml(content));
	} else {
		// Parse Typst
		editor.commands.setContent(typstToHtml(content));
	}
}

/**
 * Parse Markdown tables to HTML
 */
function parseMarkdownTables(html: string): string {
	// Match table blocks: lines that start with |
	const lines = html.split('\n');
	const result: string[] = [];
	let tableLines: string[] = [];
	let inTable = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Check if this is a table line
		if (line.startsWith('|') && line.endsWith('|')) {
			inTable = true;
			tableLines.push(line);
		} else {
			// End of table
			if (inTable && tableLines.length > 0) {
				result.push(convertTableLinesToHtml(tableLines));
				tableLines = [];
				inTable = false;
			}
			result.push(lines[i]);
		}
	}

	// Handle table at end of document
	if (inTable && tableLines.length > 0) {
		result.push(convertTableLinesToHtml(tableLines));
	}

	return result.join('\n');
}

/**
 * Convert table lines to HTML
 */
function convertTableLinesToHtml(lines: string[]): string {
	if (lines.length < 2) { return lines.join('\n'); }

	// Check if second line is separator (contains ---)
	const isSeparator = lines[1].includes('---');
	const hasHeader = isSeparator;

	// Remove separator line
	const dataLines = hasHeader ? [lines[0], ...lines.slice(2)] : lines;

	let tableHtml = '<table>';

	dataLines.forEach((line, index) => {
		// Parse cells from | cell1 | cell2 |
		const cells = line
			.replace(/^\|/, '')
			.replace(/\|$/, '')
			.split('|')
			.map(cell => cell.trim());

		if (index === 0 && hasHeader) {
			// Header row
			tableHtml += '<tr>';
			cells.forEach(cell => {
				tableHtml += `<th><p>${cell}</p></th>`;
			});
			tableHtml += '</tr>';
		} else {
			// Data row
			tableHtml += '<tr>';
			cells.forEach(cell => {
				tableHtml += `<td><p>${cell}</p></td>`;
			});
			tableHtml += '</tr>';
		}
	});

	tableHtml += '</table>';
	return tableHtml;
}

/**
 * Simple Markdown to HTML converter
 * TODO: Replace with proper parser
 */
function markdownToHtml(markdown: string): string {
	let html = markdown;

	// Headers
	html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
	html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
	html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
	html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
	html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
	html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

	// Bold and Italic
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/_(.+?)_/g, '<em>$1</em>');

	// Strikethrough
	html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

	// Links
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	// Images - resolve relative paths using resourceBaseUri
	html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
		const resolvedSrc = resolveResourcePath(src);
		// Store original path in alt if no alt text provided (for serialization)
		const altText = alt || src;
		return `<img src="${resolvedSrc}" alt="${altText}">`;
	});

	// Horizontal rule
	html = html.replace(/^---$/gm, '<hr>');
	html = html.replace(/^\*\*\*$/gm, '<hr>');

	// Tables - parse markdown tables to HTML
	html = parseMarkdownTables(html);

	// Blockquotes
	html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

	// Task lists (must be before regular unordered lists)
	// Use .* instead of .+ to allow empty task items like "- [ ]"
	// TipTap expects list items to contain a <p> element
	html = html.replace(/^- \[x\] ?(.*)$/gm, '<li data-type="taskItem" data-checked="true"><p>$1</p></li>');
	html = html.replace(/^- \[ \] ?(.*)$/gm, '<li data-type="taskItem" data-checked="false"><p>$1</p></li>');
	html = html.replace(/(<li data-type="taskItem"[^>]*>.*<\/li>\n?)+/g, '<ul data-type="taskList">$&</ul>');

	// Ordered lists (1. item, 2. item, etc.) - must be before unordered lists
	// TipTap expects list items to contain a <p> element
	html = html.replace(/^(\d+)\. (.*)$/gm, '<li data-type="orderedItem"><p>$2</p></li>');
	html = html.replace(/(<li data-type="orderedItem">.*<\/li>\n?)+/g, '<ol>$&</ol>');
	// Clean up the data-type attribute after wrapping
	html = html.replace(/data-type="orderedItem"/g, '');

	// Unordered lists (items not already matched as tasks)
	// Match lines starting with "- " that weren't already converted to task items
	// TipTap expects list items to contain a <p> element
	html = html.replace(/^- (.*)$/gm, (match, content) => {
		// Skip if this line was already processed (contains li tags)
		if (match.includes('<li')) { return match; }
		return `<li><p>${content}</p></li>`;
	});
	html = html.replace(/(<li>(?!.*data-type).*<\/li>\n?)+/g, '<ul>$&</ul>');

	// Paragraphs (lines not already wrapped)
	const lines = html.split('\n');
	html = lines.map(line => {
		// Preserve empty lines as empty paragraphs (blank lines in original markdown)
		if (line.trim() === '') { return '<p></p>'; }
		// Skip lines that already have HTML tags (both opening and closing tags)
		if (line.match(/^<\/?[a-z]/i)) { return line; }
		// Wrap plain text in paragraph
		return `<p>${line}</p>`;
	}).join('');

	return html;
}

/**
 * Parse Typst table syntax to HTML
 * Handles: #table(columns: N, [cell1], [cell2], ...)
 */
function parseTypstTables(typst: string): string {
	// Match #table(...) blocks - handle multiline
	const tableRegex = /#table\s*\(\s*columns:\s*(\d+)\s*,\s*([\s\S]*?)\s*\)/g;

	return typst.replace(tableRegex, (_match, colCountStr, cellsStr) => {
		const colCount = parseInt(colCountStr, 10);

		// Extract cell contents from [content] patterns
		const cellRegex = /\[([^\]]*)\]/g;
		const cells: string[] = [];
		let cellMatch;
		while ((cellMatch = cellRegex.exec(cellsStr)) !== null) {
			cells.push(cellMatch[1]);
		}

		if (cells.length === 0 || colCount === 0) {
			return _match; // Return original if parsing fails
		}

		// Build HTML table
		let tableHtml = '<table>';
		const rowCount = Math.ceil(cells.length / colCount);

		for (let row = 0; row < rowCount; row++) {
			tableHtml += '<tr>';
			for (let col = 0; col < colCount; col++) {
				const cellIndex = row * colCount + col;
				const cellContent = cellIndex < cells.length ? cells[cellIndex] : '';
				// First row as header
				if (row === 0) {
					tableHtml += `<th><p>${cellContent}</p></th>`;
				} else {
					tableHtml += `<td><p>${cellContent}</p></td>`;
				}
			}
			tableHtml += '</tr>';
		}

		tableHtml += '</table>';
		return tableHtml;
	});
}

/**
 * Simple Typst to HTML converter
 * TODO: Replace with proper parser
 */
function typstToHtml(typst: string): string {
	let html = typst;

	// Tables - parse #table(...) syntax FIRST before other processing
	html = parseTypstTables(html);

	// Headers (= Heading)
	html = html.replace(/^====== (.+)$/gm, '<h6>$1</h6>');
	html = html.replace(/^===== (.+)$/gm, '<h5>$1</h5>');
	html = html.replace(/^==== (.+)$/gm, '<h4>$1</h4>');
	html = html.replace(/^=== (.+)$/gm, '<h3>$1</h3>');
	html = html.replace(/^== (.+)$/gm, '<h2>$1</h2>');
	html = html.replace(/^= (.+)$/gm, '<h1>$1</h1>');

	// Bold (*text*)
	html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

	// Italic (_text_)
	html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

	// Links #link("url")[text]
	html = html.replace(/#link\("([^"]+)"\)\[([^\]]+)\]/g, '<a href="$1">$2</a>');

	// Images #image("path") - resolve relative paths
	html = html.replace(/#image\("([^"]+)"\)/g, (_match, src) => {
		const resolvedSrc = resolveResourcePath(src);
		// Store original path in alt for serialization
		return `<img src="${resolvedSrc}" alt="${src}">`;
	});

	// Strike #strike[text]
	html = html.replace(/#strike\[([^\]]+)\]/g, '<s>$1</s>');

	// Unordered lists (- item)
	html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

	// Ordered lists (+ item)
	html = html.replace(/^\+ (.+)$/gm, '<li>$1</li>');

	// Wrap lists
	html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

	// Paragraphs
	const lines = html.split('\n');
	html = lines.map(line => {
		if (line.trim() === '') { return ''; }
		if (line.match(/^<\/?[a-z]/i)) { return line; }
		return `<p>${line}</p>`;
	}).join('\n');

	return html;
}

/**
 * Setup toolbar button handlers
 */
function setupToolbar(): void {
	const toolbar = document.getElementById('toolbar');
	if (!toolbar || !editor) { return; }

	toolbar.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;
		const button = target.closest('.toolbar-button') as HTMLElement;
		if (!button || !editor) { return; }

		const command = button.dataset.command;
		if (!command) { return; }

		// Prevent focus loss
		e.preventDefault();

		executeCommand(command);
		editor.commands.focus();
	});

	// Prevent toolbar from stealing focus
	toolbar.addEventListener('mousedown', (e) => {
		e.preventDefault();
	});
}

/**
 * Execute a toolbar command
 */
function executeCommand(command: string): void {
	if (!editor) { return; }

	switch (command) {
		case 'bold':
			editor.chain().focus().toggleBold().run();
			break;
		case 'italic':
			editor.chain().focus().toggleItalic().run();
			break;
		case 'strike':
			editor.chain().focus().toggleStrike().run();
			break;
		case 'code':
			editor.chain().focus().toggleCode().run();
			break;
		case 'heading1':
			editor.chain().focus().toggleHeading({ level: 1 }).run();
			break;
		case 'heading2':
			editor.chain().focus().toggleHeading({ level: 2 }).run();
			break;
		case 'heading3':
			editor.chain().focus().toggleHeading({ level: 3 }).run();
			break;
		case 'bulletList':
			editor.chain().focus().toggleBulletList().run();
			break;
		case 'orderedList':
			editor.chain().focus().toggleOrderedList().run();
			break;
		case 'taskList':
			editor.chain().focus().toggleTaskList().run();
			break;
		case 'blockquote':
			editor.chain().focus().toggleBlockquote().run();
			break;
		case 'horizontalRule':
			editor.chain().focus().setHorizontalRule().run();
			break;
		case 'link': {
			// Request URL from extension (prompt doesn't work in sandboxed webview)
			vscode.postMessage({ type: 'requestLink' });
			break;
		}
		case 'image': {
			// Request image from extension (file picker)
			vscode.postMessage({ type: 'requestImage' });
			break;
		}
		case 'undo':
			editor.chain().focus().undo().run();
			break;
		case 'redo':
			editor.chain().focus().redo().run();
			break;
		case 'insertTable':
			// Request table dimensions from extension
			vscode.postMessage({ type: 'requestTable' });
			break;
		case 'addColumnBefore':
			editor.chain().focus().addColumnBefore().run();
			break;
		case 'addColumnAfter':
			editor.chain().focus().addColumnAfter().run();
			break;
		case 'deleteColumn':
			editor.chain().focus().deleteColumn().run();
			break;
		case 'addRowBefore':
			editor.chain().focus().addRowBefore().run();
			break;
		case 'addRowAfter':
			editor.chain().focus().addRowAfter().run();
			break;
		case 'deleteRow':
			editor.chain().focus().deleteRow().run();
			break;
		case 'deleteTable':
			editor.chain().focus().deleteTable().run();
			break;
		case 'toggleHeaderRow':
			editor.chain().focus().toggleHeaderRow().run();
			break;
	}

	updateToolbarState();
}

/**
 * Update toolbar button states
 */
function updateToolbarState(): void {
	if (!editor) { return; }

	const buttons = document.querySelectorAll('.toolbar-button[data-command]');
	buttons.forEach(button => {
		const command = (button as HTMLElement).dataset.command;
		if (!command) { return; }

		let isActive = false;
		switch (command) {
			case 'bold':
				isActive = editor!.isActive('bold');
				break;
			case 'italic':
				isActive = editor!.isActive('italic');
				break;
			case 'strike':
				isActive = editor!.isActive('strike');
				break;
			case 'code':
				isActive = editor!.isActive('code');
				break;
			case 'heading1':
				isActive = editor!.isActive('heading', { level: 1 });
				break;
			case 'heading2':
				isActive = editor!.isActive('heading', { level: 2 });
				break;
			case 'heading3':
				isActive = editor!.isActive('heading', { level: 3 });
				break;
			case 'bulletList':
				isActive = editor!.isActive('bulletList');
				break;
			case 'orderedList':
				isActive = editor!.isActive('orderedList');
				break;
			case 'taskList':
				isActive = editor!.isActive('taskList');
				break;
			case 'blockquote':
				isActive = editor!.isActive('blockquote');
				break;
		}

		button.classList.toggle('active', isActive);
	});
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(): void {
	// Most shortcuts are handled by TipTap's StarterKit
	// Add any custom ones here

	// Use capture phase to intercept Tab before TipTap handles it
	document.addEventListener('keydown', (e) => {
		// Cmd+S to save
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			vscode.postMessage({ type: 'save' });
		}

		// Cmd+K for link
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			executeCommand('link');
		}

		// Tab for indent in lists
		if (e.key === 'Tab' && !e.shiftKey && editor) {
			const isInList = editor.isActive('listItem') || editor.isActive('taskItem');
			if (isInList) {
				e.preventDefault();
				e.stopPropagation();
				// Try to sink the appropriate list item type
				if (editor.isActive('taskItem')) {
					editor.chain().focus().sinkListItem('taskItem').run();
				} else {
					editor.chain().focus().sinkListItem('listItem').run();
				}
			}
		}

		// Shift+Tab for outdent in lists
		if (e.key === 'Tab' && e.shiftKey && editor) {
			const isInList = editor.isActive('listItem') || editor.isActive('taskItem');
			if (isInList) {
				e.preventDefault();
				e.stopPropagation();
				// Try to lift the appropriate list item type
				if (editor.isActive('taskItem')) {
					editor.chain().focus().liftListItem('taskItem').run();
				} else {
					editor.chain().focus().liftListItem('listItem').run();
				}
			}
		}
	}, { capture: true }); // Use capture phase to handle Tab before TipTap
}

/**
 * Update status bar
 */
function updateStatusBar(): void {
	if (!editor) { return; }

	const leftStatus = document.getElementById('status-left');
	const rightStatus = document.getElementById('status-right');

	if (leftStatus) {
		const { from } = editor.state.selection;
		const pos = editor.view.state.doc.resolve(from);
		// Simple line count approximation
		leftStatus.textContent = `Pos: ${from}`;
	}

	if (rightStatus) {
		const text = editor.getText();
		const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
		const chars = text.length;
		rightStatus.textContent = `${words} words, ${chars} chars`;
	}
}

/**
 * Handle messages from extension
 */
window.addEventListener('message', (event) => {
	const message = event.data;

	switch (message.type) {
		case 'load':
			currentFormat = message.format || 'markdown';
			// Store resource base URIs for resolving paths
			if (message.resourceBaseUri) {
				resourceBaseUri = message.resourceBaseUri;
			}
			if (message.workspaceRootUri) {
				workspaceRootUri = message.workspaceRootUri;
			}
			if (editor && message.content !== undefined) {
				// Skip if this is just our own content echoing back
				if (lastSentContent !== null && message.content === lastSentContent) {
					lastSentContent = null; // Reset after checking
					return;
				}
				lastSentContent = null;
				parseContent(message.content, currentFormat);
				updateToolbarState();
				updateStatusBar();
			}
			break;

		case 'setTheme':
			// Theme is handled by CSS variables from VS Code
			break;

		case 'setLink':
			// Apply link from extension input
			if (editor && message.url) {
				editor.chain().focus().setLink({ href: message.url }).run();
			}
			break;

		case 'setImage':
			// Insert image from file picker
			if (editor && message.src) {
				editor.chain().focus().setImage({
					src: message.src,
					alt: message.alt || ''
				}).run();
			}
			break;

		case 'insertTable':
			// Insert table with specified dimensions
			if (editor && message.rows && message.cols) {
				editor.chain().focus().insertTable({
					rows: message.rows,
					cols: message.cols,
					withHeaderRow: true
				}).run();
			}
			break;
	}
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		initEditor();
		vscode.postMessage({ type: 'ready' });
	});
} else {
	initEditor();
	vscode.postMessage({ type: 'ready' });
}

