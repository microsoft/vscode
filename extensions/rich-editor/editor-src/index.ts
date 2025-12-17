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
		const md = nodeToMarkdown(node);
		if (md.trim() !== '') {
			results.push(md);
		}
	}
	return results.join('\n\n');
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

		default:
			return content ? content.map(n => inlineToMarkdown(n)).join('') : '';
	}
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

	// Blockquotes
	html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

	// Task lists (must be before regular unordered lists)
	html = html.replace(/^- \[x\] (.+)$/gm, '<li data-type="taskItem" data-checked="true">$1</li>');
	html = html.replace(/^- \[ \] (.+)$/gm, '<li data-type="taskItem" data-checked="false">$1</li>');
	html = html.replace(/(<li data-type="taskItem"[^>]*>.*<\/li>\n?)+/g, '<ul data-type="taskList">$&</ul>');

	// Unordered lists (items not already matched as tasks)
	html = html.replace(/^- ([^\[].*)$/gm, '<li>$1</li>');
	html = html.replace(/(<li>(?!.*data-type).*<\/li>\n?)+/g, '<ul>$&</ul>');

	// Paragraphs (lines not already wrapped)
	const lines = html.split('\n');
	html = lines.map(line => {
		// Skip empty lines entirely
		if (line.trim() === '') { return null; }
		// Skip lines that already have HTML tags
		if (line.match(/^<[a-z]/i)) { return line; }
		// Wrap plain text in paragraph
		return `<p>${line}</p>`;
	}).filter(line => line !== null).join('');

	return html;
}

/**
 * Simple Typst to HTML converter
 * TODO: Replace with proper parser
 */
function typstToHtml(typst: string): string {
	let html = typst;

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
		if (line.match(/^<[a-z]/i)) { return line; }
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

