/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import './media/branchPicker.css';

const FILTER_THRESHOLD = 10;
let descriptionIdPool = 0;

export interface IBranchPickerBranch {
	readonly name: string;
	readonly selected?: boolean;
	readonly unavailable?: boolean;
}

export interface IBranchPickerState {
	readonly label: string;
	readonly branches: readonly IBranchPickerBranch[];
	readonly status: 'ready' | 'loading' | 'empty' | 'error';
	readonly canOpen: boolean;
	readonly disabledReason?: string;
	readonly missing?: boolean;
	readonly showChevron?: boolean;
	readonly isolation?: IBranchPickerIsolationState;
}

/**
 * Static configuration for the optional isolation checkbox rendered before the branch trigger.
 */
export interface IBranchPickerIsolationOptions {
	readonly label: string;
	readonly ariaLabel: string;
	readonly onToggle: (checked: boolean) => void;
	readonly slotClassName?: string;
	readonly markTarget?: (element: HTMLElement) => IDisposable;
}

/**
 * Per-update state for the optional isolation checkbox.
 */
export interface IBranchPickerIsolationState {
	readonly checked: boolean;
	readonly state: 'enabled' | 'disabled' | 'hidden';
	readonly disabledReason?: string;
}

export interface IBranchPickerOptions {
	readonly user: string;
	readonly onSelectBranch: (branch: string) => void;
	readonly onRetry?: () => void;
	readonly slotClassName?: string;
	readonly triggerClassName?: string;
	readonly labelClassName?: string;
	readonly descriptionClassName?: string;
	readonly keepDisabledFocusable?: boolean;
	readonly renderDisabledAsStatic?: boolean;
	readonly ariaLive?: 'off' | 'polite' | 'assertive';
	readonly isolation?: IBranchPickerIsolationOptions;
}

interface IBranchPickerItem {
	readonly kind: 'branch' | 'retry';
	readonly name?: string;
	readonly checked?: boolean;
	readonly unavailable?: boolean;
}

/**
 * Shared branch trigger and ActionWidget used by new-session and automation surfaces.
 */
export class BranchPicker extends Disposable {
	private readonly _renderDisposables = this._register(new DisposableStore());
	private _state: IBranchPickerState = {
		label: localize('branchPicker.select', "Branch"),
		branches: [],
		status: 'empty',
		canOpen: false,
	};
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;
	private _descriptionElement: HTMLElement | undefined;
	private _isOpen = false;
	private _isolationSlot: HTMLElement | undefined;
	private _isolationRow: HTMLElement | undefined;
	private _isolationCheckbox: Checkbox | undefined;
	private _isolationState: IBranchPickerIsolationState | undefined;

	constructor(
		private readonly _options: IBranchPickerOptions,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
	) {
		super();
		this._register(toDisposable(() => {
			if (this._isOpen) {
				this._actionWidgetService.hide(true);
			}
		}));
	}

	private _renderIsolation(container: HTMLElement): void {
		const isolation = this._options.isolation;
		if (!isolation) {
			return;
		}

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-isolation-checkbox'));
		if (isolation.slotClassName) {
			slot.classList.add(isolation.slotClassName);
		}
		this._isolationSlot = slot;
		this._renderDisposables.add(toDisposable(() => slot.remove()));
		if (isolation.markTarget) {
			this._renderDisposables.add(isolation.markTarget(slot));
		}

		const row = dom.append(slot, dom.$('.action-label'));
		row.setAttribute('aria-label', isolation.ariaLabel);
		this._isolationRow = row;

		const checkbox = this._renderDisposables.add(new Checkbox(isolation.label, this._isolationState?.checked ?? false, { ...defaultCheckboxStyles, size: 14 }));
		this._isolationCheckbox = checkbox;
		dom.append(row, checkbox.domNode);
		const labelSpan = dom.append(row, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = isolation.label;

		this._renderDisposables.add(checkbox.onChange(() => isolation.onToggle(checkbox.checked)));
		this._renderDisposables.add(Gesture.addTarget(row));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(row, eventType, e => {
				if (!checkbox.enabled) {
					return;
				}
				dom.EventHelper.stop(e, true);
				checkbox.checked = !checkbox.checked;
				isolation.onToggle(checkbox.checked);
			}));
		}

		this._updateIsolation();
	}

	private _updateIsolation(): void {
		if (!this._options.isolation || !this._isolationCheckbox || !this._isolationSlot) {
			return;
		}

		const state = this._isolationState;
		const mode = state?.state ?? 'disabled';
		this._isolationCheckbox.checked = state?.checked ?? false;
		if (mode === 'enabled') {
			this._isolationCheckbox.enable();
		} else {
			this._isolationCheckbox.disable();
			// Keep focusable so keyboard users can discover the disabled reason via tooltip
			this._isolationCheckbox.domNode.tabIndex = 0;
		}
		this._isolationSlot.classList.toggle('disabled', mode === 'disabled');
		this._isolationSlot.classList.toggle('hidden', mode === 'hidden');

		const reason = state?.disabledReason;
		if (this._isolationRow) {
			if (mode === 'disabled' && reason) {
				this._isolationRow.title = reason;
			} else {
				this._isolationRow.removeAttribute('title');
			}
		}
	}

	render(container: HTMLElement): void {
		if (this._isOpen) {
			this._actionWidgetService.hide(true);
		}
		this._renderDisposables.clear();

		const renderTarget = this._options.isolation
			? dom.append(container, dom.$('span.sessions-chat-branch-picker-group'))
			: container;
		if (renderTarget !== container) {
			this._renderDisposables.add({ dispose: () => renderTarget.remove() });
		}

		this._renderIsolation(renderTarget);

		const slot = dom.append(renderTarget, dom.$('.sessions-chat-picker-slot'));
		if (this._options.slotClassName) {
			slot.classList.add(this._options.slotClassName);
		}
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		if (this._options.triggerClassName) {
			trigger.classList.add(this._options.triggerClassName);
		}
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		if (this._options.ariaLive) {
			trigger.setAttribute('aria-live', this._options.ariaLive);
		}
		this._triggerElement = trigger;

		const description = dom.append(slot, dom.$('span.branch-picker-description'));
		if (this._options.descriptionClassName) {
			description.classList.add(this._options.descriptionClassName);
		}
		description.id = `branch-picker-description-${++descriptionIdPool}`;
		trigger.setAttribute('aria-describedby', description.id);
		this._descriptionElement = description;

		this._updateTrigger();

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
	}

	update(state: IBranchPickerState): void {
		this._state = state;
		this._isolationState = state.isolation;
		this._updateTrigger();
		this._updateIsolation();
		if (this._isOpen) {
			if (!state.canOpen) {
				this._actionWidgetService.hide(true);
			} else {
				this._actionWidgetService.updateItems(this._getItems());
			}
		}
	}

	showPicker(): void {
		if (!this._triggerElement || this._actionWidgetService.isVisible || !this._state.canOpen) {
			return;
		}

		const trigger = this._triggerElement;
		const delegate: IActionListDelegate<IBranchPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				if (item.kind === 'retry') {
					this._options.onRetry?.();
				} else if (item.name) {
					this._options.onSelectBranch(item.name);
				}
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
		const items = this._getItems();
		const branchCount = items.filter(item => item.item?.kind === 'branch' && !item.item.unavailable).length;
		this._actionWidgetService.show(
			this._options.user,
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => {
					const label = item.label ?? '';
					return item.item?.unavailable
						? localize('branchPicker.unavailableAriaLabel', "{0}, unavailable locally", label)
						: label;
				},
				getWidgetAriaLabel: () => localize('branchPicker.ariaLabel', "Branch Picker"),
			},
			branchCount > FILTER_THRESHOLD
				? { showFilter: true, filterPlaceholder: localize('branchPicker.filter', "Filter branches…") }
				: undefined,
		);
	}

	private _getItems(): readonly IActionListItem<IBranchPickerItem>[] {
		switch (this._state.status) {
			case 'loading':
				return [{
					kind: ActionListItemKind.Action,
					label: localize('branchPicker.loading', "Loading branches…"),
					disabled: true,
					item: { kind: 'branch' },
				}];
			case 'error':
				return [{
					kind: ActionListItemKind.Action,
					label: localize('branchPicker.retry', "Retry Loading Branches"),
					group: { title: '', icon: Codicon.refresh },
					disabled: !this._options.onRetry,
					item: { kind: 'retry' },
				}];
			case 'empty':
				return [{
					kind: ActionListItemKind.Action,
					label: localize('branchPicker.empty', "No local branches"),
					disabled: true,
					item: { kind: 'branch' },
				}];
			case 'ready':
				return this._state.branches.map(branch => ({
					kind: ActionListItemKind.Action,
					label: branch.name,
					detail: branch.unavailable ? localize('branchPicker.unavailable', "Unavailable locally") : undefined,
					group: { title: '', icon: branch.unavailable ? Codicon.warning : Codicon.gitBranch },
					item: {
						kind: 'branch',
						name: branch.name,
						checked: branch.selected || undefined,
						unavailable: branch.unavailable,
					},
				}));
		}
	}

	private _updateTrigger(): void {
		if (!this._triggerElement || !this._slotElement || !this._descriptionElement) {
			return;
		}
		dom.clearNode(this._triggerElement);

		const icon = dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
		icon.setAttribute('aria-hidden', 'true');
		const label = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		if (this._options.labelClassName) {
			label.classList.add(this._options.labelClassName);
		}
		label.textContent = this._state.label;
		if (this._state.showChevron !== false) {
			const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
			chevron.setAttribute('aria-hidden', 'true');
		}

		const disabled = !this._state.canOpen;
		const renderAsStatic = disabled && this._options.renderDisabledAsStatic === true;
		const reason = this._state.disabledReason;
		this._triggerElement.setAttribute('aria-label', disabled && reason
			? localize('branchPicker.disabledAriaLabel', "{0}. {1}", this._state.label, reason)
			: localize('branchPicker.triggerAriaLabel', "Pick Branch, {0}", this._state.label));
		this._triggerElement.setAttribute('aria-disabled', String(disabled));
		this._triggerElement.setAttribute('aria-busy', String(this._state.status === 'loading'));
		this._triggerElement.tabIndex = !disabled || this._options.keepDisabledFocusable && !renderAsStatic ? 0 : -1;
		if (renderAsStatic) {
			this._triggerElement.removeAttribute('role');
			this._triggerElement.removeAttribute('aria-haspopup');
			this._triggerElement.removeAttribute('aria-expanded');
		} else {
			this._triggerElement.setAttribute('role', 'button');
			this._triggerElement.setAttribute('aria-haspopup', 'listbox');
			this._triggerElement.setAttribute('aria-expanded', String(this._isOpen));
		}
		this._triggerElement.title = disabled && reason ? reason : this._state.label;
		this._descriptionElement.textContent = reason ?? '';
		this._slotElement.classList.toggle('disabled', disabled);
		this._triggerElement.classList.toggle('branch-picker-disabled', disabled);
		this._triggerElement.classList.toggle('branch-picker-missing', this._state.missing === true);
	}
}
