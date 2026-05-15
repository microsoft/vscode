/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

// Only `import type` is allowed in preload scripts — Electron preloads cannot resolve module imports at runtime.
import type { IBrowserViewTheme } from '../common/browserView.js';

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
		// eslint-disable-next-line no-restricted-syntax
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

		// Allow native shortcuts to be handled by the browser
		const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
		if (ctrlCmd && !event.altKey) {
			const key = event.key.toLowerCase();
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

	const elementPicker = new ElementPicker(el => ipcRenderer.send('vscode:browserView:elementPicked', track(el)));

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

	let contextMenuTargetRef: WeakRef<Element> | undefined;
	window.addEventListener('contextmenu', (event) => {
		if (!event.isTrusted) {
			return;
		}

		const target = event.target;
		if (target instanceof Element) {
			const els = [target];
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				els.push(selection.anchorNode as Element, selection.focusNode as Element);
			}
			contextMenuTargetRef = new WeakRef(findCommonVisibleAncestor(els) ?? target);
		} else {
			contextMenuTargetRef = undefined;
		}
	}, { capture: true });

	const getElement = (id: string): Element | null => {
		switch (id) {
			case 'active':
				// eslint-disable-next-line no-restricted-syntax
				return document.activeElement;
			case 'context-menu-target':
				return contextMenuTargetRef?.deref() ?? null;
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
		},
		setTheme(theme: IBrowserViewTheme): void {
			elementPicker.setTheme(theme);
		},
		pickElement: elementPicker.api,
		highlightElement(id: string): boolean {
			const element = getElement(id);
			if (!element) {
				return false;
			}
			elementPicker.highlight(element);
			return true;
		},
		hideHighlight(): void {
			elementPicker.hideHighlight();
		}
	};

	const mainWorldHelpers = {
		getElement
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

	ipcRenderer.send('vscode:browserView:preloadReady');
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
			// eslint-disable-next-line no-restricted-syntax
			const width = cur instanceof HTMLElement ? cur.offsetWidth : cur.clientWidth;
			// eslint-disable-next-line no-restricted-syntax
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
	static DRAG_THRESHOLD_PX = 4;

	private _selectionActive = false;
	private _continuous = false;

	// DOM — created once in the constructor, reused across start/stop cycles.
	private readonly _shadowHost: HTMLDivElement;
	private readonly _highlight: HTMLDivElement;
	private readonly _label: HTMLDivElement;
	private readonly _labelSelector: HTMLSpanElement;
	private readonly _labelDims: HTMLSpanElement;
	private readonly _dragbox: HTMLDivElement;

	// Interaction state (reset on stop)
	private _dragStart: { x: number; y: number } | undefined;
	private _dragStartTarget: Element | undefined;
	private _highlightTarget: Element | undefined;

	readonly api = {
		start: (): boolean => this.start(),
		stop: (): void => this.stop(),
		isActive: (): boolean => this._selectionActive,
	};

	constructor(
		private readonly _onPicked: (element: Element) => void
	) {
		// Build the shadow DOM tree once. The host is appended/removed from the
		// document on start/stop so the overlay only captures events when active.
		const shadowHost = document.createElement('div');
		shadowHost.setAttribute('data-vscode-pick-host', '');
		shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
		const root = shadowHost.attachShadow({ mode: 'closed' });
		root.appendChild(ElementPicker._buildStyle());
		this._shadowHost = shadowHost;

		const highlight = document.createElement('div');
		highlight.className = 'highlight';
		highlight.style.display = 'none';
		root.appendChild(highlight);
		this._highlight = highlight;

		const overlay = document.createElement('div');
		overlay.className = 'overlay';
		root.appendChild(overlay);

		const label = document.createElement('div');
		label.className = 'label';
		label.style.display = 'none';
		root.appendChild(label);
		this._label = label;

		const labelSelector = document.createElement('span');
		labelSelector.className = 'label-selector';
		label.appendChild(labelSelector);
		this._labelSelector = labelSelector;

		const labelDims = document.createElement('span');
		labelDims.className = 'label-dims';
		label.appendChild(labelDims);
		this._labelDims = labelDims;

		const dragbox = document.createElement('div');
		dragbox.className = 'dragbox';
		dragbox.style.display = 'none';
		root.appendChild(dragbox);
		this._dragbox = dragbox;

		window.addEventListener('scroll', () => this._onScrollOrResize(), { passive: true, capture: true });
		window.addEventListener('resize', () => this._onScrollOrResize());
	}

	start(): boolean {
		if (this._selectionActive) {
			return true;
		}
		this._continuous = false; // for now
		// eslint-disable-next-line no-restricted-syntax
		document.documentElement.appendChild(this._shadowHost);
		this._shadowHost.classList.add('selecting');
		this._selectionActive = true;

		// Register high-frequency listeners only while selection is active.
		window.addEventListener('pointermove', this._onPointerMove, true);
		window.addEventListener('pointerleave', this._onPointerLeave, true);
		window.addEventListener('pointerdown', this._onPointerDown, true);
		window.addEventListener('pointerup', this._onPointerUp, true);
		window.addEventListener('click', this._onClick, true);

		return true;
	}

	/**
	 * Update the theme colors applied to the overlay.
	 * Can be called at any time; takes effect immediately.
	 */
	setTheme(theme: IBrowserViewTheme): void {
		ElementPicker._applyTheme(this._shadowHost, theme);
	}

	/**
	 * Highlight a specific element without starting a pick session.
	 * Mounts the shadow host if not already in the document.
	 */
	highlight(element: Element): void {
		if (!this._shadowHost.parentNode) {
			// eslint-disable-next-line no-restricted-syntax
			document.documentElement.appendChild(this._shadowHost);
		}
		this._updateHighlight(element);
	}

	/**
	 * Hide any current highlight. If no pick session is active, also
	 * removes the shadow host from the document.
	 */
	hideHighlight(): void {
		this._updateHighlight(undefined);
		if (!this._selectionActive && this._shadowHost.parentNode) {
			this._shadowHost.remove();
		}
	}

	stop(): void {
		if (!this._selectionActive) {
			return;
		}
		this._selectionActive = false;
		this._shadowHost.classList.remove('selecting');
		this._shadowHost.remove();

		// Remove high-frequency listeners.
		window.removeEventListener('pointermove', this._onPointerMove, true);
		window.removeEventListener('pointerleave', this._onPointerLeave, true);
		window.removeEventListener('pointerdown', this._onPointerDown, true);
		window.removeEventListener('pointerup', this._onPointerUp, true);
		window.removeEventListener('click', this._onClick, true);

		this._highlight.style.display = 'none';
		this._label.style.display = 'none';
		this._dragbox.style.display = 'none';
		this._dragStart = undefined;
		this._dragStartTarget = undefined;
		this._highlightTarget = undefined;
	}

	// --- Event handlers ---

	private _onPointerMove = (e: PointerEvent): void => {
		if (!this._selectionActive) {
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
		if (dx < ElementPicker.DRAG_THRESHOLD_PX && dy < ElementPicker.DRAG_THRESHOLD_PX) {
			return;
		}
		const left = Math.min(this._dragStart.x, e.clientX);
		const top = Math.min(this._dragStart.y, e.clientY);
		if (this._dragbox) {
			this._dragbox.style.display = 'block';
			this._dragbox.style.left = `${left}px`;
			this._dragbox.style.top = `${top}px`;
			this._dragbox.style.width = `${dx}px`;
			this._dragbox.style.height = `${dy}px`;
		}
		// Live preview of the deepest common ancestor that the region
		// currently resolves to, so the user sees exactly what will be
		// selected if they release the drag now.
		this._updateHighlight(this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy }));
	};

	private _onPointerLeave = (): void => {
		if (!this._selectionActive) {
			return;
		}
		if (!this._dragStart) {
			this._updateHighlight(undefined);
		}
	};

	private _onPointerDown = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (e.button !== 0) {
			return;
		}
		this._dragStart = { x: e.clientX, y: e.clientY };
		this._dragStartTarget = this._pickElementAt(e.clientX, e.clientY);
		e.preventDefault();
		e.stopPropagation();
	};

	private _onPointerUp = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (!this._dragStart) {
			return;
		}
		const dx = Math.abs(e.clientX - this._dragStart.x);
		const dy = Math.abs(e.clientY - this._dragStart.y);
		const start = this._dragStart;
		this._dragStart = undefined;

		if (dx < ElementPicker.DRAG_THRESHOLD_PX && dy < ElementPicker.DRAG_THRESHOLD_PX) {
			// Click → pick the element under the pointer.
			const target = this._dragStartTarget ?? this._pickElementAt(e.clientX, e.clientY);
			this._dragStartTarget = undefined;
			if (target) {
				this._commit(target);
			}
		} else {
			// Drag → pick the deepest common ancestor of the region.
			this._dragStartTarget = undefined;
			if (this._dragbox) {
				this._dragbox.style.display = 'none';
			}
			this._updateHighlight(undefined);
			const left = Math.min(start.x, e.clientX);
			const top = Math.min(start.y, e.clientY);
			const ancestor = this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy });
			if (ancestor) {
				this._commit(ancestor);
			}
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onClick = (e: Event): void => {
		if (!this._selectionActive) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onScrollOrResize(): void {
		if (this._highlightTarget) {
			this._renderHighlight(this._highlightTarget);
		}
	}

	// --- Picking helpers ---

	/** Return the page element under a viewport point, skipping our own overlay host. */
	private _pickElementAt(x: number, y: number): Element | undefined {
		// eslint-disable-next-line no-restricted-syntax
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
	private _pickRegionAncestor(rect: { x: number; y: number; width: number; height: number }): Element | undefined {
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
		const labelHeight = 22; // label height (20) + 2px gap above the box.

		// Highlight box is in *page* coordinates so it scrolls with the document.
		highlight.style.display = 'block';
		highlight.style.left = `${rect.left + scrollX}px`;
		highlight.style.top = `${rect.top + scrollY}px`;
		highlight.style.width = `${rect.width}px`;
		highlight.style.height = `${rect.height}px`;

		// Label is in *viewport* coordinates and sticky-clamped to the
		// viewport so it stays visible while any part of the element is
		// in view.
		if (rect.bottom <= 0 || rect.top >= viewportHeight) {
			label.style.display = 'none';
			return;
		}
		const tagName = String(target.tagName || '').toLowerCase();
		const idPart = target.id ? `#${target.id}` : '';
		const classPart = target.classList.length
			? '.' + [...target.classList].join('.')
			: '';
		let selector = tagName + idPart + classPart;
		if (selector.length > 60) {
			selector = selector.slice(0, 59) + '\u2026';
		}
		this._labelSelector.textContent = selector;
		this._labelDims.textContent = `${Math.round(rect.width)} \u00d7 ${Math.round(rect.height)}`;
		label.style.display = 'inline-flex';
		const idealTop = rect.top - labelHeight;
		const labelTop = Math.max(0, Math.min(viewportHeight - labelHeight, idealTop));
		label.style.left = `${Math.max(0, rect.left)}px`;
		label.style.top = `${labelTop}px`;
	}

	private _updateHighlight(target: Element | undefined): void {
		this._highlightTarget = target;
		if (!target) {
			this._highlight.style.display = 'none';
			this._label.style.display = 'none';
			return;
		}
		this._renderHighlight(target);
	}

	// --- Commit ---

	private _commit(target: Element): void {
		if (!this._selectionActive) {
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
				border: 2px solid var(--pick-accent, #0078d4);
				background: color-mix(in srgb, var(--pick-accent, #0078d4) 12%, transparent);
				border-radius: 2px;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent; box-sizing: border-box;
				z-index: 1;
			}
			:host(.selecting) .overlay {
				cursor: crosshair;
			}
			.label {
				position: fixed; box-sizing: border-box;
				display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px;
				max-width: 80vw;
				background: var(--pick-accent, #0078d4);
				color: var(--pick-accent-fg, white);
				font-family: inherit;
				font-size: 11px; font-weight: 600; line-height: 20px;
				white-space: nowrap;
				border-radius: 2px;
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
				z-index: 3;
			}
			.label-selector {
				overflow: hidden; text-overflow: ellipsis; min-width: 0;
			}
			.label-dims {
				flex-shrink: 0; opacity: 0.8; font-weight: normal;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dotted var(--pick-secondary, #a0aabe);
				background: transparent;
				z-index: 2;
			}
		`;
		return style;
	}

	private static _applyTheme(host: HTMLElement, theme: IBrowserViewTheme | undefined): void {
		host.style.setProperty('--pick-accent', theme?.accentColor ?? null);
		host.style.setProperty('--pick-accent-fg', theme?.accentForegroundColor ?? null);
		host.style.setProperty('--pick-secondary', theme?.secondaryColor ?? null);
		host.style.setProperty('--pick-font', theme?.font ?? null);
	}
}

init();
