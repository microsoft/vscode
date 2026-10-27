/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { NEW_WORKTREE_LABEL } from './branchPicker.js';

/** Where a new session works: in its folder, or in a new Git worktree of it. */
export type SessionIsolation = 'folder' | 'worktree';

interface IIsolationOption {
	readonly isolation: SessionIsolation;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
}

interface IIsolationPickerItem {
	readonly isolation: SessionIsolation;
	readonly checked: boolean;
}

const ISOLATION_OPTIONS: readonly IIsolationOption[] = [
	{
		isolation: 'folder',
		label: localize('isolationPicker.branch', "Branch"),
		description: localize('isolationPicker.branchDescription', "Works in the repository already on this computer"),
		icon: Codicon.folder,
	},
	{
		isolation: 'worktree',
		label: NEW_WORKTREE_LABEL,
		description: localize('isolationPicker.worktreeDescription', "Creates a separate copy for this session"),
		icon: Codicon.worktree,
	},
];

export interface IIsolationPickerOptions {
	readonly user: string;
	readonly hoverDelegate?: IHoverDelegate;
	readonly onSelect: (isolation: SessionIsolation) => void;
}

/**
 * The isolation dropdown of the New Session composer (Branch or New Worktree): a trigger showing the
 * current choice that opens a list of both, each with its description.
 */
export class IsolationPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _hoverDelegate: IHoverDelegate;
	private _isolation: SessionIsolation = 'folder';
	private _trigger: HTMLElement | undefined;
	private _isOpen = false;

	constructor(
		private readonly _options: IIsolationPickerOptions,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
		this._hoverDelegate = _options.hoverDelegate ?? this._register(createInstantHoverDelegate());
		this._register(toDisposable(() => {
			if (this._isOpen) {
				this._actionWidgetService.hide(true);
			}
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-isolation-picker'));
		this._renderDisposables.add(toDisposable(() => slot.remove()));
		const trigger = this._trigger = dom.append(slot, dom.$('a.action-label'));
		this._renderDisposables.add(toDisposable(() => this._trigger = undefined));
		trigger.role = 'button';
		trigger.tabIndex = 0;
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));
		this._renderDisposables.add(this._hoverService.setupManagedHover(this._hoverDelegate, trigger, () => this._getOption(this._isolation).description));
		this._updateTrigger();
	}

	update(isolation: SessionIsolation): void {
		this._isolation = isolation;
		this._updateTrigger();
		if (this._isOpen) {
			this._actionWidgetService.updateItems(this._getItems());
		}
	}

	showPicker(): void {
		const trigger = this._trigger;
		if (!trigger || this._actionWidgetService.isVisible) {
			return;
		}
		const delegate: IActionListDelegate<IIsolationPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				this._options.onSelect(item.isolation);
			},
			onHide: () => {
				this._isOpen = false;
				trigger.setAttribute('aria-expanded', 'false');
				if (trigger.isConnected) {
					trigger.focus();
				}
			},
		};
		this._isOpen = true;
		trigger.setAttribute('aria-expanded', 'true');
		this._actionWidgetService.show(this._options.user, false, this._getItems(), delegate, trigger, undefined, [], {
			getAriaLabel: item => item.label ?? '',
			getWidgetAriaLabel: () => localize('isolationPicker.ariaLabel', "Isolation Picker"),
		});
	}

	private _getItems(): IActionListItem<IIsolationPickerItem>[] {
		return ISOLATION_OPTIONS.map(option => ({
			kind: ActionListItemKind.Action,
			label: option.label,
			detail: option.description,
			ariaDescription: option.description,
			group: { title: '', icon: option.icon },
			item: { isolation: option.isolation, checked: option.isolation === this._isolation },
		}));
	}

	private _getOption(isolation: SessionIsolation): IIsolationOption {
		return ISOLATION_OPTIONS.find(option => option.isolation === isolation) ?? ISOLATION_OPTIONS[0];
	}

	private _updateTrigger(): void {
		const trigger = this._trigger;
		if (!trigger) {
			return;
		}
		const option = this._getOption(this._isolation);
		dom.clearNode(trigger);
		dom.append(trigger, renderIcon(option.icon)).setAttribute('aria-hidden', 'true');
		dom.append(trigger, dom.$('span.sessions-chat-dropdown-label')).textContent = option.label;
		trigger.setAttribute('aria-label', localize('isolationPicker.triggerAriaLabel', "Isolation: {0}", option.label));
	}
}
