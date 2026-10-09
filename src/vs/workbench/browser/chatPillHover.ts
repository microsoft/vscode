/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPills.css';

import { $ } from '../../base/browser/dom.js';
import { IManagedHoverTooltipHTMLElement } from '../../base/browser/ui/hover/hover.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IActionListItemHover } from '../../platform/actionWidget/browser/actionList.js';
import type { IChatPillAction, IChatPillEntry } from './chatPills.js';

export interface IChatPillHoverContent {
	readonly element: HTMLElement;
	readonly tabbableElements: readonly HTMLElement[];
	/** Noninteractive regions with stable indexes that can refresh without replacing focused content. */
	readonly liveElements?: readonly HTMLElement[];
	readonly onRefreshing?: () => void;
}

/** Resource-specific content and freshness; the shared presenter owns the hover lifecycle. */
export interface IChatPillHoverContentProvider {
	readonly fallback: string;
	/** Creates a fresh content snapshot for an opening or refresh. */
	readonly createContent: (density: 'default' | 'compact') => IChatPillHoverContent | undefined;
	readonly resolve?: () => Promise<void>;
	readonly isFresh?: () => boolean;
	readonly failedFallback?: string;
}

type CreateHover = IChatPillHoverContentProvider['createContent'];
type HoverPresentation = Pick<IChatPillEntry, 'hover' | 'pillHover' | 'toolbarActions' | 'hoverActions' | 'promotedAction'>;

export function createChatPillHoverElement(className: string, density: 'default' | 'compact' = 'default'): HTMLElement {
	const element = $('.chat-pill-hover-content');
	element.classList.add(className);
	element.classList.toggle('compact', density === 'compact');
	return element;
}

/** Supplies the same hover lifecycle for static and asynchronously enriched pill content. */
export function createChatPillHover(provider: IChatPillHoverContentProvider): { readonly hover: IActionListItemHover; readonly pillHover: IManagedHoverTooltipHTMLElement } {
	return new CachedChatPillHover(provider);
}

/** Keeps collection hovers and actions stable through updates, with fresh content on reopening. */
export class ChatPillHoverCache extends Disposable {
	private readonly _entries = new Map<string, CachedChatPillHover>();
	private _scope: string | undefined;

	get(key: string, entry: IChatPillEntry, createHover: CreateHover | undefined): HoverPresentation {
		let cached = this._entries.get(key);
		if (!cached) {
			cached = new CachedChatPillHover({ fallback: entry.tooltip ?? entry.label, createContent: () => undefined });
			this._entries.set(key, cached);
		}
		return cached.update(entry, createHover);
	}

	retain(keys: ReadonlySet<string>, scope?: string): void {
		if (this._scope !== scope) {
			this._entries.clear();
			this._scope = scope;
		}
		for (const key of this._entries.keys()) {
			if (!keys.has(key)) {
				this._entries.delete(key);
			}
		}
	}

	override dispose(): void {
		this._entries.clear();
		super.dispose();
	}
}

class CachedChatPillHover {
	private readonly _views = new Map<'default' | 'compact', { element: HTMLElement; tabbableElements: readonly HTMLElement[]; liveElements?: readonly HTMLElement[]; resolved: boolean; resolution?: Promise<void> }>();
	private readonly _actions = new Map<string, IChatPillAction>();
	private _resolution: Promise<void> | undefined;

	constructor(private _provider: IChatPillHoverContentProvider) { }

	readonly hover: IActionListItemHover = {
		content: () => this._render('compact'),
		expandable: true,
		showIndicator: false,
		tabThroughPanel: true,
		getTabbableElements: () => this._views.get('compact')?.tabbableElements ?? [],
		contentOwnsPadding: true,
		panelClassName: 'chat-pill-hover-panel',
	};
	readonly pillHover: IManagedHoverTooltipHTMLElement = {
		element: () => this._render('default'),
		contentOwnsPadding: true,
	};

	update(entry: IChatPillEntry, createHover: CreateHover | undefined): HoverPresentation {
		this._provider = { fallback: entry.tooltip ?? entry.label, createContent: createHover ?? (() => undefined) };
		for (const [density, view] of this._views) {
			if (view.element.isConnected && createHover && (!view.resolved || view.liveElements?.length)) {
				const content = createHover(density);
				if (content) {
					if (view.resolved) {
						this._updateLiveElements(view, content);
					} else {
						this._updateView(view, content);
					}
				}
			}
		}
		const actions = [...entry.toolbarActions ?? [], ...entry.hoverActions ?? [], ...entry.promotedAction ? [entry.promotedAction] : []];
		const retained = new Set(actions.map(action => action.id));
		for (const id of this._actions.keys()) {
			if (!retained.has(id)) {
				this._actions.delete(id);
			}
		}
		return {
			hover: this.hover,
			pillHover: this.pillHover,
			toolbarActions: entry.toolbarActions?.map(action => this._getAction(action)),
			hoverActions: entry.hoverActions?.map(action => this._getAction(action)),
			promotedAction: entry.promotedAction ? this._getAction(entry.promotedAction) : undefined,
		};
	}

	private _render(density: 'default' | 'compact'): HTMLElement {
		let view = this._views.get(density);
		if (view?.element.isConnected || view?.resolution) {
			return view.element;
		}
		const hover = this._provider.createContent(density);
		if (!view) {
			const element = $('.chat-pill-hover-content');
			view = { element, tabbableElements: [], resolved: false };
			this._views.set(density, view);
		}
		if (hover) {
			this._updateView(view, hover);
		} else {
			view.element.className = 'chat-pill-hover-content';
			view.element.textContent = this._provider.fallback;
			view.tabbableElements = [];
			view.resolved = false;
		}
		view.element.classList.toggle('compact', density === 'compact');
		if (this._provider.resolve && (!hover || !this._provider.isFresh?.())) {
			const renderedView = view;
			const provider = this._provider;
			renderedView.element.setAttribute('aria-busy', 'true');
			if (hover) {
				hover.onRefreshing?.();
			}
			this._resolution ??= Promise.resolve().then(() => provider.resolve?.()).catch(error => {
				onUnexpectedError(error);
				throw error;
			}).finally(() => { this._resolution = undefined; });
			renderedView.resolution = this._resolution.then(() => {
				const content = provider.createContent(density);
				if (content) {
					if (renderedView.resolved && renderedView.element.isConnected) {
						this._updateLiveElements(renderedView, content);
					} else {
						this._updateView(renderedView, content);
					}
				} else {
					renderedView.element.textContent = provider.failedFallback ?? provider.fallback;
					renderedView.tabbableElements = [];
					renderedView.resolved = false;
				}
			}, () => {
				if (!renderedView.resolved) {
					renderedView.element.textContent = provider.failedFallback ?? provider.fallback;
				}
			}).finally(() => {
				renderedView.element.setAttribute('aria-busy', 'false');
				renderedView.resolution = undefined;
			});
		} else {
			view.element.setAttribute('aria-busy', 'false');
		}
		return view.element;
	}

	private _updateLiveElements(view: { liveElements?: readonly HTMLElement[] }, content: IChatPillHoverContent): void {
		for (const [index, element] of (view.liveElements ?? []).entries()) {
			const refreshedElement = content.liveElements?.[index];
			if (refreshedElement && !element.isEqualNode(refreshedElement)) {
				element.replaceChildren(...refreshedElement.childNodes);
			}
		}
	}

	private _updateView(view: { element: HTMLElement; tabbableElements: readonly HTMLElement[]; liveElements?: readonly HTMLElement[]; resolved: boolean }, hover: IChatPillHoverContent): void {
		view.element.className = hover.element.className;
		view.element.classList.add('chat-pill-hover-content');
		view.element.replaceChildren(...hover.element.childNodes);
		view.tabbableElements = hover.tabbableElements;
		view.liveElements = hover.liveElements;
		view.resolved = true;
	}

	private _getAction(action: IChatPillAction): IChatPillAction {
		const cached = this._actions.get(action.id);
		if (!cached) {
			this._actions.set(action.id, action);
			return action;
		}
		if (cached !== action) {
			cached.label = action.label;
			cached.tooltip = action.tooltip;
			cached.class = action.class;
			cached.enabled = action.enabled;
			cached.checked = action.checked;
			cached.run = (...args) => action.run(...args);
		}
		return cached;
	}
}
