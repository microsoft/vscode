/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { safeIntl } from '../../../../../../base/common/date.js';
import { GraphemeIterator } from '../../../../../../base/common/strings.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

export const STREAMING_ANIMATION_CONFIG = {
	/** Class applied to all streaming tokens */
	tokenClass: 'chat-streaming-token',
	/** Class applied to tokens that should animate */
	animatingClass: 'chat-streaming-token-animating',
	/** Milliseconds delay between each token's animation start */
	delayIncrement: 20,
	/** Maximum total animation delay in milliseconds */
	maxDelay: 300,
	/** Elements that should be animated as single units (like links/inline code) */
	animatableWidgets: {
		/** CSS classes that identify animatable widgets */
		classes: [
			'chat-inline-anchor-widget', // File/symbol reference widgets in responses
			'katex',                     // Inline math formulas
			'katex-display',             // Display/block math formulas
		],
		/** Tag names that identify animatable widgets */
		tagNames: [
			'img',                       // Inline images
		],
	},
	/** CSS selector for elements to skip entirely (no animation) */
	skipSelector: 'pre, [data-code], .monaco-editor, .chat-codeblock-pill-container, .chat-codeblock-pill-widget, .chat-extensions-content-part',
} as const;

/**
 * Track how many characters have already been animated per response.
 * This persists across DOM re-renders so we don't re-animate already-visible content.
 */
const animatedTextLengths = new WeakMap<IChatResponseViewModel, number>();

type StreamingNodeType = 'text' | 'element-wrapper' | 'skip' | 'ignore';

/**
 * Wraps an element in an animation token span.
 * Used for anchors, inline code, and animatable widgets that should animate as a single unit.
 */
function wrapElementAsToken(
	node: HTMLElement,
	currentCharPosition: number,
	previouslyAnimatedLength: number,
	newTokens: HTMLElement[],
	document: Document
): number {
	const parent = node.parentNode;
	const textLength = node.textContent?.length ?? 0;

	if (parent && currentCharPosition >= previouslyAnimatedLength) {
		const wrapper = document.createElement('span');
		wrapper.classList.add('token', STREAMING_ANIMATION_CONFIG.tokenClass, STREAMING_ANIMATION_CONFIG.animatingClass);
		parent.replaceChild(wrapper, node);
		wrapper.appendChild(node);
		newTokens.push(wrapper);
	}

	return textLength;
}

function isAnimatableWidget(element: HTMLElement): boolean {
	const { classes, tagNames } = STREAMING_ANIMATION_CONFIG.animatableWidgets;
	return classes.some(cls => element.classList.contains(cls)) ||
		(tagNames as readonly string[]).includes(element.tagName.toLowerCase());
}

function classifyNodeForStreaming(node: Node): StreamingNodeType {
	if (node.nodeType === Node.TEXT_NODE) {
		if (!node.nodeValue) {
			return 'ignore';
		}
		return shouldSkipTextNode(node as Text) ? 'skip' : 'text';
	}
	if (!dom.isHTMLElement(node)) {
		return 'ignore';
	}
	if (node.closest(`.${STREAMING_ANIMATION_CONFIG.tokenClass}`)) {
		return 'ignore';
	}
	if (shouldSkipElement(node)) {
		return 'ignore';
	}

	// Anchors, inline code (not in pre), and animatable widgets all get wrapped as units
	if (dom.isHTMLAnchorElement(node)) {
		return 'element-wrapper';
	}
	if (node.tagName.toLowerCase() === 'code' && !node.closest('pre')) {
		return 'element-wrapper';
	}
	if (isAnimatableWidget(node)) {
		return 'element-wrapper';
	}

	return 'ignore';
}

function shouldSkipTextNode(node: Text): boolean {
	const parent = node.parentElement;
	if (!parent) {
		return true;
	}

	// Build a combined selector for all skip conditions
	const { tokenClass, animatableWidgets, skipSelector } = STREAMING_ANIMATION_CONFIG;
	const skipSelectors = [
		`.${tokenClass}`,              // Already wrapped
		'a',                           // Inside anchor (wrapped as unit)
		'code:not(pre code)',          // Inline code (wrapped as unit)
		...animatableWidgets.classes.map(cls => `.${cls}`),
		skipSelector,
	].join(', ');

	return !!parent.closest(skipSelectors);
}

function shouldSkipElement(element: HTMLElement): boolean {
	return !!element.closest(STREAMING_ANIMATION_CONFIG.skipSelector);
}

/**
 * Iterates over graphemes (user-perceived characters) in a string.
 * Handles emoji, combining characters, etc.
 */
function* iterateGraphemes(str: string): IterableIterator<string> {
	const segmenter = safeIntl.Segmenter(undefined, { granularity: 'grapheme' });
	if (segmenter.value) {
		for (const { segment } of segmenter.value.segment(str)) {
			yield segment;
		}
		return;
	}

	// Fallback for environments without Intl.Segmenter
	const iterator = new GraphemeIterator(str);
	let offset = 0;
	while (!iterator.eol()) {
		const length = iterator.nextGraphemeLength();
		yield str.substring(offset, offset + length);
		offset += length;
	}
}

interface TokenizationResult {
	/** Newly created token elements that need animation */
	newTokens: HTMLElement[];
	/** Total text length after tokenization */
	totalTextLength: number;
}

/**
 * Tokenizes new content in the chat markdown DOM for streaming animation.
 * Only wraps NEW tokens (characters that haven't been animated yet) - old content is left as raw text.
 */
function tokenizeChatMarkdownDomForStreaming(root: HTMLElement, element: IChatResponseViewModel): TokenizationResult {
	const document = root.ownerDocument;
	const newTokens: HTMLElement[] = [];

	const totalTextLength = root.textContent?.length ?? 0;
	const previouslyAnimatedLength = animatedTextLengths.get(element) ?? 0;

	// If no new content, nothing to animate
	if (totalTextLength <= previouslyAnimatedLength) {
		return { newTokens, totalTextLength };
	}

	let currentCharPosition = 0;

	// PASS 1: Collect all nodes to process without modifying DOM
	// (TreeWalker breaks if you modify DOM while iterating)
	const window = dom.getWindow(root);
	const nodesToProcess: Array<{ node: Node; type: StreamingNodeType }> = [];

	const walker = document.createTreeWalker(
		root,
		window.NodeFilter.SHOW_ELEMENT | window.NodeFilter.SHOW_TEXT
	);

	let node: Node | null;
	while ((node = walker.nextNode())) {
		const type = classifyNodeForStreaming(node);
		if (type !== 'ignore') {
			nodesToProcess.push({ node, type });
		}
	}

	// PASS 2: Process collected nodes
	for (const { node, type } of nodesToProcess) {
		if (type === 'text' && node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue;
			if (!text) {
				continue;
			}

			const fragment = document.createDocumentFragment();

			for (const grapheme of iterateGraphemes(text)) {
				const isNew = currentCharPosition >= previouslyAnimatedLength;

				// Whitespace and old content: add as raw text (no wrapper needed)
				if (grapheme.trim().length === 0 || !isNew) {
					fragment.appendChild(document.createTextNode(grapheme));
					currentCharPosition += grapheme.length;
					continue;
				}

				// New content: wrap in animating span
				const span = document.createElement('span');
				span.classList.add('token', STREAMING_ANIMATION_CONFIG.tokenClass, STREAMING_ANIMATION_CONFIG.animatingClass);
				span.textContent = grapheme;
				fragment.appendChild(span);
				newTokens.push(span);
				currentCharPosition += grapheme.length;
			}

			const parent = node.parentNode;
			if (parent) {
				parent.replaceChild(fragment, node);
			}
		} else if (type === 'element-wrapper' && dom.isHTMLElement(node)) {
			// Wrap entire element (anchor, inline code, widget) as single token
			currentCharPosition += wrapElementAsToken(
				node,
				currentCharPosition,
				previouslyAnimatedLength,
				newTokens,
				document
			);
		} else if (type === 'skip') {
			// Skipped content (e.g., code blocks): just advance the position counter
			// without any DOM manipulation to keep position tracking in sync
			const textLength = node.textContent?.length ?? 0;
			currentCharPosition += textLength;
		}
	}

	return { newTokens, totalTextLength };
}

function applyStaggeredAnimationDelays(tokens: HTMLElement[]): void {
	const { animatingClass, delayIncrement, maxDelay } = STREAMING_ANIMATION_CONFIG;

	tokens.forEach((token, index) => {
		if (token.classList.contains(animatingClass)) {
			const delay = Math.min(index * delayIncrement, maxDelay);
			token.style.animationDelay = `${delay}ms`;
		}
	});
}

/**
 * Applies streaming animation to new content in a chat response.
 *
 * @param domNode The DOM node containing the rendered markdown
 * @param element The chat response view model
 * @param enabled Whether streaming animation is enabled
 */
export function applyStreamingAnimation(
	domNode: HTMLElement,
	element: IChatResponseViewModel,
	enabled: boolean
): void {
	if (!enabled || element.isCanceled) {
		return;
	}

	const previouslyAnimatedLength = animatedTextLengths.get(element) ?? 0;
	const currentTextLength = domNode.textContent?.length ?? 0;
	const isLoadingCompletedResponse = element.isComplete && previouslyAnimatedLength === 0;

	if (isLoadingCompletedResponse) {
		// Mark as fully animated so we don't re-check on future renders
		animatedTextLengths.set(element, currentTextLength);
		return;
	}

	if (currentTextLength <= previouslyAnimatedLength) {
		return; // No new content
	}

	const { newTokens, totalTextLength } = tokenizeChatMarkdownDomForStreaming(domNode, element);
	applyStaggeredAnimationDelays(newTokens);
	animatedTextLengths.set(element, totalTextLength);
}
