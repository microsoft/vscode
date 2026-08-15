/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */

// Only `import type` is allowed in preload scripts — Electron preloads cannot resolve module imports at runtime.
import type { BrowserElementSelectionMode, IBrowserElementCommentsUpdate, IBrowserElementSelectionOptions, IBrowserViewPreloadLocalizedStrings, IBrowserViewTheme, IBrowserViewRect } from '../common/browserView.js';

const commentElementSelectionMode = 'comment' as BrowserElementSelectionMode;
let localizedStrings: IBrowserViewPreloadLocalizedStrings = {
	addComment: 'Add Comment',
	addCommentPlaceholder: 'Add a comment',
	commentOnSelectedElement: 'Comment on selected element',
	elementComment: 'Element comment {0}',
	elementCommentWithBody: 'Element comment {0}: {1}',
	emptyElementComment: 'Empty element comment {0}',
	removeComment: 'Remove Comment',
	removeElementComment: 'Remove element comment',
};

/**
 * Preload script for pages loaded in Integrated Browser
 *
 * It runs in an isolated context that Electron calls an "isolated world".
 * Specifically the isolated world with worldId 999, which shows in DevTools as "Electron Isolated Context".
 * Despite being isolated, it still runs on the same page as the JS from the actual loaded website
 * which runs on the so-called "main world" (worldId 0. In DevTools as "top").
 *
 * Learn more: see Electron docs for Security, contextBridge, and Context Isolation.
 */
function init() {
	const { contextBridge, ipcRenderer } = require('electron');

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
	// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/electron/electron/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	// Ctrl/Cmd keybindings that correspond to native editing shortcuts and should be handled by the browser / OS and not forwarded to the workbench.
	const nativeCtrlCmdKeybindings = {
		mac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z']),
			withShift: new Set(['v', 'z']),
		},
		nonMac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z', 'y']),
			withShift: new Set(['v', 'z']),
		}
	};

	// Listen for keydown events that the page did not handle and forward them for shortcut handling.
	window.addEventListener('keydown', (event) => {
		// Require that the event is trusted -- i.e. user-initiated.
		if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
			return;
		}

		// If the event was already handled by the page, do not forward it.
		if (event.defaultPrevented) {
			return;
		}

		const isNonEditingKey =
			event.key === 'Escape' ||
			/^F\d+$/.test(event.key) ||
			event.key.startsWith('Audio') || event.key.startsWith('Media') || event.key.startsWith('Browser');

		// Only forward if there's a command modifier or it's a non-editing key
		// (most plain key events should just be handled natively by the browser and not forwarded)
		if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
			return;
		}

		// Never handle plain modifier key presses as keybindings
		if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
			return;
		}

		const isMac = navigator.platform.indexOf('Mac') >= 0;

		// Alt+Key special character handling (Alt + Numpad keys on Windows/Linux, Alt + any key on Mac)
		if (event.altKey && !event.ctrlKey && !event.metaKey) {
			if (isMac || /^Numpad\d+$/.test(event.code)) {
				return;
			}
		}

		// Allow Shift+F10 for context menu
		if (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
			return;
		}

		// Allow native shortcuts to be handled by the browser
		const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
		if (ctrlCmd && !event.altKey) {
			let key = event.key.toLowerCase();
			// Prefer remapped Latin letters, falling back to the physical key for non-Latin layouts.
			if (!/^[a-z]$/.test(key) && /^Key[A-Z]$/.test(event.code)) {
				key = event.code.slice(3).toLowerCase();
			}
			const keySetsToCheck = [
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'].always,
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'][event.shiftKey ? 'withShift' : 'noShift'],
			];
			if (keySetsToCheck.some(set => set.has(key))) {
				return;
			}

			// Emoji picker on Mac
			if (isMac && event.ctrlKey && !event.shiftKey && key === ' ') {
				return;
			}
		}

		// Everything else should be forwarded to the workbench for potential shortcut handling.
		event.preventDefault();
		event.stopPropagation();
		ipcRenderer.send('vscode:browserView:keydown', {
			key: event.key,
			keyCode: event.keyCode,
			code: event.code,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			repeat: event.repeat
		});
	});

	const elementPicker = new ElementPicker(
		(el, comment) => {
			const elementId = track(el);
			ipcRenderer.send('vscode:browserView:elementPicked', { elementId, comment });
			return elementId;
		},
		elementId => ipcRenderer.send('vscode:browserView:elementCommentRemoved', elementId),
		() => ipcRenderer.send('vscode:browserView:elementPickStopped')
	);

	const areaPicker = new AreaPicker(
		rect => ipcRenderer.send('vscode:browserView:areaPicked', rect),
		() => ipcRenderer.send('vscode:browserView:areaPickStopped')
	);

	const trackedElementsById = new Map<string, WeakRef<Element>>();
	const finalizationRegistry = new FinalizationRegistry<string>(id => {
		trackedElementsById.delete(id);
	});

	function track(element: Element): string {
		const id = `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		trackedElementsById.set(id, new WeakRef(element));
		finalizationRegistry.register(element, id);
		return id;
	}

	let contextMenuTarget: { ref: WeakRef<Element>; anchor: { x: number; y: number } } | undefined;
	window.addEventListener('contextmenu', (event) => {
		if (!event.isTrusted) {
			return;
		}
		const target = elementPicker.resolveContextMenuTarget(event);
		if (target) {
			const els = [target];
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				els.push(selection.anchorNode as Element, selection.focusNode as Element);
			}
			contextMenuTarget = {
				ref: new WeakRef(findCommonVisibleAncestor(els) ?? target),
				anchor: { x: event.clientX, y: event.clientY },
			};
		} else {
			contextMenuTarget = undefined;
		}
	}, { capture: true });

	// Invoked over IPC to support frames (executeJavaScriptInIsolatedWorld doesn't exist on WebFrameMain).
	ipcRenderer.on('vscode:browserView:setTheme', (_event: unknown, theme: IBrowserViewTheme) => {
		elementPicker.setTheme(theme);
		areaPicker.setTheme(theme);
	});
	ipcRenderer.on('vscode:browserView:setLocalizedStrings', (_event: unknown, strings: IBrowserViewPreloadLocalizedStrings) => {
		localizedStrings = strings;
		elementPicker.updateLocalizedStrings();
	});
	ipcRenderer.on('vscode:browserView:startElementPicker', (_event: unknown, options: IBrowserElementSelectionOptions) => {
		elementPicker.start(options);
	});
	ipcRenderer.on('vscode:browserView:stopElementPicker', (_event: unknown) => {
		elementPicker.stop();
	});
	ipcRenderer.on('vscode:browserView:startAreaPicker', (_event: unknown) => {
		areaPicker.start();
	});
	ipcRenderer.on('vscode:browserView:stopAreaPicker', (_event: unknown) => {
		areaPicker.stop();
	});
	ipcRenderer.on('vscode:browserView:highlightElement', (_event: unknown, { elementId }: { elementId: string }) => {
		const element = getElement(elementId);
		if (element) {
			elementPicker.highlight(element);
		}
	});
	ipcRenderer.on('vscode:browserView:showElementComment', (_event: unknown, { elementId }: { elementId: string }) => {
		const element = getElement(elementId);
		if (element && contextMenuTarget) {
			elementPicker.comment(element, contextMenuTarget.anchor);
		}
	});
	ipcRenderer.on('vscode:browserView:hideHighlight', (_event: unknown) => {
		elementPicker.hideHighlight();
	});
	ipcRenderer.on('vscode:browserView:setElementComments', (_event: unknown, update: IBrowserElementCommentsUpdate) => {
		elementPicker.updateComments(update);
	});

	const getElement = (id: string): Element | null => {
		switch (id) {
			case 'active':
				return document.activeElement;
			case 'context-menu-target':
				return contextMenuTarget?.ref.deref() ?? null;
			default:
				return trackedElementsById.get(id)?.deref() ?? null;
		}
	};

	const isolatedHelpers = {
		/**
		 * Get the currently selected text in the page.
		 */
		getSelectedText(): string {
			try {
				// Even if the page has overridden window.getSelection, our call here will still reach the original
				// implementation. That's because Electron proxies functions, such as getSelectedText here, that are
				// exposed to a different context via exposeInIsolatedWorld or exposeInMainWorld.
				return window.getSelection()?.toString() ?? '';
			} catch {
				return '';
			}
		}
	};

	// Generate a unique token for this frame instance. This token is used to
	// correlate the Electron WebFrameMain (available via IPC senderFrame) with
	// the CDP target session (discoverable via Runtime.evaluate in the main world).
	const frameToken = `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	const mainWorldHelpers = {
		getElement,
		/** Opaque token exposed for CDP-side frame matching. */
		getFrameToken(): string { return frameToken; }
	};

	try {
		// Use `contextBridge` APIs to expose globals to the same isolated world where this preload script runs (worldId 999).
		// The isolatedHelpers object will be recursively frozen (and for functions also proxied) by Electron to prevent
		// modification within the given context.
		contextBridge.exposeInIsolatedWorld(999, 'browserViewAPI', isolatedHelpers);
		// Expose helpers on `window.__vscode_helpers` in the page's main world
		// for CDP `Runtime.evaluate` (which runs against the main world) to use.
		contextBridge.exposeInMainWorld('__vscode_helpers', mainWorldHelpers);
	} catch (error) {
		console.error(error);
	}

	ipcRenderer.send('vscode:browserView:preloadReady', frameToken);
}

/**
 * Find the deepest element that contains every element in `candidates`.
 * Walks up `parentElement` from each candidate to build chains, then
 * returns the last shared element. Returns `undefined` if the chains
 * don't overlap (shouldn't happen for elements in the same document).
 */
function findCommonVisibleAncestor(candidates: readonly (Node | null | undefined)[]): Element | undefined {
	const filteredNodes = candidates.filter(c => !!c) as Node[];
	const unique = [...new Set(filteredNodes.map(node => node instanceof Element ? node : node.parentElement).filter(e => !!e))] as Element[];
	if (unique.length === 0) {
		return undefined;
	}

	// Find the nearest visible ancestor of a single element.
	const findVisible = (el: Element): Element => {
		for (let cur: Element | null = el; cur; cur = cur.parentElement) {
			const width = cur instanceof HTMLElement ? cur.offsetWidth : cur.clientWidth;
			const height = cur instanceof HTMLElement ? cur.offsetHeight : cur.clientHeight;
			if (width > 0 && height > 0) {
				return cur;
			}
		}
		return el;
	};

	if (unique.length === 1) {
		return findVisible(unique[0]);
	}

	// Build the ancestor chain for the first candidate (root → element).
	const firstChain: Element[] = [];
	for (let cur: Element | null = unique[0]; cur; cur = cur.parentElement) {
		firstChain.unshift(cur);
	}

	// Reduce to chain prefix shared with every other candidate.
	let common = firstChain;
	for (let i = 1; i < unique.length; i++) {
		const otherChain: Element[] = [];
		for (let cur: Element | null = unique[i]; cur; cur = cur.parentElement) {
			otherChain.unshift(cur);
		}
		let j = 0;
		const limit = Math.min(common.length, otherChain.length);
		while (j < limit && common[j] === otherChain[j]) {
			j++;
		}
		common = common.slice(0, j);
		if (common.length === 0) {
			return undefined;
		}
	}
	return findVisible(common[common.length - 1]);
}

type ElementComment = {
	target: Element;
	pin: HTMLDivElement;
	numberElement: HTMLSpanElement;
	body: string;
	ordinal: number;
	offset: { x: number; y: number };
};

type PendingElementComment = {
	target: Element;
	anchor: { x: number; y: number };
	body: string;
	pointerInteraction: boolean;
};

type ScheduledCommentPin = {
	body: string;
	ordinal: number;
	animationFrame: number;
	timeout: number;
};

type CommentAnimation = {
	surface: Animation;
	supporting: Animation[];
};

/**
 * Element-pick controller used by the "Add Element to Chat" flow.
 *
 * `start({ theme })` mounts a transparent overlay on the page that
 * highlights the element under the pointer (click) or finds the deepest
 * common ancestor of the elements covered by a click+drag rectangle. On
 * selection the picked `Element` is registered with the shared `track()`
 * helper and the host is notified with the resulting id; the overlay is
 * then torn down. `stop()` tears down without picking.
 */
class ElementPicker {
	private static readonly _DRAG_THRESHOLD_PX = 4;
	private static readonly _COMMENT_PIN_SIZE = 22;
	private static readonly _COMMENT_PIN_RESTORE_FRAMES = 5;
	private static readonly _COMMENT_PIN_RESTORE_TIMEOUT = 100;
	private static readonly _COMMENT_PREVIEW_HIT_PADDING = ElementPicker._COMMENT_PIN_SIZE / 2;
	private static readonly _COMMENT_PREVIEW_HIDE_DELAY = 80;
	private static readonly _COMMENT_SURFACE_ANIMATION_DURATION = 140;
	private static readonly _COMMENT_SUPPORTING_FADE_DURATION = 120;
	private static readonly _CURSOR_DEFAULT = '/* VS Code injected style */ * { cursor: default !important; }';
	private static readonly _CURSOR_CROSSHAIR = '/* VS Code injected style */ * { cursor: crosshair !important; }';

	private _selectionActive = false;
	private _continuous = false;
	private _commentMode = false;

	// DOM — created once in the constructor, reused across start/stop cycles.
	private readonly _shadowHost: HTMLDivElement;
	private readonly _commentBackdrop: SVGSVGElement;
	private readonly _commentBackdropCutout: SVGRectElement;
	private readonly _highlightShape: SVGRectElement;
	private readonly _highlight: HTMLDivElement;
	private readonly _commentPreviewRemoveButton: HTMLButtonElement;
	private readonly _overlay: HTMLDivElement;
	private readonly _label: HTMLDivElement;
	private readonly _labelSelector: HTMLSpanElement;
	private readonly _labelClasses: HTMLSpanElement;
	private readonly _labelDims: HTMLSpanElement;
	private readonly _commentPreviewHitArea: HTMLDivElement;
	private readonly _commentPreview: HTMLDivElement;
	private readonly _commentPreviewBody: HTMLSpanElement;
	private readonly _dragbox: HTMLDivElement;
	private readonly _commentLayer: HTMLDivElement;
	private readonly _commentComposer: HTMLDivElement;
	private readonly _commentInput: HTMLTextAreaElement;
	private readonly _commentSendButton: HTMLButtonElement;
	private readonly _comments = new Map<string, ElementComment>();
	private readonly _pendingComments = new Map<string, PendingElementComment>();
	private readonly _scheduledCommentPins = new Map<string, ScheduledCommentPin>();

	// Interaction state (reset on stop)
	private _dragStart: { x: number; y: number } | undefined;
	private _dragStartTarget: Element | undefined;
	private _highlightTarget: Element | undefined;
	private _externalHighlightTarget: Element | undefined;
	private _focusedTarget: Element | undefined;
	private _cursorStylesheet: HTMLStyleElement | undefined;
	private _dismissedCommentOnPointerDown = false;
	private _commentTarget: Element | undefined;
	private _commentAnchor: { x: number; y: number } | undefined;
	private _commentPointerInteraction = false;
	private _pendingCommentInteractionId: string | undefined;
	private _commentBackdropTarget: Element | undefined;
	private _commentBackdropRequest = 0;
	private _commentPreviewElementId: string | undefined;
	private _commentPreviewHideTimeout: number | undefined;
	private _commentAnimation: CommentAnimation | undefined;
	private _commentPreviewCollapsing = false;
	private _reducedMotion = false;

	constructor(
		private readonly _onPicked: (element: Element, comment?: string) => string,
		private readonly _onCommentRemoved: (elementId: string) => void,
		private readonly _onStopped: () => void
	) {
		// Build the shadow DOM tree once. The host is appended/removed from the
		// document on start/stop so the overlay only captures events when active.
		const shadowHost = document.createElement('div');
		shadowHost.setAttribute('data-vscode-pick-host', '');
		shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
		const root = shadowHost.attachShadow({ mode: 'closed' });
		root.appendChild(ElementPicker._buildStyle());
		this._shadowHost = shadowHost;

		const svgNamespace = 'http://www.w3.org/2000/svg';
		const commentBackdrop = document.createElementNS(svgNamespace, 'svg');
		commentBackdrop.classList.add('comment-backdrop');
		const backdropMaskId = `vscode-comment-cutout-${Math.random().toString(36).slice(2)}`;
		const backdropDefinitions = document.createElementNS(svgNamespace, 'defs');
		const backdropMask = document.createElementNS(svgNamespace, 'mask');
		backdropMask.id = backdropMaskId;
		backdropMask.setAttribute('maskUnits', 'userSpaceOnUse');
		backdropMask.setAttribute('x', '0');
		backdropMask.setAttribute('y', '0');
		backdropMask.setAttribute('width', '100%');
		backdropMask.setAttribute('height', '100%');
		const backdropMaskFill = document.createElementNS(svgNamespace, 'rect');
		backdropMaskFill.setAttribute('width', '100%');
		backdropMaskFill.setAttribute('height', '100%');
		backdropMaskFill.setAttribute('fill', 'white');
		const backdropCutout = document.createElementNS(svgNamespace, 'rect');
		backdropCutout.setAttribute('fill', 'black');
		backdropMask.append(backdropMaskFill, backdropCutout);
		backdropDefinitions.appendChild(backdropMask);
		const backdropFill = document.createElementNS(svgNamespace, 'rect');
		backdropFill.classList.add('comment-backdrop-fill');
		backdropFill.setAttribute('width', '100%');
		backdropFill.setAttribute('height', '100%');
		backdropFill.setAttribute('mask', `url(#${backdropMaskId})`);
		const highlightShape = document.createElementNS(svgNamespace, 'rect');
		highlightShape.classList.add('highlight-shape');
		highlightShape.style.display = 'none';
		commentBackdrop.append(backdropDefinitions, backdropFill, highlightShape);
		root.appendChild(commentBackdrop);
		this._commentBackdrop = commentBackdrop;
		this._commentBackdropCutout = backdropCutout;
		this._highlightShape = highlightShape;

		const highlight = document.createElement('div');
		highlight.className = 'highlight';
		highlight.style.display = 'none';
		root.appendChild(highlight);
		this._highlight = highlight;

		const commentPreviewRemoveButton = document.createElement('button');
		commentPreviewRemoveButton.className = 'comment-preview-remove';
		commentPreviewRemoveButton.type = 'button';
		const commentPreviewRemoveIcon = document.createElementNS(svgNamespace, 'svg');
		commentPreviewRemoveIcon.setAttribute('viewBox', '0 0 16 16');
		commentPreviewRemoveIcon.setAttribute('fill', 'currentColor');
		commentPreviewRemoveIcon.setAttribute('aria-hidden', 'true');
		const commentPreviewRemoveIconPath = document.createElementNS(svgNamespace, 'path');
		commentPreviewRemoveIconPath.setAttribute('d', 'M3.854 3.146a.5.5 0 0 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8l4.147-4.146a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146Z');
		commentPreviewRemoveIcon.appendChild(commentPreviewRemoveIconPath);
		commentPreviewRemoveButton.appendChild(commentPreviewRemoveIcon);
		commentPreviewRemoveButton.title = localizedStrings.removeComment;
		commentPreviewRemoveButton.setAttribute('aria-label', localizedStrings.removeElementComment);
		commentPreviewRemoveButton.addEventListener('click', () => {
			if (this._commentPreviewElementId) {
				this._removeComment(this._commentPreviewElementId);
			}
		});
		this._commentPreviewRemoveButton = commentPreviewRemoveButton;

		const overlay = document.createElement('div');
		overlay.className = 'overlay';
		root.appendChild(overlay);
		this._overlay = overlay;

		const label = document.createElement('div');
		label.className = 'label';
		label.style.display = 'none';
		root.appendChild(label);
		this._label = label;

		const labelInfo = document.createElement('span');
		labelInfo.className = 'label-info';
		label.appendChild(labelInfo);

		const labelSelector = document.createElement('span');
		labelSelector.className = 'label-selector';
		labelInfo.appendChild(labelSelector);
		this._labelSelector = labelSelector;

		const labelClasses = document.createElement('span');
		labelClasses.className = 'label-classes';
		labelInfo.appendChild(labelClasses);
		this._labelClasses = labelClasses;

		const labelDims = document.createElement('span');
		labelDims.className = 'label-dims';
		label.appendChild(labelDims);
		this._labelDims = labelDims;

		const commentPreviewHitArea = document.createElement('div');
		commentPreviewHitArea.className = 'comment-preview-hit-area';
		commentPreviewHitArea.style.display = 'none';
		root.appendChild(commentPreviewHitArea);
		this._commentPreviewHitArea = commentPreviewHitArea;

		const commentPreview = document.createElement('div');
		commentPreview.className = 'comment-surface comment-preview';
		commentPreview.style.display = 'none';
		commentPreview.setAttribute('role', 'note');
		const commentPreviewBody = document.createElement('span');
		commentPreviewBody.className = 'comment-preview-body';
		commentPreview.appendChild(commentPreviewBody);
		commentPreview.appendChild(commentPreviewRemoveButton);
		commentPreviewHitArea.appendChild(commentPreview);
		this._commentPreview = commentPreview;
		this._commentPreviewBody = commentPreviewBody;

		commentPreviewHitArea.addEventListener('mouseenter', () => this._cancelCommentPreviewHide());
		commentPreviewHitArea.addEventListener('mouseleave', () => this._scheduleCommentPreviewHide());
		commentPreviewHitArea.addEventListener('focusin', () => this._cancelCommentPreviewHide());
		commentPreviewHitArea.addEventListener('focusout', () => this._scheduleCommentPreviewHide());

		const dragbox = document.createElement('div');
		dragbox.className = 'dragbox';
		dragbox.style.display = 'none';
		root.appendChild(dragbox);
		this._dragbox = dragbox;

		const commentLayer = document.createElement('div');
		commentLayer.className = 'comment-layer';
		root.appendChild(commentLayer);
		this._commentLayer = commentLayer;

		const commentComposer = document.createElement('div');
		commentComposer.className = 'comment-surface comment-composer';
		commentComposer.style.display = 'none';
		commentComposer.setAttribute('role', 'dialog');
		commentComposer.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		commentComposer.setAttribute('aria-modal', 'true');
		commentLayer.appendChild(commentComposer);
		this._commentComposer = commentComposer;

		const commentInput = document.createElement('textarea');
		commentInput.className = 'comment-input';
		commentInput.rows = 1;
		commentInput.placeholder = localizedStrings.addCommentPlaceholder;
		commentInput.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		commentInput.addEventListener('input', () => this._layoutCommentInput());
		commentInput.addEventListener('keydown', event => {
			event.stopPropagation();
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				this._submitComment();
			}
		});
		commentInput.addEventListener('keypress', event => event.stopPropagation());
		commentInput.addEventListener('keyup', event => event.stopPropagation());
		commentComposer.appendChild(commentInput);
		this._commentInput = commentInput;

		const sendButton = document.createElement('button');
		sendButton.className = 'comment-send';
		sendButton.type = 'button';
		const sendButtonIcon = document.createElementNS(svgNamespace, 'svg');
		sendButtonIcon.setAttribute('viewBox', '0 0 16 16');
		sendButtonIcon.setAttribute('fill', 'currentColor');
		sendButtonIcon.setAttribute('aria-hidden', 'true');
		const sendButtonIconPath = document.createElementNS(svgNamespace, 'path');
		sendButtonIconPath.setAttribute('d', 'M8.5 3a.5.5 0 0 0-1 0v4.5H3a.5.5 0 0 0 0 1h4.5V13a.5.5 0 0 0 1 0V8.5H13a.5.5 0 0 0 0-1H8.5V3Z');
		sendButtonIcon.appendChild(sendButtonIconPath);
		sendButton.appendChild(sendButtonIcon);
		sendButton.title = localizedStrings.addComment;
		sendButton.setAttribute('aria-label', localizedStrings.addComment);
		sendButton.addEventListener('click', () => this._submitComment());
		commentComposer.appendChild(sendButton);
		this._commentSendButton = sendButton;

		commentComposer.addEventListener('keydown', event => {
			if (event.key !== 'Tab') {
				return;
			}
			if (event.shiftKey && event.target === commentInput) {
				event.preventDefault();
				sendButton.focus();
			} else if (!event.shiftKey && event.target === sendButton) {
				event.preventDefault();
				commentInput.focus();
			}
		});

		window.addEventListener('scroll', () => this._onScrollOrResize(), { passive: true, capture: true });
		window.addEventListener('resize', () => this._onScrollOrResize());
	}

	start(options: IBrowserElementSelectionOptions): boolean {
		if (this._selectionActive) {
			this._updateSelectionOptions(options);
			return true;
		}
		this._commentMode = options.mode === commentElementSelectionMode;
		this._continuous = options.continuous ?? false;
		this._ensureMounted();
		this._selectionActive = true;
		this._overlay.style.display = 'block';

		// Inject a stylesheet into the page to override all cursors while element selection is active,
		// so the cursor always appears as a normal pointer even when over e.g. links.
		// Updated to crosshair in _onPointerDown, reset in _onPointerUp.
		const cursorStyle = document.createElement('style');
		cursorStyle.textContent = ElementPicker._CURSOR_DEFAULT;
		document.head.appendChild(cursorStyle);
		this._cursorStylesheet = cursorStyle;

		// Register high-frequency listeners only while selection is active.
		window.addEventListener('pointermove', this._onPointerMove, true);
		document.addEventListener('pointerleave', this._onPointerLeave, true);
		window.addEventListener('pointerdown', this._onPointerDown, true);
		window.addEventListener('pointerup', this._onPointerUp, true);
		window.addEventListener('click', this._onClick, true);
		window.addEventListener('contextmenu', this._onClick, true);
		window.addEventListener('focusin', this._onFocusIn, true);
		window.addEventListener('blur', this._onWindowBlur);
		window.addEventListener('keydown', this._onKeyDown, true);

		if (!this._externalHighlightTarget) {
			const focusedElement = this._getFocusedElement();
			this._focusedTarget = options.highlightFocusedElement ? focusedElement : undefined;
			this._updateHighlight(this._focusedTarget);
		}

		return true;
	}

	private _updateSelectionOptions(options: IBrowserElementSelectionOptions): void {
		const wasCommentMode = this._commentMode;
		this._commentMode = options.mode === commentElementSelectionMode;
		this._continuous = options.continuous ?? false;
		if (wasCommentMode && !this._commentMode && this._commentTarget) {
			this._closeCommentComposer();
		}
		if (options.highlightFocusedElement && !this._commentTarget && !this._commentPreviewElementId && !this._externalHighlightTarget) {
			this._focusedTarget = this._getFocusedElement();
			this._updateHighlight(this._focusedTarget);
		}
	}

	stop(): void {
		if (!this._selectionActive) {
			return;
		}
		this._hideActiveCommentPreview();
		this._selectionActive = false;
		this._closeCommentComposer();
		this._overlay.style.display = 'none';

		this._cursorStylesheet?.remove();
		this._cursorStylesheet = undefined;

		// Remove high-frequency listeners.
		window.removeEventListener('pointermove', this._onPointerMove, true);
		document.removeEventListener('pointerleave', this._onPointerLeave, true);
		window.removeEventListener('pointerdown', this._onPointerDown, true);
		window.removeEventListener('pointerup', this._onPointerUp, true);
		window.removeEventListener('click', this._onClick, true);
		window.removeEventListener('contextmenu', this._onClick, true);
		window.removeEventListener('focusin', this._onFocusIn, true);
		window.removeEventListener('blur', this._onWindowBlur);
		window.removeEventListener('keydown', this._onKeyDown, true);

		this._highlight.style.display = 'none';
		this._label.style.display = 'none';
		this._dragbox.style.display = 'none';
		this._dragStart = undefined;
		this._dragStartTarget = undefined;
		this._dismissedCommentOnPointerDown = false;
		this._highlightTarget = undefined;
		this._focusedTarget = undefined;
		if (this._externalHighlightTarget) {
			this._updateHighlight(this._externalHighlightTarget);
		}

		this._onStopped();
		this._unmountWhenIdle();
	}

	/**
	 * Update the theme colors applied to the overlay.
	 * Can be called at any time; takes effect immediately.
	 */
	setTheme(theme: IBrowserViewTheme): void {
		ElementPicker._applyTheme(this._shadowHost, theme);
		this._reducedMotion = theme.reducedMotion ?? false;
		this._shadowHost.classList.toggle('reduce-motion', this._reducedMotion);
	}

	updateLocalizedStrings(): void {
		this._applyLocalizedStrings();
	}

	resolveContextMenuTarget(event: MouseEvent): Element | undefined {
		if (this._commentPreviewElementId && event.composedPath().includes(this._shadowHost)) {
			this._hideActiveCommentPreview();
			return this._pickElementAt(event.clientX, event.clientY);
		}
		return event.target instanceof Element ? event.target : undefined;
	}

	/**
	 * Highlight a specific element without starting a pick session.
	 * Mounts the shadow host if not already in the document.
	 */
	highlight(element: Element): void {
		this._ensureMounted();
		this._externalHighlightTarget = element;
		this._hideActiveCommentPreview();
		this._updateHighlight(element);
	}

	/**
	 * Hide any current highlight. If no pick session is active, also
	 * removes the shadow host from the document.
	 */
	hideHighlight(): void {
		this._externalHighlightTarget = undefined;
		if (this._commentTarget) {
			return;
		}
		this._updateHighlight(undefined);
		this._unmountWhenIdle();
	}

	comment(element: Element, anchor: { x: number; y: number }): void {
		this._externalHighlightTarget = undefined;
		if (this._selectionActive) {
			this.stop();
		}
		this.start({ mode: commentElementSelectionMode });
		this._showCommentComposer(element, anchor, true);
	}

	updateComments(update: IBrowserElementCommentsUpdate): void {
		if (update.comments) {
			const incoming = new Map(update.comments.map((comment, index) => [comment.elementId, { body: comment.body, ordinal: index + 1 }]));
			for (const [elementId, comment] of this._comments) {
				const incomingComment = incoming.get(elementId);
				if (!incomingComment) {
					if (this._commentPreviewElementId === elementId) {
						this._hideActiveCommentPreview();
					}
					comment.pin.remove();
					this._comments.delete(elementId);
				} else {
					comment.ordinal = incomingComment.ordinal;
					if (incomingComment.body === comment.body) {
						continue;
					}
					comment.body = incomingComment.body;
					if (this._commentPreviewElementId === elementId) {
						this._setCommentPreviewBody(incomingComment.body);
						this._renderHighlight(comment.target);
					}
				}
			}
			for (const [elementId, comment] of incoming) {
				if (this._comments.has(elementId)) {
					continue;
				}
				const pending = this._pendingComments.get(elementId);
				if (pending) {
					this._scheduleCommentPin(elementId, comment.body, comment.ordinal);
				}
			}
			for (const elementId of this._scheduledCommentPins.keys()) {
				if (!incoming.has(elementId)) {
					this._discardPendingComment(elementId);
				}
			}
		}
		for (const elementId of update.pendingCommentIdsToDiscard ?? []) {
			this._discardPendingComment(elementId);
		}
		this._updateCommentPinNumbers();
		this._unmountWhenIdle();
	}

	// --- Event handlers ---

	private _onPointerMove = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		const isOverPicker = e.composedPath().includes(this._shadowHost);
		if (this._commentTarget) {
			if (!isOverPicker) {
				this._commentPointerInteraction = true;
			}
			return;
		}
		const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : undefined;
		if (pendingComment) {
			if (!isOverPicker) {
				pendingComment.pointerInteraction = true;
			}
			return;
		}
		if (this._commentPreviewElementId || this._externalHighlightTarget || isOverPicker) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (!this._dragStart) {
			this._updateHighlight(this._pickElementAt(e.clientX, e.clientY));
			return;
		}
		const dx = Math.abs(e.clientX - this._dragStart.x);
		const dy = Math.abs(e.clientY - this._dragStart.y);
		if (dx < ElementPicker._DRAG_THRESHOLD_PX && dy < ElementPicker._DRAG_THRESHOLD_PX) {
			return;
		}
		const left = Math.min(this._dragStart.x, e.clientX);
		const top = Math.min(this._dragStart.y, e.clientY);
		this._dragbox.style.display = 'block';
		this._dragbox.style.left = `${left}px`;
		this._dragbox.style.top = `${top}px`;
		this._dragbox.style.width = `${dx}px`;
		this._dragbox.style.height = `${dy}px`;
		// Live preview of the deepest common ancestor that the region
		// currently resolves to, so the user sees exactly what will be
		// selected if they release the drag now.
		this._updateHighlight(this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy }));
	};

	private _onPointerLeave = (): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._commentTarget) {
			this._commentPointerInteraction = true;
			return;
		}
		const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : undefined;
		if (pendingComment) {
			pendingComment.pointerInteraction = true;
			return;
		}
		if (this._commentPreviewElementId || this._externalHighlightTarget) {
			return;
		}
		if (!this._dragStart) {
			this._updateHighlight(this._focusedTarget);
		}
	};

	private _onPointerDown = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		this._dismissedCommentOnPointerDown = false;
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		if (this._pendingCommentInteractionId) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (this._commentTarget) {
			this._dismissedCommentOnPointerDown = true;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		this._dragStart = { x: e.clientX, y: e.clientY };
		this._dragStartTarget = this._pickElementAt(e.clientX, e.clientY);
		if (this._cursorStylesheet) {
			this._cursorStylesheet.textContent = ElementPicker._CURSOR_CROSSHAIR;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onPointerUp = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._dismissedCommentOnPointerDown) {
			e.preventDefault();
			e.stopPropagation();
			const commentTarget = this._commentTarget;
			if (commentTarget) {
				window.setTimeout(() => {
					if (this._commentTarget === commentTarget) {
						this._finishCommentInteraction();
					}
				});
			}
			return;
		}
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		if (!this._dragStart) {
			return;
		}
		const dx = Math.abs(e.clientX - this._dragStart.x);
		const dy = Math.abs(e.clientY - this._dragStart.y);
		const start = this._dragStart;
		this._dragStart = undefined;
		if (this._cursorStylesheet) {
			this._cursorStylesheet.textContent = ElementPicker._CURSOR_DEFAULT;
		}

		if (dx < ElementPicker._DRAG_THRESHOLD_PX && dy < ElementPicker._DRAG_THRESHOLD_PX) {
			// Click → pick the element under the pointer.
			const target = this._dragStartTarget ?? this._pickElementAt(e.clientX, e.clientY);
			this._dragStartTarget = undefined;
			if (target) {
				this._commit(target, { x: e.clientX, y: e.clientY });
			}
		} else {
			// Drag → pick the deepest common ancestor of the region.
			this._dragStartTarget = undefined;
			this._dragbox.style.display = 'none';
			this._updateHighlight(undefined);
			const left = Math.min(start.x, e.clientX);
			const top = Math.min(start.y, e.clientY);
			const ancestor = this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy });
			if (ancestor) {
				this._commit(ancestor, { x: e.clientX, y: e.clientY });
			}
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onClick = (e: Event): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._dismissedCommentOnPointerDown) {
			this._dismissedCommentOnPointerDown = false;
			e.preventDefault();
			e.stopPropagation();
			this._finishCommentInteraction();
			return;
		}
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onFocusIn = (event: FocusEvent): void => {
		if (!this._selectionActive || this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
			return;
		}
		if (event.composedPath().includes(this._shadowHost)) {
			return;
		}
		const focusedElement = this._getFocusedElement();
		this._focusedTarget = focusedElement?.matches(':focus-visible') ? focusedElement : undefined;
		this._updateHighlight(this._focusedTarget);
	};

	private _onWindowBlur = (): void => {
		if (!this._selectionActive || this._commentTarget || this._externalHighlightTarget) {
			return;
		}
		this._focusedTarget = undefined;
		this._updateHighlight(undefined);
	};

	private _onKeyDown = (e: KeyboardEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (e.key === 'Escape') {
			if (this._commentTarget) {
				const target = this._commentTarget;
				this._focusCommentTarget(target);
				this._finishCommentInteraction();
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			this.stop();
			e.preventDefault();
			e.stopPropagation();
		} else if (e.key === 'Enter' && !e.isComposing) {
			if (this._pendingCommentInteractionId) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			const focusedElement = this._getFocusedElement();
			if (focusedElement) {
				e.preventDefault();
				e.stopPropagation();
				this._commit(focusedElement);
			}
		}
	};

	private _onScrollOrResize(): void {
		if (this._commentPreviewCollapsing) {
			this._hideActiveCommentPreview();
		}
		this._cancelCommentAnimations();
		if (this._highlightTarget) {
			this._renderHighlight(this._highlightTarget);
		}
		if (this._commentBackdropTarget) {
			this._layoutCommentBackdrop(this._commentBackdropTarget);
		}
		for (const comment of this._comments.values()) {
			this._layoutCommentPin(comment);
		}
	}

	// --- Picking helpers ---

	private _getFocusedElement(): Element | undefined {
		if (!document.hasFocus()) {
			return undefined;
		}
		let activeElement = document.activeElement;
		while (activeElement?.shadowRoot?.activeElement) {
			activeElement = activeElement.shadowRoot.activeElement;
		}
		if (!activeElement || activeElement === document.body || activeElement === document.documentElement || activeElement === this._shadowHost || activeElement instanceof HTMLIFrameElement) {
			return undefined;
		}
		return activeElement;
	}

	/** Return the page element under a viewport point, skipping our own overlay host. */
	private _pickElementAt(x: number, y: number): Element | undefined {
		const candidates = document.elementsFromPoint(x, y);
		for (const el of candidates) {
			if (el === this._shadowHost || this._shadowHost.contains(el)) {
				continue;
			}
			return el;
		}
		return undefined;
	}

	/**
	 * Resolve the element that "covers" a drag rectangle.
	 *
	 * Samples `elementFromPoint` at the 4 corners, 4 edge midpoints, and
	 * center, then returns their deepest common ancestor.
	 */
	private _pickRegionAncestor(rect: IBrowserViewRect): Element | undefined {
		const { x, y, width, height } = rect;
		const x2 = x + width;
		const y2 = y + height;
		const cx = x + width / 2;
		const cy = y + height / 2;
		const samples: Element[] = [];
		for (const [sx, sy] of [
			[x, y], [x2, y], [x, y2], [x2, y2],       // corners
			[cx, y], [cx, y2], [x, cy], [x2, cy],      // edge midpoints
			[cx, cy]                                     // center
		]) {
			const el = this._pickElementAt(sx, sy);
			if (el) {
				samples.push(el);
			}
		}
		return findCommonVisibleAncestor(samples);
	}

	// --- Highlight ---

	private _renderHighlight(target: Element): void {
		const highlight = this._highlight;
		const label = this._label;

		const rect = target.getBoundingClientRect();
		const scrollX = window.scrollX || 0;
		const scrollY = window.scrollY || 0;
		const viewportHeight = window.innerHeight;
		const viewportWidth = document.documentElement.clientWidth;
		const visibleRect = this._getVisibleTargetBounds(rect);
		const labelHeight = 22; // label height (20) + 2px gap above the box.

		// Highlight box is in *page* coordinates so it scrolls with the document.
		highlight.style.display = 'block';
		highlight.style.left = `${rect.left + scrollX}px`;
		highlight.style.top = `${rect.top + scrollY}px`;
		highlight.style.width = `${rect.width}px`;
		highlight.style.height = `${rect.height}px`;
		this._highlightShape.style.display = 'block';
		this._highlightShape.setAttribute('x', `${visibleRect.x}`);
		this._highlightShape.setAttribute('y', `${visibleRect.y}`);
		this._highlightShape.setAttribute('width', `${visibleRect.width}`);
		this._highlightShape.setAttribute('height', `${visibleRect.height}`);
		this._highlightShape.setAttribute('rx', '2');
		// Label is in *viewport* coordinates and sticky-clamped to the viewport.
		const tagName = String(target.tagName || '').toLowerCase();
		const idPart = target.id ? `#${target.id}` : '';
		const classPart = target.classList.length
			? '.' + [...target.classList].join('.')
			: '';
		this._labelSelector.textContent = tagName + idPart;
		this._labelClasses.textContent = classPart;
		this._labelDims.textContent = `${Math.round(rect.width)} \u00d7 ${Math.round(rect.height)}`;
		label.style.display = 'inline-flex';
		const idealTop = rect.top - labelHeight;
		const labelTop = Math.max(0, Math.min(viewportHeight - labelHeight, idealTop));
		// Use clientWidth (excludes scrollbar) rather than innerWidth so the
		// label doesn't extend behind the scrollbar on Windows/Linux.
		// Position label at the element's left edge, but push it left if it
		// would overflow the viewport. Clamp to 0 so it never goes off-screen.
		label.style.left = '0';
		const naturalWidth = label.offsetWidth;
		const idealLeft = rect.left;
		const labelLeft = Math.max(0, Math.min(idealLeft, viewportWidth - naturalWidth));
		label.style.left = `${labelLeft}px`;
		label.style.top = `${labelTop}px`;

		if (this._commentPreview.style.display !== 'none') {
			const previewPlacement = this._layoutCommentSurface(this._commentPreview, visibleRect, viewportWidth, viewportHeight);
			if (this._commentPreviewElementId && previewPlacement === 'above' && this._elementsOverlap(label, this._commentPreview)) {
				label.style.top = `${Math.max(0, Math.min(viewportHeight - labelHeight, visibleRect.bottom + 2))}px`;
			}
		}
		if (this._commentComposer.style.display !== 'none') {
			this._layoutCommentSurface(this._commentComposer, visibleRect, viewportWidth, viewportHeight);
		}
	}

	private _elementsOverlap(first: HTMLElement, second: HTMLElement): boolean {
		const firstBounds = first.getBoundingClientRect();
		const secondBounds = second.getBoundingClientRect();
		return firstBounds.left < secondBounds.right
			&& firstBounds.right > secondBounds.left
			&& firstBounds.top < secondBounds.bottom
			&& firstBounds.bottom > secondBounds.top;
	}

	private _getVisibleTargetBounds(rect: DOMRect): DOMRect {
		const left = Math.max(0, Math.min(rect.left, window.innerWidth));
		const right = Math.max(left, Math.min(rect.right, window.innerWidth));
		const top = Math.max(0, Math.min(rect.top, window.innerHeight));
		const bottom = Math.max(top, Math.min(rect.bottom, window.innerHeight));
		return new DOMRect(left, top, right - left, bottom - top);
	}

	private _layoutCommentSurface(surface: HTMLElement, targetBounds: DOMRect, viewportWidth: number, viewportHeight: number): 'above' | 'below' {
		if (surface === this._commentPreview) {
			surface.style.width = 'max-content';
			surface.style.minWidth = '0';
			surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
			const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : undefined;
			if (comment) {
				const pinBounds = comment.pin.getBoundingClientRect();
				return this._layoutCommentSurfaceAtAnchor(
					surface,
					{ x: pinBounds.left + pinBounds.width / 2, y: pinBounds.top + pinBounds.height / 2 },
					viewportWidth,
					viewportHeight
				);
			}
		} else if (surface === this._commentComposer && this._commentAnchor) {
			surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
			return this._layoutCommentSurfaceAtAnchor(
				surface,
				{ x: this._commentAnchor.x - window.scrollX, y: this._commentAnchor.y - window.scrollY },
				viewportWidth,
				viewportHeight
			);
		}
		const surfaceHeight = surface.offsetHeight;
		const belowTop = targetBounds.bottom;
		const placement = belowTop + surfaceHeight <= viewportHeight - 8 ? 'below' : 'above';
		const surfaceTop = belowTop + surfaceHeight <= viewportHeight - 8
			? belowTop
			: Math.max(0, targetBounds.top - surfaceHeight);
		const surfaceWidth = surface.offsetWidth;
		const alignLeft = targetBounds.left + surfaceWidth <= viewportWidth;
		const alignment = alignLeft ? 'left' : 'right';
		const surfaceLeft = alignLeft
			? Math.max(0, targetBounds.left)
			: Math.max(0, targetBounds.right - surfaceWidth);
		surface.dataset.attachmentCorner = `${placement === 'below' ? 'top' : 'bottom'}-${alignment}`;
		this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
		return placement;
	}

	private _layoutCommentSurfaceAtAnchor(surface: HTMLElement, anchor: { x: number; y: number }, viewportWidth: number, viewportHeight: number): 'above' | 'below' {
		const viewportInset = 8;
		let surfaceWidth = surface.offsetWidth;
		const availableRight = Math.max(0, viewportWidth - viewportInset - anchor.x);
		const availableLeft = Math.max(0, anchor.x - viewportInset);
		const opensRight = surfaceWidth <= availableRight || (surfaceWidth > availableLeft && availableRight >= availableLeft);
		const availableWidth = opensRight ? availableRight : availableLeft;
		if (surfaceWidth > availableWidth) {
			surface.style.maxWidth = `${availableWidth}px`;
			surfaceWidth = surface.offsetWidth;
		}

		const surfaceHeight = surface.offsetHeight;
		const availableBelow = Math.max(0, viewportHeight - viewportInset - anchor.y);
		const availableAbove = Math.max(0, anchor.y - viewportInset);
		const opensAbove = surfaceHeight <= availableAbove || (surfaceHeight > availableBelow && availableAbove >= availableBelow);
		const opensBelow = !opensAbove;
		const placement = opensBelow ? 'below' : 'above';
		const alignment = opensRight ? 'left' : 'right';
		surface.dataset.attachmentCorner = `${opensBelow ? 'top' : 'bottom'}-${alignment}`;
		const surfaceLeft = opensRight ? anchor.x : anchor.x - surfaceWidth;
		const surfaceTop = opensBelow ? anchor.y : Math.max(viewportInset, anchor.y - surfaceHeight);
		this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
		return placement;
	}

	private _setCommentSurfacePosition(surface: HTMLElement, left: number, top: number): void {
		if (surface !== this._commentPreview) {
			surface.style.left = `${left}px`;
			surface.style.top = `${top}px`;
			return;
		}

		const padding = ElementPicker._COMMENT_PREVIEW_HIT_PADDING;
		this._commentPreviewHitArea.style.left = `${left - padding}px`;
		this._commentPreviewHitArea.style.top = `${top - padding}px`;
		this._commentPreviewHitArea.style.width = `${surface.offsetWidth + padding * 2}px`;
		this._commentPreviewHitArea.style.height = `${surface.offsetHeight + padding * 2}px`;
		surface.style.left = `${padding}px`;
		surface.style.top = `${padding}px`;
	}

	private _updateHighlight(target: Element | undefined): void {
		this._highlightTarget = target;
		if (!target) {
			this._highlight.style.display = 'none';
			this._highlightShape.style.display = 'none';
			this._label.style.display = 'none';
			return;
		}
		this._renderHighlight(target);
	}

	// --- Commit ---

	private _commit(target: Element, anchor?: { x: number; y: number }): void {
		if (!this._selectionActive) {
			return;
		}
		if (this._commentMode) {
			this._showCommentComposer(target, anchor ?? this._getDefaultCommentAnchor(target), anchor !== undefined);
			return;
		}
		// Wait a frame so any pending event handlers can be completed in the selecting active state.
		requestAnimationFrame(() => {
			if (!this._continuous) {
				// Tear down the overlay before notifying the host so any
				// screenshot capture doesn't include our chrome.
				this.stop();
			} else {
				this._updateHighlight(undefined);
			}
			this._onPicked(target);
		});
	}

	private _getDefaultCommentAnchor(target: Element): { x: number; y: number } {
		const bounds = target.getBoundingClientRect();
		return { x: bounds.left, y: bounds.bottom };
	}

	private _showCommentComposer(target: Element, anchor: { x: number; y: number }, pointerInteraction = false): void {
		this._externalHighlightTarget = undefined;
		this._hideActiveCommentPreview();
		this._commentTarget = target;
		this._commentPointerInteraction = pointerInteraction;
		this._commentAnchor = {
			x: anchor.x + window.scrollX,
			y: anchor.y + window.scrollY
		};
		this._showCommentBackdrop(target);
		this._commentLayer.classList.add('composing');
		this._commentInput.value = '';
		this._commentComposer.style.display = 'flex';
		this._resizeCommentInput();
		this._updateHighlight(target);
		this._animateCommentComposer();
		this._commentInput.focus({ preventScroll: true });
		requestAnimationFrame(() => {
			if (this._commentTarget === target) {
				this._commentInput.focus({ preventScroll: true });
			}
		});
	}

	private _animateCommentComposer(): void {
		if (this._reducedMotion) {
			return;
		}
		this._cancelCommentAnimations();
		this._commentAnimation = {
			surface: this._animateCommentSurface(this._commentComposer),
			supporting: []
		};
	}

	private _setCommentSurfaceTransformOrigin(surface: HTMLElement): void {
		const [verticalOrigin, horizontalOrigin] = (surface.dataset.attachmentCorner ?? 'top-left').split('-');
		surface.style.transformOrigin = `${horizontalOrigin} ${verticalOrigin}`;
	}

	private _closeCommentComposer(): void {
		this._commentTarget = undefined;
		this._commentAnchor = undefined;
		this._hideCommentBackdrop();
		this._commentLayer.classList.remove('composing');
		this._commentComposer.style.display = 'none';
		this._commentInput.value = '';
		this._cancelCommentAnimations();
		this._updateHighlight(undefined);
	}

	private _finishCommentInteraction(): void {
		if (this._continuous) {
			this._closeCommentComposer();
		} else {
			this.stop();
		}
	}

	private _submitComment(): void {
		const target = this._commentTarget;
		const anchor = this._commentAnchor;
		if (!target || !anchor) {
			return;
		}
		const body = this._commentInput.value.replace(/\r?\n/g, ' ');
		const pendingComment = {
			target,
			anchor,
			body,
			pointerInteraction: this._commentPointerInteraction
		};
		this._commentLayer.classList.add('comment-capture-pending');
		this._finishCommentInteraction();
		const elementId = this._onPicked(target, body);
		this._pendingComments.set(elementId, pendingComment);
		this._pendingCommentInteractionId = elementId;
	}

	private _restoreInteractionAfterComment(elementId: string, pending: PendingElementComment): void {
		if (this._pendingCommentInteractionId === elementId) {
			this._pendingCommentInteractionId = undefined;
			this._commentLayer.classList.remove('comment-capture-pending');
		}
		if (this._commentTarget) {
			return;
		}
		if (!pending.pointerInteraction) {
			this._focusCommentTarget(pending.target);
		}
	}

	private _focusCommentTarget(target: Element): void {
		if (!target.isConnected || !(target instanceof HTMLElement || target instanceof SVGElement)) {
			return;
		}

		const hadTabIndex = target.hasAttribute('tabindex');
		if (!hadTabIndex) {
			target.tabIndex = -1;
		}
		target.focus({ preventScroll: true });
		if (!hadTabIndex) {
			target.removeAttribute('tabindex');
		}
	}

	private _discardPendingComment(elementId: string): void {
		const pending = this._pendingComments.get(elementId);
		this._pendingComments.delete(elementId);
		this._cancelScheduledCommentPin(elementId);
		if (pending) {
			this._restoreInteractionAfterComment(elementId, pending);
		}
	}

	private _cancelScheduledCommentPin(elementId: string): void {
		const scheduled = this._scheduledCommentPins.get(elementId);
		if (!scheduled) {
			return;
		}
		window.clearTimeout(scheduled.timeout);
		cancelAnimationFrame(scheduled.animationFrame);
		this._scheduledCommentPins.delete(elementId);
	}

	private _scheduleCommentPin(elementId: string, body: string, ordinal: number): void {
		const existing = this._scheduledCommentPins.get(elementId);
		if (existing) {
			existing.body = body;
			existing.ordinal = ordinal;
			return;
		}

		const scheduled: ScheduledCommentPin = { body, ordinal, animationFrame: 0, timeout: 0 };
		this._scheduledCommentPins.set(elementId, scheduled);
		let frameCount = 0;
		const finish = () => {
			if (this._scheduledCommentPins.get(elementId) !== scheduled) {
				return;
			}
			this._cancelScheduledCommentPin(elementId);
			const pending = this._pendingComments.get(elementId);
			if (pending) {
				this._createCommentPin(elementId, pending.target, pending.anchor, scheduled.body, scheduled.ordinal);
			}
		};
		const waitForFrame = () => {
			if (this._scheduledCommentPins.get(elementId) !== scheduled) {
				return;
			}
			frameCount++;
			if (frameCount >= ElementPicker._COMMENT_PIN_RESTORE_FRAMES) {
				finish();
			} else {
				scheduled.animationFrame = requestAnimationFrame(waitForFrame);
			}
		};
		scheduled.timeout = window.setTimeout(finish, ElementPicker._COMMENT_PIN_RESTORE_TIMEOUT);
		scheduled.animationFrame = requestAnimationFrame(waitForFrame);
	}

	private _createCommentPin(elementId: string, target: Element, anchor: { x: number; y: number }, body: string, ordinal: number): void {
		this._ensureMounted();
		const existing = this._comments.get(elementId);
		if (existing && this._commentPreviewElementId === elementId) {
			this._hideActiveCommentPreview();
		}
		existing?.pin.remove();
		const pending = this._pendingComments.get(elementId);
		this._pendingComments.delete(elementId);
		const rect = target.getBoundingClientRect();
		const offset = {
			x: anchor.x - (rect.left + window.scrollX),
			y: anchor.y - (rect.top + window.scrollY)
		};

		const pin = document.createElement('div');
		pin.className = 'comment-pin';
		pin.tabIndex = 0;
		pin.setAttribute('role', 'note');
		const bubble = document.createElement('span');
		bubble.className = 'comment-pin-bubble';
		const numberElement = document.createElement('span');
		numberElement.className = 'comment-pin-number';
		bubble.appendChild(numberElement);
		pin.appendChild(bubble);

		const show = () => {
			if (this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
				return;
			}
			this._showCommentPreview(elementId, target, body);
		};
		pin.addEventListener('pointermove', show);
		pin.addEventListener('focusin', show);
		pin.addEventListener('focusout', () => this._scheduleCommentPreviewHide());
		this._commentLayer.appendChild(pin);
		const comment = { target, pin, numberElement, body, ordinal, offset };
		this._comments.set(elementId, comment);
		this._updateCommentPinNumbers();
		this._layoutCommentPin(comment);
		if (pending) {
			this._restoreInteractionAfterComment(elementId, pending);
		}
	}

	private _updateCommentPinNumbers(): void {
		for (const comment of this._comments.values()) {
			const numberLabel = String(comment.ordinal);
			comment.numberElement.textContent = numberLabel;
			comment.pin.title = comment.body || this._formatLocalizedString(localizedStrings.elementComment, numberLabel);
			comment.pin.setAttribute(
				'aria-label',
				comment.body
					? this._formatLocalizedString(localizedStrings.elementCommentWithBody, numberLabel, comment.body)
					: this._formatLocalizedString(localizedStrings.emptyElementComment, numberLabel)
			);
		}
	}

	private _applyLocalizedStrings(): void {
		this._commentPreviewRemoveButton.title = localizedStrings.removeComment;
		this._commentPreviewRemoveButton.setAttribute('aria-label', localizedStrings.removeElementComment);
		this._commentComposer.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		this._commentInput.placeholder = localizedStrings.addCommentPlaceholder;
		this._commentInput.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		this._commentSendButton.title = localizedStrings.addComment;
		this._commentSendButton.setAttribute('aria-label', localizedStrings.addComment);
		this._updateCommentPinNumbers();
	}

	private _formatLocalizedString(template: string, ...values: readonly string[]): string {
		return template.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? '');
	}

	private _layoutCommentPin(comment: { target: Element; pin: HTMLDivElement; offset: { x: number; y: number } }): void {
		const rect = comment.target.getBoundingClientRect();
		const x = rect.left + window.scrollX + comment.offset.x;
		const y = rect.top + window.scrollY + comment.offset.y;
		const scrollingElement = document.scrollingElement ?? document.documentElement;
		const halfWidth = comment.pin.offsetWidth / 2;
		const halfHeight = comment.pin.offsetHeight / 2;
		const clampedX = Math.max(halfWidth, Math.min(x, scrollingElement.scrollWidth - halfWidth));
		const clampedY = Math.max(halfHeight, Math.min(y, scrollingElement.scrollHeight - halfHeight));
		comment.pin.style.left = `${clampedX}px`;
		comment.pin.style.top = `${clampedY}px`;
	}

	private _showCommentPreview(elementId: string, target: Element, fallbackBody: string): void {
		if (this._pendingCommentInteractionId || this._commentPreviewCollapsing) {
			return;
		}
		if (this._commentPreviewElementId === elementId) {
			this._cancelCommentPreviewHide();
			return;
		}
		this._hideActiveCommentPreview();
		this._commentPreviewElementId = elementId;
		const comment = this._comments.get(elementId);
		if (comment) {
			comment.pin.classList.add('previewing');
			comment.pin.after(this._commentPreviewHitArea);
		}
		const body = comment?.body ?? fallbackBody;
		this._setCommentPreviewBody(body);
		this._shadowHost.classList.add('comment-preview-active');
		this._updateHighlight(target);
		this._showCommentBackdrop(target);
		if (comment) {
			this._animateCommentPreview();
		}
	}

	private _setCommentPreviewBody(body: string): void {
		this._commentPreviewBody.textContent = body;
		this._commentPreview.title = body;
		this._commentPreview.classList.toggle('empty', !body);
		this._commentPreviewHitArea.style.display = 'block';
		this._commentPreview.style.display = 'flex';
	}

	private _animateCommentPreview(collapsing = false): Animation | undefined {
		if (this._reducedMotion) {
			return undefined;
		}
		const previewAnimation = this._animateCommentSurface(this._commentPreview, collapsing);
		const supportingKeyframes: Keyframe[] = collapsing ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
		const supportingAnimations: Animation[] = [];
		for (const element of [this._highlightShape, this._label]) {
			if (element.style.display === 'none') {
				continue;
			}
			const animation = element.animate(supportingKeyframes, { duration: ElementPicker._COMMENT_SUPPORTING_FADE_DURATION, easing: 'linear', fill: 'both' });
			supportingAnimations.push(animation);
		}
		this._commentAnimation = { surface: previewAnimation, supporting: supportingAnimations };
		return previewAnimation;
	}

	private _animateCommentSurface(surface: HTMLElement, collapsing = false): Animation {
		this._setCommentSurfaceTransformOrigin(surface);
		return surface.animate(
			collapsing ? [{ transform: 'scale(1)' }, { transform: 'scale(0)' }] : [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
			{ duration: ElementPicker._COMMENT_SURFACE_ANIMATION_DURATION, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }
		);
	}

	private _scheduleCommentPreviewHide(): void {
		if (this._commentPreviewCollapsing) {
			return;
		}
		this._cancelCommentPreviewHide();
		this._commentPreviewHideTimeout = window.setTimeout(() => {
			this._commentPreviewHideTimeout = undefined;
			const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : undefined;
			const pinFocused = comment?.pin.matches(':focus-within') ?? false;
			const hitAreaActive = this._commentPreviewHitArea.matches(':hover, :focus-within');
			if (pinFocused || hitAreaActive) {
				return;
			}
			this._collapseActiveCommentPreview();
		}, ElementPicker._COMMENT_PREVIEW_HIDE_DELAY);
	}

	private _cancelCommentPreviewHide(): void {
		if (this._commentPreviewHideTimeout !== undefined) {
			window.clearTimeout(this._commentPreviewHideTimeout);
			this._commentPreviewHideTimeout = undefined;
		}
	}

	private _collapseActiveCommentPreview(): void {
		if (this._commentPreviewCollapsing) {
			return;
		}
		const elementId = this._commentPreviewElementId;
		const comment = elementId ? this._comments.get(elementId) : undefined;
		if (!elementId || !comment || this._reducedMotion) {
			this._hideActiveCommentPreview();
			return;
		}

		this._commentPreviewCollapsing = true;
		this._shadowHost.classList.add('comment-preview-collapsing');
		this._hideCommentBackdrop();
		const commentAnimation = this._commentAnimation;
		let surfaceAnimation: Animation | undefined;
		if (commentAnimation) {
			surfaceAnimation = commentAnimation.surface;
			surfaceAnimation.reverse();
			for (const animation of commentAnimation.supporting) {
				animation.reverse();
			}
		} else {
			surfaceAnimation = this._animateCommentPreview(true);
		}
		if (!surfaceAnimation) {
			this._hideActiveCommentPreview();
			return;
		}
		surfaceAnimation.onfinish = () => {
			if (this._commentPreviewCollapsing && this._commentPreviewElementId === elementId) {
				this._commentPreviewCollapsing = false;
				this._hideActiveCommentPreview();
			}
		};
	}

	private _cancelCommentAnimations(): void {
		if (!this._commentAnimation) {
			return;
		}
		this._commentAnimation.surface.cancel();
		for (const animation of this._commentAnimation.supporting) {
			animation.cancel();
		}
		this._commentAnimation = undefined;
	}

	private _hideActiveCommentPreview(): void {
		this._cancelCommentPreviewHide();
		this._commentPreviewCollapsing = false;
		this._shadowHost.classList.remove('comment-preview-collapsing');
		if (this._commentPreviewElementId) {
			this._comments.get(this._commentPreviewElementId)?.pin.classList.remove('previewing');
		}
		this._commentPreviewElementId = undefined;
		this._shadowHost.classList.remove('comment-preview-active');
		this._commentPreviewHitArea.style.display = 'none';
		this._commentPreview.style.display = 'none';
		this._hideCommentBackdrop();
		if (!this._commentTarget) {
			this._updateHighlight(this._externalHighlightTarget);
		}
		this._cancelCommentAnimations();
	}

	private _removeComment(elementId: string): void {
		const comment = this._comments.get(elementId);
		if (!comment) {
			return;
		}
		this._hideActiveCommentPreview();
		comment.pin.remove();
		this._comments.delete(elementId);
		this._updateCommentPinNumbers();
		this._unmountWhenIdle();
		this._onCommentRemoved(elementId);
	}

	private _layoutCommentInput(): void {
		this._resizeCommentInput();
		this._layoutCommentComposer();
	}

	private _resizeCommentInput(): void {
		this._commentInput.style.height = 'auto';
		this._commentInput.style.height = `${Math.min(this._commentInput.scrollHeight, 96)}px`;
	}

	private _layoutCommentBackdrop(target: Element): void {
		const rect = this._getVisibleTargetBounds(target.getBoundingClientRect());
		this._commentBackdropCutout.setAttribute('x', `${rect.x}`);
		this._commentBackdropCutout.setAttribute('y', `${rect.y}`);
		this._commentBackdropCutout.setAttribute('width', `${rect.width}`);
		this._commentBackdropCutout.setAttribute('height', `${rect.height}`);
		this._commentBackdropCutout.setAttribute('rx', '2');
	}

	private _showCommentBackdrop(target: Element): void {
		const request = ++this._commentBackdropRequest;
		this._commentBackdropTarget = target;
		this._layoutCommentBackdrop(target);
		this._commentBackdrop.classList.remove('visible');
		requestAnimationFrame(() => {
			if (this._commentBackdropRequest === request) {
				this._commentBackdrop.classList.add('visible');
			}
		});
	}

	private _hideCommentBackdrop(): void {
		this._commentBackdropRequest++;
		this._commentBackdropTarget = undefined;
		this._commentBackdrop.classList.remove('visible');
	}

	private _layoutCommentComposer(): void {
		if (!this._commentTarget) {
			return;
		}
		this._renderHighlight(this._commentTarget);
	}

	private _ensureMounted(): void {
		if (!this._shadowHost.parentNode) {
			document.documentElement.appendChild(this._shadowHost);
		}
	}

	private _unmountWhenIdle(): void {
		if (!this._selectionActive && !this._highlightTarget && this._comments.size === 0) {
			this._shadowHost.remove();
		}
	}

	// --- Static helpers ---

	/**
	 * Inject the shadow-root stylesheet. Custom properties on the host
	 * element drive the colors so the workbench can theme them.
	 *
	 * We deliberately do **not** use a `*` selector with `all: initial` —
	 * that would also reset `<style>`'s default `display: none`, causing
	 * the literal CSS source to render as page text.
	 */
	private static _buildStyle(): HTMLStyleElement {
		const style = document.createElement('style');
		style.textContent = `
			:host {
				all: initial;
				font-family: var(--pick-font, system-ui, -apple-system, sans-serif);
				pointer-events: none !important;
			}
			.highlight {
				position: absolute; box-sizing: border-box;
				z-index: 2;
			}
			.comment-backdrop {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: 2;
			}
			.comment-backdrop-fill {
				fill: var(--vscode-widget-shadow, transparent);
				opacity: 0;
				transition: opacity 120ms linear;
			}
			.comment-backdrop.visible .comment-backdrop-fill {
				opacity: 1;
			}
			.highlight-shape {
				fill: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				stroke: var(--vscode-focusBorder, #0078d4);
				stroke-width: 2px;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent; box-sizing: border-box;
				z-index: 2;
			}
			.comment-layer {
				position: absolute; inset: 0; pointer-events: none;
			}
			.comment-surface {
				position: fixed;
				box-sizing: border-box;
				width: min(320px, calc(100vw - 16px));
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-large, 8px);
				background: var(--vscode-editorWidget-background, #252526);
				color: var(--vscode-editorWidget-foreground, #cccccc);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				font-size: 13px;
				font-weight: 400;
				z-index: 4;
			}
			.comment-surface[data-attachment-corner='top-left'] {
				border-top-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='top-right'] {
				border-top-right-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-left'] {
				border-bottom-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-right'] {
				border-bottom-right-radius: 0;
			}
			.comment-preview-hit-area {
				position: fixed;
				pointer-events: none;
				z-index: 4;
			}
			.comment-preview {
				position: absolute;
				align-items: flex-start;
				gap: 8px;
				max-height: 96px;
				padding: 6px 8px;
				overflow: hidden;
				line-height: 20px;
				pointer-events: none;
			}
			.comment-preview.empty {
				gap: 0;
				padding: 4px;
			}
			.comment-preview.empty .comment-preview-body {
				display: none;
			}
			.comment-preview.empty .comment-preview-remove {
				margin-block: 0;
			}
			.comment-preview-body {
				flex: 1;
				min-width: 0;
				max-height: 82px;
				overflow-x: hidden;
				overflow-y: auto;
				overflow-wrap: anywhere;
				scrollbar-width: thin;
				white-space: pre-wrap;
			}
			:host(.comment-preview-active) .comment-preview-hit-area,
			:host(.comment-preview-active) .comment-preview {
				pointer-events: auto;
			}
			:host(.comment-preview-collapsing) .comment-preview-hit-area,
			:host(.comment-preview-collapsing) .comment-preview {
				pointer-events: none;
			}
			.comment-preview-remove {
				flex: none;
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 24px;
				height: 24px;
				margin-block: -2px;
				padding: 0;
				border: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, inherit);
				cursor: pointer;
				font-family: inherit;
			}
			.comment-preview-remove svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-preview-remove:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-composer {
				align-items: flex-end; gap: 6px; padding: 6px;
				pointer-events: auto;
			}
			.comment-input {
				flex: 1; min-width: 0; resize: none; overflow: auto;
				scrollbar-width: none;
				box-sizing: border-box; margin: 0; padding: 2px 6px;
				background: transparent; color: inherit;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-small, 4px);
				outline: 0;
				font: inherit;
				line-height: 20px;
				caret-color: var(--vscode-focusBorder, currentColor);
			}
			.comment-input::-webkit-scrollbar {
				display: none;
			}
			.comment-input::placeholder {
				color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground, #ccccccb3));
				opacity: 1;
			}
			.comment-send {
				box-sizing: border-box; border: 0; cursor: pointer; font-family: inherit;
			}
			.comment-send {
				flex: none; width: 24px; height: 24px; padding: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, #cccccc);
				display: grid;
				place-items: center;
			}
			.comment-send svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-send:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-pin {
				position: absolute;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				transform: translate(-11px, -11px);
				pointer-events: auto;
				z-index: 0;
				transition: opacity 120ms linear;
			}
			.comment-layer.composing .comment-pin {
				opacity: 0;
				pointer-events: none;
				z-index: auto;
			}
			.comment-layer.comment-capture-pending .comment-pin {
				visibility: hidden;
			}
			.comment-pin:hover, .comment-pin:focus-within {
				z-index: 1;
			}
			.comment-pin.previewing {
				z-index: 0;
			}
			:host(.comment-preview-active) .comment-pin:not(.previewing) {
				opacity: 0.35;
			}
			.comment-pin.previewing .comment-pin-bubble {
				width: 6px;
				height: 6px;
				border-width: 0;
			}
			.comment-pin.previewing .comment-pin-number {
				opacity: 0;
			}
			.comment-pin-bubble {
				box-sizing: border-box;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				padding: 0;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-background, #252526);
				border-radius: var(--vscode-cornerRadius-circle, 9999px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				transition: width 140ms cubic-bezier(0.2, 0, 0, 1), height 140ms cubic-bezier(0.2, 0, 0, 1), border-width 140ms cubic-bezier(0.2, 0, 0, 1);
			}
			.comment-pin-number {
				display: block;
				width: 100%;
				font-size: 11px;
				font-weight: 600;
				line-height: 12px;
				text-align: center;
				transition: opacity 80ms linear;
			}
			.comment-send:focus-visible, .comment-preview-remove:focus-visible, .comment-pin:focus-visible, .comment-input:focus-visible {
				outline: 2px solid var(--vscode-focusBorder, #0078d4);
				outline-offset: 2px;
			}
			:host(.reduce-motion) .comment-backdrop-fill,
			:host(.reduce-motion) .comment-pin,
			:host(.reduce-motion) .comment-pin-bubble,
			:host(.reduce-motion) .comment-pin-number {
				transition: none;
			}
			.label {
				position: fixed; box-sizing: border-box;
				display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px;
				max-width: min(100%, 320px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				font-family: inherit;
				font-size: 11px; line-height: 20px;
				white-space: nowrap;
				border-radius: 2px;
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
				z-index: 3;
			}
			.label-info {
				display: inline-block; overflow: hidden; text-overflow: ellipsis; min-width: 0;
			}
			.label-selector {
				font-weight: 600;
			}
			.label-dims {
				flex-shrink: 0; opacity: 0.8;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dotted var(--vscode-focusBorder, #a0aabe);
				background: transparent;
				z-index: 2;
			}
		`;
		return style;
	}

	private static _applyTheme(host: HTMLElement, theme: IBrowserViewTheme | undefined): void {
		host.style.setProperty('--vscode-focusBorder', theme?.focusBorder ?? null);
		host.style.setProperty('--vscode-button-background', theme?.buttonBackground ?? null);
		host.style.setProperty('--vscode-button-foreground', theme?.buttonForeground ?? null);
		host.style.setProperty('--vscode-editorWidget-background', theme?.widgetBackground ?? null);
		host.style.setProperty('--vscode-editorWidget-foreground', theme?.widgetForeground ?? null);
		host.style.setProperty('--vscode-editorWidget-border', theme?.widgetBorder ?? null);
		host.style.setProperty('--vscode-widget-shadow', theme?.widgetShadow ?? null);
		host.style.setProperty('--vscode-contrastBorder', theme?.contrastBorder ?? null);
		host.style.setProperty('--vscode-descriptionForeground', theme?.descriptionForeground ?? null);
		host.style.setProperty('--vscode-input-placeholderForeground', theme?.inputPlaceholderForeground ?? null);
		host.style.setProperty('--vscode-toolbar-hoverBackground', theme?.toolbarHoverBackground ?? null);
		host.style.setProperty('--pick-font', theme?.font ?? null);
	}
}

/**
 * Drag-to-select rectangle picker used by the "Add Area Screenshot to Chat"
 * flow. Mounts a transparent shadow overlay that captures pointer
 * events, draws a dotted rubber-band rectangle while dragging, and on pointer
 * up reports the selected region in **viewport coordinates**. ESC or a
 * zero-area drag cancels the pick.
 */
class AreaPicker {
	private static readonly _MIN_AREA_PX = 4;
	private static readonly _CURSOR_CROSSHAIR = '/* VS Code injected style */ * { cursor: crosshair !important; }';

	private _selectionActive = false;

	private readonly _shadowHost: HTMLDivElement;
	private readonly _dragbox: HTMLDivElement;

	private _dragStart: { x: number; y: number } | undefined;
	private _cursorStylesheet: HTMLStyleElement | undefined;

	constructor(
		private readonly _onPicked: (rect: IBrowserViewRect) => void,
		private readonly _onStopped: () => void
	) {
		const shadowHost = document.createElement('div');
		shadowHost.setAttribute('data-vscode-area-pick-host', '');
		shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
		const root = shadowHost.attachShadow({ mode: 'closed' });
		root.appendChild(AreaPicker._buildStyle());
		this._shadowHost = shadowHost;

		// A fixed full-viewport layer below the dragbox so the page underneath
		// doesn't receive hover/click events while we're picking. The layer is
		// transparent — the actual page is still visible.
		const overlay = document.createElement('div');
		overlay.className = 'overlay';
		root.appendChild(overlay);

		const dragbox = document.createElement('div');
		dragbox.className = 'dragbox';
		dragbox.style.display = 'none';
		root.appendChild(dragbox);
		this._dragbox = dragbox;
	}

	start(): void {
		if (this._selectionActive) {
			return;
		}
		this._dragStart = undefined;

		document.documentElement.appendChild(this._shadowHost);
		this._selectionActive = true;

		// Force a crosshair cursor across the whole page while picking.
		const cursorStyle = document.createElement('style');
		cursorStyle.setAttribute('data-vscode-area-pick-cursor', '');
		cursorStyle.textContent = AreaPicker._CURSOR_CROSSHAIR;
		document.head.appendChild(cursorStyle);
		this._cursorStylesheet = cursorStyle;

		window.addEventListener('pointermove', this._onPointerMove, true);
		window.addEventListener('pointerdown', this._onPointerDown, true);
		window.addEventListener('pointerup', this._onPointerUp, true);
		window.addEventListener('click', this._onClick, true);
		window.addEventListener('contextmenu', this._onClick, true);
		window.addEventListener('keydown', this._onKeyDown, true);
	}

	stop(): void {
		if (!this._selectionActive) {
			return;
		}
		this._teardown();
		this._onStopped();
	}

	/**
	 * Synchronous teardown of the overlay, cursor style, and event listeners.
	 * Used by both {@link stop} (which then fires `_onStopped`) and `_onPointerUp`
	 * (which fires `_onPicked` or `_onStopped` after teardown completes, so the
	 * IPC consumer can capture the page without our overlay in the frame).
	 */
	private _teardown(): void {
		this._selectionActive = false;
		this._shadowHost.remove();

		this._cursorStylesheet?.remove();
		this._cursorStylesheet = undefined;

		window.removeEventListener('pointermove', this._onPointerMove, true);
		window.removeEventListener('pointerdown', this._onPointerDown, true);
		window.removeEventListener('pointerup', this._onPointerUp, true);
		window.removeEventListener('click', this._onClick, true);
		window.removeEventListener('contextmenu', this._onClick, true);
		window.removeEventListener('keydown', this._onKeyDown, true);

		this._dragbox.style.display = 'none';
		this._dragbox.style.left = '0px';
		this._dragbox.style.top = '0px';
		this._dragbox.style.width = '0px';
		this._dragbox.style.height = '0px';
		this._dragStart = undefined;
	}

	setTheme(theme: IBrowserViewTheme): void {
		this._shadowHost.style.setProperty('--vscode-focusBorder', theme?.focusBorder ?? null);
	}

	private _onPointerDown = (e: PointerEvent): void => {
		if (!this._selectionActive || e.button !== 0) {
			return;
		}
		this._dragStart = { x: e.clientX, y: e.clientY };
		this._dragbox.style.display = 'block';
		this._dragbox.style.left = `${e.clientX}px`;
		this._dragbox.style.top = `${e.clientY}px`;
		this._dragbox.style.width = '0px';
		this._dragbox.style.height = '0px';
		e.preventDefault();
		e.stopPropagation();
	};

	private _onPointerMove = (e: PointerEvent): void => {
		if (!this._selectionActive || !this._dragStart) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const left = Math.min(this._dragStart.x, e.clientX);
		const top = Math.min(this._dragStart.y, e.clientY);
		const width = Math.abs(e.clientX - this._dragStart.x);
		const height = Math.abs(e.clientY - this._dragStart.y);
		this._dragbox.style.left = `${left}px`;
		this._dragbox.style.top = `${top}px`;
		this._dragbox.style.width = `${width}px`;
		this._dragbox.style.height = `${height}px`;
	};

	private _onPointerUp = (e: PointerEvent): void => {
		if (!this._selectionActive || !this._dragStart) {
			return;
		}
		const start = this._dragStart;

		const left = Math.min(start.x, e.clientX);
		const top = Math.min(start.y, e.clientY);
		const width = Math.abs(e.clientX - start.x);
		const height = Math.abs(e.clientY - start.y);

		// Tear down the overlay before committing so the IPC consumer can
		// immediately start a screenshot without our dragbox being in the way.
		this._teardown();

		e.preventDefault();
		e.stopPropagation();

		if (width < AreaPicker._MIN_AREA_PX || height < AreaPicker._MIN_AREA_PX) {
			this._onStopped();
			return;
		}

		// Keep rectangle in viewport (client) coordinates to match other screenshot
		// capture call sites that pass viewport-space bounds as pageRect. The
		// main-process clip math (`pageRect * visualViewportScale * zoomFactor`)
		// measures from the visual viewport origin, so subtract the visual
		// viewport's offset (non-zero only when pinch-panned) to convert layout-
		// viewport client coords into the same coord space that Add Element to
		// Chat's CDP box-model bounds use.
		const vv = window.visualViewport;
		const offsetLeft = vv?.offsetLeft ?? 0;
		const offsetTop = vv?.offsetTop ?? 0;
		const rect = { x: left - offsetLeft, y: top - offsetTop, width, height };

		// The synchronous DOM teardown above is the prerequisite — the next compositor
		// frame won't contain the overlay. Waiting for that frame to actually land
		// before reading the GPU surface is the consumer's responsibility (see
		// `awaitNextPaint` in `BrowserView.captureScreenshot`).
		this._onPicked(rect);
	};

	private _onClick = (e: Event): void => {
		if (!this._selectionActive) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onKeyDown = (e: KeyboardEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (e.key === 'Escape') {
			this.stop();
			e.preventDefault();
			e.stopPropagation();
		}
	};

	private static _buildStyle(): HTMLStyleElement {
		const style = document.createElement('style');
		style.textContent = `
			:host {
				all: initial;
				pointer-events: none !important;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent;
				z-index: 1;
				/* Capture hit-testing so pointer events don't reach the underlying
				 * page during a pick — otherwise hover/:hover styles would
				 * fire on elements beneath the cursor while we're dragging. */
				pointer-events: auto;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dashed var(--vscode-focusBorder, #0078d4);
				background: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				z-index: 2;
				pointer-events: auto;
			}
		`;
		return style;
	}
}

init();
