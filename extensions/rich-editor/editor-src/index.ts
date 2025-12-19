/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * Custom Image extension that uses addNodeView to control image rendering.
 * This allows us to resolve the src URL BEFORE the browser attempts to load it,
 * avoiding 401 errors in webview environments.
 */
const CustomImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			src: {
				default: null,
				parseHTML: element => element.getAttribute('src'),
				renderHTML: attributes => {
					if (!attributes.src) {
						return {};
					}
					return { src: attributes.src };
				},
			},
			alt: {
				default: null,
				parseHTML: element => element.getAttribute('alt'),
				renderHTML: attributes => {
					if (!attributes.alt) {
						return {};
					}
					return { alt: attributes.alt };
				},
			},
			title: {
				default: null,
				parseHTML: element => element.getAttribute('title'),
				renderHTML: attributes => {
					if (!attributes.title) {
						return {};
					}
					return { title: attributes.title };
				},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'img[src]',
				getAttrs: (node) => {
					const element = node as HTMLElement;
					return {
						src: element.getAttribute('src'),
						alt: element.getAttribute('alt'),
						title: element.getAttribute('title'),
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
	},

	/**
	 * Custom NodeView that resolves the image src before assigning it to the DOM element.
	 * This is the key to avoiding 401 errors - we control when and what src is set.
	 */
	addNodeView() {
		return ({ node, HTMLAttributes }) => {
			const img = document.createElement('img');

			// Get the original src and alt
			const originalSrc = node.attrs.src || HTMLAttributes.src || '';
			const alt = node.attrs.alt || HTMLAttributes.alt || '';
			const title = node.attrs.title || HTMLAttributes.title || '';

			// Set alt and title immediately
			if (alt) {
				img.setAttribute('alt', alt);
			}
			if (title) {
				img.setAttribute('title', title);
			}

			// Apply any additional HTML attributes from options
			const mergedAttrs = mergeAttributes(this.options.HTMLAttributes || {}, HTMLAttributes);
			Object.entries(mergedAttrs).forEach(([key, value]) => {
				if (key !== 'src' && key !== 'alt' && key !== 'title' && value !== null && value !== undefined) {
					img.setAttribute(key, String(value));
				}
			});

			// Resolve the src using our custom resolver
			// This happens BEFORE we set the src attribute, so the browser
			// never tries to load the unresolved URL
			const resolvedSrc = resolveImageSrc(originalSrc, alt);
			if (resolvedSrc) {
				img.setAttribute('src', resolvedSrc);
			}

			return {
				dom: img,
				update: (updatedNode) => {
					if (updatedNode.type.name !== 'image') {
						return false;
					}

					// Update src if changed
					const newSrc = updatedNode.attrs.src || '';
					const newAlt = updatedNode.attrs.alt || '';
					const newResolvedSrc = resolveImageSrc(newSrc, newAlt);

					if (newResolvedSrc && img.getAttribute('src') !== newResolvedSrc) {
						img.setAttribute('src', newResolvedSrc);
					}

					// Update alt if changed
					if (newAlt !== img.getAttribute('alt')) {
						img.setAttribute('alt', newAlt);
					}

					// Update title if changed
					const newTitle = updatedNode.attrs.title || '';
					if (newTitle !== img.getAttribute('title')) {
						if (newTitle) {
							img.setAttribute('title', newTitle);
						} else {
							img.removeAttribute('title');
						}
					}

					return true;
				},
			};
		};
	},
});

/**
 * Resolve image src - called from the NodeView before setting the src attribute.
 * This is the proper place to do URL resolution as it happens BEFORE the browser
 * attempts to load the image.
 */
function resolveImageSrc(src: string, alt: string): string {
	// If src is empty, try alt (which may contain the original path)
	const pathToResolve = src || alt;

	if (!pathToResolve) {
		return '';
	}

	// If it's already a data URL, use it directly
	if (pathToResolve.startsWith('data:')) {
		return pathToResolve;
	}

	// If it's already an absolute URL that looks resolved, use it
	if (pathToResolve.startsWith('http://') ||
		pathToResolve.startsWith('https://') ||
		pathToResolve.startsWith('vscode-resource') ||
		pathToResolve.startsWith('vscode-webview') ||
		pathToResolve.startsWith('file+.vscode-resource')) {
		return pathToResolve;
	}

	// Resolve using our resource path resolver
	// This will return a data URL if available, or resolve the path appropriately
	return resolveResourcePath(pathToResolve);
}
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import katex from 'katex';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/**
 * Convert Typst math syntax to LaTeX for KaTeX rendering
 * Handles common Typst math functions and syntax
 */
function typstMathToLatex(typstMath: string): string {
	let latex = typstMath;

	// Function conversions: func(args) → \func{args}
	// Handle nested parentheses properly

	// sqrt(x) → \sqrt{x}
	latex = latex.replace(/\bsqrt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '\\sqrt{$1}');

	// frac(a, b) → \frac{a}{b}
	latex = latex.replace(/\bfrac\(([^,]+),\s*([^)]+)\)/g, '\\frac{$1}{$2}');

	// sum → \sum (standalone)
	latex = latex.replace(/\bsum\b(?!\()/g, '\\sum');

	// prod → \prod
	latex = latex.replace(/\bprod\b(?!\()/g, '\\prod');

	// integral → \int
	latex = latex.replace(/\bintegral\b/g, '\\int');

	// infinity, oo → \infty
	latex = latex.replace(/\binfinity\b/g, '\\infty');
	latex = latex.replace(/\boo\b/g, '\\infty');

	// Common Greek letters
	const greekLetters = [
		'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
		'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
		'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
		'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
		'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
		'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
	];
	for (const letter of greekLetters) {
		const regex = new RegExp(`\\b${letter}\\b`, 'g');
		latex = latex.replace(regex, `\\${letter}`);
	}

	// Subscript: x_n or x_(n+1) → x_{n} or x_{n+1}
	// First handle x_(content)
	latex = latex.replace(/_\(([^)]+)\)/g, '_{$1}');
	// Then handle single character subscripts that aren't already braced
	latex = latex.replace(/_([a-zA-Z0-9])(?![{])/g, '_{$1}');

	// Superscript: x^n or x^(n+1) → x^{n} or x^{n+1}
	// First handle x^(content)
	latex = latex.replace(/\^\(([^)]+)\)/g, '^{$1}');
	// Then handle single character superscripts that aren't already braced
	latex = latex.replace(/\^([a-zA-Z0-9])(?![{])/g, '^{$1}');

	// sin, cos, tan, etc. → \sin, \cos, \tan
	const trigFunctions = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'min', 'max'];
	for (const func of trigFunctions) {
		const regex = new RegExp(`\\b${func}\\b(?!\\\\)`, 'g');
		latex = latex.replace(regex, `\\${func}`);
	}

	// vec(x) → \vec{x}
	latex = latex.replace(/\bvec\(([^)]+)\)/g, '\\vec{$1}');

	// hat(x) → \hat{x}
	latex = latex.replace(/\bhat\(([^)]+)\)/g, '\\hat{$1}');

	// bar(x) → \bar{x}
	latex = latex.replace(/\bbar\(([^)]+)\)/g, '\\bar{$1}');

	// dot(x) → \dot{x}
	latex = latex.replace(/\bdot\(([^)]+)\)/g, '\\dot{$1}');

	// ddot(x) → \ddot{x}
	latex = latex.replace(/\bddot\(([^)]+)\)/g, '\\ddot{$1}');

	// tilde(x) → \tilde{x}
	latex = latex.replace(/\btilde\(([^)]+)\)/g, '\\tilde{$1}');

	// abs(x) → |x|
	latex = latex.replace(/\babs\(([^)]+)\)/g, '|$1|');

	// norm(x) → \|x\|
	latex = latex.replace(/\bnorm\(([^)]+)\)/g, '\\|$1\\|');

	// floor(x) → \lfloor x \rfloor
	latex = latex.replace(/\bfloor\(([^)]+)\)/g, '\\lfloor $1 \\rfloor');

	// ceil(x) → \lceil x \rceil
	latex = latex.replace(/\bceil\(([^)]+)\)/g, '\\lceil $1 \\rceil');

	// binom(n, k) → \binom{n}{k}
	latex = latex.replace(/\bbinom\(([^,]+),\s*([^)]+)\)/g, '\\binom{$1}{$2}');

	// cases - Typst uses cases(a, b, c, d) for {a if b; c if d}
	// This is complex, skip for now - users can write LaTeX directly if needed

	// Matrix syntax: mat(a, b; c, d) - basic support
	latex = latex.replace(/\bmat\(([^)]+)\)/g, (_match, content) => {
		const rows = content.split(';').map((row: string) => row.trim().split(',').map((cell: string) => cell.trim()).join(' & ')).join(' \\\\ ');
		return `\\begin{pmatrix} ${rows} \\end{pmatrix}`;
	});

	// Operators: times → \times, dot → \cdot (when not function)
	latex = latex.replace(/\btimes\b/g, '\\times');
	latex = latex.replace(/\bcdot\b/g, '\\cdot');
	latex = latex.replace(/\bdiv\b/g, '\\div');
	latex = latex.replace(/\bpm\b/g, '\\pm');
	latex = latex.replace(/\bmp\b/g, '\\mp');

	// Comparison: <= → \leq, >= → \geq, != → \neq
	latex = latex.replace(/<=/g, '\\leq');
	latex = latex.replace(/>=/g, '\\geq');
	latex = latex.replace(/!=/g, '\\neq');
	latex = latex.replace(/approx/g, '\\approx');
	latex = latex.replace(/equiv/g, '\\equiv');

	// Set notation
	latex = latex.replace(/\bin\b/g, '\\in');
	latex = latex.replace(/\bnotin\b/g, '\\notin');
	latex = latex.replace(/\bsubset\b/g, '\\subset');
	latex = latex.replace(/\bsupset\b/g, '\\supset');
	latex = latex.replace(/\bunion\b/g, '\\cup');
	latex = latex.replace(/\bintersect\b/g, '\\cap');
	latex = latex.replace(/\bemptyset\b/g, '\\emptyset');

	// Arrows
	latex = latex.replace(/->/g, '\\to');
	latex = latex.replace(/<-/g, '\\leftarrow');
	latex = latex.replace(/=>/g, '\\Rightarrow');
	latex = latex.replace(/<=>/g, '\\Leftrightarrow');

	// Dots
	latex = latex.replace(/\bdots\b/g, '\\dots');
	latex = latex.replace(/\bcdots\b/g, '\\cdots');
	latex = latex.replace(/\bvdots\b/g, '\\vdots');
	latex = latex.replace(/\bddots\b/g, '\\ddots');

	// Spaces in Typst math: thin space is ~ or space
	// This is usually fine as-is

	// partial → \partial
	latex = latex.replace(/\bpartial\b/g, '\\partial');

	// nabla → \nabla
	latex = latex.replace(/\bnabla\b/g, '\\nabla');

	// forall, exists
	latex = latex.replace(/\bforall\b/g, '\\forall');
	latex = latex.replace(/\bexists\b/g, '\\exists');

	return latex;
}

/**
 * Render math content - uses KaTeX for both Markdown and Typst
 * For Typst, converts Typst math syntax to LaTeX first
 */
function renderMathContent(content: string, displayMode: boolean, format: 'markdown' | 'typst'): string {
	// Convert Typst math to LaTeX if needed
	const latexContent = format === 'typst' ? typstMathToLatex(content) : content;

	try {
		return katex.renderToString(latexContent, {
			throwOnError: false,
			displayMode: displayMode,
		});
	} catch (e) {
		// Fallback: show styled raw content on error
		const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return `<span class="math-error">${escaped}</span>`;
	}
}

/**
 * MathInline extension for inline math ($...$)
 * Renders with KaTeX for Markdown, styled text for Typst
 */
const MathInline = Node.create({
	name: 'mathInline',
	group: 'inline',
	inline: true,
	atom: true,

	addAttributes() {
		return {
			content: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-math-inline]',
				getAttrs: (node) => {
					const element = node as HTMLElement;
					return { content: element.getAttribute('data-content') || element.textContent || '' };
				},
			},
		];
	},

	renderHTML({ node }) {
		const content = node.attrs.content || '';
		return [
			'span',
			mergeAttributes({
				'data-math-inline': 'true',
				'data-content': content,
				class: 'math-inline',
				contenteditable: 'false',
			}),
			content,
		];
	},

	addNodeView() {
		return ({ node }) => {
			const span = document.createElement('span');
			span.setAttribute('data-math-inline', 'true');
			span.setAttribute('data-content', node.attrs.content || '');
			span.className = 'math-inline math-rendered';
			span.contentEditable = 'false';

			const content = node.attrs.content || '';
			// Render with KaTeX for both Markdown and Typst
			span.innerHTML = renderMathContent(content, false, currentFormat);

			return { dom: span };
		};
	},
});

/**
 * MathBlock extension for display math ($$...$$)
 * Renders with KaTeX for Markdown, styled text for Typst
 */
const MathBlock = Node.create({
	name: 'mathBlock',
	group: 'block',
	atom: true,

	addAttributes() {
		return {
			content: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'div[data-math-block]',
				getAttrs: (node) => {
					const element = node as HTMLElement;
					return { content: element.getAttribute('data-content') || element.textContent || '' };
				},
			},
		];
	},

	renderHTML({ node }) {
		const content = node.attrs.content || '';
		return [
			'div',
			mergeAttributes({
				'data-math-block': 'true',
				'data-content': content,
				class: 'math-block',
				contenteditable: 'false',
			}),
			content,
		];
	},

	addNodeView() {
		return ({ node }) => {
			const div = document.createElement('div');
			div.setAttribute('data-math-block', 'true');
			div.setAttribute('data-content', node.attrs.content || '');
			div.className = 'math-block math-rendered';
			div.contentEditable = 'false';

			const content = node.attrs.content || '';
			// Render with KaTeX for both Markdown and Typst
			div.innerHTML = renderMathContent(content, true, currentFormat);

			return { dom: div };
		};
	},
});

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
// Workspace-relative path to the document directory (for better path resolution)
let documentDirPath: string | null = null;
// Pre-resolved images from the extension (relative path -> data URL)
let resolvedImages: Record<string, string> = {};

// Current view mode: wysiwyg, source, or split
type ViewMode = 'wysiwyg' | 'source' | 'split';
let currentViewMode: ViewMode = 'wysiwyg';

// Store Typst preamble (directives like #set, #let, #import, #show) for preservation during serialization
let typstPreamble: string[] = [];

// Flag to prevent sync loops between editor and source textarea
let isSyncingFromSource = false;
let isSyncingFromEditor = false;

// Source textarea element
let sourceTextarea: HTMLTextAreaElement | null = null;

/**
 * Switch between view modes (WYSIWYG, Source, Split)
 */
function setViewMode(mode: ViewMode): void {
	if (currentViewMode === mode) {
		return;
	}

	const container = document.querySelector('.editor-container');
	const modeButtons = document.querySelectorAll('.mode-button');

	if (!container) {
		return;
	}

	// If switching FROM source or split mode, sync content to editor
	if ((currentViewMode === 'source' || currentViewMode === 'split') && mode === 'wysiwyg') {
		syncSourceToEditor();
	}

	// If switching TO source or split mode, sync editor to source
	if (currentViewMode === 'wysiwyg' && (mode === 'source' || mode === 'split')) {
		syncEditorToSource();
	}

	currentViewMode = mode;
	container.setAttribute('data-mode', mode);

	// Update button states
	modeButtons.forEach(btn => {
		const btnMode = btn.getAttribute('data-mode');
		btn.classList.toggle('active', btnMode === mode);
	});

	// Focus appropriate editor
	if (mode === 'source' && sourceTextarea) {
		sourceTextarea.focus();
	} else if (mode === 'wysiwyg' && editor) {
		editor.commands.focus();
	}
}

/**
 * Sync content from WYSIWYG editor to source textarea
 */
function syncEditorToSource(): void {
	if (isSyncingFromSource || !editor || !sourceTextarea) {
		return;
	}

	isSyncingFromEditor = true;
	const content = currentFormat === 'markdown'
		? jsonToMarkdown(editor.getJSON())
		: jsonToTypst(editor.getJSON());
	sourceTextarea.value = content;
	isSyncingFromEditor = false;
}

/**
 * Sync content from source textarea to WYSIWYG editor
 */
function syncSourceToEditor(): void {
	if (isSyncingFromEditor || !editor || !sourceTextarea) {
		return;
	}

	isSyncingFromSource = true;
	const content = sourceTextarea.value;
	parseContent(content, currentFormat);
	isSyncingFromSource = false;
}

/**
 * Initialize view mode buttons and split divider
 */
function initViewModes(): void {
	// Get source textarea
	sourceTextarea = document.getElementById('source-textarea') as HTMLTextAreaElement;

	// Set up mode button click handlers
	const modeButtons = document.querySelectorAll('.mode-button');
	modeButtons.forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			const mode = btn.getAttribute('data-mode') as ViewMode;
			if (mode) {
				setViewMode(mode);
			}
		});
	});

	// Set up source textarea sync (debounced)
	let sourceUpdateTimer: ReturnType<typeof setTimeout> | null = null;
	if (sourceTextarea) {
		sourceTextarea.addEventListener('input', () => {
			if (isSyncingFromEditor) {
				return;
			}

			// In split mode, sync to editor with debounce
			if (currentViewMode === 'split') {
				if (sourceUpdateTimer) {
					clearTimeout(sourceUpdateTimer);
				}
				sourceUpdateTimer = setTimeout(() => {
					syncSourceToEditor();
				}, 500);
			}

			// Also update the document (debounced)
			if (updateTimer) {
				clearTimeout(updateTimer);
			}
			updateTimer = setTimeout(() => {
				const content = sourceTextarea?.value || '';
				lastSentContent = content;
				vscode.postMessage({
					type: 'update',
					content: content
				});
			}, 300);
		});
	}

	// Set up split divider for resizing
	const splitDivider = document.getElementById('split-divider');
	const editorsContainer = document.querySelector('.editors-container') as HTMLElement;
	const editorContent = document.getElementById('editor');
	const sourceEditor = document.getElementById('source-editor');

	if (splitDivider && editorsContainer && editorContent && sourceEditor) {
		let isResizing = false;

		splitDivider.addEventListener('mousedown', (e) => {
			isResizing = true;
			document.body.style.cursor = 'col-resize';
			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!isResizing) {
				return;
			}

			const containerRect = editorsContainer.getBoundingClientRect();
			const relativeX = e.clientX - containerRect.left;
			const percentage = (relativeX / containerRect.width) * 100;

			// Clamp between 20% and 80%
			const clampedPercentage = Math.min(80, Math.max(20, percentage));

			editorContent.style.flex = `0 0 ${clampedPercentage}%`;
			sourceEditor.style.flex = `0 0 ${100 - clampedPercentage}%`;
		});

		document.addEventListener('mouseup', () => {
			if (isResizing) {
				isResizing = false;
				document.body.style.cursor = '';
			}
		});
	}
}

/**
 * Resolve a relative resource path to an absolute webview URI
 * Handles ../ navigation correctly using workspace-relative paths for accuracy
 * Uses pre-resolved images (data URLs) when available to avoid 401 errors
 */
function resolveResourcePath(path: string): string {
	// First, check if we have a pre-resolved image for this path
	if (resolvedImages[path]) {
		return resolvedImages[path];
	}

	// Also try without leading ./ if present
	const cleanPath = path.startsWith('./') ? path.slice(2) : path;
	if (cleanPath !== path && resolvedImages[cleanPath]) {
		return resolvedImages[cleanPath];
	}

	// If it's already an absolute URL or data URL, return as-is
	if (path.startsWith('http://') || path.startsWith('https://') ||
		path.startsWith('data:') ||
		path.startsWith('vscode-resource://') || path.startsWith('vscode-webview://') ||
		path.startsWith('file+.vscode-resource') || path.startsWith('vscode-local+')) {
		return path;
	}

	// Determine if path is absolute (starts with /) or relative
	const isAbsolutePath = path.startsWith('/');

	// Choose the appropriate base URI
	const base = isAbsolutePath ? workspaceRootUri : resourceBaseUri;

	if (!base) {
		console.warn('resolveResourcePath: No base URI available for path:', path);
		return path;
	}

	// Parse the base URL properly using URL API
	try {
		const baseUrl = new URL(base);

		// Clean the relative path
		let cleanPath = path;
		if (cleanPath.startsWith('./')) {
			cleanPath = cleanPath.slice(2);
		}

		// Count how many ../ we need and collect non-../ parts
		let upCount = 0;
		const pathParts = cleanPath.split('/');
		const nonUpParts: string[] = [];

		for (const segment of pathParts) {
			if (segment === '..') {
				upCount++;
			} else if (segment !== '.' && segment !== '') {
				nonUpParts.push(segment);
			}
		}

		// Use documentDirPath for more accurate path resolution
		// This is especially important in remote/deployed environments
		// where the webview URI pathname may not match the actual file structure
		let resolvedDirSegments: string[];

		if (documentDirPath && !isAbsolutePath) {
			// Use workspace-relative path for better accuracy
			resolvedDirSegments = documentDirPath.split('/').filter(s => s && s !== '.');

			// Apply ../ navigation
			for (let i = 0; i < upCount; i++) {
				if (resolvedDirSegments.length > 0) {
					resolvedDirSegments.pop();
				}
			}

			// Add the non-../ parts
			resolvedDirSegments.push(...nonUpParts);

			// Build the final URL using workspace root + resolved path
			if (workspaceRootUri) {
				const wsUrl = new URL(workspaceRootUri);
				// Ensure workspace root path doesn't have trailing slash
				let wsPath = wsUrl.pathname;
				while (wsPath.endsWith('/')) {
					wsPath = wsPath.slice(0, -1);
				}
				wsUrl.pathname = wsPath + '/' + resolvedDirSegments.join('/');
				return wsUrl.toString();
			}
		}

		// Fallback: use base URL pathname (original behavior)
		let basePath = baseUrl.pathname;

		// Remove trailing slash from base if present
		while (basePath.endsWith('/')) {
			basePath = basePath.slice(0, -1);
		}

		// Split base path into segments
		const baseSegments = basePath.split('/').filter(s => s);
		const originalBaseLength = baseSegments.length;

		// If we're trying to go up more levels than available,
		// the path might be relative to a different root (filesystem vs workspace)
		if (upCount > originalBaseLength) {
			console.warn(`[resolveResourcePath] Path "${path}" goes ${upCount} levels up but base only has ${originalBaseLength} segments.`);
			// Try using workspace root instead
			if (workspaceRootUri) {
				const wsUrl = new URL(workspaceRootUri);
				let wsPath = wsUrl.pathname;
				while (wsPath.endsWith('/')) {
					wsPath = wsPath.slice(0, -1);
				}
				wsUrl.pathname = wsPath + '/' + nonUpParts.join('/');
				return wsUrl.toString();
			}
			// Last resort: just append filename to base
			const result = baseUrl.origin + basePath + '/' + nonUpParts.join('/');
			return result;
		}

		// Process the relative path segments normally
		for (const segment of pathParts) {
			if (segment === '..') {
				// Go up one level
				if (baseSegments.length > 0) {
					baseSegments.pop();
				}
			} else if (segment !== '.' && segment !== '') {
				// Add segment to path
				baseSegments.push(segment);
			}
		}

		// Reconstruct the URL
		baseUrl.pathname = '/' + baseSegments.join('/');
		return baseUrl.toString();
	} catch (e) {
		console.error('resolveResourcePath: Failed to parse URL:', base, e);
		// Fallback: simple concatenation
		return base + '/' + path;
	}
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
				},
				// Disable default codeBlock, we use CodeBlockLowlight instead
				codeBlock: false
			}),
			CodeBlockLowlight.configure({
				lowlight,
				defaultLanguage: 'plaintext',
				HTMLAttributes: {
					class: 'hljs'
				}
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					target: '_blank',
					rel: 'noopener noreferrer'
				}
			}),
			CustomImage.configure({
				inline: false,
				allowBase64: true,
				HTMLAttributes: {
					class: 'rich-editor-image',
				},
			}),
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
			}),
			MathInline,
			MathBlock
		],
		content: '',
		autofocus: true,
		editable: true,
		onUpdate: ({ editor: editorInstance }) => {
			// Debounce content updates
			if (updateTimer) {
				clearTimeout(updateTimer);
			}
			updateTimer = setTimeout(() => {
				sendContentUpdate(editorInstance);
			}, 300);

			// Sync to source textarea in split mode (debounced)
			if (currentViewMode === 'split' && !isSyncingFromSource) {
				syncEditorToSource();
			}
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

	// Setup paste and drag&drop for images
	setupImagePasteAndDrop();

	// Initialize view mode controls (WYSIWYG/Source/Split)
	initViewModes();

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
 * Refresh image nodes to ensure they are properly rendered
 * This forces TipTap to re-process image nodes after content load
 */
function refreshImageNodes(): void {
	if (!editor) { return; }

	// Get the current content as JSON
	const json = editor.getJSON();
	const content = json.content;
	if (!content) { return; }

	let hasChanges = false;

	// Recursively find and fix image nodes
	function processNodes(nodes: Array<Record<string, unknown>>): void {
		for (const node of nodes) {
			if (node.type === 'image') {
				const attrs = node.attrs as Record<string, unknown> | undefined;
				if (attrs) {
					const currentSrc = attrs.src as string || '';
					const alt = attrs.alt as string || '';

					// If src is a relative path, resolve it
					if (currentSrc && !currentSrc.startsWith('http') &&
						!currentSrc.startsWith('vscode-resource') &&
						!currentSrc.startsWith('vscode-webview') &&
						!currentSrc.startsWith('file+.vscode-resource') &&
						!currentSrc.startsWith('data:')) {
						const resolvedSrc = resolveResourcePath(currentSrc);
						if (resolvedSrc !== currentSrc) {
							attrs.src = resolvedSrc;
							// Preserve original path in alt for serialization
							if (!alt || alt === currentSrc) {
								attrs.alt = currentSrc;
							}
							hasChanges = true;
						}
					}
					// Also try resolving from alt if src needs updating
					else if (alt && !alt.startsWith('http') && !alt.startsWith('vscode') && !alt.startsWith('data:')) {
						const resolvedFromAlt = resolveResourcePath(alt);
						if (resolvedFromAlt !== currentSrc && resolvedFromAlt !== alt) {
							attrs.src = resolvedFromAlt;
							hasChanges = true;
						}
					}
				}
			}
			// Process child nodes
			const childContent = node.content as Array<Record<string, unknown>> | undefined;
			if (childContent) {
				processNodes(childContent);
			}
		}
	}

	processNodes(content as Array<Record<string, unknown>>);

	// If we made changes, update the editor content
	if (hasChanges) {
		editor.commands.setContent(json);
	}
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

		case 'mathBlock': {
			const mathContent = (attrs?.content as string) || '';
			return `$$\n${mathContent}\n$$`;
		}

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

	if (node.type === 'mathInline') {
		const mathContent = (node.attrs as Record<string, unknown>)?.content as string || '';
		return `$${mathContent}$`;
	}

	return '';
}

/**
 * Convert ProseMirror JSON to Typst
 */
function jsonToTypst(doc: Record<string, unknown>): string {
	const content = doc.content as Array<Record<string, unknown>> | undefined;
	if (!content) {
		// If no content but we have preamble, return just the preamble
		return typstPreamble.length > 0 ? typstPreamble.join('\n') : '';
	}

	// Build body with smart line spacing
	const lines: string[] = [];
	let prevNodeType: string | null = null;

	for (const node of content) {
		const nodeType = node.type as string;
		const serialized = nodeToTypst(node);

		// Empty paragraph = blank line (preserve original spacing)
		if (nodeType === 'paragraph' && serialized === '') {
			lines.push('');
			prevNodeType = nodeType;
			continue;
		}

		// Add blank line before headings and block elements if previous wasn't empty
		if (prevNodeType && prevNodeType !== 'paragraph' &&
			(nodeType === 'heading' || nodeType === 'mathBlock' || nodeType === 'codeBlock' || nodeType === 'table')) {
			lines.push('');
		}

		lines.push(serialized);
		prevNodeType = nodeType;
	}

	const bodyContent = lines.join('\n');

	// Prepend directives if we have stored any (#set, #let, #import, #show)
	if (typstPreamble.length > 0) {
		return typstPreamble.join('\n') + '\n\n' + bodyContent;
	}

	return bodyContent;
}

/**
 * Serialize a Typst list with proper indentation for nesting
 * @param items Array of listItem nodes
 * @param listType 'bullet' (-) or 'ordered' (+)
 * @param indentLevel Current indentation level (0 = root)
 */
function serializeTypstList(
	items: Array<Record<string, unknown>> | undefined,
	listType: 'bullet' | 'ordered',
	indentLevel: number
): string {
	if (!items) {
		return '';
	}

	const marker = listType === 'bullet' ? '-' : '+';
	const indent = '  '.repeat(indentLevel); // 2 spaces per level

	const lines: string[] = [];

	for (const item of items) {
		if ((item.type as string) !== 'listItem') {
			continue;
		}

		const itemContent = item.content as Array<Record<string, unknown>> | undefined;
		if (!itemContent) {
			continue;
		}

		// Separate paragraph content from nested lists
		const paragraphs: Array<Record<string, unknown>> = [];
		const nestedLists: Array<Record<string, unknown>> = [];

		for (const child of itemContent) {
			const childType = child.type as string;
			if (childType === 'bulletList' || childType === 'orderedList') {
				nestedLists.push(child);
			} else {
				paragraphs.push(child);
			}
		}

		// Get the text content from paragraphs
		const textContent = paragraphs.map(n => {
			if ((n.type as string) === 'paragraph') {
				const paraContent = n.content as Array<Record<string, unknown>> | undefined;
				return paraContent ? paraContent.map(c => inlineToTypst(c)).join('') : '';
			}
			return nodeToTypst(n);
		}).filter(t => t.trim() !== '').join(' ');

		// Add the list item line
		lines.push(`${indent}${marker} ${textContent}`);

		// Add nested lists with increased indentation
		for (const nestedList of nestedLists) {
			const nestedType = (nestedList.type as string) === 'bulletList' ? 'bullet' : 'ordered';
			const nestedContent = nestedList.content as Array<Record<string, unknown>> | undefined;
			const nestedHtml = serializeTypstList(nestedContent, nestedType, indentLevel + 1);
			if (nestedHtml) {
				lines.push(nestedHtml);
			}
		}
	}

	return lines.join('\n');
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
			return serializeTypstList(content, 'bullet', 0);

		case 'orderedList':
			return serializeTypstList(content, 'ordered', 0);

		case 'listItem':
			// This shouldn't be called directly - handled by serializeTypstList
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

		case 'mathBlock': {
			const mathContent = (attrs?.content as string) || '';
			// Typst display math: $ content $ with spaces
			// Preserve multiline content
			if (mathContent.includes('\n')) {
				return `$ ${mathContent} $`;
			}
			return `$ ${mathContent} $`;
		}

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
 * Uses Typst function syntax for formatting (#strong[], #emph[], etc.)
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
						// Use shorthand syntax *text* as it's more common in Typst
						text = `*${text}*`;
						break;
					case 'italic':
						// Use shorthand syntax _text_
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
					case 'highlight':
						text = `#highlight[${text}]`;
						break;
					case 'underline':
						text = `#underline[${text}]`;
						break;
					case 'subscript':
						text = `#sub[${text}]`;
						break;
					case 'superscript':
						text = `#super[${text}]`;
						break;
				}
			}
		}
		return text;
	}

	if (node.type === 'hardBreak') {
		return '\n';
	}

	if (node.type === 'mathInline') {
		const mathContent = (node.attrs as Record<string, unknown>)?.content as string || '';
		// Typst inline math: $content$ without spaces
		return `$${mathContent}$`;
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

	// IMPORTANT: Extract math content FIRST and replace with placeholders
	// This prevents italic/bold regex from corrupting math expressions
	// Use \x00 (null char) as delimiter to avoid conflicts with any text formatting
	const mathPlaceholders: Map<string, string> = new Map();
	let placeholderIndex = 0;

	// Math blocks ($$...$$) - must be before other processing
	// Handle multiline math blocks
	html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
		const key = `\x00MATHBLOCK${placeholderIndex++}\x00`;
		const escaped = content.trim().replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		mathPlaceholders.set(key, `<div data-math-block="true" data-content="${escaped}" class="math-block">${escaped}</div>`);
		return key;
	});

	// Inline math ($...$) - single $ delimiters, not $$
	// Use negative lookbehind/lookahead to avoid matching $$
	html = html.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (_match, content) => {
		const key = `\x00MATHINLINE${placeholderIndex++}\x00`;
		const escaped = content.trim().replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		mathPlaceholders.set(key, `<span data-math-inline="true" data-content="${escaped}" class="math-inline">${escaped}</span>`);
		return key;
	});

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

	// Images - resolve relative paths using resourceBaseUri
	// IMPORTANT: Must be processed BEFORE links to avoid ![alt](url) being captured as a link
	html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
		const resolvedSrc = resolveResourcePath(src);
		// Store original path in alt if no alt text provided (for serialization)
		const altText = alt || src;
		return `<img src="${resolvedSrc}" alt="${altText}">`;
	});

	// Links (must be after images)
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

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

	// Restore math placeholders
	for (const [key, value] of mathPlaceholders) {
		html = html.replace(key, value);
	}

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
 * Parse nested Typst function content like #func[content with [nested] brackets]
 * Returns the content and the index after the closing bracket
 */
function parseTypstBracketContent(text: string, startIndex: number): { content: string; endIndex: number } | null {
	if (text[startIndex] !== '[') {
		return null;
	}

	let depth = 1;
	let i = startIndex + 1;
	let content = '';

	while (i < text.length && depth > 0) {
		if (text[i] === '[') {
			depth++;
			content += text[i];
		} else if (text[i] === ']') {
			depth--;
			if (depth > 0) {
				content += text[i];
			}
		} else if (text[i] === '\\' && i + 1 < text.length) {
			// Handle escaped characters
			content += text[i] + text[i + 1];
			i++;
		} else {
			content += text[i];
		}
		i++;
	}

	if (depth !== 0) {
		return null; // Unmatched brackets
	}

	return { content, endIndex: i };
}

/**
 * Parse Typst functions like #func[content] or #func("arg")[content]
 * Supports: #strong[], #emph[], #strike[], #highlight[], #underline[], #quote[], #raw[]
 */
function parseTypstFunctions(html: string): string {
	// Process functions from innermost to outermost by repeated passes
	let prevHtml = '';
	let iterations = 0;
	const maxIterations = 10; // Prevent infinite loops

	while (prevHtml !== html && iterations < maxIterations) {
		prevHtml = html;
		iterations++;

		// #strong[text] → <strong>text</strong>
		html = html.replace(/#strong\[/g, (match, offset) => {
			const result = parseTypstBracketContent(html, offset + match.length - 1);
			if (result) {
				// We need to handle this differently since regex can't do recursive matching
				return match; // Let the simpler regex below handle non-nested cases
			}
			return match;
		});

		// Simple non-nested function replacements
		// #strong[text] (no nested brackets)
		html = html.replace(/#strong\[([^\[\]]*)\]/g, '<strong>$1</strong>');

		// #emph[text]
		html = html.replace(/#emph\[([^\[\]]*)\]/g, '<em>$1</em>');

		// #strike[text]
		html = html.replace(/#strike\[([^\[\]]*)\]/g, '<s>$1</s>');

		// #highlight[text] → <mark>text</mark>
		html = html.replace(/#highlight\[([^\[\]]*)\]/g, '<mark>$1</mark>');

		// #underline[text] → <u>text</u>
		html = html.replace(/#underline\[([^\[\]]*)\]/g, '<u>$1</u>');

		// #sub[text] → <sub>text</sub>
		html = html.replace(/#sub\[([^\[\]]*)\]/g, '<sub>$1</sub>');

		// #super[text] → <sup>text</sup>
		html = html.replace(/#super\[([^\[\]]*)\]/g, '<sup>$1</sup>');

		// #smallcaps[text] → <span style="font-variant: small-caps">text</span>
		html = html.replace(/#smallcaps\[([^\[\]]*)\]/g, '<span style="font-variant: small-caps">$1</span>');

		// #quote[text] → <blockquote><p>text</p></blockquote>
		html = html.replace(/#quote\[([^\[\]]*)\]/g, '<blockquote><p>$1</p></blockquote>');

		// #raw[text] or #raw("lang")[text] for inline code
		html = html.replace(/#raw\[([^\[\]]*)\]/g, '<code>$1</code>');
		html = html.replace(/#raw\("[^"]*"\)\[([^\[\]]*)\]/g, '<code>$1</code>');

		// #text with formatting options like #text(fill: red)[text]
		// For now, just extract the content
		html = html.replace(/#text\([^)]*\)\[([^\[\]]*)\]/g, '$1');

		// #box[text] and #block[text] - just extract content
		html = html.replace(/#box\[([^\[\]]*)\]/g, '$1');
		html = html.replace(/#block\[([^\[\]]*)\]/g, '<div>$1</div>');
	}

	return html;
}

/**
 * Parse Typst lists with proper nesting support
 * Handles: - for bullet lists, + for ordered lists
 * Supports indentation for nested lists (2 spaces per level)
 */
function parseTypstLists(text: string): string {
	const lines = text.split('\n');
	const result: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Check if line starts a list item (with possible indentation)
		const listMatch = line.match(/^(\s*)([-+])\s+(.*)$/);

		if (listMatch) {
			// Found a list item, parse the entire list block
			const { html: listHtml, endIndex } = parseTypstListBlock(lines, i);
			result.push(listHtml);
			i = endIndex;
		} else {
			result.push(line);
			i++;
		}
	}

	return result.join('\n');
}

/**
 * Parse a block of Typst list items starting at the given index
 * Returns the HTML and the index after the last list item
 */
function parseTypstListBlock(lines: string[], startIndex: number): { html: string; endIndex: number } {
	interface ListItem {
		indent: number;
		type: 'bullet' | 'ordered';
		content: string;
		children: ListItem[];
	}

	const items: ListItem[] = [];
	let i = startIndex;

	// Parse all list items
	while (i < lines.length) {
		const line = lines[i];
		const match = line.match(/^(\s*)([-+])\s+(.*)$/);

		if (!match) {
			// Check if this is a continuation line (indented but no list marker)
			// For now, we stop at non-list lines
			break;
		}

		const [, indentStr, marker, content] = match;
		const indent = indentStr.length;
		const type: 'bullet' | 'ordered' = marker === '-' ? 'bullet' : 'ordered';

		items.push({
			indent,
			type,
			content,
			children: []
		});
		i++;
	}

	if (items.length === 0) {
		return { html: '', endIndex: startIndex };
	}

	// Build nested structure
	const rootItems: ListItem[] = [];
	const stack: { item: ListItem; indent: number }[] = [];

	for (const item of items) {
		// Pop items from stack that are at same or greater indent
		while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) {
			stack.pop();
		}

		if (stack.length === 0) {
			// Root level item
			rootItems.push(item);
		} else {
			// Child of the last item on the stack
			stack[stack.length - 1].item.children.push(item);
		}

		stack.push({ item, indent: item.indent });
	}

	// Convert to HTML
	function itemsToHtml(items: ListItem[]): string {
		if (items.length === 0) {
			return '';
		}

		// Group consecutive items by type
		const groups: { type: 'bullet' | 'ordered'; items: ListItem[] }[] = [];
		let currentGroup: { type: 'bullet' | 'ordered'; items: ListItem[] } | null = null;

		for (const item of items) {
			if (!currentGroup || currentGroup.type !== item.type) {
				currentGroup = { type: item.type, items: [item] };
				groups.push(currentGroup);
			} else {
				currentGroup.items.push(item);
			}
		}

		// Render each group
		return groups.map(group => {
			const tag = group.type === 'bullet' ? 'ul' : 'ol';
			const itemsHtml = group.items.map(item => {
				const childrenHtml = item.children.length > 0 ? itemsToHtml(item.children) : '';
				return `<li><p>${item.content}</p>${childrenHtml}</li>`;
			}).join('');
			return `<${tag}>${itemsHtml}</${tag}>`;
		}).join('');
	}

	return { html: itemsToHtml(rootItems), endIndex: i };
}

/**
 * Parse Typst code blocks with ```lang syntax or #raw(lang: "...") blocks
 */
function parseTypstCodeBlocks(html: string): string {
	// Code blocks with ```language
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
		const language = lang || 'plaintext';
		return `<pre data-language="${language}"><code class="language-${language}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
	});

	// #raw(lang: "language")[code block] or #raw(block: true, lang: "language")[code]
	html = html.replace(/#raw\([^)]*lang:\s*"([^"]*)"[^)]*\)\[([^\]]*)\]/g, (_match, lang, code) => {
		return `<pre data-language="${lang}"><code class="language-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
	});

	return html;
}

/**
 * Parse Typst horizontal rules: #line(length: 100%) or similar
 */
function parseTypstHorizontalRules(html: string): string {
	// #line(length: 100%) or variations
	html = html.replace(/#line\s*\([^)]*length:\s*100%[^)]*\)/g, '<hr>');
	// Also handle simple #line() which might be used as HR
	html = html.replace(/^#line\(\)$/gm, '<hr>');

	return html;
}

/**
 * Parse Typst math expressions (both block and inline) with proper multiline support
 * Block math: $ content $ (with spaces after opening and before closing $)
 * Inline math: $content$ (no spaces)
 */
function parseTypstMath(
	html: string,
	mathPlaceholders: Map<string, string>,
	startIndex: number
): string {
	let result = '';
	let i = 0;
	let placeholderIndex = startIndex;

	while (i < html.length) {
		if (html[i] === '$') {
			// Check if this is a math expression
			const startPos = i;
			i++; // Skip opening $

			if (i >= html.length) {
				result += '$';
				break;
			}

			// Determine if block math (has space after $) or inline (no space)
			const isBlock = /\s/.test(html[i]);

			// Find the closing $
			// For block math: look for $ preceded by space
			// For inline math: look for $ not preceded by space
			let content = '';
			let foundClose = false;

			while (i < html.length) {
				if (html[i] === '$') {
					// Check if this is a valid closing delimiter
					if (isBlock) {
						// Block math: needs whitespace before closing $
						if (content.length > 0 && /\s$/.test(content)) {
							foundClose = true;
							break;
						}
					} else {
						// Inline math: no space before closing $
						if (content.length > 0 && !/\s$/.test(content)) {
							foundClose = true;
							break;
						}
					}
				}
				content += html[i];
				i++;
			}

			if (foundClose) {
				i++; // Skip closing $
				const trimmedContent = content.trim();
				const escaped = trimmedContent.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

				if (isBlock) {
					const key = `\x00MATHBLOCK${placeholderIndex++}\x00`;
					mathPlaceholders.set(key, `<div data-math-block="true" data-content="${escaped}" class="math-block">${escaped}</div>`);
					result += key;
				} else {
					const key = `\x00MATHINLINE${placeholderIndex++}\x00`;
					mathPlaceholders.set(key, `<span data-math-inline="true" data-content="${escaped}" class="math-inline">${escaped}</span>`);
					result += key;
				}
			} else {
				// No valid closing found, output as-is
				result += html.slice(startPos, i);
			}
		} else {
			result += html[i];
			i++;
		}
	}

	return result;
}

/**
 * Parse #math.equation(...) with proper handling of nested parentheses
 * Returns the modified HTML string
 */
function parseMathEquations(
	html: string,
	mathPlaceholders: Map<string, string>,
	startIndex: number
): string {
	let result = '';
	let i = 0;
	let placeholderIndex = startIndex;

	while (i < html.length) {
		// Look for #math.equation
		if (html.slice(i, i + 15) === '#math.equation') {
			// Find the opening parenthesis
			let j = i + 15;
			while (j < html.length && html[j] !== '(') {
				if (!/\s/.test(html[j])) {
					// Not a valid #math.equation call
					result += html[i];
					i++;
					continue;
				}
				j++;
			}

			if (j >= html.length) {
				result += html[i];
				i++;
				continue;
			}

			// Parse the parentheses content with nesting support
			const startParen = j;
			let depth = 1;
			j++; // Skip opening paren

			while (j < html.length && depth > 0) {
				if (html[j] === '(') {
					depth++;
				} else if (html[j] === ')') {
					depth--;
				} else if (html[j] === '"') {
					// Skip string content
					j++;
					while (j < html.length && html[j] !== '"') {
						if (html[j] === '\\') {
							j++; // Skip escaped char
						}
						j++;
					}
				}
				j++;
			}

			if (depth !== 0) {
				// Unmatched parentheses, skip this
				result += html[i];
				i++;
				continue;
			}

			// Extract the full content between parentheses
			const args = html.slice(startParen + 1, j - 1);

			// Extract block parameter (default to true if present)
			const isBlock = /block:\s*true/.test(args);

			// Extract math content from $ ... $ within the arguments
			// Need to find the $ delimiters properly
			const dollarStart = args.indexOf('$');
			if (dollarStart === -1) {
				// No math content found, skip
				result += html.slice(i, j);
				i = j;
				continue;
			}

			// Find the closing $ (skip the first character after opening $)
			const dollarEnd = args.indexOf('$', dollarStart + 1);
			if (dollarEnd === -1) {
				result += html.slice(i, j);
				i = j;
				continue;
			}

			const mathContent = args.slice(dollarStart + 1, dollarEnd).trim();
			const escaped = mathContent.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

			if (isBlock) {
				const key = `\x00MATHBLOCK${placeholderIndex++}\x00`;
				mathPlaceholders.set(key, `<div data-math-block="true" data-content="${escaped}" class="math-block">${escaped}</div>`);
				result += key;
			} else {
				const key = `\x00MATHINLINE${placeholderIndex++}\x00`;
				mathPlaceholders.set(key, `<span data-math-inline="true" data-content="${escaped}" class="math-inline">${escaped}</span>`);
				result += key;
			}

			i = j;
		} else {
			result += html[i];
			i++;
		}
	}

	return result;
}

/**
 * Extract Typst directives (#set, #let, #import, #show) from anywhere in the document.
 * These directives configure the document but are not visual content.
 * Returns the content without directives and stores them for later serialization.
 */
function extractTypstDirectives(typst: string): string {
	const lines = typst.split('\n');
	const directiveLines: string[] = [];
	const contentLines: string[] = [];

	// Regex patterns for directives
	// #set function(...) - page/text/document/heading/par configuration
	const setPattern = /^#set\s+\w+\s*\(/;
	// #let variable = value - variable declarations
	const letPattern = /^#let\s+\w+/;
	// #import "path" - imports
	const importPattern = /^#import\s+/;
	// #show: rule - show rules
	const showPattern = /^#show\s*:/;

	let i = 0;
	while (i < lines.length) {
		const line = lines[i].trim();

		// Check if line is a directive
		if (setPattern.test(line) || letPattern.test(line) || importPattern.test(line) || showPattern.test(line)) {
			// Handle multi-line directives (find closing parenthesis)
			let fullDirective = lines[i];
			let j = i;

			// Count parentheses to handle multi-line
			let parenCount = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;

			while (parenCount > 0 && j + 1 < lines.length) {
				j++;
				fullDirective += '\n' + lines[j];
				parenCount += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length;
			}

			directiveLines.push(fullDirective);
			i = j + 1; // Skip processed lines
		} else {
			contentLines.push(lines[i]);
			i++;
		}
	}

	// Store directives for serialization
	typstPreamble = directiveLines;

	// Return content without directives
	return contentLines.join('\n');
}

/**
 * Simple Typst to HTML converter
 * Supports Typst function syntax (#strong[], #emph[], etc.) and shorthand (*bold*, _italic_)
 */
function typstToHtml(typst: string): string {
	// First, extract and store directives (they shouldn't appear in visual editor)
	let html = extractTypstDirectives(typst);

	// Tables - parse #table(...) syntax FIRST before other processing
	html = parseTypstTables(html);

	// Code blocks - parse before other processing
	html = parseTypstCodeBlocks(html);

	// Horizontal rules
	html = parseTypstHorizontalRules(html);

	// IMPORTANT: Extract math content FIRST and replace with placeholders
	// This prevents italic/bold regex from corrupting math expressions
	// Use \x00 (null char) as delimiter to avoid conflicts with any text formatting
	const mathPlaceholders: Map<string, string> = new Map();
	let placeholderIndex = 0;

	// #math.equation(...) - advanced math with alt text and block option
	// Example: #math.equation(alt: "...", block: true, $ content $)
	// Need to handle nested parentheses properly
	html = parseMathEquations(html, mathPlaceholders, placeholderIndex);
	// Update placeholderIndex based on how many were added
	placeholderIndex = mathPlaceholders.size;

	// Parse all math expressions (block and inline) with proper multiline support
	html = parseTypstMath(html, mathPlaceholders, placeholderIndex);
	placeholderIndex = mathPlaceholders.size;

	// Headers (= Heading)
	html = html.replace(/^====== (.+)$/gm, '<h6>$1</h6>');
	html = html.replace(/^===== (.+)$/gm, '<h5>$1</h5>');
	html = html.replace(/^==== (.+)$/gm, '<h4>$1</h4>');
	html = html.replace(/^=== (.+)$/gm, '<h3>$1</h3>');
	html = html.replace(/^== (.+)$/gm, '<h2>$1</h2>');
	html = html.replace(/^= (.+)$/gm, '<h1>$1</h1>');

	// Parse Typst function syntax BEFORE shorthand syntax
	// This handles #strong[], #emph[], #strike[], #highlight[], #underline[], etc.
	html = parseTypstFunctions(html);

	// Links #link("url")[text]
	html = html.replace(/#link\("([^"]+)"\)\[([^\]]+)\]/g, '<a href="$1">$2</a>');

	// Images #image("path") - resolve relative paths
	html = html.replace(/#image\("([^"]+)"\)/g, (_match, src) => {
		const resolvedSrc = resolveResourcePath(src);
		// Store original path in alt for serialization
		return `<img src="${resolvedSrc}" alt="${src}">`;
	});

	// Shorthand syntax (after functions, so #strong[] is already converted)
	// Bold (*text*) - but not ** which is different
	html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

	// Italic (_text_)
	html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

	// Inline code (backticks)
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

	// Parse lists with proper nesting support (- for bullet, + for ordered)
	html = parseTypstLists(html);

	// Paragraphs - convert non-HTML lines to paragraphs
	const lines = html.split('\n');
	const processedLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		// Skip empty lines entirely (don't create empty paragraphs)
		if (trimmed === '') { continue; }
		// Skip lines that already have HTML tags
		if (trimmed.match(/^<\/?[a-z]/i)) {
			processedLines.push(line);
			continue;
		}
		// Skip lines that are math placeholders (they will be replaced with block elements)
		if (trimmed.includes('\x00MATHBLOCK') || trimmed.includes('\x00MATHINLINE')) {
			processedLines.push(trimmed);
			continue;
		}
		// Wrap plain text in paragraph
		processedLines.push(`<p>${trimmed}</p>`);
	}

	html = processedLines.join('\n');

	// Restore math placeholders
	for (const [key, value] of mathPlaceholders) {
		html = html.replace(key, value);
	}

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
		case 'mathInline':
			// Request math input from extension
			vscode.postMessage({ type: 'requestMathInline' });
			break;
		case 'mathBlock':
			// Request math input from extension
			vscode.postMessage({ type: 'requestMathBlock' });
			break;
		case 'codeBlock':
			// Request language selection from extension
			vscode.postMessage({ type: 'requestCodeBlock' });
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
			case 'codeBlock':
				isActive = editor!.isActive('codeBlock');
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
 * Setup paste and drag&drop handlers for images
 */
function setupImagePasteAndDrop(): void {
	const editorElement = document.getElementById('editor');
	if (!editorElement) { return; }

	// Handle paste event
	editorElement.addEventListener('paste', async (e) => {
		const clipboardData = e.clipboardData;
		if (!clipboardData) { return; }

		// Check for image in clipboard
		const items = clipboardData.items;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const file = item.getAsFile();
				if (file) {
					await handleImageFile(file, 'pasteImage');
				}
				return;
			}
		}
	});

	// Handle drag over (needed to enable drop)
	editorElement.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		editorElement.classList.add('drag-over');
	});

	editorElement.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		editorElement.classList.remove('drag-over');
	});

	// Handle drop event
	editorElement.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		editorElement.classList.remove('drag-over');

		const dataTransfer = e.dataTransfer;
		if (!dataTransfer) { return; }

		// Check for files
		const files = dataTransfer.files;
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.type.startsWith('image/')) {
				await handleImageFile(file, 'dropImage');
				return; // Only handle first image
			}
		}
	});
}

/**
 * Handle an image file (from paste or drop)
 */
async function handleImageFile(file: File, messageType: 'pasteImage' | 'dropImage'): Promise<void> {
	try {
		// Read file as base64
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			// Extract base64 data (remove "data:image/png;base64," prefix)
			const base64Data = dataUrl.split(',')[1];

			// Send to extension
			vscode.postMessage({
				type: messageType,
				imageData: base64Data,
				imageName: file.name || `image-${Date.now()}`,
				mimeType: file.type
			});
		};
		reader.readAsDataURL(file);
	} catch (error) {
		console.error('Failed to read image file:', error);
	}
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
			// Store document directory path for accurate relative path resolution
			if (message.documentDirPath) {
				documentDirPath = message.documentDirPath;
			}
			// Store pre-resolved images (avoids 401 errors in remote environments)
			if (message.resolvedImages) {
				resolvedImages = message.resolvedImages;
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
				// Force re-render of images after content load
				// Use setTimeout to ensure TipTap has fully processed the content
				// Multiple attempts with increasing delays for robustness
				setTimeout(() => {
					refreshImageNodes();
				}, 50);
				setTimeout(() => {
					refreshImageNodes();
				}, 200);
				// Sync to source textarea if in split or source mode
				if (currentViewMode === 'source' || currentViewMode === 'split') {
					syncEditorToSource();
				}
				// Also update source textarea with raw content for source mode
				if (sourceTextarea && message.content !== undefined) {
					sourceTextarea.value = message.content;
				}
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
				// Force refresh after insertion
				setTimeout(() => {
					refreshImageNodes();
				}, 100);
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

		case 'setMathInline':
			// Insert inline math
			if (editor && message.content) {
				editor.chain().focus().insertContent({
					type: 'mathInline',
					attrs: { content: message.content }
				}).run();
			}
			break;

		case 'setMathBlock':
			// Insert block math
			if (editor && message.content) {
				editor.chain().focus().insertContent({
					type: 'mathBlock',
					attrs: { content: message.content }
				}).run();
			}
			break;

		case 'setCodeBlock':
			// Insert code block with language
			if (editor) {
				const language = message.language || 'plaintext';
				editor.chain().focus().toggleCodeBlock({ language }).run();
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

