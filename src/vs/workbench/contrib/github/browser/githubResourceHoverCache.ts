/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { IManagedHoverTooltipHTMLElement } from '../../../../base/browser/ui/hover/hover.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IActionListItemHover } from '../../../../platform/actionWidget/browser/actionList.js';
import { IChatPillAction, IChatPillEntry } from '../../../browser/chatPills.js';
import { IGitHubResourceHover } from './githubResourceHover.js';

type CreateHover = (density: 'default' | 'compact') => IGitHubResourceHover;
type HoverPresentation = Pick<IChatPillEntry, 'hover' | 'pillHover' | 'toolbarActions' | 'hoverActions' | 'promotedAction'>;

/** Keeps GitHub pill hovers stable during metadata refreshes, with a fresh snapshot on each opening. */
export class GitHubResourceHoverCache extends Disposable {
	private readonly _entries = new Map<string, CachedGitHubResourceHover>();
	private _scope: string | undefined;

	get(key: string, entry: IChatPillEntry, createHover: CreateHover | undefined): HoverPresentation {
		let cached = this._entries.get(key);
		if (!cached) {
			cached = new CachedGitHubResourceHover();
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

class CachedGitHubResourceHover {
	private _createHover: CreateHover | undefined;
	private _fallback = '';
	private readonly _views = new Map<'default' | 'compact', { element: HTMLElement; tabbableElements: readonly HTMLElement[]; resolved: boolean }>();
	private readonly _actions = new Map<string, IChatPillAction>();

	private readonly _hover: IActionListItemHover = {
		content: () => this._render('compact'),
		expandable: true,
		showIndicator: false,
		tabThroughPanel: true,
		getTabbableElements: () => this._views.get('compact')?.tabbableElements ?? [],
		contentOwnsPadding: true,
	};
	private readonly _pillHover: IManagedHoverTooltipHTMLElement = {
		element: () => this._render('default'),
		contentOwnsPadding: true,
	};

	update(entry: IChatPillEntry, createHover: CreateHover | undefined): HoverPresentation {
		this._createHover = createHover;
		this._fallback = entry.tooltip ?? entry.label;
		for (const [density, view] of this._views) {
			// Complete initial loading in place, but leave an already-resolved card and its focus untouched.
			if (!view.resolved && view.element.isConnected && createHover) {
				this._updateView(view, createHover(density));
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
			hover: this._hover,
			pillHover: this._pillHover,
			toolbarActions: entry.toolbarActions?.map(action => this._getAction(action)),
			hoverActions: entry.hoverActions?.map(action => this._getAction(action)),
			promotedAction: entry.promotedAction ? this._getAction(entry.promotedAction) : undefined,
		};
	}

	private _render(density: 'default' | 'compact'): HTMLElement {
		let view = this._views.get(density);
		if (view?.element.isConnected) {
			return view.element;
		}
		const hover = this._createHover?.(density);
		if (!view) {
			const element = hover?.element ?? $('.sessions-pr-hover', undefined, this._fallback);
			element.classList.toggle('compact', density === 'compact');
			view = { element, tabbableElements: hover?.tabbableElements ?? [], resolved: !!hover };
			this._views.set(density, view);
		} else if (hover) {
			this._updateView(view, hover);
		} else {
			view.element.className = 'sessions-pr-hover';
			view.element.classList.toggle('compact', density === 'compact');
			view.element.textContent = this._fallback;
			view.tabbableElements = [];
			view.resolved = false;
		}
		return view.element;
	}

	private _updateView(view: { element: HTMLElement; tabbableElements: readonly HTMLElement[]; resolved: boolean }, hover: IGitHubResourceHover): void {
		view.element.className = hover.element.className;
		view.element.replaceChildren(...hover.element.childNodes);
		view.tabbableElements = hover.tabbableElements;
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
