/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow, isAncestor, isHTMLElement } from '../../../../../base/browser/dom.js';
import { appendEscapedMarkdownInlineCode, isPortableLinkTarget, isPortableMarkdownTarget } from '../../../../../base/common/htmlContent.js';
import * as marked from '../../../../../base/common/marked/marked.js';
import { IMarkdownEdit, markdownTokensToPlainText, rewriteMarkdownLinks } from '../../../../../base/common/markdownLinks.js';
import { katexContainerClassName, katexContainerRawLatexAttributeName } from '../../../markdown/common/markedKatexExtension.js';

function createMathText(math: Element): HTMLElement {
	// eslint-disable-next-line eslint-js/no-restricted-syntax -- math may belong to a detached clipboard fragment
	const text = $(math.querySelector('.katex-display') ? 'div' : 'span');
	text.style.whiteSpace = 'pre-wrap';
	text.textContent = math.getAttribute(katexContainerRawLatexAttributeName)!;
	return text;
}

function replaceMathWithSource(fragment: DocumentFragment): boolean {
	let changed = false;
	// eslint-disable-next-line eslint-js/no-restricted-syntax -- operating on a detached fragment
	for (const math of fragment.querySelectorAll(`.${katexContainerClassName}[${katexContainerRawLatexAttributeName}]`)) {
		math.replaceWith(createMathText(math));
		changed = true;
	}
	return changed;
}

/**
 * Copies selected equations as their original Markdown, including partially selected equations.
 */
export function getMathAwareSelectionText(selection: Selection, container: HTMLElement, selectedEquations?: Set<Element>): string | undefined {
	if (selection.isCollapsed || !selection.rangeCount) {
		return undefined;
	}

	const ranges: Range[] = [];
	for (let i = 0; i < selection.rangeCount; i++) {
		const range = selection.getRangeAt(i);
		if (!isAncestor(range.commonAncestorContainer, container)) {
			return undefined;
		}
		ranges.push(range.cloneRange());
	}

	// eslint-disable-next-line eslint-js/no-restricted-syntax -- locate math intersecting the native selection
	const equations = Array.from(container.querySelectorAll(`.${katexContainerClassName}[${katexContainerRawLatexAttributeName}]`))
		.filter(math => ranges.some(range => range.intersectsNode(math)));
	if (!equations.length) {
		return undefined;
	}

	const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
	const readNativeText = (range: Range): string => {
		selection.removeAllRanges();
		selection.addRange(range);
		return selection.toString();
	};
	try {
		let hasMath = false;
		const result: string[] = [];
		for (const range of ranges) {
			const text = readNativeText(range);
			const edits: { start: number; end: number; source: string; display: boolean }[] = [];
			let previousEnd = range.cloneRange();
			previousEnd.collapse(true);
			let offset = 0;
			for (const math of equations) {
				if (!range.intersectsNode(math)) {
					continue;
				}
				const intersection = range.cloneRange();
				intersection.selectNodeContents(math);
				if (intersection.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
					intersection.setStart(range.startContainer, range.startOffset);
				}
				if (intersection.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
					intersection.setEnd(range.endContainer, range.endOffset);
				}
				const preceding = previousEnd.cloneRange();
				preceding.setEnd(intersection.startContainer, intersection.startOffset);
				const precedingText = readNativeText(preceding);
				const selectedMath = readNativeText(intersection);
				if (!selectedMath.trim()) {
					continue;
				}
				let searchStart = offset;
				while (precedingText && searchStart > 0 && /\s/.test(text[searchStart - 1])) {
					searchStart--;
				}
				const precedingIndex = text.indexOf(precedingText, searchStart);
				const mathIndex = text.indexOf(selectedMath, precedingIndex + precedingText.length);
				if (precedingIndex < 0 || mathIndex < 0) {
					console.warn('Unable to locate selected math in clipboard text; using native selection text');
					selectedEquations?.clear();
					return undefined;
				}
				if (precedingIndex < offset && edits.length) {
					edits[edits.length - 1].end = precedingIndex;
				}
				const start = precedingIndex + precedingText.length;
				const end = mathIndex + selectedMath.length;
				offset = end;
				previousEnd = intersection.cloneRange();
				previousEnd.collapse(false);
				selectedEquations?.add(math);
				// eslint-disable-next-line eslint-js/no-restricted-syntax -- retain block boundaries, not KaTeX's internal line breaks
				const display = !!math.querySelector('.katex-display');
				edits.push({ start, end, source: math.getAttribute(katexContainerRawLatexAttributeName)!, display });
			}
			hasMath ||= edits.length > 0;
			const parts: string[] = [];
			let position = 0;
			for (const edit of edits) {
				let source = edit.source;
				if (edit.display) {
					if (edit.start > 0 && text[edit.start - 1] !== '\n') {
						source = '\n' + source;
					}
					if (edit.end < text.length && text[edit.end] !== '\n') {
						source += '\n';
					}
				}
				parts.push(text.slice(position, edit.start), source);
				position = edit.end;
			}
			parts.push(text.slice(position));
			result.push(parts.join(''));
		}
		return hasMath ? result.join('') : undefined;
	} finally {
		selection.removeAllRanges();
		if (ranges.length === 1 && anchorNode && focusNode) {
			selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
		} else {
			for (const range of ranges) {
				selection.addRange(range);
			}
		}
	}
}

/**
 * Reads the target a rendered chat anchor points at. Clicks route through `data-href`, so that
 * attribute carries the semantic target while `href` may be empty or a copy-safe duplicate.
 */
export function getLinkTarget(element: Element): string {
	return (element.getAttribute('data-href') || element.getAttribute('href') || '').trim();
}

const hiddenElementAttribute = 'data-chat-clipboard-hidden';

/** Controls rendered alongside chat content; their markup says nothing about what the reader selected. */
const controlSelector = '[role="toolbar"]';

/**
 * Clones a selected range of rendered chat content along with the elements it sits inside, up to
 * `root`. `cloneContents` returns only what lies between the range boundaries, which drops both
 * the heading or list item giving the text its shape and, for a partly selected link, the rest of
 * its label. Elements the reader cannot see, such as a hidden file changes summary or the
 * stylesheet a list embeds, are left out, just as they are from the selected text, and so are
 * toolbars.
 */
export function cloneVisibleSelection(range: Range, root: Node, selectedEquations?: ReadonlySet<Element>): DocumentFragment {
	const hiddenElements = findHiddenElements(range);
	if (selectedEquations && isHTMLElement(root)) {
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- match cloned equations to the selected live equations
		for (const math of root.querySelectorAll(`.${katexContainerClassName}[${katexContainerRawLatexAttributeName}]`)) {
			if (!selectedEquations.has(math)) {
				hiddenElements.push(math);
			}
		}
	}
	for (const element of hiddenElements) {
		element.setAttribute(hiddenElementAttribute, '');
	}

	try {
		const fragment = cloneWithAncestors(range, root, selectedEquations !== undefined);
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- operating on a detached fragment
		for (const element of Array.from(fragment.querySelectorAll(`[${hiddenElementAttribute}], ${controlSelector}`))) {
			element.remove();
		}
		return fragment;
	} finally {
		for (const element of hiddenElements) {
			element.removeAttribute(hiddenElementAttribute);
		}
	}
}

/**
 * Finds the outermost elements in `range` the reader cannot see: unrendered ones, and ones a
 * collapsed section hides with `visibility: hidden` or `opacity: 0` while keeping them laid out.
 */
function findHiddenElements(range: Range): Element[] {
	const scope = range.commonAncestorContainer;
	const hiddenElements: Element[] = [];
	const walker = scope.ownerDocument!.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT, {
		acceptNode: node => {
			if (!range.intersectsNode(node)) {
				return NodeFilter.FILTER_REJECT;
			}
			const element = node as Element;
			if (element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) {
				return NodeFilter.FILTER_ACCEPT;
			}
			// A `display: contents` element has no box of its own, so it reads as hidden, but its
			// descendants render. Only read the computed style on this rare branch.
			if (getWindow(element).getComputedStyle(element).display === 'contents') {
				return NodeFilter.FILTER_SKIP;
			}
			hiddenElements.push(element);
			return NodeFilter.FILTER_REJECT;
		}
	});
	while (walker.nextNode()) {
		// The filter collects the hidden elements.
	}
	return hiddenElements;
}

function cloneWithAncestors(range: Range, root: Node, excludeUnselectableText: boolean): DocumentFragment {
	let content: Node = range.cloneContents();

	if (excludeUnselectableText) {
		const document = range.commonAncestorContainer.ownerDocument!;
		const originals = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
		const copies = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
		const excluded: Node[] = [];
		let original = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer : originals.nextNode();
		let copy = copies.nextNode();
		while (original && copy) {
			if (range.intersectsNode(original)) {
				if (original.parentElement && getWindow(original.parentElement).getComputedStyle(original.parentElement).userSelect === 'none') {
					excluded.push(copy);
				}
				copy = copies.nextNode();
			}
			original = originals.nextNode();
		}
		for (const node of excluded) {
			node.parentNode?.removeChild(node);
		}
	}

	for (
		let ancestor = range.commonAncestorContainer;
		ancestor && ancestor !== root;
		ancestor = ancestor.parentNode as Node
	) {
		if (!isHTMLElement(ancestor)) {
			continue;
		}

		// A link is one unit: selecting part of `foo.ts:42` should still copy the whole
		// reference rather than a fragment of its label.
		if (ancestor.tagName === 'A') {
			content = ancestor.cloneNode(true);
			continue;
		}

		const wrapper = ancestor.cloneNode(false);
		wrapper.appendChild(content);
		content = wrapper;
	}

	if (content.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		return content as DocumentFragment;
	}

	const fragment = range.commonAncestorContainer.ownerDocument!.createDocumentFragment();
	fragment.appendChild(content);
	return fragment;
}

/** Replaces an element with the text a reader saw, marked up as code. */
function replaceWithLabel(element: Element, label: string): void {
	if (!label.trim()) {
		element.remove();
		return;
	}

	const code = $('code');
	code.textContent = label;
	element.replaceWith(code);
}

/**
 * Rewrites a copied chat selection so it stays useful outside this window, replacing links and
 * images that only resolve here with the text the reader saw, and rendered math with its original LaTeX source. Returns whether anything changed.
 */
export function sanitizeChatClipboardFragment(fragment: DocumentFragment, replaceMath = true): boolean {
	let changed = replaceMath && replaceMathWithSource(fragment);

	// eslint-disable-next-line eslint-js/no-restricted-syntax -- operating on a detached fragment
	for (const anchor of Array.from(fragment.querySelectorAll('a'))) {
		const target = getLinkTarget(anchor);
		if (isPortableLinkTarget(target)) {
			anchor.setAttribute('href', target);
			anchor.removeAttribute('data-href');
			continue;
		}

		replaceWithLabel(anchor, anchor.textContent ?? '');
		changed = true;
	}

	// eslint-disable-next-line eslint-js/no-restricted-syntax -- operating on a detached fragment
	for (const image of Array.from(fragment.querySelectorAll('img'))) {
		if (!isPortableLinkTarget(image.getAttribute('src') ?? '')) {
			replaceWithLabel(image, image.getAttribute('alt') ?? '');
			changed = true;
		}
	}

	// eslint-disable-next-line eslint-js/no-restricted-syntax -- operating on a detached fragment
	for (const element of Array.from(fragment.querySelectorAll('[data-href]'))) {
		element.removeAttribute('data-href');
	}

	return changed;
}

function overlapsCode(start: number, end: number, codeRanges: readonly { readonly start: number; readonly end: number }[]): boolean {
	return codeRanges.some(range => start < range.end && end > range.start);
}

/**
 * Rewrites markdown so it can be shared outside this window. Chat responses address workspace
 * resources with targets that only mean something here — agent host sessions are even
 * instructed to emit absolute filesystem paths — so links and images that don't resolve
 * elsewhere are reduced to the text the reader saw.
 *
 * Raw HTML is left verbatim. Chat markdown is rendered without `supportHtml`, so a tag the model
 * wrote was never a live link, and rewriting its attributes would corrupt text the reader saw.
 */
export function toPortableMarkdown(markdown: string): string {
	return rewriteMarkdownLinks(markdown, {
		rewriteLink(token) {
			const target = token.href ?? '';
			if (!isPortableMarkdownTarget(target)) {
				const label = markdownTokensToPlainText((token as marked.Tokens.Link).tokens ?? []).trim() || (token.text ?? '').trim();
				return label ? appendEscapedMarkdownInlineCode(label) : '';
			}

			// Every definition is dropped below, so a link that named one has to start carrying
			// its own target. Spelling the target out is what tells the two apart.
			if (!token.raw.includes(target)) {
				const title = token.title ? ` "${token.title}"` : '';
				return `${token.type === 'image' ? '!' : ''}[${token.text}](${target}${title})`;
			}
			return undefined;
		},

		additionalEdits(source, { codeRanges, definitionRanges, unlocatable }) {
			const edits: IMarkdownEdit[] = [];

			// A label spanning lines inside a list or quote cannot be located, so scrub the
			// target itself rather than let an absolute path reach the clipboard. Occurrences
			// inside code are left alone: those are samples, not live links.
			for (const token of unlocatable) {
				const target = token.href ?? '';
				if (isPortableMarkdownTarget(target)) {
					continue;
				}
				const needle = `](${target})`;
				for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
					if (!overlapsCode(at, at + needle.length, codeRanges)) {
						edits.push({ start: at, end: at + needle.length, replacement: ']()' });
					}
				}
			}

			// A definition holds its target in source the reader never saw, so leaving one behind
			// would publish the very path this strips. The links that leaned on them now spell
			// their targets out, so the definitions have nothing left to say.
			edits.push(...definitionRanges.map(range => ({ ...range, replacement: '' })));
			return edits;
		},
	});
}
