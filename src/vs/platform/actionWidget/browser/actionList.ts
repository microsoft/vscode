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
import { IAction, SubmenuAction, toAction } from '../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter } from '../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { AnchorPosition } from '../../../base/common/layout.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
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
import { IInstantiationService } from '../../instantiation/common/instantiation.js';

export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';

export interface IActionListDelegate<T> {
	onHide(didCancel?: boolean): void;
	onSelect(action: T, preview?: boolean): void;
	onFilter?(filter: string, cancellationToken: CancellationToken): Promise<readonly IActionListItem<T>[]>;
	onHover?(action: T, cancellationToken: CancellationToken): Promise<{ canPreview: boolean } | void>;
	onFocus?(action: T | undefined): void;
}

/**
 * Optional hover configuration shown when focusing/hovering over an action list item.
 */
export interface IActionListItemHover {
	/**
	 * Content to display in the hover. Can be a markdown string or an HTMLElement for full DOM control.
	 */
	readonly content?: string | MarkdownString | HTMLElement;
	/**
	 * Optional disposable associated with the hover content (e.g. from rendered markdown).
	 */
	readonly disposable?: IDisposable;
}

export interface IActionListItem<T> {
	readonly item?: T;
	readonly kind: ActionListItemKind;
	readonly group?: { kind?: unknown; icon?: ThemeIcon; title: string };
	readonly disabled?: boolean;
	readonly label?: string;
	/**
	 * Optional detail text displayed as a second line below the label.
	 */
	readonly detail?: string;
	readonly description?: string | IMarkdownString;
	/**
	 * Optional hover configuration shown when focusing/hovering over the item.
	 */
	readonly hover?: IActionListItemHover;
	/**
	 * Optional actions shown in a nested submenu panel, triggered by a chevron
	 * indicator on the right side of the item. When set, hovering or clicking
	 * the chevron opens an inline submenu with these actions.
	 */
	readonly submenuActions?: IAction[];
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
	/**
	 * Optional callback invoked when the item is removed via the built-in remove button.
	 * When set, a close button is automatically added to the item toolbar.
	 */
	readonly onRemove?: () => void | Promise<void>;
}

interface IActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly detail: HTMLElement;
	readonly badge: HTMLElement;
	readonly description?: HTMLElement;
	readonly groupTitle: HTMLElement;
	readonly keybinding: KeybindingLabel;
	readonly toolbar: HTMLElement;
	readonly submenuIndicator: HTMLElement;
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
		private readonly _onRemoveItem: ((item: IActionListItem<T>) => void) | undefined,
		private readonly _onShowSubmenu: ((item: IActionListItem<T>) => void) | undefined,
		private readonly _hasAnySubmenuActions: boolean,
		private readonly _groupTitleByIndex: ReadonlyMap<number, string>,
		private readonly _linkHandler: ((uri: URI, item: IActionListItem<T>) => void) | undefined,
		private readonly _hideDefaultKeybindingTooltip: boolean,
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

		const groupTitle = document.createElement('span');
		groupTitle.className = 'group-title';
		container.append(groupTitle);

		const detail = document.createElement('span');
		detail.className = 'detail';
		container.append(detail);

		const keybinding = new KeybindingLabel(container, OS);

		const toolbar = document.createElement('div');
		toolbar.className = 'action-list-item-toolbar';
		container.append(toolbar);

		const submenuIndicator = document.createElement('div');
		submenuIndicator.className = 'action-list-submenu-indicator';
		container.append(submenuIndicator);

		const elementDisposables = new DisposableStore();

		return { container, icon, text, detail, badge, description, groupTitle, keybinding, toolbar, submenuIndicator, elementDisposables };
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

		// Set aria-expanded for section toggle items
		if (element.isSectionToggle) {
			const expanded = element.group?.icon === Codicon.chevronDown;
			data.container.setAttribute('aria-expanded', String(expanded));
		} else {
			data.container.removeAttribute('aria-expanded');
		}

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
						const uri = URI.parse(content);
						if (this._linkHandler) {
							this._linkHandler(uri, element);
						} else {
							void this._openerService.open(uri, { allowCommands: true });
						}
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

		// Render group title (shown to the right, separate from description)
		const groupTitleText = this._groupTitleByIndex.get(_index);
		if (groupTitleText) {
			data.groupTitle.textContent = groupTitleText;
			data.groupTitle.style.display = '';
		} else {
			data.groupTitle.textContent = '';
			data.groupTitle.style.display = 'none';
		}

		// Render optional detail (shown as second line below the label)
		if (element.detail) {
			data.detail.textContent = stripNewlines(element.detail);
			data.detail.style.display = '';
		} else {
			data.detail.textContent = '';
			data.detail.style.display = 'none';
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
		} else if (this._hideDefaultKeybindingTooltip) {
			data.container.title = '';
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
		const toolbarActions = [...(element.toolbarActions ?? [])];
		if (element.onRemove) {
			toolbarActions.push(toAction({
				id: 'actionList.remove',
				label: localize('actionList.remove', "Remove"),
				class: ThemeIcon.asClassName(Codicon.close),
				run: async () => {
					await element.onRemove!();
					this._onRemoveItem?.(element);
				},
			}));
		}
		data.container.classList.toggle('has-toolbar', toolbarActions.length > 0);
		if (toolbarActions.length > 0) {
			const actionBar = new ActionBar(data.toolbar);
			data.elementDisposables.add(actionBar);
			actionBar.push(toolbarActions, { icon: true, label: false });
		}

		// Show submenu indicator only for items with submenu actions
		// but not when the item also has hover content (panel auto-shows on hover)
		if (element.submenuActions?.length && !element.hover?.content) {
			data.submenuIndicator.className = 'action-list-submenu-indicator has-submenu ' + ThemeIcon.asClassName(Codicon.chevronRight);
			data.submenuIndicator.style.display = '';
			data.submenuIndicator.style.visibility = '';
			data.elementDisposables.add(dom.addDisposableListener(data.submenuIndicator, dom.EventType.CLICK, (e) => {
				e.stopPropagation();
				this._onShowSubmenu?.(element);
			}));
		} else if (this._hasAnySubmenuActions) {
			// Reserve space for alignment when other items have submenus
			data.submenuIndicator.className = 'action-list-submenu-indicator';
			data.submenuIndicator.style.display = '';
			data.submenuIndicator.style.visibility = 'hidden';
		} else {
			data.submenuIndicator.className = 'action-list-submenu-indicator';
			data.submenuIndicator.style.display = 'none';
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
	 * Optional actions shown in the filter row, to the right of the input.
	 */
	readonly filterActions?: readonly IAction[];

	/**
	 * Section IDs that should be collapsed by default.
	 */
	readonly collapsedByDefault?: ReadonlySet<string>;

	/**
	 * Minimum width for the action list.
	 */
	readonly minWidth?: number;

	/**
	 * Maximum width for the action list. When set, items wider than this are
	 * truncated rather than expanding the popup.
	 */
	readonly maxWidth?: number;

	/**
	 * Optional handler for markdown links activated in item descriptions or hovers.
	 * When unset, links open via the opener service with command links allowed.
	 */
	readonly linkHandler?: (uri: URI, item: IActionListItem<unknown>) => void;

	/**
	 * Optional callback fired when a section's collapsed state changes.
	 */
	readonly onDidToggleSection?: (section: string, collapsed: boolean) => void;

	/**
	 * When true, descriptions are rendered inline right after the label
	 * instead of aligned to the right.
	 */
	readonly inlineDescription?: boolean;

	/**
	 * Height (in px) used for action items that have a `detail` line.
	 * Defaults to 48.
	 */
	readonly detailItemHeight?: number;

	/**
	 * When true, the group title is shown on the first item of each group
	 * in the description area (aligned to the right).
	 */
	readonly showGroupTitleOnFirstItem?: boolean;

	/**
	 * When true and filtering is enabled, focuses the filter input when the list opens.
	 */
	readonly focusFilterOnOpen?: boolean;

	/**
	 * When false, non-submenu items do not reserve space for the submenu chevron.
	 * Defaults to true for alignment consistency.
	 */
	readonly reserveSubmenuSpace?: boolean;

	/**
	 * When true, items without an explicit `tooltip` or `hover` do not get a
	 * default "{keybinding} to Apply" tooltip. Useful for non-code-action lists
	 * where this hint is misleading.
	 */
	readonly hideDefaultKeybindingTooltip?: boolean;

	/**
	 * Optional label shown on the right side of the filter row.
	 */
	readonly secondaryHeading?: string;

	/**
	 * Optional text shown below the action list as a footer.
	 */
	readonly footerText?: string;
}

/**
 * A standalone action list widget that handles core list rendering, filtering,
 * hover, submenu, and section management without depending on IContextViewService
 * or anchor-based positioning. Suitable for embedding directly in any container.
 */
export class ActionListWidget<T> extends Disposable {

	public readonly domNode: HTMLElement;

	private readonly _list: List<IActionListItem<T>>;

	protected readonly _actionLineHeight: number;
	protected readonly _headerLineHeight = 24;
	protected readonly _separatorLineHeight = 8;

	protected _allMenuItems: IActionListItem<T>[];

	private readonly cts = this._register(new CancellationTokenSource());

	private readonly _submenuDisposables = this._register(new DisposableStore());
	private readonly _submenuContainer: HTMLElement;
	private _submenuHideTimeout: ReturnType<typeof setTimeout> | undefined;
	private _submenuShowTimeout: ReturnType<typeof setTimeout> | undefined;
	private _currentSubmenuWidget: ActionListWidget<IAction> | undefined;
	private _currentSubmenuElement: IActionListItem<T> | undefined;

	private readonly _collapsedSections = new Set<string>();
	private _filterText = '';
	private _suppressHover = false;
	private _hasLaidOut = false;
	private readonly _filterInput: HTMLInputElement | undefined;
	private readonly _filterContainer: HTMLElement | undefined;
	private readonly _footerContainer: HTMLElement | undefined;
	private readonly _filterCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _groupTitleByIndex = new Map<number, string>();

	private readonly _onDidRequestLayout = this._register(new Emitter<void>());

	/**
	 * Fired when the widget's visible item set changes and the parent should
	 * re-layout (e.g. after filtering or collapsing a section).
	 */
	readonly onDidRequestLayout = this._onDidRequestLayout.event;

	constructor(
		user: string,
		preview: boolean,
		items: readonly IActionListItem<T>[],
		protected readonly _delegate: IActionListDelegate<T>,
		accessibilityProvider: Partial<IListAccessibilityProvider<IActionListItem<T>>> | undefined,
		protected readonly _options: IActionListOptions | undefined,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.classList.add('actionList');
		if (this._options?.inlineDescription) {
			this.domNode.classList.add('inline-description');
		}
		this._actionLineHeight = 24;

		// Create submenu container appended to domNode
		this._submenuContainer = document.createElement('div');
		this._submenuContainer.className = 'action-list-submenu-panel action-widget';
		this._submenuContainer.style.display = 'none';
		this.domNode.append(this._submenuContainer);

		this._register(dom.addDisposableListener(this._submenuContainer, 'mouseenter', () => {
			this._cancelSubmenuHide();
		}));
		this._register(dom.addDisposableListener(this._submenuContainer, 'mouseleave', () => {
			this._scheduleSubmenuHide();
		}));
		this._register(toDisposable(() => {
			this._cancelSubmenuHide();
			this._cancelSubmenuShow();
		}));

		// Initialize collapsed sections
		if (this._options?.collapsedByDefault) {
			for (const section of this._options.collapsedByDefault) {
				this._collapsedSections.add(section);
			}
		}

		const virtualDelegate: IListVirtualDelegate<IActionListItem<T>> = {
			getHeight: element => {
				return this._getItemHeight(element);
			},
			getTemplateId: element => element.kind
		};


		const reserveSubmenuSpace = this._options?.reserveSubmenuSpace ?? true;
		const hasAnySubmenuActions = reserveSubmenuSpace && items.some(item => !!item.submenuActions?.length && !item.hover?.content);

		this._list = this._register(new List(user, this.domNode, virtualDelegate, [
			new ActionItemRenderer<T>(preview, (item) => this._removeItem(item), (item) => this._showSubmenuForItem(item), hasAnySubmenuActions, this._groupTitleByIndex, this._options?.linkHandler, this._options?.hideDefaultKeybindingTooltip ?? false, this._keybindingService, this._openerService),
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
						if (element.detail) {
							label = label + ', ' + stripNewlines(element.detail);
						}
						if (element.description) {
							const descText = typeof element.description === 'string' ? element.description : element.description.value;
							label = label + ', ' + stripNewlines(descText);
						}
						if (element.group?.title) {
							label = label + ', ' + element.group.title;
						}
						if (element.disabled) {
							label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
						}
						if (element.submenuActions?.length) {
							label = localize('actionList.submenuHint', "{0}, use right arrow to access options", label);
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

		this._allMenuItems = [...items];

		// Create filter input and/or secondary heading
		if (this._options?.showFilter || this._options?.secondaryHeading) {
			this._filterContainer = document.createElement('div');
			this._filterContainer.className = 'action-list-filter';
			const filterRow = dom.append(this._filterContainer, dom.$('.action-list-filter-row'));

			if (this._options?.showFilter) {
				this._filterInput = document.createElement('input');
				this._filterInput.type = 'text';
				this._filterInput.className = 'action-list-filter-input';
				this._filterInput.placeholder = this._options?.filterPlaceholder ?? localize('actionList.filter.placeholder', "Search...");
				this._filterInput.setAttribute('aria-label', localize('actionList.filter.ariaLabel', "Filter items"));
				filterRow.appendChild(this._filterInput);

				const filterActions = this._options?.filterActions ?? [];
				if (filterActions.length > 0) {
					const filterActionsContainer = dom.append(filterRow, dom.$('.action-list-filter-actions'));
					const filterActionBar = this._register(new ActionBar(filterActionsContainer));
					filterActionBar.push(filterActions, { icon: true, label: false });
				}

				this._register(dom.addDisposableListener(this._filterInput, 'input', () => {
					this._filterText = this._filterInput!.value;
					this._applyOrUpdateFilter();
				}));
			}

			if (this._options?.secondaryHeading) {
				const filterLabelEl = dom.append(filterRow, dom.$('.action-list-filter-label'));
				filterLabelEl.textContent = this._options.secondaryHeading;
			}
		}

		// Create footer text
		if (this._options?.footerText) {
			this._footerContainer = document.createElement('div');
			this._footerContainer.className = 'action-list-footer';
			this._footerContainer.textContent = this._options.footerText;
		}

		this._applyFilter();

		if (this._list.length) {
			this._focusCheckedOrFirst();
		}

		// ArrowRight opens submenu for the focused item and moves focus into it
		this._register(dom.addDisposableListener(this.domNode, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'ArrowRight') {
				const focused = this._list.getFocus();
				if (focused.length > 0) {
					const element = this._list.element(focused[0]);
					if (element?.submenuActions?.length) {
						dom.EventHelper.stop(e, true);
						const rowElement = this._getRowElement(focused[0]);
						if (rowElement) {
							this._showSubmenuForElement(element, rowElement);
							this._currentSubmenuWidget?.focus();
						}
					}
				}
			}
		}));

		// When the list has focus and user types a printable character,
		// forward it to the filter input so search begins automatically.
		if (this._filterInput) {
			this._register(dom.addDisposableListener(this.domNode, 'keydown', (e: KeyboardEvent) => {
				if (this._filterInput && !dom.isActiveElement(this._filterInput)
					&& e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
					this._filterInput.focus();
					this._filterInput.value = e.key;
					this._filterText = e.key;
					this._applyOrUpdateFilter();
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
		this._options?.onDidToggleSection?.(section, this._collapsedSections.has(section));
		this._applyFilter();
	}

	private _applyOrUpdateFilter(): void {
		if (!this._delegate.onFilter) {
			this._applyFilter();
			return;
		}

		const filterText = this._filterText;
		this._filterCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._filterCts.value = cts;
		this._delegate.onFilter(filterText, cts.token).then(items => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			this._allMenuItems = [...items];
			this._applyFilter(true);
		}).catch(() => { /* best-effort */ });
	}

	private _applyFilter(skipTextFilter = false): void {
		const filterLower = skipTextFilter ? '' : this._filterText.toLowerCase();
		const isFiltering = !skipTextFilter && filterLower.length > 0;
		const visible: IActionListItem<T>[] = [];

		// Remember the focused item before splice
		const focusedIndexes = this._list.getFocus();
		let focusedItem: IActionListItem<T> | undefined;
		if (focusedIndexes.length > 0) {
			focusedItem = this._list.element(focusedIndexes[0]);
		}

		if (isFiltering) {
			let pendingSeparator: IActionListItem<T> | undefined;
			let filteredSectionItems: IActionListItem<T>[] = [];
			let hasMatchingActionInSection = false;

			const flushFilteredSection = () => {
				if (pendingSeparator && hasMatchingActionInSection) {
					visible.push(pendingSeparator);
				}
				visible.push(...filteredSectionItems);
				pendingSeparator = undefined;
				filteredSectionItems = [];
				hasMatchingActionInSection = false;
			};

			const matchesFilter = (item: IActionListItem<T>) => {
				const label = (item.label ?? '').toLowerCase();
				const descValue = typeof item.description === 'string' ? item.description : (item.description?.value ?? '');
				return label.includes(filterLower) || descValue.toLowerCase().includes(filterLower);
			};

			for (const item of this._allMenuItems) {
				if (item.kind === ActionListItemKind.Header) {
					continue;
				}

				if (item.kind === ActionListItemKind.Separator) {
					flushFilteredSection();
					pendingSeparator = item.label ? item : undefined;
					continue;
				}

				if (item.showAlways) {
					filteredSectionItems.push(item);
					continue;
				}

				if (item.isSectionToggle) {
					continue;
				}

				if (matchesFilter(item)) {
					hasMatchingActionInSection = true;
					filteredSectionItems.push(item);
				}
			}

			flushFilteredSection();
		} else {
			for (const item of this._allMenuItems) {
				if (item.kind === ActionListItemKind.Header) {
					visible.push(item);
					continue;
				}

				if (item.kind === ActionListItemKind.Separator) {
					if (item.section && this._collapsedSections.has(item.section)) {
						continue;
					}
					visible.push(item);
					continue;
				}

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

		// Remove orphaned separators while keeping labeled separators that act as
		// section headers above their following action items.
		const hasActionBefore: boolean[] = [];
		let seenAction = false;
		for (let i = 0; i < visible.length; i++) {
			hasActionBefore[i] = seenAction;
			if (visible[i].kind === ActionListItemKind.Action) {
				seenAction = true;
			}
		}

		const hasActionBeforeNextSeparator: boolean[] = [];
		let seenActionInSection = false;
		for (let i = visible.length - 1; i >= 0; i--) {
			if (visible[i].kind === ActionListItemKind.Action) {
				seenActionInSection = true;
				continue;
			}
			if (visible[i].kind !== ActionListItemKind.Separator) {
				continue;
			}
			hasActionBeforeNextSeparator[i] = seenActionInSection;
			seenActionInSection = false;
		}

		for (let i = visible.length - 1; i >= 0; i--) {
			const item = visible[i];
			if (item.kind !== ActionListItemKind.Separator) {
				continue;
			}
			const hasFollowingActionInSection = hasActionBeforeNextSeparator[i];
			const isLeadingUnlabeledDivider = !item.label && !hasActionBefore[i];
			if (!hasFollowingActionInSection || isLeadingUnlabeledDivider) {
				visible.splice(i, 1);
			}
		}

		// Recompute group title positions based on visible items
		if (this._options?.showGroupTitleOnFirstItem) {
			this._recomputeGroupTitles(visible);
		}

		// Capture whether the filter input currently has focus before splice
		// which may cause DOM changes that shift focus.
		const filterInputHasFocus = this._filterInput && dom.isActiveElement(this._filterInput);

		this._list.splice(0, this._list.length, visible);

		// Notify the parent that a re-layout is needed
		this._onDidRequestLayout.fire();

		// Restore focus after splice destroyed DOM elements,
		// otherwise the blur handler in ActionWidgetService closes the widget.
		// Keep focus on the filter input if the user is typing a filter.
		if (filterInputHasFocus) {
			this._filterInput?.focus();
			// Keep a highlighted item in the list so Enter works without pressing DownArrow first
			this._focusCheckedOrFirst();
		} else if (this._hasLaidOut) {
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
	}

	/**
	 * Returns the filter container element, if filter is enabled.
	 * The caller is responsible for appending it to the widget DOM.
	 */
	get filterContainer(): HTMLElement | undefined {
		return this._filterContainer;
	}

	get footerContainer(): HTMLElement | undefined {
		return this._footerContainer;
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
			// Highlight the first item so Enter works immediately
			this._focusCheckedOrFirst();
			return;
		}
		this._list.domFocus();
		this._focusCheckedOrFirst();
	}

	clearFocus(): void {
		this._list.setFocus([]);
	}

	getFocusedElement(): IActionListItem<T> | undefined {
		const focused = this._list.getFocus();
		if (focused.length > 0) {
			return this._list.element(focused[0]);
		}
		return undefined;
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
			// Set focus on the first focusable item without moving DOM focus
			this._list.focusFirst(undefined, this.focusCondition);
			const focused = this._list.getFocus();
			if (focused.length > 0) {
				this._list.reveal(focused[0]);
			}
		} finally {
			this._suppressHover = false;
		}
	}

	hide(didCancel?: boolean): void {
		this._delegate.onHide(didCancel);
		this.cts.cancel();
		this._filterCts.value?.cancel();
		this._filterCts.clear();
		this._hideSubmenu();
	}

	clearFilter(): boolean {
		if (this._filterInput && this._filterText) {
			this._filterInput.value = '';
			this._filterText = '';
			this._applyOrUpdateFilter();
			return true;
		}
		return false;
	}

	/**
	 * Whether this widget uses dynamic height (has filter or collapsible sections).
	 */
	get hasDynamicHeight(): boolean {
		if (this._options?.showFilter) {
			return true;
		}
		return this._allMenuItems.some(item => item.isSectionToggle);
	}

	/**
	 * The height of a single action row in pixels.
	 */
	get lineHeight(): number {
		return this._actionLineHeight;
	}

	/**
	 * Returns the height for an action item, using a taller line height
	 * for items with a detail (second line).
	 */
	protected _getItemHeight(item: IActionListItem<T>): number {
		switch (item.kind) {
			case ActionListItemKind.Header:
				return this._headerLineHeight;
			case ActionListItemKind.Separator:
				return item.label ? this._actionLineHeight : this._separatorLineHeight;
			default:
				return item.detail ? (this._options?.detailItemHeight ?? 48) : this._actionLineHeight;
		}
	}

	/**
	 * Computes the total height of all items (including collapsed/filtered items).
	 */
	computeFullHeight(): number {
		let fullHeight = 0;
		for (const item of this._allMenuItems) {
			fullHeight += this._getItemHeight(item);
		}
		return fullHeight;
	}

	/**
	 * Computes the total height of visible items in the list.
	 */
	computeListHeight(): number {
		const visibleCount = this._list.length;
		let listHeight = 0;
		for (let i = 0; i < visibleCount; i++) {
			const element = this._list.element(i);
			listHeight += this._getItemHeight(element);
		}
		return listHeight;
	}

	/**
	 * Lays out the list widget with the given explicit dimensions.
	 */
	layout(height: number, width?: number): void {
		this._hasLaidOut = true;
		this._list.layout(height, width);
		this.domNode.style.height = `${height}px`;

		// Place filter container on the preferred side.
		if (this._filterContainer && this._filterContainer.parentElement) {
			this._filterContainer.parentElement.insertBefore(this._filterContainer, this.domNode);
		}
	}

	computeMaxWidth(minWidth: number): number {
		const visibleCount = this._list.length;
		const effectiveMinWidth = Math.max(minWidth, this._options?.minWidth ?? 0);
		const rawMaxWidthCap = this._options?.maxWidth ?? Number.POSITIVE_INFINITY;
		const maxWidthCap = Math.max(rawMaxWidthCap, effectiveMinWidth);
		const clamp = (w: number) => Math.min(Math.max(w, effectiveMinWidth), maxWidthCap);
		let maxWidth = effectiveMinWidth;

		const totalItemCount = this._allMenuItems.length;
		if (totalItemCount >= 50) {
			return clamp(380);
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
				allItemsHeight += this._getItemHeight(item);
			}
			this._list.layout(allItemsHeight);

			const itemWidths: number[] = [];
			for (let i = 0; i < allItems.length; i++) {
				const element = this._getRowElement(i);
				if (element) {
					element.style.width = 'auto';
					const width = element.getBoundingClientRect().width;
					element.style.width = '';
					itemWidths.push(width + this._computeToolbarWidth(allItems[i]));
				}
			}

			maxWidth = clamp(Math.max(...itemWidths));

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
				itemWidths.push(width + this._computeToolbarWidth(this._list.element(i)));
			}
		}
		return clamp(Math.max(...itemWidths));
	}

	focusPrevious() {
		if (this._filterInput && dom.isActiveElement(this._filterInput)) {
			this._list.domFocus();
			// An item is already highlighted; advance from it instead of jumping to last
			const current = this._list.getFocus();
			if (current.length > 0) {
				this._list.focusPrevious(1, false, undefined, this.focusCondition);
				const focused = this._list.getFocus();
				// If we couldn't move (already at first), go to filter
				if (focused.length > 0 && focused[0] >= current[0]) {
					this._filterInput.focus();
				} else if (focused.length > 0) {
					this._list.reveal(focused[0]);
				}
			} else {
				this._list.focusLast(undefined, this.focusCondition);
				const focused = this._list.getFocus();
				if (focused.length > 0) {
					this._list.reveal(focused[0]);
				}
			}
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
			// An item is already highlighted; advance from it instead of jumping to first
			const current = this._list.getFocus();
			if (current.length > 0) {
				this._list.focusNext(1, false, undefined, this.focusCondition);
				const focused = this._list.getFocus();
				if (focused.length > 0) {
					this._list.reveal(focused[0]);
				}
			} else {
				this._list.focusFirst(undefined, this.focusCondition);
				const focused = this._list.getFocus();
				if (focused.length > 0) {
					this._list.reveal(focused[0]);
				}
			}
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
		if (element.isSectionToggle && element.section) {
			this._list.setSelection([]);
			const section = element.section;
			queueMicrotask(() => {
				this._toggleSection(section);
			});
			return;
		}
		// Don't select when clicking the toolbar or submenu indicator
		if (dom.isMouseEvent(e.browserEvent)) {
			const target = e.browserEvent.target;
			if (dom.isHTMLElement(target) && (target.closest('.action-list-item-toolbar') || target.closest('.action-list-submenu-indicator'))) {
				this._list.setSelection([]);
				return;
			}
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

	private _removeItem(item: IActionListItem<T>): void {
		const index = this._allMenuItems.indexOf(item);
		if (index >= 0) {
			this._allMenuItems.splice(index, 1);
			this._applyFilter();
		}
	}

	private _recomputeGroupTitles(items: readonly IActionListItem<T>[]): void {
		this._groupTitleByIndex.clear();
		const seenTitles = new Set<string>();
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.kind === ActionListItemKind.Action && item.group?.title && !seenTitles.has(item.group.title)) {
				seenTitles.add(item.group.title);
				this._groupTitleByIndex.set(i, item.group.title);
			}
		}
	}

	private _computeToolbarWidth(item: IActionListItem<T>): number {
		let actionCount = item.toolbarActions?.length ?? 0;
		if (item.onRemove) {
			actionCount++;
		}
		if (actionCount === 0) {
			return 0;
		}
		// Each toolbar action button is ~22px (16px icon + padding) plus 6px row gap
		const actionButtonWidth = 22;
		return actionCount * actionButtonWidth + 6;
	}

	private _getRowElement(index: number): HTMLElement | null {
		// eslint-disable-next-line no-restricted-syntax
		return this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
	}

	private _showHoverForElement(element: IActionListItem<T>, index: number): void {
		if (this._currentSubmenuElement === element) {
			return;
		}

		const hasHoverContent = !!element.hover?.content;
		const hasSubmenuActions = !!element.submenuActions?.length;

		if (hasHoverContent || hasSubmenuActions) {
			const rowElement = this._getRowElement(index);
			if (rowElement) {
				this._showSubmenuForElement(element, rowElement);
			}
			return;
		}

		// Navigated to an item with no hover/submenu — fully tear down any
		// previous submenu so a blank panel doesn't linger.
		this._hideSubmenu();
	}

	private _showSubmenuForItem(item: IActionListItem<T>): void {
		const index = this._list.indexOf(item);
		if (index >= 0) {
			const rowElement = this._getRowElement(index);
			if (rowElement) {
				this._showSubmenuForElement(item, rowElement);
			}
		}
	}

	private _showSubmenuForElement(element: IActionListItem<T>, anchor: HTMLElement): void {
		if (this._currentSubmenuElement === element) {
			return;
		}

		this._submenuDisposables.clear();
		this._currentSubmenuElement = element;
		dom.clearNode(this._submenuContainer);

		// When the item has hover content, render it as a header
		let hoverHeader: HTMLElement | undefined;
		const hoverContent = element.hover?.content;
		if (hoverContent) {
			if (dom.isHTMLElement(hoverContent)) {
				hoverHeader = hoverContent;
				if (element.hover?.disposable) {
					this._submenuDisposables.add(element.hover.disposable);
				}
			} else {
				const markdown = typeof hoverContent === 'string' ? new MarkdownString(hoverContent) : hoverContent;
				const linkHandler = this._options?.linkHandler;
				const rendered = renderMarkdown(markdown, {
					actionHandler: (url: string) => {
						const uri = URI.parse(url);
						if (linkHandler) {
							linkHandler(uri, element);
						} else {
							this._openerService.open(uri, { allowCommands: true });
						}
					},
				});
				this._submenuDisposables.add(rendered);
				hoverHeader = rendered.element;
			}
			hoverHeader.classList.add('action-list-submenu-hover-header');
			if (element.submenuActions?.length) {
				hoverHeader.classList.add('has-submenu');
			}
			this._submenuContainer.appendChild(hoverHeader);
		}

		const hasSubmenuActions = !!element.submenuActions?.length;

		// Show container before creating widget so List can measure during construction
		this._submenuContainer.style.display = '';
		this._submenuContainer.style.position = 'absolute';
		this._submenuContainer.removeAttribute('role');

		const anchorRect = anchor.getBoundingClientRect();
		const parentRect = this.domNode.getBoundingClientRect();
		const targetWindow = dom.getWindow(this.domNode);

		let totalHeight = 0;
		let maxWidth = hoverHeader ? hoverHeader.offsetWidth : 0;

		if (hasSubmenuActions) {
			// Convert submenu actions into ActionListWidget items
			const submenuItems: IActionListItem<IAction>[] = [];
			const submenuGroups = element.submenuActions!.filter((a): a is SubmenuAction => a instanceof SubmenuAction);
			const groupsWithActions = submenuGroups.filter(g => g.actions.length > 0);
			for (let gi = 0; gi < groupsWithActions.length; gi++) {
				const group = groupsWithActions[gi];
				if (group.label) {
					submenuItems.push({
						kind: ActionListItemKind.Header,
						group: { title: group.label },
						label: group.label,
					});
				}
				for (let ci = 0; ci < group.actions.length; ci++) {
					const child = group.actions[ci];
					const extendedChild = child as IAction & { icon?: ThemeIcon; hoverContent?: string; onRemove?: () => void };
					const icon = extendedChild.icon
						?? ThemeIcon.fromId(child.checked ? Codicon.check.id : Codicon.blank.id);
					const hoverContent = extendedChild.hoverContent;
					submenuItems.push({
						item: child,
						kind: ActionListItemKind.Action,
						label: child.label,
						description: child.tooltip || undefined,
						group: { title: '', icon },
						hideIcon: false,
						hover: hoverContent ? { content: hoverContent } : {},
						onRemove: extendedChild.onRemove,
					});
				}
				if (gi < groupsWithActions.length - 1) {
					submenuItems.push({ kind: ActionListItemKind.Separator, label: '' });
				}
			}
			// Also include non-SubmenuAction items directly
			for (const action of element.submenuActions!) {
				if (!(action instanceof SubmenuAction)) {
					const extendedAction = action as IAction & { onRemove?: () => void };
					submenuItems.push({
						item: action,
						kind: ActionListItemKind.Action,
						label: action.label,
						description: action.tooltip || undefined,
						group: { title: '' },
						hideIcon: false,
						hover: {},
						onRemove: extendedAction.onRemove,
					});
				}
			}

			const submenuDelegate: IActionListDelegate<IAction> = {
				onHide: () => { },
				onSelect: (action) => {
					action.run();
					const parentItem = this._currentSubmenuElement?.item;
					this._hideSubmenu();
					if (parentItem) {
						this._delegate.onSelect(parentItem);
					}
					this.hide();
				},
			};

			const submenuWidget = this._submenuDisposables.add(this._instantiationService.createInstance(
				ActionListWidget<IAction>,
				'submenu',
				false,
				submenuItems,
				submenuDelegate,
				undefined,
				undefined,
			));
			this._submenuContainer.appendChild(submenuWidget.domNode);
			this._currentSubmenuWidget = submenuWidget;

			// The submenu widget's constructor focuses its first item by
			// default; clear that until the user actually navigates into
			// the submenu (via ArrowRight) so it doesn't render as if
			// selected while the parent list still has focus.
			submenuWidget.clearFocus();

			totalHeight = submenuWidget.computeListHeight();
			submenuWidget.layout(totalHeight);
			const submenuMaxWidth = submenuWidget.computeMaxWidth(0);
			maxWidth = Math.max(maxWidth, submenuMaxWidth);
			submenuWidget.layout(totalHeight, maxWidth);
			submenuWidget.domNode.style.width = `${maxWidth}px`;

			// Keyboard navigation in submenu
			this._submenuDisposables.add(dom.addDisposableListener(submenuWidget.domNode, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'ArrowLeft' || e.key === 'Escape') {
					dom.EventHelper.stop(e, true);
					this._hideSubmenu();
					this._list.domFocus();
				} else if (e.key === 'Enter') {
					dom.EventHelper.stop(e, true);
					const focused = submenuWidget.getFocusedElement();
					if (focused?.item) {
						focused.item.run();
						const parentItem = this._currentSubmenuElement?.item;
						this._hideSubmenu();
						if (parentItem) {
							this._delegate.onSelect(parentItem);
						}
						this.hide();
					}
				} else if (e.key === 'ArrowDown') {
					dom.EventHelper.stop(e, true);
					submenuWidget.focusNext();
				} else if (e.key === 'ArrowUp') {
					dom.EventHelper.stop(e, true);
					submenuWidget.focusPrevious();
				}
			}));
		}

		// Position: prefer right side, fall back to left if not enough space
		const viewportWidth = targetWindow.innerWidth;
		const spaceRight = viewportWidth - anchorRect.right;
		const spaceLeft = parentRect.left;
		const panelWidth = maxWidth + 10; // account for border/padding

		const gap = 4;
		if (spaceRight >= panelWidth || spaceRight >= spaceLeft) {
			this._submenuContainer.style.left = `${parentRect.right - parentRect.left + gap}px`;
		} else {
			this._submenuContainer.style.left = `${-panelWidth - gap}px`;
		}
		const hoverHeaderHeight = hoverHeader ? hoverHeader.offsetHeight : 0;
		const totalPanelHeight = totalHeight + hoverHeaderHeight;
		const viewportHeight = targetWindow.innerHeight;
		const anchorHeight = anchorRect.height;
		let top = anchorRect.top - parentRect.top + (anchorHeight - totalPanelHeight) / 2;
		const panelBottom = parentRect.top + top + totalPanelHeight;
		if (panelBottom > viewportHeight) {
			top -= (panelBottom - viewportHeight + 8);
		}
		if (parentRect.top + top < 0) {
			top = -parentRect.top;
		}
		this._submenuContainer.style.top = `${top}px`;
	}

	private _hideSubmenu(): void {
		this._cancelSubmenuHide();
		this._cancelSubmenuShow();
		this._submenuDisposables.clear();
		this._currentSubmenuWidget = undefined;
		this._currentSubmenuElement = undefined;
		dom.clearNode(this._submenuContainer);
		this._submenuContainer.style.display = 'none';
	}

	private _scheduleSubmenuHide(): void {
		this._cancelSubmenuHide();
		this._submenuHideTimeout = setTimeout(() => {
			this._hideSubmenu();
		}, 300);
	}

	private _cancelSubmenuHide(): void {
		if (this._submenuHideTimeout !== undefined) {
			clearTimeout(this._submenuHideTimeout);
			this._submenuHideTimeout = undefined;
		}
	}

	private _scheduleSubmenuShow(element: IActionListItem<T>, index: number | undefined): void {
		this._cancelSubmenuShow();
		this._submenuShowTimeout = setTimeout(() => {
			this._submenuShowTimeout = undefined;
			const rowElement = typeof index === 'number' ? this._getRowElement(index) : null;
			if (rowElement) {
				this._showSubmenuForElement(element, rowElement);
			}
		}, 500);
	}

	private _cancelSubmenuShow(): void {
		if (this._submenuShowTimeout !== undefined) {
			clearTimeout(this._submenuShowTimeout);
			this._submenuShowTimeout = undefined;
		}
	}

	private async onListHover(e: IListMouseEvent<IActionListItem<T>>) {
		const element = e.element;

		if (element && element.item && this.focusCondition(element)) {
			// Check if the hover target is inside a toolbar - if so, skip the splice
			// to avoid re-rendering which would destroy the element mid-hover.
			// But still maintain submenu state for items with submenu actions.
			const isHoveringToolbar = dom.isHTMLElement(e.browserEvent.target) && e.browserEvent.target.closest('.action-list-item-toolbar') !== null;
			if (isHoveringToolbar) {
				if (!element.submenuActions?.length) {
					this._cancelSubmenuShow();
				}
				this._list.setFocus([]);
				return;
			}

			// Set focus immediately for responsive hover feedback
			const hasPanel = !!(element.submenuActions?.length || element.hover?.content);
			if (hasPanel) {
				this._suppressHover = true;
			}
			this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);
			if (hasPanel) {
				this._suppressHover = false;
			}

			// Show hover/submenu panel on row hover with a delay
			if (hasPanel) {
				if (this._currentSubmenuElement === element) {
					this._cancelSubmenuHide();
					this._cancelSubmenuShow();
				} else {
					this._hideSubmenu();
					this._scheduleSubmenuShow(element, e.index);
				}
				return;
			}

			if (this._currentSubmenuElement === element) {
				this._cancelSubmenuHide();
			} else {
				this._cancelSubmenuShow();
				this._hideSubmenu();
			}

			if (this._delegate.onHover && !element.disabled && element.kind === ActionListItemKind.Action && this._currentSubmenuElement !== element) {
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
			// Show hover for disabled items that have hover content (with delay)
			if (this._currentSubmenuElement === element) {
				this._cancelSubmenuHide();
				this._cancelSubmenuShow();
			} else {
				this._hideSubmenu();
				this._scheduleSubmenuShow(element, e.index);
			}
		}
	}

	private onListClick(e: IListMouseEvent<IActionListItem<T>>): void {
		if (e.element && this.focusCondition(e.element)) {
			this._list.setFocus([]);
		}
	}
}

/**
 * An action list that wraps {@link ActionListWidget} with context-view positioning
 * and anchor-based height computation.
 */
export class ActionList<T> extends Disposable {

	private readonly _widget: ActionListWidget<T>;

	private readonly _anchor: HTMLElement | StandardMouseEvent | IAnchor;
	private _lastMinWidth = 0;
	private _cachedMaxWidth: number | undefined;
	private _hasLaidOut = false;
	private _showAbove: boolean | undefined;

	get domNode(): HTMLElement {
		return this._widget.domNode;
	}

	get filterContainer(): HTMLElement | undefined {
		return this._widget.filterContainer;
	}

	get footerContainer(): HTMLElement | undefined {
		return this._widget.footerContainer;
	}

	get filterInput(): HTMLInputElement | undefined {
		return this._widget.filterInput;
	}

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
		_delegate: IActionListDelegate<T>,
		accessibilityProvider: Partial<IListAccessibilityProvider<IActionListItem<T>>> | undefined,
		options: IActionListOptions | undefined,
		anchor: HTMLElement | StandardMouseEvent | IAnchor,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._anchor = anchor;

		this._widget = this._register(instantiationService.createInstance(
			ActionListWidget<T>,
			user,
			preview,
			items,
			_delegate,
			accessibilityProvider,
			options,
		));

		this._register(this._widget.onDidRequestLayout(() => {
			if (this._hasLaidOut) {
				this.layout(this._lastMinWidth);
				this._contextViewService.layout();
			}
		}));
	}

	focus(): void {
		this._widget.focus();
	}

	hide(didCancel?: boolean): void {
		this._widget.hide(didCancel);
		this._contextViewService.hideContextView();
	}

	clearFilter(): boolean {
		return this._widget.clearFilter();
	}

	focusPrevious(): void {
		this._widget.focusPrevious();
	}

	focusNext(): void {
		this._widget.focusNext();
	}

	collapseFocusedSection(): void {
		this._widget.collapseFocusedSection();
	}

	expandFocusedSection(): void {
		this._widget.expandFocusedSection();
	}

	toggleFocusedSection(): boolean {
		return this._widget.toggleFocusedSection();
	}

	acceptSelected(preview?: boolean): void {
		this._widget.acceptSelected(preview);
	}

	private hasDynamicHeight(): boolean {
		return this._widget.hasDynamicHeight;
	}

	private computeHeight(): number {
		const listHeight = this._widget.computeListHeight();

		const filterHeight = this._widget.filterContainer ? 36 : 0;
		const footerHeight = this._widget.footerContainer ? 32 : 0;
		const chromeHeight = filterHeight + footerHeight;
		const targetWindow = dom.getWindow(this.domNode);
		let availableHeight;

		if (this.hasDynamicHeight()) {
			const viewportHeight = targetWindow.innerHeight;
			const anchorRect = getAnchorRect(this._anchor);
			const anchorTopInViewport = anchorRect.top - targetWindow.pageYOffset;
			const bottomGap = 30;
			const spaceBelow = viewportHeight - anchorTopInViewport - anchorRect.height - bottomGap;
			const spaceAbove = anchorTopInViewport;

			// Lock the direction on first layout based on whether the full
			// unconstrained list fits below. Once decided, the dropdown stays
			// in the same position even when the visible item count changes.
			if (this._showAbove === undefined) {
				const fullHeight = chromeHeight + this._widget.computeFullHeight();
				this._showAbove = fullHeight > spaceBelow && spaceAbove > spaceBelow;
			}
			availableHeight = this._showAbove ? spaceAbove : spaceBelow;
		} else {
			const padding = 10;
			const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
			const widgetTop = this.domNode.getBoundingClientRect().top;
			availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
		}

		const viewportMaxHeight = Math.floor(targetWindow.innerHeight * 0.6);
		const actionLineHeight = this._widget.lineHeight;
		const maxHeight = Math.min(Math.max(availableHeight, actionLineHeight * 3 + chromeHeight), viewportMaxHeight);
		const height = Math.min(listHeight + chromeHeight, maxHeight);
		return height - chromeHeight;
	}

	layout(minWidth: number): number {
		this._hasLaidOut = true;
		this._lastMinWidth = minWidth;

		const listHeight = this.computeHeight();
		this._widget.layout(listHeight);

		const computedWidth = this._widget.computeMaxWidth(minWidth);
		this._cachedMaxWidth = computedWidth;
		this._widget.layout(listHeight, this._cachedMaxWidth);

		return this._cachedMaxWidth;
	}
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}
