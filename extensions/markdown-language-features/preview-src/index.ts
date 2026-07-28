/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker';
import { onceDocumentLoaded } from './events';
import { createPosterForVsCode } from './messaging';
import { getEditorLineNumberForPageOffset, getElementsForSourceLine, getElementsForSourceLineRange, getLineElementForFragment, scrollToRevealSourceLine } from './scroll-sync';
import { SettingsManager, getData, getRawData } from './settings';
import throttle = require('lodash.throttle');
import morphdom from 'morphdom';
import type { MarkdownPreviewChangeIndicator, MarkdownPreviewInnerChange, MarkdownPreviewLineChanges, ToWebviewMessage } from '../types/previewMessaging';
import { isOfScheme, Schemes } from '../src/util/schemes';
import { DiffScrollSyncManager } from './diffScrollSync';

let scrollDisabledCount = 0;
let scrollDisabledTimer: number | undefined;

const marker = new ActiveLineMarker();
const settings = new SettingsManager();

let documentVersion = 0;
let documentResource = settings.settings.source;
let lineChanges = settings.settings.lineChanges;

const vscode = acquireVsCodeApi();

const onDiffScroll = (mappedLine: number) => {
	scrollDisabledCount = 1;
	if (scrollDisabledTimer) {
		clearTimeout(scrollDisabledTimer);
	}
	scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 100);
	doAfterImagesLoaded(() => scrollToRevealSourceLine(mappedLine, documentVersion, settings));
};
const diffScrollSyncManager = settings.settings.diffScrollSync
	? new DiffScrollSyncManager(settings.settings.diffScrollSync, onDiffScroll)
	: undefined;

interface State {
	scrollProgress?: number;
	resource?: string;
	line?: number;
	fragment?: string;
}

const originalState: State = vscode.getState() ?? {};
const state: State = {
	...originalState,
	...getData<Partial<State>>('data-state')
};

const hasStartingLine = typeof settings.settings.line === 'number' && !isNaN(settings.settings.line);
if (typeof originalState.scrollProgress !== 'undefined'
	&& (originalState?.resource !== state.resource || (hasStartingLine && originalState.line !== settings.settings.line))) {
	state.scrollProgress = undefined;
}

// Make sure to sync VS Code state here
vscode.setState(state);

const messaging = createPosterForVsCode(vscode, settings);

window.cspAlerter.setPoster(messaging);
window.styleLoadingMonitor.setPoster(messaging);


function doAfterImagesLoaded(cb: () => void) {
	const imgElements = document.getElementsByTagName('img');
	if (imgElements.length > 0) {
		const ps = Array.from(imgElements, e => {
			if (e.complete) {
				return Promise.resolve();
			} else {
				return new Promise<void>((resolve) => {
					e.addEventListener('load', () => resolve());
					e.addEventListener('error', () => resolve());
				});
			}
		});
		Promise.all(ps).then(() => setTimeout(cb, 0));
	} else {
		setTimeout(cb, 0);
	}
}

onceDocumentLoaded(() => {
	// Load initial html
	const htmlParser = new DOMParser();
	const markDownHtml = htmlParser.parseFromString(
		getRawData('data-initial-md-content'),
		'text/html'
	);

	const newElements = [...markDownHtml.body.children];
	document.body.append(...newElements);
	for (const el of newElements) {
		if (el instanceof HTMLElement) {
			domEval(el);
		}
	}

	// Restore
	const scrollProgress = state.scrollProgress;
	addImageContexts();
	applyLineChanges(lineChanges);
	if (typeof scrollProgress === 'number' && !settings.settings.fragment) {
		doAfterImagesLoaded(() => {
			scrollDisabledCount = 1;
			if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
			scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
			// Always set scroll of at least 1 to prevent VS Code's webview code from auto scrolling us
			const scrollToY = Math.max(1, scrollProgress * document.body.clientHeight);
			window.scrollTo(0, scrollToY);
		});
		return;
	}

	if (settings.settings.scrollPreviewWithEditor) {
		doAfterImagesLoaded(() => {
			// Try to scroll to fragment if available
			if (settings.settings.fragment) {
				let fragment: string;
				try {
					fragment = encodeURIComponent(settings.settings.fragment);
				} catch {
					fragment = settings.settings.fragment;
				}
				state.fragment = undefined;
				vscode.setState(state);

				const element = getLineElementForFragment(fragment, documentVersion);
				if (element) {
					scrollDisabledCount = 1;
					if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
					scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
					scrollToRevealSourceLine(element.line, documentVersion, settings);
				}
			} else {
				if (!isNaN(settings.settings.line!)) {
					scrollDisabledCount = 1;
					if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
					scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
					scrollToRevealSourceLine(settings.settings.line!, documentVersion, settings);
				}
			}
		});
	}

	if (typeof settings.settings.selectedLine === 'number') {
		marker.onDidChangeTextEditorSelection(settings.settings.selectedLine, documentVersion);
	}
});

const onUpdateView = (() => {
	const doScroll = throttle((line: number) => {
		scrollDisabledCount = 1;
		if (scrollDisabledTimer) {
			clearTimeout(scrollDisabledTimer);
		}
		scrollDisabledTimer = window.setTimeout(() => {
			scrollDisabledCount = 0;
		}, 50);
		doAfterImagesLoaded(() => scrollToRevealSourceLine(line, documentVersion, settings));
	}, 50);

	return (line: number) => {
		if (!isNaN(line)) {
			state.line = line;

			doScroll(line);
		}
	};
})();

window.addEventListener('resize', () => {
	scrollDisabledCount = 1;
	if (scrollDisabledTimer) { clearTimeout(scrollDisabledTimer); }
	scrollDisabledTimer = window.setTimeout(() => { scrollDisabledCount = 0; }, 200);
	updateScrollProgress();
}, true);

function addImageContexts() {
	const images = document.getElementsByTagName('img');
	let idNumber = 0;
	for (const img of images) {
		img.id = 'image-' + idNumber;
		idNumber += 1;
		const imageSource = img.getAttribute('data-src');
		const isLocalFile = imageSource && !(isOfScheme(Schemes.http, imageSource) || isOfScheme(Schemes.https, imageSource));
		const webviewSection = isLocalFile ? 'localImage' : 'image';
		img.setAttribute('data-vscode-context', JSON.stringify({ webviewSection, id: img.id, 'preventDefaultContextMenuItems': true, resource: documentResource, imageSource }));
	}
}

async function copyImage(image: HTMLImageElement, retries = 5) {
	if (!document.hasFocus() && retries > 0) {
		// copyImage is called at the same time as webview.reveal, which means this function is running whilst the webview is gaining focus.
		// Since navigator.clipboard.write requires the document to be focused, we need to wait for focus.
		// We cannot use a listener, as there is a high chance the focus is gained during the setup of the listener resulting in us missing it.
		setTimeout(() => { copyImage(image, retries - 1); }, 20);
		return;
	}

	try {
		await navigator.clipboard.write([new ClipboardItem({
			'image/png': new Promise((resolve) => {
				const canvas = document.createElement('canvas');
				if (canvas !== null) {
					canvas.width = image.naturalWidth;
					canvas.height = image.naturalHeight;
					const context = canvas.getContext('2d');
					context?.drawImage(image, 0, 0);
				}
				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					}
					canvas.remove();
				}, 'image/png');
			})
		})]);
	} catch (e) {
		console.error(e);
		const selection = window.getSelection();
		if (!selection) {
			await navigator.clipboard.writeText(image.getAttribute('data-src') ?? image.src);
			return;
		}
		selection.removeAllRanges();
		const range = document.createRange();
		range.selectNode(image);
		selection.addRange(range);
		document.execCommand('copy');
		selection.removeAllRanges();
	}
}

window.addEventListener('message', async event => {
	const data = event.data as ToWebviewMessage.Type;
	switch (data.type) {
		case 'copyImage': {
			const img = document.getElementById(data.id);
			if (img instanceof HTMLImageElement) {
				copyImage(img);
			}
			return;
		}
		case 'onDidChangeTextEditorSelection':
			if (data.source === documentResource) {
				marker.onDidChangeTextEditorSelection(data.line, documentVersion);
			}
			return;

		case 'updateView':
			if (data.source === documentResource) {
				onUpdateView(data.line);
			}
			return;

		case 'updateContent': {
			lineChanges = data.lineChanges;
			if (data.diffScrollSync) {
				diffScrollSyncManager?.update(data.diffScrollSync);
			}
			const root = document.querySelector('.markdown-body')!;

			const parser = new DOMParser();
			const newContent = parser.parseFromString(data.content, 'text/html'); // CodeQL [SM03712] This renderers content from the workspace into the Markdown preview. Webviews (and the markdown preview) have many other security measures in place to make this safe

			// Strip out meta http-equiv tags
			for (const metaElement of Array.from(newContent.querySelectorAll('meta'))) {
				if (metaElement.hasAttribute('http-equiv')) {
					metaElement.remove();
				}
			}

			if (data.source !== documentResource) {
				documentResource = data.source;
				const newBody = newContent.querySelector('.markdown-body')!;
				root.replaceWith(newBody);
				domEval(newBody);
			} else {
				const newRoot = newContent.querySelector('.markdown-body')!;

				// Move styles to head
				// This prevents an ugly flash of unstyled content
				const styles = newRoot.querySelectorAll('link');
				for (const style of styles) {
					style.remove();
				}
				newRoot.prepend(...styles);

				morphdom(root, newRoot, {
					childrenOnly: true,
					onBeforeElUpdated: (fromEl: Element, toEl: Element) => {
						if (areNodesEqual(fromEl, toEl)) {
							// areEqual doesn't look at `data-line` so copy those over manually
							const fromLines = fromEl.querySelectorAll('[data-line]');
							const toLines = toEl.querySelectorAll('[data-line]');
							if (fromLines.length !== toLines.length) {
								console.log('unexpected line number change');
							}

							for (let i = 0; i < fromLines.length; ++i) {
								const fromChild = fromLines[i];
								const toChild = toLines[i];
								if (toChild) {
									fromChild.setAttribute('data-line', toChild.getAttribute('data-line')!);
								}
							}

							return false;
						}

						if (fromEl.tagName === 'DETAILS' && toEl.tagName === 'DETAILS') {
							if (fromEl.hasAttribute('open')) {
								toEl.setAttribute('open', '');
							}
						}

						return true;
					},
					addChild: (parentNode: Node, childNode: Node) => {
						parentNode.appendChild(childNode);
						if (childNode instanceof HTMLElement) {
							domEval(childNode);
						}
					}
				});
			}

			++documentVersion;

			window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
			addImageContexts();
			applyLineChanges(lineChanges);
			break;
		}
	}
}, false);

function applyLineChanges(lineChanges: MarkdownPreviewLineChanges | undefined): void {
	for (const element of document.querySelectorAll('.code-line-diff-added, .code-line-diff-deleted, .code-line-diff-modified')) {
		element.classList.remove('code-line-diff', 'code-line-diff-added', 'code-line-diff-deleted', 'code-line-diff-modified');
	}

	// Remove previous change indicators
	for (const element of document.querySelectorAll('.diff-change-indicator')) {
		element.remove();
	}

	// Remove previous modification gutter bars
	for (const element of document.querySelectorAll('.diff-modification-gutter')) {
		element.remove();
	}

	markChangedLines(lineChanges?.added, 'code-line-diff-added');
	markChangedLines(lineChanges?.deleted, 'code-line-diff-deleted');

	applyChangeIndicators(lineChanges);
	applyInnerChangeHighlights(lineChanges);
}

function markChangedLines(lines: readonly number[] | undefined, className: string): void {
	if (!lines) {
		return;
	}

	for (const line of lines) {
		const { previous, next } = getElementsForSourceLine(line, documentVersion);
		const lineElement = previous.line >= 0 ? previous : next;
		const element = lineElement?.codeElement || lineElement?.element;
		if (element) {
			element.classList.add('code-line-diff', className);
		}
	}
}


function applyChangeIndicators(lineChanges: MarkdownPreviewLineChanges | undefined): void {
	if (!lineChanges?.changeIndicators?.length) {
		return;
	}

	for (const block of getRenderedChangeBlocks(lineChanges.changeIndicators)) {
		if (block.indicator.type === 'deletion') {
			const wrapper = createChangeIndicatorElement(block.indicator);
			block.elements[0].parentElement?.insertBefore(wrapper, block.elements[0]);
			continue;
		}

		let isFirst = true;
		for (const element of block.elements) {
			element.classList.add('code-line-diff-modified');
			addModificationGutterBar(element, isFirst ? block.indicator : undefined);
			isFirst = false;
		}
	}
}

interface RenderedChangeBlock {
	readonly indicator: MarkdownPreviewChangeIndicator;
	readonly elements: readonly HTMLElement[];
}

function getRenderedChangeBlocks(indicators: readonly MarkdownPreviewChangeIndicator[]): RenderedChangeBlock[] {
	const blocks: RenderedChangeBlock[] = [];
	for (const indicator of indicators) {
		const elements = indicator.type === 'deletion'
			? getDeletionChangeElements(indicator.modifiedLine)
			: getModificationChangeElements(indicator.modifiedLine, indicator.modifiedLineCount);
		if (elements.length) {
			blocks.push({ indicator, elements });
		}
	}
	return blocks;
}

function getDeletionChangeElements(modifiedLine: number): readonly HTMLElement[] {
	const { previous, next } = getElementsForSourceLine(modifiedLine, documentVersion);
	const targetElement = (previous.line === modifiedLine)
		? (previous.codeElement || previous.element)
		: (next?.codeElement || next?.element || previous.codeElement || previous.element);
	return targetElement ? [targetElement] : [];
}

function getModificationChangeElements(modifiedLine: number, modifiedLineCount: number): readonly HTMLElement[] {
	const elements: HTMLElement[] = [];
	const seen = new Set<HTMLElement>();
	const lineElements = getElementsForSourceLineRange(modifiedLine, modifiedLine + modifiedLineCount, documentVersion);
	for (const lineElement of lineElements) {
		const element = lineElement.codeElement || lineElement.element;
		if (element && !seen.has(element)) {
			seen.add(element);
			elements.push(element);
		}
	}
	return elements;
}

function createChangeIndicatorElement(indicator: MarkdownPreviewChangeIndicator): HTMLDivElement {
	const wrapper = document.createElement('div');
	wrapper.className = `diff-change-indicator diff-change-indicator-${indicator.type}`;
	wrapper.setAttribute('data-original-line-count', String(indicator.originalLineCount));

	const arrowLine = document.createElement('span');
	arrowLine.className = 'diff-change-indicator-arrow';
	const tooltip = createDiffTooltip(indicator);
	arrowLine.appendChild(tooltip);
	wrapper.appendChild(arrowLine);

	return wrapper;
}

function addModificationGutterBar(element: HTMLElement, indicator?: MarkdownPreviewChangeIndicator): void {
	const gutter = document.createElement('div');
	gutter.className = 'diff-modification-gutter';

	if (indicator) {
		const tooltip = createDiffTooltip(indicator);
		gutter.appendChild(tooltip);
	}

	element.style.position = 'relative';
	element.appendChild(gutter);
}

function createDiffTooltip(indicator: MarkdownPreviewChangeIndicator): HTMLDivElement {
	const tooltip = document.createElement('div');
	tooltip.className = 'diff-change-indicator-tooltip';

	if (indicator.originalContent) {
		appendDiffTooltipSection(tooltip, 'diff-tooltip-deleted', indicator.originalContent, indicator.originalInnerChanges, 'diff-tooltip-inner-deleted');
	}
	if (indicator.modifiedContent) {
		appendDiffTooltipSection(tooltip, 'diff-tooltip-added', indicator.modifiedContent, indicator.modifiedInnerChanges, 'diff-tooltip-inner-added');
	}

	return tooltip;
}

function appendDiffTooltipSection(tooltip: HTMLElement, className: string, content: string, innerChanges: readonly MarkdownPreviewInnerChange[] | undefined, innerChangeClassName: string): void {
	const section = document.createElement('div');
	section.className = className;
	const pre = document.createElement('pre');
	appendDiffTooltipContent(pre, content, innerChanges, innerChangeClassName);
	section.appendChild(pre);
	tooltip.appendChild(section);
}

function appendDiffTooltipContent(container: HTMLElement, content: string, innerChanges: readonly MarkdownPreviewInnerChange[] | undefined, innerChangeClassName: string): void {
	if (!innerChanges?.length) {
		container.textContent = content;
		return;
	}

	const innerChangesByLine = groupInnerChangesByLine(innerChanges);
	const lines = content.split('\n');
	for (let line = 0; line < lines.length; ++line) {
		appendDiffTooltipLine(container, lines[line], innerChangesByLine.get(line), innerChangeClassName);
		if (line + 1 < lines.length) {
			container.appendChild(document.createTextNode('\n'));
		}
	}
}

function appendDiffTooltipLine(container: HTMLElement, lineText: string, innerChanges: readonly MarkdownPreviewInnerChange[] | undefined, innerChangeClassName: string): void {
	const normalizedInnerChanges = normalizeInnerChanges(innerChanges, lineText.length);
	let offset = 0;
	for (const change of normalizedInnerChanges) {
		if (offset < change.startColumn) {
			container.appendChild(document.createTextNode(lineText.slice(offset, change.startColumn)));
		}

		const span = document.createElement('span');
		span.className = innerChangeClassName;
		span.textContent = lineText.slice(change.startColumn, change.endColumn);
		container.appendChild(span);
		offset = change.endColumn;
	}

	if (offset < lineText.length) {
		container.appendChild(document.createTextNode(lineText.slice(offset)));
	}
}

function groupInnerChangesByLine(innerChanges: readonly MarkdownPreviewInnerChange[]): Map<number, readonly MarkdownPreviewInnerChange[]> {
	const groupedInnerChanges = new Map<number, MarkdownPreviewInnerChange[]>();
	for (const change of innerChanges) {
		const lineChanges = groupedInnerChanges.get(change.line);
		if (lineChanges) {
			lineChanges.push(change);
		} else {
			groupedInnerChanges.set(change.line, [change]);
		}
	}
	return groupedInnerChanges;
}

function normalizeInnerChanges(innerChanges: readonly MarkdownPreviewInnerChange[] | undefined, lineLength: number): { startColumn: number; endColumn: number }[] {
	if (!innerChanges?.length) {
		return [];
	}

	const sortedInnerChanges = innerChanges
		.map(change => ({
			startColumn: clampColumn(change.startColumn, lineLength),
			endColumn: clampColumn(change.endColumn, lineLength),
		}))
		.filter(change => change.startColumn < change.endColumn)
		.sort((a, b) => a.startColumn - b.startColumn || a.endColumn - b.endColumn);
	const normalizedInnerChanges: { startColumn: number; endColumn: number }[] = [];
	for (const change of sortedInnerChanges) {
		const previous = normalizedInnerChanges[normalizedInnerChanges.length - 1];
		if (previous && change.startColumn <= previous.endColumn) {
			previous.endColumn = Math.max(previous.endColumn, change.endColumn);
		} else {
			normalizedInnerChanges.push(change);
		}
	}
	return normalizedInnerChanges;
}

function clampColumn(column: number, lineLength: number): number {
	return Math.min(Math.max(column, 0), lineLength);
}


function applyInnerChangeHighlights(lineChanges: MarkdownPreviewLineChanges | undefined): void {
	const diffHighlightAddedName = 'diff-inner-added';
	const diffHighlightDeletedName = 'diff-inner-deleted';

	// Clear previous highlights
	CSS.highlights?.delete(diffHighlightAddedName);
	CSS.highlights?.delete(diffHighlightDeletedName);

	if (!lineChanges?.innerChanges?.length || !CSS.highlights) {
		return;
	}

	const highlightName = lineChanges.added ? diffHighlightAddedName : diffHighlightDeletedName;
	const ranges: Range[] = [];

	// Find all marker pairs and create Range objects between them
	const root = document.querySelector('.markdown-body');
	if (!root) {
		return;
	}

	for (const { startMarker, endMarker } of getDiffMarkerPairs(root)) {
		const range = new Range();
		range.setStartAfter(startMarker);
		range.setEndBefore(endMarker);
		ranges.push(range);
	}

	if (ranges.length > 0) {
		CSS.highlights.set(highlightName, new Highlight(...ranges));
	}
}

interface DiffMarkerPair {
	readonly startMarker: Element;
	readonly endMarker: Element;
}

function getDiffMarkerPairs(root: Element): DiffMarkerPair[] {
	const endMarkersById = new Map<string, Element>();
	for (const endMarker of root.querySelectorAll('[data-diff-end]')) {
		const id = endMarker.getAttribute('data-diff-end');
		if (id !== null) {
			endMarkersById.set(id, endMarker);
		}
	}

	const pairs: DiffMarkerPair[] = [];
	for (const startMarker of root.querySelectorAll('[data-diff-start]')) {
		const id = startMarker.getAttribute('data-diff-start');
		const endMarker = id === null ? undefined : endMarkersById.get(id);
		if (endMarker && !(startMarker.compareDocumentPosition(endMarker) & Node.DOCUMENT_POSITION_PRECEDING)) {
			pairs.push({ startMarker, endMarker });
		}
	}
	return pairs;
}



document.addEventListener('dblclick', event => {
	if (!settings.settings.doubleClickToSwitchToEditor) {
		return;
	}

	// Disable double-click to switch editor for .copilotmd files
	if (documentResource.endsWith('.copilotmd')) {
		return;
	}

	// Ignore clicks on links
	for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
		if (node.tagName === 'A') {
			return;
		}
	}

	const offset = event.pageY;
	const line = getEditorLineNumberForPageOffset(offset, documentVersion);
	if (typeof line === 'number' && !isNaN(line)) {
		messaging.postMessage('didClick', { line: Math.floor(line) });
	}
});

const passThroughLinkSchemes = ['http:', 'https:', 'mailto:', 'vscode:', 'vscode-insiders:'];

document.addEventListener('click', event => {
	if (!event) {
		return;
	}

	let node = event.target as Element | null;
	while (node) {
		if (node.tagName && node.tagName === 'A' && (node as HTMLAnchorElement).href) {
			if (node.getAttribute('href')?.startsWith('#')) {
				return;
			}

			let hrefText = node.getAttribute('data-href');
			if (!hrefText) {
				hrefText = node.getAttribute('href');
				// Pass through known schemes
				if (hrefText && passThroughLinkSchemes.some(scheme => hrefText!.startsWith(scheme))) {
					return;
				}
			}

			// If original link doesn't look like a url, delegate back to VS Code to resolve
			if (hrefText && !/^[a-z\-]+:/i.test(hrefText)) {
				messaging.postMessage('openLink', { href: hrefText });
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			return;
		}
		node = node.parentElement;
	}
}, true);

window.addEventListener('scroll', throttle(() => {
	updateScrollProgress();

	if (scrollDisabledCount > 0) {
		return;
	}

	const line = getEditorLineNumberForPageOffset(window.scrollY, documentVersion);
	if (typeof line === 'number' && !isNaN(line)) {
		state.line = line;
		vscode.setState(state);
		messaging.postMessage('revealLine', { line });
		diffScrollSyncManager?.broadcastScroll(line);
	}
}, 50));

function updateScrollProgress() {
	state.scrollProgress = window.scrollY / document.body.clientHeight;
	vscode.setState(state);
}


/**
 * Compares two nodes for morphdom to see if they are equal.
 *
 * This skips some attributes that should not cause equality to fail.
 */
function areNodesEqual(a: Element, b: Element): boolean {
	const skippedAttrs = [
		'open', // for details
	];

	if (a.isEqualNode(b)) {
		return true;
	}

	if (a.tagName !== b.tagName || a.textContent !== b.textContent) {
		return false;
	}

	const aAttrs = [...a.attributes].filter(attr => !skippedAttrs.includes(attr.name));
	const bAttrs = [...b.attributes].filter(attr => !skippedAttrs.includes(attr.name));
	if (aAttrs.length !== bAttrs.length) {
		return false;
	}

	for (let i = 0; i < aAttrs.length; ++i) {
		const aAttr = aAttrs[i];
		const bAttr = bAttrs[i];
		if (aAttr.name !== bAttr.name) {
			return false;
		}
		if (aAttr.value !== bAttr.value && aAttr.name !== 'data-line') {
			return false;
		}
	}

	const aChildren = Array.from(a.children);
	const bChildren = Array.from(b.children);

	return aChildren.length === bChildren.length && aChildren.every((x, i) => areNodesEqual(x, bChildren[i]));
}


function domEval(el: Element): void {
	const preservedScriptAttributes: (keyof HTMLScriptElement)[] = [
		'type', 'src', 'nonce', 'noModule', 'async',
	];

	const scriptNodes = el.tagName === 'SCRIPT' ? [el] : Array.from(el.getElementsByTagName('script'));

	for (const node of scriptNodes) {
		if (!(node instanceof HTMLElement)) {
			continue;
		}

		const scriptTag = document.createElement('script');
		const trustedScript = node.innerText;
		scriptTag.text = trustedScript as string;
		for (const key of preservedScriptAttributes) {
			const val = node.getAttribute?.(key);
			if (val) {
				scriptTag.setAttribute(key, val);
			}
		}

		node.insertAdjacentElement('afterend', scriptTag);
		node.remove();
	}
}
