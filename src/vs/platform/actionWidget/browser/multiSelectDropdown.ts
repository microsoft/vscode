/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Codicon } from '../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { AnchorPosition } from '../../../base/common/layout.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { ActionListItemKind, IActionListItem } from './actionList.js';
import { IActionWidgetService } from './actionWidget.js';

export interface IMultiSelectDropdownItem {
	/** Unique across all sections. */
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly disabled?: boolean;
}

export interface IMultiSelectDropdownSection {
	readonly label: string;
	readonly items: readonly IMultiSelectDropdownItem[];
}

export interface IMultiSelectDropdownOptions {
	readonly anchor: HTMLElement;
	readonly ariaLabel: string;
	/** Labels and descriptions must be localized by the caller. Empty sections are omitted. */
	readonly sections: readonly IMultiSelectDropdownSection[];
	readonly selectedIds: readonly string[];
	readonly searchable?: boolean;
	readonly filterPlaceholder?: string;
	readonly width?: number;
	/** Use a higher layer when opening inside another context view, such as a dialog. */
	readonly contextViewLayer?: number;
}

/** An anchored, sectioned checkbox menu. Selection is immediate; dismissal never rolls it back. */
export class MultiSelectDropdown extends Disposable {
	private opening: object | undefined;
	private readonly _onDidChangeSelection = this._register(new Emitter<readonly string[]>());
	/** A fresh snapshot in section/item order, emitted only for user toggles. */
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidHide = this._register(new Emitter<void>());
	/** Fired after the shared widget has finished closing. */
	readonly onDidHide = this._onDidHide.event;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
	) {
		super();
		this._register(toDisposable(() => this.hide()));
	}

	get isVisible(): boolean {
		return !!this.opening;
	}

	/** Opens with the supplied selection; consumers own the trigger and persist change events. */
	show(options: IMultiSelectDropdownOptions): void {
		const allItems = options.sections.flatMap(section => section.items);
		const ids = new Set(allItems.map(item => item.id));
		if (ids.size !== allItems.length || ids.has('') || options.selectedIds.some(id => !ids.has(id))) {
			throw new BugIndicatingError('MultiSelectDropdown requires unique, nonempty item ids and known selected ids.');
		}
		this.actionWidgetService.hide();

		const selected = new Set(options.selectedIds);
		const buildItems = (): IActionListItem<IMultiSelectDropdownItem>[] => options.sections.filter(section => section.items.length).flatMap((section, index) => [
			...(index > 0 ? [{ kind: ActionListItemKind.Separator }] : []),
			{ kind: ActionListItemKind.Header, label: section.label },
			...section.items.map(item => ({
				kind: ActionListItemKind.Action,
				item,
				label: item.label,
				description: item.description,
				disabled: item.disabled,
				group: { title: '', icon: selected.has(item.id) ? Codicon.check : Codicon.blank },
			})),
		]);

		const opening = this.opening = {};
		const expanded = options.anchor.getAttribute('aria-expanded');
		const hasPopup = options.anchor.getAttribute('aria-haspopup');
		options.anchor.setAttribute('aria-expanded', 'true');
		options.anchor.setAttribute('aria-haspopup', options.searchable ? 'listbox' : 'menu');
		this.actionWidgetService.show('multiSelectDropdown', false, buildItems(), {
			onSelect: item => {
				if (selected.has(item.id)) {
					selected.delete(item.id);
				} else {
					selected.add(item.id);
				}
				const focusItemId = options.searchable && dom.isHTMLInputElement(dom.getActiveElement()) ? undefined : item.id;
				this.actionWidgetService.updateItems(buildItems(), focusItemId, { preserveScrollPosition: true });
				this._onDidChangeSelection.fire(allItems.filter(item => selected.has(item.id)).map(item => item.id));
			},
			onHide: () => {
				if (this.opening !== opening) {
					return;
				}
				this.opening = undefined;
				for (const [name, value] of [['aria-expanded', expanded], ['aria-haspopup', hasPopup]] as const) {
					if (value === null) {
						options.anchor.removeAttribute(name);
					} else {
						options.anchor.setAttribute(name, value);
					}
				}
				if (popup && dom.isAncestorOfActiveElement(popup) && options.anchor.isConnected) {
					options.anchor.focus();
				}
				queueMicrotask(() => this._onDidHide.fire());
			},
		}, options.anchor, undefined, [], {
			getWidgetAriaLabel: () => options.ariaLabel,
			getWidgetRole: () => options.searchable ? 'listbox' : 'menu',
			getRole: item => item.kind === ActionListItemKind.Action ? (options.searchable ? 'option' : 'menuitemcheckbox') : 'separator',
			isChecked: item => item.item ? selected.has(item.item.id) : undefined,
			getAriaLabel: item => {
				if (!item.item) {
					return item.label ?? null;
				}
				const label = [item.label, item.description, options.sections.find(section => section.items.includes(item.item!))?.label].filter(Boolean).join(', ');
				return item.disabled ? localize('multiSelectDropdown.disabled', "{0}, disabled", label) : label;
			},
		}, {
			showFilter: options.searchable,
			filterPlaceholder: options.filterPlaceholder,
			focusFilterOnOpen: options.searchable,
			filterAsCombobox: options.searchable,
			ariaMultiselectable: options.searchable,
			deferInitialFocus: true,
			multipleSelectionSupport: false,
			minWidth: options.width ?? 280,
			maxWidth: options.width ?? 280,
			hideDefaultKeybindingTooltip: true,
			preferredAnchorPosition: AnchorPosition.BELOW,
			widgetClassName: 'multi-select-dropdown',
		}, options.contextViewLayer);
		const popup = dom.getActiveElement()?.closest<HTMLElement>('.multi-select-dropdown');
	}

	hide(): void {
		if (this.opening) {
			this.actionWidgetService.hide();
		}
	}
}
