/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { getAnchorRect, IAnchor } from '../../../base/browser/ui/contextview/contextview.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IListEvent, IListMouseEvent, IListRenderer, IListVirtualDelegate } from '../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider, List } from '../../../base/browser/ui/list/listWidget.js';
import { IAction } from '../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { AnchorPosition } from '../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import './actionWidget.css';
import { localize } from '../../../nls.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { IOpenerService } from '../../opener/common/opener.js';
import { defaultListStyles } from '../../theme/browser/defaultStyles.js';
import { asCssVariable } from '../../theme/common/colorRegistry.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { IHoverService } from '../../hover/browser/hover.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverPositionOptions, IHoverWidget } from '../../../base/browser/ui/hover/hover.js';

export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';

export interface IActionListDelegate<T> {
	onHide(didCancel?: boolean): void;
	onSelect(action: T, preview?: boolean): void;
	onHover?(action: T, cancellationToken: CancellationToken): Promise<{ canPreview: boolean } | void>;
	onFocus?(action: T | undefined): void;
}

/**
 * Optional hover configuration shown when focusing/hovering over an action list item.
 */
export interface IActionListItemHover {
	/**
	 * Content to display in the hover.
	 */
	readonly content?: string | MarkdownString;

	readonly position?: IHoverPositionOptions;
}

export interface IActionListItem<T> {
	readonly item?: T;
	readonly kind: ActionListItemKind;
	readonly group?: { kind?: unknown; icon?: ThemeIcon; title: string };
	readonly disabled?: boolean;
	readonly label?: string;
	readonly description?: string | IMarkdownString;
	/**
	 * Optional hover configuration shown when focusing/hovering over the item.
	 */
	readonly hover?: IActionListItemHover;
	readonly keybinding?: ResolvedKeybinding;
	canPreview?: boolean | undefined;
	readonly hideIcon?: boolean;
	readonly tooltip?: string;
	/**
	 * Optional toolbar actions shown when the item is focused or hovered.
	 */
	readonly toolbarActions?: IAction[];
	/**
	 * Optional section identifier. Items with the same section belong to the same
	 * collapsible group. Only meaningful when the ActionList is created with
	 * collapsible sections.
	 */
	readonly section?: string;
	/**
	 * When true, clicking this item toggles the section's collapsed state
	 * instead of selecting it.
	 */
	readonly isSectionToggle?: boolean;
	/**
	 * Optional CSS class name to add to the row container.
	 */
	readonly className?: string;
	/**
	 * Optional badge text to display after the label (e.g., "New").
	 */
	readonly badge?: string;
	/**
	 * When true, this item is always shown when filtering produces no other results.
	 */
	readonly showAlways?: boolean;
}

interface IActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly badge: HTMLElement;
	readonly description?: HTMLElement;
	readonly keybinding: KeybindingLabel;
	readonly toolbar: HTMLElement;
	readonly elementDisposables: DisposableStore;
	previousClassName?: string;
}

export const enum ActionListItemKind {
	Action = 'action',
	Header = 'header',
	Separator = 'separator'
}

interface IHeaderTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
}

class HeaderRenderer<T> implements IListRenderer<IActionListItem<T>, IHeaderTemplateData> {

	get templateId(): string { return ActionListItemKind.Header; }

	renderTemplate(container: HTMLElement): IHeaderTemplateData {
		container.classList.add('group-header');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: IActionListItem<T>, _index: number, templateData: IHeaderTemplateData): void {
		templateData.text.textContent = element.group?.title ?? element.label ?? '';
	}

	disposeTemplate(_templateData: IHeaderTemplateData): void {
		// noop
	}
}

interface ISeparatorTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
}

class SeparatorRenderer<T> implements IListRenderer<IActionListItem<T>, ISeparatorTemplateData> {

	get templateId(): string { return ActionListItemKind.Separator; }

	renderTemplate(container: HTMLElement): ISeparatorTemplateData {
		container.classList.add('separator');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: IActionListItem<T>, _index: number, templateData: ISeparatorTemplateData): void {
		templateData.text.textContent = element.label ?? '';
	}

	disposeTemplate(_templateData: ISeparatorTemplateData): void {
		// noop
	}
}

class ActionItemRenderer<T> implements IListRenderer<IActionListItem<T>, IActionMenuTemplateData> {

	get templateId(): string { return ActionListItemKind.Action; }

	constructor(
		private readonly _supportsPreview: boolean,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	renderTemplate(container: HTMLElement): IActionMenuTemplateData {
		container.classList.add(this.templateId);

		const icon = document.createElement('div');
		icon.className = 'icon';
		container.append(icon);

		const text = document.createElement('span');
		text.className = 'title';
		container.append(text);

		const badge = document.createElement('span');
		badge.className = 'action-item-badge';
		container.append(badge);

		const description = document.createElement('span');
		description.className = 'description';
		container.append(description);

		const keybinding = new KeybindingLabel(container, OS);

		const toolbar = document.createElement('div');
		toolbar.className = 'action-list-item-toolbar';
		container.append(toolbar);

		const elementDisposables = new DisposableStore();

		return { container, icon, text, badge, description, keybinding, toolbar, elementDisposables };
	}

	renderElement(element: IActionListItem<T>, _index: number, data: IActionMenuTemplateData): void {
		// Clear previous element disposables
		data.elementDisposables.clear();

		if (element.group?.icon) {
			data.icon.className = ThemeIcon.asClassName(element.group.icon);
			if (element.group.icon.color) {
				data.icon.style.color = asCssVariable(element.group.icon.color.id);
			}
		} else {
			data.icon.className = ThemeIcon.asClassName(Codicon.lightBulb);
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}

		if (!element.item || !element.label) {
			return;
		}

		dom.setVisibility(!element.hideIcon, data.icon);

		// Apply optional className - clean up previous to avoid stale classes
		// from virtualized row reuse
		if (data.previousClassName) {
			data.container.classList.remove(data.previousClassName);
		}
		data.container.classList.toggle('action-list-custom', !!element.className);
		if (element.className) {
			data.container.classList.add(element.className);
		}
		data.previousClassName = element.className;

		data.text.textContent = stripNewlines(element.label);

		// Render optional badge
		if (element.badge) {
			data.badge.textContent = element.badge;
			data.badge.style.display = '';
		} else {
			data.badge.textContent = '';
			data.badge.style.display = 'none';
		}

		if (element.keybinding) {
			data.description!.textContent = element.keybinding.getLabel();
			data.description!.style.display = 'inline';
			data.description!.style.letterSpacing = '0.5px';
		} else if (element.description) {
			dom.clearNode(data.description!);
			if (typeof element.description === 'string') {
				data.description!.textContent = stripNewlines(element.description);
			} else {
				const rendered = renderMarkdown(element.description, {
					actionHandler: (content: string) => {
						this._openerService.open(URI.parse(content), { allowCommands: true });
					}
				});
				data.elementDisposables.add(rendered);
				data.description!.appendChild(rendered.element);
			}
			data.description!.style.display = 'inline';
		} else {
			data.description!.textContent = '';
			data.description!.style.display = 'none';
		}

		const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
		const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
		data.container.classList.toggle('option-disabled', !!element.disabled);
		if (element.hover !== undefined) {
			// Don't show tooltip when hover content is configured - the rich hover will show instead
			data.container.title = '';
		} else if (element.tooltip) {
			data.container.title = element.tooltip;
		} else if (element.disabled) {
			data.container.title = element.label;
		} else if (actionTitle && previewTitle) {
			if (this._supportsPreview && element.canPreview) {
				data.container.title = localize({ key: 'label-preview', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
			} else {
				data.container.title = localize({ key: 'label', comment: ['placeholder is a keybinding, e.g "F2 to Apply"'] }, "{0} to Apply", actionTitle);
			}
		} else {
			data.container.title = '';
		}

		// Clear and render toolbar actions
		dom.clearNode(data.toolbar);
		data.container.classList.toggle('has-toolbar', !!element.toolbarActions?.length);
		if (element.toolbarActions?.length) {
			const actionBar = new ActionBar(data.toolbar);
			data.elementDisposables.add(actionBar);
			actionBar.push(element.toolbarActions, { icon: true, label: false });
		}
	}

	disposeTemplate(templateData: IActionMenuTemplateData): void {
		templateData.keybinding.dispose();
		templateData.elementDisposables.dispose();
	}
}

class AcceptSelectedEvent extends UIEvent {
	constructor() { super('acceptSelectedAction'); }
}

class PreviewSelectedEvent extends UIEvent {
	constructor() { super('previewSelectedAction'); }
}

function getKeyboardNavigationLabel<T>(item: IActionListItem<T>): string | undefined {
	// Filter out header vs. action vs. separator
	if (item.kind === 'action') {
		return item.label;
	}
	return undefined;
}

/**
 * Options for configuring the action list.
 */
export interface IActionListOptions {
	/**
	 * When true, shows a filter input.
	 */
	readonly showFilter?: boolean;

	/**
	 * Placeholder text for the filter input.
	 */
	readonly filterPlaceholder?: string;

	/**
	 * Section IDs that should be collapsed by default.
	 */
	readonly collapsedByDefault?: ReadonlySet<string>;

	/**
	 * Minimum width for the action list.
	 */
	readonly minWidth?: number;



	/**
	 * When true and filtering is enabled, focuses the filter input when the list opens.
	 */
	readonly focusFilterOnOpen?: boolean;
}

export class ActionList<T> extends Disposable {

	public readonly domNode: HTMLElement;

	private readonly _list: List<IActionListItem<T>>;

	private readonly _actionLineHeight = 24;
	private readonly _headerLineHeight = 24;
	private readonly _separatorLineHeight = 8;

	private readonly _allMenuItems: readonly IActionListItem<T>[];

	private readonly cts = this._register(new CancellationTokenSource());

	private _hover = this._register(new MutableDisposable<IHoverWidget>());

	private readonly _collapsedSections = new Set<string>();
	private _filterText = '';
	private _suppressHover = false;
	private readonly _filterInput: HTMLInputElement | undefined;
	private readonly _filterContainer: HTMLElement | undefined;
	private _lastMinWidth = 0;
	private _cachedMaxWidth: number | undefined;
	private _hasLaidOut = false;
	private _showAbove: boolean | undefined;

	/**
	 * Returns the resolved anchor position after the first layout.
	 * Used by the context view delegate to lock the dropdown direction.
	 */
	get anchorPosition(): AnchorPosition | undefined {
		if (this._showAbove === undefined) {
			return undefined;
		}
		return this._showAbove ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
	}

	constructor(
		user: string,
		preview: boolean,
		items: readonly IActionListItem<T>[],
		private readonly _delegate: IActionListDelegate<T>,
		accessibilityProvider: Partial<IListAccessibilityProvider<IActionListItem<T>>> | undefined,
		private readonly _options: IActionListOptions | undefined,
		private readonly _anchor: HTMLElement | StandardMouseEvent | IAnchor,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.classList.add('actionList');

		// Initialize collapsed sections
		if (this._options?.collapsedByDefault) {
			for (const section of this._options.collapsedByDefault) {
				this._collapsedSections.add(section);
			}
		}

		const virtualDelegate: IListVirtualDelegate<IActionListItem<T>> = {
			getHeight: element => {
				switch (element.kind) {
					case ActionListItemKind.Header:
						return this._headerLineHeight;
					case ActionListItemKind.Separator:
						return this._separatorLineHeight;
					default:
						return this._actionLineHeight;
				}
			},
			getTemplateId: element => element.kind
		};


		this._list = this._register(new List(user, this.domNode, virtualDelegate, [
			new ActionItemRenderer<IActionListItem<T>>(preview, this._keybindingService, this._openerService),
			new HeaderRenderer(),
			new SeparatorRenderer(),
		], {
			keyboardSupport: false,
			typeNavigationEnabled: !this._options?.showFilter,
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel },
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === ActionListItemKind.Action) {
						let label = element.label ? stripNewlines(element?.label) : '';
						if (element.description) {
							const descText = typeof element.description === 'string' ? element.description : element.description.value;
							label = label + ', ' + stripNewlines(descText);
						}
						if (element.disabled) {
							label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
						}
						return label;
					}
					return null;
				},
				getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: [`An action widget option`] }, "Action Widget"),
				getRole: (e) => {
					switch (e.kind) {
						case ActionListItemKind.Action:
							return 'option';
						case ActionListItemKind.Separator:
							return 'separator';
						default:
							return 'separator';
					}
				},
				getWidgetRole: () => 'listbox',
				...accessibilityProvider
			},
		}));

		this._list.style(defaultListStyles);

		this._register(this._list.onMouseClick(e => this.onListClick(e)));
		this._register(this._list.onMouseOver(e => this.onListHover(e)));
		this._register(this._list.onDidChangeFocus(() => this.onFocus()));
		this._register(this._list.onDidChangeSelection(e => this.onListSelection(e)));

		this._allMenuItems = items;

		// Create filter input
		if (this._options?.showFilter) {
			this._filterContainer = document.createElement('div');
			this._filterContainer.className = 'action-list-filter';

			this._filterInput = document.createElement('input');
			this._filterInput.type = 'text';
			this._filterInput.className = 'action-list-filter-input';
			this._filterInput.placeholder = this._options?.filterPlaceholder ?? localize('actionList.filter.placeholder', "Search...");
			this._filterInput.setAttribute('aria-label', localize('actionList.filter.ariaLabel', "Filter items"));
			this._filterContainer.appendChild(this._filterInput);

			this._register(dom.addDisposableListener(this._filterInput, 'input', () => {
				this._filterText = this._filterInput!.value;
				this._applyFilter();
			}));
		}

		this._applyFilter();

		if (this._list.length) {
			this._focusCheckedOrFirst();
		}

		// When the list has focus and user types a printable character,
		// forward it to the filter input so search begins automatically.
		if (this._filterInput) {
			this._register(dom.addDisposableListener(this.domNode, 'keydown', (e: KeyboardEvent) => {
				if (this._filterInput && !dom.isActiveElement(this._filterInput)
					&& e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
					this._filterInput.focus();
					this._filterInput.value = e.key;
					this._filterText = e.key;
					this._applyFilter();
					e.preventDefault();
					e.stopPropagation();
				}
			}));
		}
	}

	private _toggleSection(section: string): void {
		if (this._collapsedSections.has(section)) {
			this._collapsedSections.delete(section);
		} else {
			this._collapsedSections.add(section);
		}
		this._applyFilter();
	}

	private _applyFilter(): void {
		const filterLower = this._filterText.toLowerCase();
		const isFiltering = filterLower.length > 0;
		const visible: IActionListItem<T>[] = [];

		// Remember the focused item before splice
		const focusedIndexes = this._list.getFocus();
		let focusedItem: IActionListItem<T> | undefined;
		if (focusedIndexes.length > 0) {
			focusedItem = this._list.element(focusedIndexes[0]);
		}

		for (const item of this._allMenuItems) {
			if (item.kind === ActionListItemKind.Header) {
				if (isFiltering) {
					// When filtering, skip all headers
					continue;
				}
				visible.push(item);
				continue;
			}

			if (item.kind === ActionListItemKind.Separator) {
				if (isFiltering) {
					continue;
				}
				if (item.section && this._collapsedSections.has(item.section)) {
					continue;
				}
				visible.push(item);
				continue;
			}

			// Action item
			if (isFiltering) {
				// Always show items tagged with showAlways
				if (item.showAlways) {
					visible.push(item);
					continue;
				}
				// When filtering, skip section toggle items and only match content
				if (item.isSectionToggle) {
					continue;
				}
				// Match against label and description
				const label = (item.label ?? '').toLowerCase();
				const descValue = typeof item.description === 'string' ? item.description : item.description?.value ?? '';
				const desc = descValue.toLowerCase();
				if (label.includes(filterLower) || desc.includes(filterLower)) {
					visible.push(item);
				}
			} else {
				// Update icon for section toggle items based on collapsed state
				if (item.isSectionToggle && item.section) {
					const collapsed = this._collapsedSections.has(item.section);
					visible.push({
						...item,
						group: { ...item.group!, icon: collapsed ? Codicon.chevronRight : Codicon.chevronDown },
					});
					continue;
				}
				// Not filtering - check collapsed sections
				if (item.section && this._collapsedSections.has(item.section)) {
					continue;
				}
				visible.push(item);
			}
		}

		// Capture whether the filter input currently has focus before splice
		// which may cause DOM changes that shift focus.
		const filterInputHasFocus = this._filterInput && dom.isActiveElement(this._filterInput);

		this._list.splice(0, this._list.length, visible);

		// Re-layout to adjust height after items changed
		if (this._hasLaidOut) {
			this.layout(this._lastMinWidth);
			// Restore focus after splice destroyed DOM elements,
			// otherwise the blur handler in ActionWidgetService closes the widget.
			// Keep focus on the filter input if the user is typing a filter.
			if (filterInputHasFocus) {
				this._filterInput?.focus();
			} else {
				this._list.domFocus();
				// Restore focus to the previously focused item
				if (focusedItem) {
					const focusedItemId = (focusedItem.item as { id?: string })?.id;
					if (focusedItemId) {
						for (let i = 0; i < this._list.length; i++) {
							const el = this._list.element(i);
							if ((el.item as { id?: string })?.id === focusedItemId) {
								this._list.setFocus([i]);
								this._list.reveal(i);
								break;
							}
						}
					}
				}
			}
			// Reposition the context view so the widget grows in the correct direction
			this._contextViewService.layout();
		}
	}

	/**
	 * Returns the filter container element, if filter is enabled.
	 * The caller is responsible for appending it to the widget DOM.
	 */
	get filterContainer(): HTMLElement | undefined {
		return this._filterContainer;
	}



	get filterInput(): HTMLInputElement | undefined {
		return this._filterInput;
	}

	private focusCondition(element: IActionListItem<unknown>): boolean {
		return !element.disabled && element.kind === ActionListItemKind.Action;
	}

	focus(): void {
		if (this._filterInput && this._options?.focusFilterOnOpen) {
			this._filterInput.focus();
			return;
		}
		this._list.domFocus();
		this._focusCheckedOrFirst();
	}

	private _focusCheckedOrFirst(): void {
		this._suppressHover = true;
		try {
			// Try to focus the checked item first
			for (let i = 0; i < this._list.length; i++) {
				const element = this._list.element(i);
				if (element.kind === ActionListItemKind.Action && (element.item as { checked?: boolean })?.checked) {
					this._list.setFocus([i]);
					this._list.reveal(i);
					return;
				}
			}
			this.focusNext();
		} finally {
			this._suppressHover = false;
		}
	}

	hide(didCancel?: boolean): void {
		this._delegate.onHide(didCancel);
		this.cts.cancel();
		this._hover.clear();
		this._contextViewService.hideContextView();
	}

	clearFilter(): boolean {
		if (this._filterInput && this._filterText) {
			this._filterInput.value = '';
			this._filterText = '';
			this._applyFilter();
			return true;
		}
		return false;
	}

	private hasDynamicHeight(): boolean {
		if (this._options?.showFilter) {
			return true;
		}
		return this._allMenuItems.some(item => item.isSectionToggle);
	}

	private computeHeight(): number {
		// Compute height based on currently visible items in the list
		const visibleCount = this._list.length;
		let listHeight = 0;
		for (let i = 0; i < visibleCount; i++) {
			const element = this._list.element(i);
			switch (element.kind) {
				case ActionListItemKind.Header:
					listHeight += this._headerLineHeight;
					break;
				case ActionListItemKind.Separator:
					listHeight += this._separatorLineHeight;
					break;
				default:
					listHeight += this._actionLineHeight;
					break;
			}
		}

		const filterHeight = this._filterContainer ? 36 : 0;
		const padding = 10;
		const targetWindow = dom.getWindow(this.domNode);
		let availableHeight;

		if (this.hasDynamicHeight()) {
			const viewportHeight = targetWindow.innerHeight;
			const anchorRect = getAnchorRect(this._anchor);
			const anchorTopInViewport = anchorRect.top - targetWindow.pageYOffset;
			const spaceBelow = viewportHeight - anchorTopInViewport - anchorRect.height - padding;
			const spaceAbove = anchorTopInViewport - padding;

			// Lock the direction on first layout based on whether the full
			// unconstrained list fits below. Once decided, the dropdown stays
			// in the same position even when the visible item count changes.
			if (this._showAbove === undefined) {
				let fullHeight = filterHeight;
				for (const item of this._allMenuItems) {
					switch (item.kind) {
						case ActionListItemKind.Header: fullHeight += this._headerLineHeight; break;
						case ActionListItemKind.Separator: fullHeight += this._separatorLineHeight; break;
						default: fullHeight += this._actionLineHeight; break;
					}
				}
				this._showAbove = fullHeight > spaceBelow && spaceAbove > spaceBelow;
			}
			availableHeight = this._showAbove ? spaceAbove : spaceBelow;
		} else {
			const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
			const widgetTop = this.domNode.getBoundingClientRect().top;
			availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
		}

		const maxHeight = Math.max(availableHeight, this._actionLineHeight * 3 + filterHeight);
		const height = Math.min(listHeight + filterHeight, maxHeight);
		return height - filterHeight;
	}

	private computeMaxWidth(minWidth: number): number {
		const visibleCount = this._list.length;
		const effectiveMinWidth = Math.max(minWidth, this._options?.minWidth ?? 0);
		let maxWidth = effectiveMinWidth;

		const totalItemCount = this._allMenuItems.length;
		if (totalItemCount >= 50) {
			return Math.max(380, effectiveMinWidth);
		}

		if (this._cachedMaxWidth !== undefined) {
			return this._cachedMaxWidth;
		}

		if (totalItemCount > visibleCount) {
			// Temporarily splice in all items to measure widths,
			// preventing width jumps when expanding/collapsing sections.
			const visibleItems: IActionListItem<T>[] = [];
			for (let i = 0; i < visibleCount; i++) {
				visibleItems.push(this._list.element(i));
			}

			const allItems = [...this._allMenuItems];
			this._list.splice(0, visibleCount, allItems);
			let allItemsHeight = 0;
			for (const item of allItems) {
				switch (item.kind) {
					case ActionListItemKind.Header: allItemsHeight += this._headerLineHeight; break;
					case ActionListItemKind.Separator: allItemsHeight += this._separatorLineHeight; break;
					default: allItemsHeight += this._actionLineHeight; break;
				}
			}
			this._list.layout(allItemsHeight);

			const itemWidths: number[] = [];
			for (let i = 0; i < allItems.length; i++) {
				const element = this._getRowElement(i);
				if (element) {
					element.style.width = 'auto';
					const width = element.getBoundingClientRect().width;
					element.style.width = '';
					itemWidths.push(width);
				}
			}

			maxWidth = Math.max(...itemWidths, effectiveMinWidth);

			// Restore visible items
			this._list.splice(0, allItems.length, visibleItems);
			return maxWidth;
		}

		// All items are visible, measure them directly
		const itemWidths: number[] = [];
		for (let i = 0; i < visibleCount; i++) {
			const element = this._getRowElement(i);
			if (element) {
				element.style.width = 'auto';
				const width = element.getBoundingClientRect().width;
				element.style.width = '';
				itemWidths.push(width);
			}
		}
		return Math.max(...itemWidths, effectiveMinWidth);
	}

	layout(minWidth: number): number {
		this._hasLaidOut = true;
		this._lastMinWidth = minWidth;

		const listHeight = this.computeHeight();
		this._list.layout(listHeight);

		this._cachedMaxWidth = this.computeMaxWidth(minWidth);
		this._list.layout(listHeight, this._cachedMaxWidth);
		this.domNode.style.height = `${listHeight}px`;

		// Place filter container on the preferred side.
		if (this._filterContainer && this._filterContainer.parentElement) {
			this._filterContainer.parentElement.insertBefore(this._filterContainer, this.domNode);
		}

		return this._cachedMaxWidth;
	}

	focusPrevious() {
		if (this._filterInput && dom.isActiveElement(this._filterInput)) {
			this._list.domFocus();
			this._list.focusLast(undefined, this.focusCondition);
			return;
		}
		const previousFocus = this._list.getFocus();
		this._list.focusPrevious(1, true, undefined, this.focusCondition);
		const focused = this._list.getFocus();
		if (focused.length > 0) {
			// If focus wrapped (was at first focusable, now at last), move to filter instead
			if (this._filterInput && previousFocus.length > 0 && focused[0] > previousFocus[0]) {
				this._list.setFocus([]);
				this._filterInput.focus();
				return;
			}
			this._list.reveal(focused[0]);
		}
	}

	focusNext() {
		if (this._filterInput && dom.isActiveElement(this._filterInput)) {
			this._list.domFocus();
			this._list.focusFirst(undefined, this.focusCondition);
			return;
		}
		const previousFocus = this._list.getFocus();
		this._list.focusNext(1, true, undefined, this.focusCondition);
		const focused = this._list.getFocus();
		if (focused.length > 0) {
			// If focus wrapped (was at last focusable, now at first), move to filter instead
			if (this._filterInput && previousFocus.length > 0 && focused[0] < previousFocus[0]) {
				this._list.setFocus([]);
				this._filterInput.focus();
				return;
			}
			this._list.reveal(focused[0]);
		}
	}

	collapseFocusedSection() {
		const section = this._getFocusedSection();
		if (section && !this._collapsedSections.has(section)) {
			this._toggleSection(section);
		}
	}

	expandFocusedSection() {
		const section = this._getFocusedSection();
		if (section && this._collapsedSections.has(section)) {
			this._toggleSection(section);
		}
	}

	toggleFocusedSection(): boolean {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return false;
		}
		const element = this._list.element(focused[0]);
		if (element.isSectionToggle && element.section) {
			this._toggleSection(element.section);
			return true;
		}
		return false;
	}

	private _getFocusedSection(): string | undefined {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return undefined;
		}
		const element = this._list.element(focused[0]);
		if (element.isSectionToggle && element.section) {
			return element.section;
		}
		return element.section;
	}

	acceptSelected(preview?: boolean) {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return;
		}

		const focusIndex = focused[0];
		const element = this._list.element(focusIndex);
		if (!this.focusCondition(element)) {
			return;
		}

		const event = preview ? new PreviewSelectedEvent() : new AcceptSelectedEvent();
		this._list.setSelection([focusIndex], event);
	}

	private onListSelection(e: IListEvent<IActionListItem<T>>): void {
		if (!e.elements.length) {
			return;
		}

		const element = e.elements[0];
		if (element.isSectionToggle) {
			this._list.setSelection([]);
			return;
		}
		if (element.item && this.focusCondition(element)) {
			this._delegate.onSelect(element.item, e.browserEvent instanceof PreviewSelectedEvent);
		} else {
			this._list.setSelection([]);
		}
	}

	private onFocus() {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return;
		}
		const focusIndex = focused[0];
		const element = this._list.element(focusIndex);
		this._delegate.onFocus?.(element.item);

		// Show hover on focus change (suppress during programmatic initial focus)
		if (!this._suppressHover) {
			this._showHoverForElement(element, focusIndex);
		}
	}

	private _getRowElement(index: number): HTMLElement | null {
		// eslint-disable-next-line no-restricted-syntax
		return this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
	}

	private _showHoverForElement(element: IActionListItem<T>, index: number): void {
		let newHover: IHoverWidget | undefined;

		// Show hover if the element has hover content
		if (element.hover?.content) {
			// The List widget separates data models from DOM elements, so we need to
			// look up the actual DOM node to use as the hover target.
			const rowElement = this._getRowElement(index);
			if (rowElement) {
				const markdown = typeof element.hover.content === 'string' ? new MarkdownString(element.hover.content) : element.hover.content;
				newHover = this._hoverService.showDelayedHover({
					content: markdown ?? '',
					target: rowElement,
					additionalClasses: ['action-widget-hover'],
					position: {
						hoverPosition: HoverPosition.LEFT,
						forcePosition: false,
						...element.hover.position,
					},
					appearance: {
						showPointer: true,
					},
				}, { groupId: `actionListHover` });
			}
		}

		this._hover.value = newHover;
	}

	private async onListHover(e: IListMouseEvent<IActionListItem<T>>) {
		const element = e.element;

		if (element && element.item && this.focusCondition(element)) {
			// Check if the hover target is inside a toolbar - if so, skip the splice
			// to avoid re-rendering which would destroy the toolbar mid-hover
			const isHoveringToolbar = dom.isHTMLElement(e.browserEvent.target) && e.browserEvent.target.closest('.action-list-item-toolbar') !== null;
			if (isHoveringToolbar) {
				this._list.setFocus([]);
				return;
			}

			// Set focus immediately for responsive hover feedback
			this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);

			if (this._delegate.onHover && !element.disabled && element.kind === ActionListItemKind.Action) {
				const result = await this._delegate.onHover(element.item, this.cts.token);
				const canPreview = result ? result.canPreview : undefined;
				if (canPreview !== element.canPreview) {
					element.canPreview = canPreview;
					if (typeof e.index === 'number') {
						this._list.splice(e.index, 1, [element]);
						this._list.setFocus([e.index]);
					}
				}
			}
		} else if (element && element.hover?.content && typeof e.index === 'number') {
			// Show hover for disabled items that have hover content
			this._showHoverForElement(element, e.index);
		}
	}

	private onListClick(e: IListMouseEvent<IActionListItem<T>>): void {
		if (e.element && e.element.isSectionToggle && e.element.section) {
			const section = e.element.section;
			queueMicrotask(() => this._toggleSection(section));
			return;
		}
		if (e.element && this.focusCondition(e.element)) {
			this._list.setFocus([]);
		}
	}
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}
