/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../theme/browser/defaultStyles.js';
import './actionListDropdown.css';

/**
 * Represents an item in the action list dropdown.
 */
export interface IActionListDropdownItem {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly tooltip?: string;
	readonly className?: string;
	readonly badge?: string;
	readonly descriptionButton?: { readonly label: string; readonly onDidClick: () => void };
	readonly section?: string;
	readonly isSectionToggle?: boolean;
	readonly run: () => void;
}

/**
 * The kind of entry in the action list dropdown.
 */
export const enum ActionListDropdownItemKind {
	Action = 'action',
	Separator = 'separator'
}

/**
 * An entry in the action list dropdown, either an action item or a separator.
 */
export interface IActionListDropdownEntry {
	readonly item?: IActionListDropdownItem;
	readonly kind: ActionListDropdownItemKind;
}

/**
 * Options for the action list dropdown.
 */
export interface IActionListDropdownOptions {
	readonly collapsedByDefault?: ReadonlySet<string>;
	readonly minWidth?: number;
}

/**
 * Delegate that receives callbacks from the action list dropdown.
 */
export interface IActionListDropdownDelegate {
	onSelect(item: IActionListDropdownItem): void;
	onHide(): void;
}

const ACTION_ITEM_HEIGHT = 24;
const SEPARATOR_HEIGHT = 8;

/**
 * A DOM-based dropdown widget with filtering and collapsible groups.
 * Renders items directly as DOM elements without using the List widget.
 */
export class ActionListDropdown extends Disposable {

	private _isVisible = false;
	private _domNode: HTMLElement | undefined;
	private _previousFocusedElement: HTMLElement | undefined;
	private readonly _showDisposables = this._register(new DisposableStore());
	private readonly _collapsedSections = new Set<string>();

	get isVisible(): boolean {
		return this._isVisible;
	}

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();
	}

	/**
	 * Show the dropdown anchored to the given element.
	 */
	show(entries: IActionListDropdownEntry[], delegate: IActionListDropdownDelegate, anchor: HTMLElement, options?: IActionListDropdownOptions): void {
		this.hide();

		this._showDisposables.clear();
		this._previousFocusedElement = dom.getDocument(anchor).activeElement as HTMLElement | undefined;
		this._focusedIndex = -1;

		this._collapsedSections.clear();
		if (options?.collapsedByDefault) {
			for (const section of options.collapsedByDefault) {
				this._collapsedSections.add(section);
			}
		}

		let filterText = '';
		let itemElements: { element: HTMLElement; entry: IActionListDropdownEntry }[] = [];
		let itemsContainer: HTMLElement;
		let filterContainer: HTMLElement;

		const showDisposables = this._showDisposables;

		let filterInput: HTMLInputElement;

		const renderItems = () => {
			dom.clearNode(itemsContainer);
			itemElements = [];

			const filtered = this._getVisibleEntries(entries, filterText);
			for (const entry of filtered) {
				const el = this._renderEntry(entry, delegate, renderItems, showDisposables);
				itemsContainer.appendChild(el);
				itemElements.push({ element: el, entry });
			}

			this._focusedIndex = -1;
			this._updateWidth(itemsContainer, itemElements, options?.minWidth);
			this._constrainHeight(itemsContainer, filterContainer);

			// Re-focus filter input after re-render to prevent blur-to-close
			filterInput?.focus();
		};

		const contextView = this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container) => {
				const disposables = new DisposableStore();

				const widget = dom.append(container, dom.$('.action-list-dropdown'));
				this._domNode = widget;

				itemsContainer = dom.append(widget, dom.$('.action-list-dropdown-items'));

				filterContainer = dom.append(widget, dom.$('.action-list-dropdown-filter'));
				filterInput = dom.append(filterContainer, dom.$<HTMLInputElement>('input.action-list-dropdown-filter-input'));
				filterInput.type = 'text';
				filterInput.placeholder = localize('filterPlaceholder', "Filter...");

				disposables.add(dom.addDisposableListener(filterInput, 'input', () => {
					filterText = filterInput.value;
					renderItems();
				}));

				disposables.add(dom.addDisposableListener(filterInput, 'keydown', (e: KeyboardEvent) => {
					const event = new StandardKeyboardEvent(e);
					if (event.keyCode === KeyCode.DownArrow) {
						e.preventDefault();
						this._focusedIndex = -1;
						this._moveFocus(itemElements, 1);
					} else if (event.keyCode === KeyCode.UpArrow) {
						e.preventDefault();
						this._focusedIndex = itemElements.length;
						this._moveFocus(itemElements, -1);
					} else if (event.keyCode === KeyCode.Escape) {
						e.preventDefault();
						if (filterText) {
							filterInput.value = '';
							filterText = '';
							renderItems();
						} else {
							this.hide();
						}
					}
				}));

				disposables.add(dom.addDisposableListener(widget, 'keydown', (e: KeyboardEvent) => {
					const event = new StandardKeyboardEvent(e);
					if (event.keyCode === KeyCode.DownArrow) {
						e.preventDefault();
						this._moveFocus(itemElements, 1);
					} else if (event.keyCode === KeyCode.UpArrow) {
						e.preventDefault();
						this._moveFocus(itemElements, -1);
					} else if (event.keyCode === KeyCode.Enter) {
						e.preventDefault();
						if (this._focusedIndex >= 0 && this._focusedIndex < itemElements.length) {
							const { entry } = itemElements[this._focusedIndex];
							if (entry.kind === ActionListDropdownItemKind.Action && entry.item) {
								if (entry.item.isSectionToggle) {
									this._toggleSection(entry.item.section);
									renderItems();
								} else {
									delegate.onSelect(entry.item);
								}
							}
						}
					} else if (event.keyCode === KeyCode.Escape) {
						e.preventDefault();
						if (filterText) {
							filterInput.value = '';
							filterText = '';
							renderItems();
						} else {
							this.hide();
						}
					}
				}));

				renderItems();

				// Focus tracking
				const focusTracker = dom.trackFocus(widget);
				disposables.add(focusTracker);
				disposables.add(focusTracker.onDidBlur(() => {
					const activeElement = dom.getDocument(widget).activeElement;
					if (!widget.contains(activeElement)) {
						this.hide();
					}
				}));

				filterInput.focus();

				return disposables;
			},
			onHide: () => {
				this._isVisible = false;
				delegate.onHide();
				if (this._previousFocusedElement) {
					this._previousFocusedElement.focus();
					this._previousFocusedElement = undefined;
				}
			},
		}, undefined, false);

		this._showDisposables.add({ dispose: () => contextView.close() });
		this._isVisible = true;
	}

	/**
	 * Hide the dropdown.
	 */
	hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._showDisposables.clear();
		this._domNode = undefined;
	}

	private _getVisibleEntries(entries: IActionListDropdownEntry[], filter: string): IActionListDropdownEntry[] {
		const isFiltering = filter.length > 0;
		const filterLower = filter.toLowerCase();
		const result: IActionListDropdownEntry[] = [];
		const seenIds = new Set<string>();
		let pendingSeparator: IActionListDropdownEntry | undefined;

		for (const entry of entries) {
			if (entry.kind === ActionListDropdownItemKind.Separator) {
				pendingSeparator = entry;
				continue;
			}

			const item = entry.item;
			if (!item) {
				continue;
			}

			// Skip section toggle items when filtering
			if (isFiltering && item.isSectionToggle) {
				continue;
			}

			// Skip collapsed section items (but not the toggle itself)
			if (!isFiltering && item.section && !item.isSectionToggle && this._collapsedSections.has(item.section)) {
				continue;
			}

			// Apply text filter
			if (isFiltering) {
				const label = item.label.toLowerCase();
				const desc = (item.description ?? '').toLowerCase();
				if (!label.includes(filterLower) && !desc.includes(filterLower)) {
					continue;
				}
				// Deduplicate by id when filtering across sections
				if (seenIds.has(item.id)) {
					continue;
				}
				seenIds.add(item.id);
			}

			// Emit pending separator (skip if this would be the first item)
			if (pendingSeparator && result.length > 0) {
				result.push(pendingSeparator);
			}
			pendingSeparator = undefined;

			result.push(entry);
		}

		return result;
	}

	private _renderEntry(
		entry: IActionListDropdownEntry,
		delegate: IActionListDropdownDelegate,
		rerender: () => void,
		disposables: DisposableStore,
	): HTMLElement {
		if (entry.kind === ActionListDropdownItemKind.Separator) {
			const separator = dom.$('.action-list-dropdown-item.separator');
			separator.style.height = `${SEPARATOR_HEIGHT}px`;
			return separator;
		}

		const item = entry.item!;
		const row = dom.$('.action-list-dropdown-item.action');
		row.style.height = `${ACTION_ITEM_HEIGHT}px`;
		row.tabIndex = 0;

		if (item.disabled) {
			row.classList.add('option-disabled');
		}
		if (item.className) {
			row.classList.add(item.className);
		}
		if (item.tooltip) {
			row.title = item.tooltip;
		}

		// Icon
		const iconContainer = dom.append(row, dom.$('.icon'));
		if (item.isSectionToggle) {
			const toggleIcon = this._collapsedSections.has(item.section ?? '') ? Codicon.chevronRight : Codicon.chevronDown;
			iconContainer.classList.add(...ThemeIcon.asClassNameArray(toggleIcon));
		} else if (item.checked !== undefined) {
			const checkIcon = item.checked ? Codicon.check : Codicon.blank;
			iconContainer.classList.add(...ThemeIcon.asClassNameArray(checkIcon));
		} else if (item.icon) {
			iconContainer.classList.add(...ThemeIcon.asClassNameArray(item.icon));
		}

		// Title
		const title = dom.append(row, dom.$('span.title'));
		title.textContent = item.label;

		// Badge
		if (item.badge) {
			const badge = dom.append(row, dom.$('span.action-list-dropdown-item-badge'));
			badge.textContent = item.badge;
		}

		// Description or description button
		if (item.descriptionButton) {
			const descContainer = dom.append(row, dom.$('span.description'));
			const btn = new Button(descContainer, { ...defaultButtonStyles });
			disposables.add(btn);
			btn.label = item.descriptionButton.label;
			disposables.add(btn.onDidClick(() => {
				item.descriptionButton!.onDidClick();
			}));
		} else if (item.description) {
			const desc = dom.append(row, dom.$('span.description'));
			desc.textContent = item.description;
		}

		// Click handler
		if (!item.disabled || item.isSectionToggle) {
			disposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, (e: MouseEvent) => {
				e.stopPropagation();
				if (item.isSectionToggle) {
					this._toggleSection(item.section);
					rerender();
				} else {
					delegate.onSelect(item);
				}
			}));
		}

		return row;
	}

	private _toggleSection(section: string | undefined): void {
		if (!section) {
			return;
		}
		if (this._collapsedSections.has(section)) {
			this._collapsedSections.delete(section);
		} else {
			this._collapsedSections.add(section);
		}
	}

	private _moveFocus(
		itemElements: { element: HTMLElement; entry: IActionListDropdownEntry }[],
		direction: 1 | -1,
	): void {
		let idx = this._focusedIndex;
		while (true) {
			idx += direction;
			if (idx < 0 || idx >= itemElements.length) {
				return;
			}
			const { entry } = itemElements[idx];
			if (entry.kind === ActionListDropdownItemKind.Action && entry.item && !entry.item.disabled) {
				this._setFocusedIndex(itemElements, idx);
				return;
			}
		}
	}

	private _focusedIndex = -1;

	private _setFocusedIndex(
		itemElements: { element: HTMLElement; entry: IActionListDropdownEntry }[],
		index: number,
	): void {
		// Remove previous focus
		if (this._focusedIndex >= 0 && this._focusedIndex < itemElements.length) {
			itemElements[this._focusedIndex].element.classList.remove('focused');
		}
		this._focusedIndex = index;
		if (index >= 0 && index < itemElements.length) {
			const el = itemElements[index].element;
			el.classList.add('focused');
			el.focus();
		}
	}

	private _constrainHeight(itemsContainer: HTMLElement, filterContainer: HTMLElement): void {
		if (!this._domNode) {
			return;
		}
		const targetWindow = dom.getWindow(this._domNode);
		const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
		const widgetTop = this._domNode.getBoundingClientRect().top;
		const padding = 10;
		const filterHeight = filterContainer.getBoundingClientRect().height || 30;
		const availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
		const maxHeight = Math.max(availableHeight, ACTION_ITEM_HEIGHT * 3 + filterHeight);

		itemsContainer.style.maxHeight = `${maxHeight - filterHeight}px`;
		itemsContainer.style.overflowY = 'auto';
	}

	private _updateWidth(
		itemsContainer: HTMLElement,
		itemElements: { element: HTMLElement; entry: IActionListDropdownEntry }[],
		minWidth?: number,
	): void {
		let maxWidth = minWidth ?? 0;
		for (const { element, entry } of itemElements) {
			if (entry.kind !== ActionListDropdownItemKind.Action) {
				continue;
			}
			element.style.width = 'auto';
			const width = element.getBoundingClientRect().width;
			element.style.width = '';
			maxWidth = Math.max(maxWidth, width);
		}
		if (maxWidth > 0) {
			itemsContainer.style.width = `${maxWidth}px`;
		}
	}
}
