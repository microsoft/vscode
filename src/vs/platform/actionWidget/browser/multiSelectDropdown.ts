/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Codicon } from '../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { AnchorPosition } from '../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ActionList, ActionListItemKind, IActionListItem } from './actionList.js';

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
	private readonly popup = this._register(new MutableDisposable<DisposableStore>());
	private readonly _onDidChangeSelection = this._register(new Emitter<readonly string[]>());
	/** A fresh snapshot in section/item order, emitted only for user toggles. */
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get isVisible(): boolean {
		return !!this.popup.value;
	}

	/** Opens with the supplied selection; consumers own the trigger and persist change events. */
	show(options: IMultiSelectDropdownOptions): void {
		const allItems = options.sections.flatMap(section => section.items);
		const ids = new Set(allItems.map(item => item.id));
		if (ids.size !== allItems.length || ids.has('') || options.selectedIds.some(id => !ids.has(id))) {
			throw new BugIndicatingError('MultiSelectDropdown requires unique, nonempty item ids and known selected ids.');
		}
		this.hide();

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

		const popup = new DisposableStore();
		this.popup.value = popup;
		let list: ActionList<IMultiSelectDropdownItem> | undefined;
		const expanded = options.anchor.getAttribute('aria-expanded');
		const hasPopup = options.anchor.getAttribute('aria-haspopup');
		options.anchor.setAttribute('aria-expanded', 'true');
		options.anchor.setAttribute('aria-haspopup', 'menu');
		popup.add(toDisposable(() => {
			for (const [name, value] of [['aria-expanded', expanded], ['aria-haspopup', hasPopup]] as const) {
				if (value === null) {
					options.anchor.removeAttribute(name);
				} else {
					options.anchor.setAttribute(name, value);
				}
			}
		}));
		const view = this.contextViewService.showContextView({
			getAnchor: () => options.anchor,
			get anchorPosition() { return list?.anchorPosition ?? AnchorPosition.BELOW; },
			layer: options.contextViewLayer,
			render: container => {
				const store = new DisposableStore();
				const widget = dom.append(container, dom.$('.action-widget.multi-select-dropdown'));
				list = store.add(this.instantiationService.createInstance(
					ActionList<IMultiSelectDropdownItem>, 'multiSelectDropdown', false, buildItems(), {
					onHide: () => this.hide(),
					onSelect: item => {
						if (selected.has(item.id)) {
							selected.delete(item.id);
						} else {
							selected.add(item.id);
						}
						list!.updateItems(buildItems(), item.id, { preserveScrollPosition: true });
						this._onDidChangeSelection.fire(allItems.filter(item => selected.has(item.id)).map(item => item.id));
					},
				}, {
					getWidgetAriaLabel: () => options.ariaLabel,
					getWidgetRole: () => 'menu',
					getRole: item => item.kind === ActionListItemKind.Action ? 'menuitemcheckbox' : 'separator',
					isChecked: item => item.item ? selected.has(item.item.id) : undefined,
					getAriaLabel: item => item.item
						? [item.label, item.description, options.sections.find(section => section.items.includes(item.item!))?.label].filter(Boolean).join(', ')
						: item.label ?? null,
				}, {
					showFilter: options.searchable,
					filterPlaceholder: options.filterPlaceholder,
					focusFilterOnOpen: options.searchable,
					deferInitialFocus: true,
					minWidth: options.width ?? 280,
					maxWidth: options.width ?? 280,
					hideDefaultKeybindingTooltip: true,
					preferredAnchorPosition: AnchorPosition.BELOW,
				}, options.anchor,
				));
				if (list.filterContainer) {
					widget.appendChild(list.filterContainer);
				}
				widget.appendChild(list.domNode);
				widget.style.width = `${list.layout(options.width ?? 280)}px`;
				store.add(dom.addStandardDisposableListener(widget, 'keydown', e => {
					if (e.browserEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey) {
						return;
					}
					switch (e.keyCode) {
						case KeyCode.Escape:
							dom.EventHelper.stop(e, true);
							this.hide();
							options.anchor.focus();
							break;
						case KeyCode.Enter:
						case KeyCode.Space:
							if (e.keyCode === KeyCode.Space && e.target === list!.filterInput) {
								return;
							}
							dom.EventHelper.stop(e, true);
							list!.acceptSelected();
							break;
						case KeyCode.UpArrow:
							dom.EventHelper.stop(e, true);
							list!.focusPrevious();
							break;
						case KeyCode.DownArrow:
							dom.EventHelper.stop(e, true);
							list!.focusNext();
							break;
					}
				}));
				const focusTracker = store.add(dom.trackFocus(widget));
				store.add(focusTracker.onDidBlur(() => this.hide()));
				store.add(dom.addDisposableListener(dom.getWindow(widget).document, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
					if (dom.isHTMLElement(e.target) && !dom.isAncestor(e.target, widget)) {
						this.hide();
					}
				}, true));
				return store;
			},
			focus: () => list?.focus(),
			layout: () => { list?.layout(options.width ?? 280); },
			onHide: () => {
				if (this.popup.value === popup) {
					this.popup.clear();
				}
			},
		});
		popup.add(toDisposable(() => view.close()));
		popup.add(toDisposable(() => this._onDidHide.fire()));
	}

	hide(): void {
		this.popup.clear();
	}
}
