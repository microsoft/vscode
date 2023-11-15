/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider, IListOptions, IListStyles, List } from 'vs/base/browser/ui/list/listWidget';
import { IAction } from 'vs/base/common/actions';
import { range } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { compareAnything } from 'vs/base/common/comparers';
import { memoize } from 'vs/base/common/decorators';
import { isCancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IMatch } from 'vs/base/common/filters';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { getCodiconAriaLabel, IParsedLabelWithIcons, matchesFuzzyIconAware, parseLabelWithIcons } from 'vs/base/common/iconLabels';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { ltrim } from 'vs/base/common/strings';
import 'vs/css!./media/quickInput';
import { localize } from 'vs/nls';
import { IQuickInputOptions } from 'vs/platform/quickinput/browser/quickInput';
import { getIconClass } from 'vs/platform/quickinput/browser/quickInputUtils';
import { IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickPickSeparatorButtonEvent, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { Lazy } from 'vs/base/common/lazy';
import { URI } from 'vs/base/common/uri';
import { isDark } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const $ = dom.$;

interface IListElementLazyParts {
	readonly saneLabel: string;
	readonly saneSortLabel: string;
	readonly saneAriaLabel: string;
}

interface IListElement extends IListElementLazyParts {
	readonly hasCheckbox: boolean;
	readonly index: number;
	readonly item?: IQuickPickItem;
	readonly saneDescription?: string;
	readonly saneDetail?: string;
	readonly saneTooltip?: string | IMarkdownString | HTMLElement;
	readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
	readonly fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void;
	readonly onChecked: Event<boolean>;
	checked: boolean;
	hidden: boolean;
	element?: HTMLElement;
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];
	separator?: IQuickPickSeparator;
}

class ListElement implements IListElement {
	private readonly _init: Lazy<IListElementLazyParts>;

	readonly hasCheckbox: boolean;
	readonly index: number;
	readonly item?: IQuickPickItem;
	readonly saneDescription?: string;
	readonly saneDetail?: string;
	readonly saneTooltip?: string | IMarkdownString | HTMLElement;
	readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
	readonly fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void;

	// state will get updated later
	private _checked: boolean = false;
	private _hidden: boolean = false;
	private _element?: HTMLElement;
	private _labelHighlights?: IMatch[];
	private _descriptionHighlights?: IMatch[];
	private _detailHighlights?: IMatch[];
	private _separator?: IQuickPickSeparator;

	private readonly _onChecked: Emitter<{ listElement: IListElement; checked: boolean }>;
	onChecked: Event<boolean>;

	constructor(
		mainItem: QuickPickItem,
		previous: QuickPickItem | undefined,
		index: number,
		hasCheckbox: boolean,
		fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void,
		fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void,
		onCheckedEmitter: Emitter<{ listElement: IListElement; checked: boolean }>
	) {
		this.hasCheckbox = hasCheckbox;
		this.index = index;
		this.fireButtonTriggered = fireButtonTriggered;
		this.fireSeparatorButtonTriggered = fireSeparatorButtonTriggered;
		this._onChecked = onCheckedEmitter;
		this.onChecked = hasCheckbox
			? Event.map(Event.filter<{ listElement: IListElement; checked: boolean }>(this._onChecked.event, e => e.listElement === this), e => e.checked)
			: Event.None;

		if (mainItem.type === 'separator') {
			this._separator = mainItem;
		} else {
			this.item = mainItem;
			if (previous && previous.type === 'separator' && !previous.buttons) {
				this._separator = previous;
			}
			this.saneDescription = this.item.description;
			this.saneDetail = this.item.detail;
			this._labelHighlights = this.item.highlights?.label;
			this._descriptionHighlights = this.item.highlights?.description;
			this._detailHighlights = this.item.highlights?.detail;
			this.saneTooltip = this.item.tooltip;
		}
		this._init = new Lazy(() => {
			const saneLabel = mainItem.label ?? '';
			const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();

			const saneAriaLabel = mainItem.ariaLabel || [saneLabel, this.saneDescription, this.saneDetail]
				.map(s => getCodiconAriaLabel(s))
				.filter(s => !!s)
				.join(', ');

			return {
				saneLabel,
				saneSortLabel,
				saneAriaLabel
			};
		});
	}

	// #region Lazy Getters

	get saneLabel() {
		return this._init.value.saneLabel;
	}

	get saneSortLabel() {
		return this._init.value.saneSortLabel;
	}

	get saneAriaLabel() {
		return this._init.value.saneAriaLabel;
	}

	// #endregion

	// #region Getters and Setters

	get element() {
		return this._element;
	}

	set element(value: HTMLElement | undefined) {
		this._element = value;
	}

	get hidden() {
		return this._hidden;
	}

	set hidden(value: boolean) {
		this._hidden = value;
	}

	get checked() {
		return this._checked;
	}

	set checked(value: boolean) {
		if (value !== this._checked) {
			this._checked = value;
			this._onChecked.fire({ listElement: this, checked: value });
		}
	}

	get separator() {
		return this._separator;
	}

	set separator(value: IQuickPickSeparator | undefined) {
		this._separator = value;
	}

	get labelHighlights() {
		return this._labelHighlights;
	}

	set labelHighlights(value: IMatch[] | undefined) {
		this._labelHighlights = value;
	}

	get descriptionHighlights() {
		return this._descriptionHighlights;
	}

	set descriptionHighlights(value: IMatch[] | undefined) {
		this._descriptionHighlights = value;
	}

	get detailHighlights() {
		return this._detailHighlights;
	}

	set detailHighlights(value: IMatch[] | undefined) {
		this._detailHighlights = value;
	}

	// #endregion
}

interface IListElementTemplateData {
	entry: HTMLDivElement;
	checkbox: HTMLInputElement;
	icon: HTMLDivElement;
	label: IconLabel;
	keybinding: KeybindingLabel;
	detail: IconLabel;
	separator: HTMLDivElement;
	actionBar: ActionBar;
	element: IListElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class ListElementRenderer implements IListRenderer<IListElement, IListElementTemplateData> {

	static readonly ID = 'listelement';

	constructor(private readonly themeService: IThemeService) { }

	get templateId() {
		return ListElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IListElementTemplateData {
		const data: IListElementTemplateData = Object.create(null);
		data.toDisposeElement = [];
		data.toDisposeTemplate = [];

		data.entry = dom.append(container, $('.quick-input-list-entry'));

		// Checkbox
		const label = dom.append(data.entry, $('label.quick-input-list-label'));
		data.toDisposeTemplate.push(dom.addStandardDisposableListener(label, dom.EventType.CLICK, e => {
			if (!data.checkbox.offsetParent) { // If checkbox not visible:
				e.preventDefault(); // Prevent toggle of checkbox when it is immediately shown afterwards. #91740
			}
		}));
		data.checkbox = <HTMLInputElement>dom.append(label, $('input.quick-input-list-checkbox'));
		data.checkbox.type = 'checkbox';
		data.toDisposeTemplate.push(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			data.element.checked = data.checkbox.checked;
		}));

		// Rows
		const rows = dom.append(label, $('.quick-input-list-rows'));
		const row1 = dom.append(rows, $('.quick-input-list-row'));
		const row2 = dom.append(rows, $('.quick-input-list-row'));

		// Label
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true });
		data.toDisposeTemplate.push(data.label);
		data.icon = <HTMLInputElement>dom.prepend(data.label.element, $('.quick-input-list-icon'));

		// Keybinding
		const keybindingContainer = dom.append(row1, $('.quick-input-list-entry-keybinding'));
		data.keybinding = new KeybindingLabel(keybindingContainer, platform.OS);

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
		data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true });
		data.toDisposeTemplate.push(data.detail);

		// Separator
		data.separator = dom.append(data.entry, $('.quick-input-list-separator'));

		// Actions
		data.actionBar = new ActionBar(data.entry);
		data.actionBar.domNode.classList.add('quick-input-list-entry-action-bar');
		data.toDisposeTemplate.push(data.actionBar);

		return data;
	}

	renderElement(element: IListElement, index: number, data: IListElementTemplateData): void {
		data.element = element;
		element.element = data.entry ?? undefined;
		const mainItem: QuickPickItem = element.item ? element.item : element.separator!;

		data.checkbox.checked = element.checked;
		data.toDisposeElement.push(element.onChecked(checked => data.checkbox.checked = checked));

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		if (element.item?.iconPath) {
			const icon = isDark(this.themeService.getColorTheme().type) ? element.item.iconPath.dark : (element.item.iconPath.light ?? element.item.iconPath.dark);
			const iconUrl = URI.revive(icon);
			data.icon.className = 'quick-input-list-icon';
			data.icon.style.backgroundImage = dom.asCSSUrl(iconUrl);
		} else {
			data.icon.style.backgroundImage = '';
			data.icon.className = element.item?.iconClass ? `quick-input-list-icon ${element.item.iconClass}` : '';
		}

		// Label
		const options: IIconLabelValueOptions = {
			matches: labelHighlights || [],
			descriptionTitle: element.saneDescription,
			descriptionMatches: descriptionHighlights || [],
			labelEscapeNewLines: true
		};
		if (mainItem.type !== 'separator') {
			options.extraClasses = mainItem.iconClasses;
			options.italic = mainItem.italic;
			options.strikethrough = mainItem.strikethrough;
			data.entry.classList.remove('quick-input-list-separator-as-item');
		} else {
			data.entry.classList.add('quick-input-list-separator-as-item');
		}
		data.label.setLabel(element.saneLabel, element.saneDescription, options);

		// Keybinding
		data.keybinding.set(mainItem.type === 'separator' ? undefined : mainItem.keybinding);

		// Detail
		if (element.saneDetail) {
			data.detail.element.style.display = '';
			data.detail.setLabel(element.saneDetail, undefined, {
				matches: detailHighlights,
				title: element.saneDetail,
				labelEscapeNewLines: true
			});
		} else {
			data.detail.element.style.display = 'none';
		}

		// Separator
		if (element.item && element.separator && element.separator.label) {
			data.separator.textContent = element.separator.label;
			data.separator.style.display = '';
		} else {
			data.separator.style.display = 'none';
		}
		data.entry.classList.toggle('quick-input-list-separator-border', !!element.separator);

		// Actions
		const buttons = mainItem.buttons;
		if (buttons && buttons.length) {
			data.actionBar.push(buttons.map((button, index): IAction => {
				let cssClasses = button.iconClass || (button.iconPath ? getIconClass(button.iconPath) : undefined);
				if (button.alwaysVisible) {
					cssClasses = cssClasses ? `${cssClasses} always-visible` : 'always-visible';
				}
				return {
					id: `id-${index}`,
					class: cssClasses,
					enabled: true,
					label: '',
					tooltip: button.tooltip || '',
					run: () => {
						mainItem.type !== 'separator'
							? element.fireButtonTriggered({
								button,
								item: mainItem
							})
							: element.fireSeparatorButtonTriggered({
								button,
								separator: mainItem
							});
					}
				};
			}), { icon: true, label: false });
			data.entry.classList.add('has-actions');
		} else {
			data.entry.classList.remove('has-actions');
		}
	}

	disposeElement(element: IListElement, index: number, data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.actionBar.clear();
	}

	disposeTemplate(data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class ListElementDelegate implements IListVirtualDelegate<IListElement> {

	getHeight(element: IListElement): number {
		if (!element.item) {
			// must be a separator
			return 24;
		}
		return element.saneDetail ? 44 : 22;
	}

	getTemplateId(element: IListElement): string {
		return ListElementRenderer.ID;
	}
}

export enum QuickInputListFocus {
	First = 1,
	Second,
	Last,
	Next,
	Previous,
	NextPage,
	PreviousPage
}

export class QuickInputList {

	readonly id: string;
	private container: HTMLElement;
	private list: List<IListElement>;
	private inputElements: Array<QuickPickItem> = [];
	private elements: IListElement[] = [];
	private elementsToIndexes = new Map<QuickPickItem, number>();
	matchOnDescription = false;
	matchOnDetail = false;
	matchOnLabel = true;
	matchOnLabelMode: 'fuzzy' | 'contiguous' = 'fuzzy';
	matchOnMeta = true;
	sortByLabel = true;
	private readonly _onChangedAllVisibleChecked = new Emitter<boolean>();
	onChangedAllVisibleChecked: Event<boolean> = this._onChangedAllVisibleChecked.event;
	private readonly _onChangedCheckedCount = new Emitter<number>();
	onChangedCheckedCount: Event<number> = this._onChangedCheckedCount.event;
	private readonly _onChangedVisibleCount = new Emitter<number>();
	onChangedVisibleCount: Event<number> = this._onChangedVisibleCount.event;
	private readonly _onChangedCheckedElements = new Emitter<IQuickPickItem[]>();
	onChangedCheckedElements: Event<IQuickPickItem[]> = this._onChangedCheckedElements.event;
	private readonly _onButtonTriggered = new Emitter<IQuickPickItemButtonEvent<IQuickPickItem>>();
	onButtonTriggered = this._onButtonTriggered.event;
	private readonly _onSeparatorButtonTriggered = new Emitter<IQuickPickSeparatorButtonEvent>();
	onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;
	private readonly _onKeyDown = new Emitter<StandardKeyboardEvent>();
	onKeyDown: Event<StandardKeyboardEvent> = this._onKeyDown.event;
	private readonly _onLeave = new Emitter<void>();
	onLeave: Event<void> = this._onLeave.event;
	private readonly _listElementChecked = new Emitter<{ listElement: IListElement; checked: boolean }>();
	private _fireCheckedEvents = true;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];
	private _lastHover: IHoverWidget | undefined;
	private _toggleHover: IDisposable | undefined;

	constructor(
		private parent: HTMLElement,
		id: string,
		private options: IQuickInputOptions,
		themeService: IThemeService
	) {
		this.id = id;
		this.container = dom.append(this.parent, $('.quick-input-list'));
		const delegate = new ListElementDelegate();
		const accessibilityProvider = new QuickInputAccessibilityProvider();
		this.list = options.createList('QuickInput', this.container, delegate, [new ListElementRenderer(themeService)], {
			identityProvider: {
				getId: element => {
					// always prefer item over separator because if item is defined, it must be the main item type
					// always prefer a defined id if one was specified and use label as a fallback
					return element.item?.id
						?? element.item?.label
						?? element.separator?.id
						?? element.separator?.label
						?? '';
				}
			},
			setRowLineHeight: false,
			multipleSelectionSupport: false,
			horizontalScrolling: false,
			accessibilityProvider
		} as IListOptions<IListElement>);
		this.list.getHTMLElement().id = id;
		this.disposables.push(this.list);
		this.disposables.push(this.list.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggleCheckbox();
					break;
				case KeyCode.KeyA:
					if (platform.isMacintosh ? e.metaKey : e.ctrlKey) {
						this.list.setFocus(range(this.list.length));
					}
					break;
				case KeyCode.UpArrow: {
					const focus1 = this.list.getFocus();
					if (focus1.length === 1 && focus1[0] === 0) {
						this._onLeave.fire();
					}
					break;
				}
				case KeyCode.DownArrow: {
					const focus2 = this.list.getFocus();
					if (focus2.length === 1 && focus2[0] === this.list.length - 1) {
						this._onLeave.fire();
					}
					break;
				}
			}

			this._onKeyDown.fire(event);
		}));
		this.disposables.push(this.list.onMouseDown(e => {
			if (e.browserEvent.button !== 2) {
				// Works around / fixes #64350.
				e.browserEvent.preventDefault();
			}
		}));
		this.disposables.push(dom.addDisposableListener(this.container, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space' on checkbox.
				this._onLeave.fire();
			}
		}));
		this.disposables.push(this.list.onMouseMiddleClick(e => {
			this._onLeave.fire();
		}));
		this.disposables.push(this.list.onContextMenu(e => {
			if (typeof e.index === 'number') {
				e.browserEvent.preventDefault();

				// we want to treat a context menu event as
				// a gesture to open the item at the index
				// since we do not have any context menu
				// this enables for example macOS to Ctrl-
				// click on an item to open it.
				this.list.setSelection([e.index]);
			}
		}));

		if (options.hoverDelegate) {
			const delayer = new ThrottledDelayer(options.hoverDelegate.delay);
			// onMouseOver triggers every time a new element has been moused over
			// even if it's on the same list item.
			this.disposables.push(this.list.onMouseOver(async e => {
				// If we hover over an anchor element, we don't want to show the hover because
				// the anchor may have a tooltip that we want to show instead.
				if (e.browserEvent.target instanceof HTMLAnchorElement) {
					delayer.cancel();
					return;
				}
				if (
					// anchors are an exception as called out above so we skip them here
					!(e.browserEvent.relatedTarget instanceof HTMLAnchorElement) &&
					// check if the mouse is still over the same element
					dom.isAncestor(e.browserEvent.relatedTarget as Node, e.element?.element as Node)
				) {
					return;
				}
				try {
					await delayer.trigger(async () => {
						if (e.element) {
							this.showHover(e.element);
						}
					});
				} catch (e) {
					// Ignore cancellation errors due to mouse out
					if (!isCancellationError(e)) {
						throw e;
					}
				}
			}));
			this.disposables.push(this.list.onMouseOut(e => {
				// onMouseOut triggers every time a new element has been moused over
				// even if it's on the same list item. We only want one event, so we
				// check if the mouse is still over the same element.
				if (dom.isAncestor(e.browserEvent.relatedTarget as Node, e.element?.element as Node)) {
					return;
				}
				delayer.cancel();
			}));
			this.disposables.push(delayer);
		}
		this.disposables.push(this._listElementChecked.event(_ => this.fireCheckedEvents()));
		this.disposables.push(
			this._onChangedAllVisibleChecked,
			this._onChangedCheckedCount,
			this._onChangedVisibleCount,
			this._onChangedCheckedElements,
			this._onButtonTriggered,
			this._onSeparatorButtonTriggered,
			this._onLeave,
			this._onKeyDown
		);
	}

	@memoize
	get onDidChangeFocus() {
		return Event.map(this.list.onDidChangeFocus, e => e.elements.map(e => e.item));
	}

	@memoize
	get onDidChangeSelection() {
		return Event.map(this.list.onDidChangeSelection, e => ({ items: e.elements.map(e => e.item), event: e.browserEvent }));
	}

	get scrollTop() {
		return this.list.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.list.scrollTop = scrollTop;
	}

	get ariaLabel() {
		return this.list.getHTMLElement().ariaLabel;
	}

	set ariaLabel(label: string | null) {
		this.list.getHTMLElement().ariaLabel = label;
	}

	getAllVisibleChecked() {
		return this.allVisibleChecked(this.elements, false);
	}

	private allVisibleChecked(elements: IListElement[], whenNoneVisible = true) {
		for (let i = 0, n = elements.length; i < n; i++) {
			const element = elements[i];
			if (!element.hidden) {
				if (!element.checked) {
					return false;
				} else {
					whenNoneVisible = true;
				}
			}
		}
		return whenNoneVisible;
	}

	getCheckedCount() {
		let count = 0;
		const elements = this.elements;
		for (let i = 0, n = elements.length; i < n; i++) {
			if (elements[i].checked) {
				count++;
			}
		}
		return count;
	}

	getVisibleCount() {
		let count = 0;
		const elements = this.elements;
		for (let i = 0, n = elements.length; i < n; i++) {
			if (!elements[i].hidden) {
				count++;
			}
		}
		return count;
	}

	setAllVisibleChecked(checked: boolean) {
		try {
			this._fireCheckedEvents = false;
			this.elements.forEach(element => {
				if (!element.hidden) {
					element.checked = checked;
				}
			});
		} finally {
			this._fireCheckedEvents = true;
			this.fireCheckedEvents();
		}
	}

	setElements(inputElements: Array<QuickPickItem>): void {
		this.elementDisposables = dispose(this.elementDisposables);
		const fireButtonTriggered = (event: IQuickPickItemButtonEvent<IQuickPickItem>) => this.fireButtonTriggered(event);
		const fireSeparatorButtonTriggered = (event: IQuickPickSeparatorButtonEvent) => this.fireSeparatorButtonTriggered(event);
		this.inputElements = inputElements;
		const elementsToIndexes = new Map<QuickPickItem, number>();
		const hasCheckbox = this.parent.classList.contains('show-checkboxes');
		this.elements = inputElements.reduce((result, item, index) => {
			const previous = index > 0 ? inputElements[index - 1] : undefined;
			if (item.type === 'separator') {
				if (!item.buttons) {
					// This separator will be rendered as a part of the list item
					return result;
				}
			}

			const element = new ListElement(
				item,
				previous,
				index,
				hasCheckbox,
				fireButtonTriggered,
				fireSeparatorButtonTriggered,
				this._listElementChecked
			);

			const resultIndex = result.length;
			result.push(element);
			elementsToIndexes.set(element.item ?? element.separator!, resultIndex);
			return result;
		}, [] as IListElement[]);
		this.elementsToIndexes = elementsToIndexes;
		this.list.splice(0, this.list.length); // Clear focus and selection first, sending the events when the list is empty.
		this.list.splice(0, this.list.length, this.elements);
		this._onChangedVisibleCount.fire(this.elements.length);
	}

	getElementsCount(): number {
		return this.inputElements.length;
	}

	getFocusedElements() {
		return this.list.getFocusedElements()
			.map(e => e.item);
	}

	setFocusedElements(items: IQuickPickItem[]) {
		this.list.setFocus(items
			.filter(item => this.elementsToIndexes.has(item))
			.map(item => this.elementsToIndexes.get(item)!));
		if (items.length > 0) {
			const focused = this.list.getFocus()[0];
			if (typeof focused === 'number') {
				this.list.reveal(focused);
			}
		}
	}

	getActiveDescendant() {
		return this.list.getHTMLElement().getAttribute('aria-activedescendant');
	}

	getSelectedElements() {
		return this.list.getSelectedElements()
			.map(e => e.item);
	}

	setSelectedElements(items: IQuickPickItem[]) {
		this.list.setSelection(items
			.filter(item => this.elementsToIndexes.has(item))
			.map(item => this.elementsToIndexes.get(item)!));
	}

	getCheckedElements() {
		return this.elements.filter(e => e.checked)
			.map(e => e.item)
			.filter(e => !!e) as IQuickPickItem[];
	}

	setCheckedElements(items: IQuickPickItem[]) {
		try {
			this._fireCheckedEvents = false;
			const checked = new Set();
			for (const item of items) {
				checked.add(item);
			}
			for (const element of this.elements) {
				element.checked = checked.has(element.item);
			}
		} finally {
			this._fireCheckedEvents = true;
			this.fireCheckedEvents();
		}
	}

	set enabled(value: boolean) {
		this.list.getHTMLElement().style.pointerEvents = value ? '' : 'none';
	}

	focus(what: QuickInputListFocus): void {
		if (!this.list.length) {
			return;
		}

		if (what === QuickInputListFocus.Second && this.list.length < 2) {
			what = QuickInputListFocus.First;
		}

		switch (what) {
			case QuickInputListFocus.First:
				this.list.scrollTop = 0;
				this.list.focusFirst(undefined, (e) => !!e.item);
				break;
			case QuickInputListFocus.Second:
				this.list.scrollTop = 0;
				this.list.focusNth(1, undefined, (e) => !!e.item);
				break;
			case QuickInputListFocus.Last:
				this.list.scrollTop = this.list.scrollHeight;
				this.list.focusLast(undefined, (e) => !!e.item);
				break;
			case QuickInputListFocus.Next: {
				this.list.focusNext(undefined, true, undefined, (e) => !!e.item);
				const index = this.list.getFocus()[0];
				if (index !== 0 && !this.elements[index - 1].item && this.list.firstVisibleIndex > index - 1) {
					this.list.reveal(index - 1);
				}
				break;
			}
			case QuickInputListFocus.Previous: {
				this.list.focusPrevious(undefined, true, undefined, (e) => !!e.item);
				const index = this.list.getFocus()[0];
				if (index !== 0 && !this.elements[index - 1].item && this.list.firstVisibleIndex > index - 1) {
					this.list.reveal(index - 1);
				}
				break;
			}
			case QuickInputListFocus.NextPage:
				this.list.focusNextPage(undefined, (e) => !!e.item);
				break;
			case QuickInputListFocus.PreviousPage:
				this.list.focusPreviousPage(undefined, (e) => !!e.item);
				break;
		}

		const focused = this.list.getFocus()[0];
		if (typeof focused === 'number') {
			this.list.reveal(focused);
		}
	}

	clearFocus() {
		this.list.setFocus([]);
	}

	domFocus() {
		this.list.domFocus();
	}

	/**
	 * Disposes of the hover and shows a new one for the given index if it has a tooltip.
	 * @param element The element to show the hover for
	 */
	private showHover(element: IListElement): void {
		if (this.options.hoverDelegate === undefined) {
			return;
		}
		if (this._lastHover && !this._lastHover.isDisposed) {
			this.options.hoverDelegate.onDidHideHover?.();
			this._lastHover?.dispose();
		}

		if (!element.element || !element.saneTooltip) {
			return;
		}
		this._lastHover = this.options.hoverDelegate.showHover({
			content: element.saneTooltip!,
			target: element.element!,
			linkHandler: (url) => {
				this.options.linkOpenerDelegate(url);
			},
			showPointer: true,
			container: this.container,
			hoverPosition: HoverPosition.RIGHT
		}, false);
	}

	layout(maxHeight?: number): void {
		this.list.getHTMLElement().style.maxHeight = maxHeight ? `${
			// Make sure height aligns with list item heights
			Math.floor(maxHeight / 44) * 44
			// Add some extra height so that it's clear there's more to scroll
			+ 6
			}px` : '';
		this.list.layout();
	}

	filter(query: string): boolean {
		if (!(this.sortByLabel || this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
			this.list.layout();
			return false;
		}

		const queryWithWhitespace = query;
		query = query.trim();

		// Reset filtering
		if (!query || !(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
			this.elements.forEach(element => {
				element.labelHighlights = undefined;
				element.descriptionHighlights = undefined;
				element.detailHighlights = undefined;
				element.hidden = false;
				const previous = element.index && this.inputElements[element.index - 1];
				if (element.item) {
					element.separator = previous && previous.type === 'separator' && !previous.buttons ? previous : undefined;
				}
			});
		}

		// Filter by value (since we support icons in labels, use $(..) aware fuzzy matching)
		else {
			let currentSeparator: IQuickPickSeparator | undefined;
			this.elements.forEach(element => {
				let labelHighlights: IMatch[] | undefined;
				if (this.matchOnLabelMode === 'fuzzy') {
					labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
				} else {
					labelHighlights = this.matchOnLabel ? matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
				}
				const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || '')) ?? undefined : undefined;
				const detailHighlights = this.matchOnDetail ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || '')) ?? undefined : undefined;

				if (labelHighlights || descriptionHighlights || detailHighlights) {
					element.labelHighlights = labelHighlights;
					element.descriptionHighlights = descriptionHighlights;
					element.detailHighlights = detailHighlights;
					element.hidden = false;
				} else {
					element.labelHighlights = undefined;
					element.descriptionHighlights = undefined;
					element.detailHighlights = undefined;
					element.hidden = element.item ? !element.item.alwaysShow : true;
				}

				// Ensure separators are filtered out first before deciding if we need to bring them back
				if (element.item) {
					element.separator = undefined;
				} else if (element.separator) {
					element.hidden = true;
				}

				// we can show the separator unless the list gets sorted by match
				if (!this.sortByLabel) {
					const previous = element.index && this.inputElements[element.index - 1];
					currentSeparator = previous && previous.type === 'separator' ? previous : currentSeparator;
					if (currentSeparator && !element.hidden) {
						element.separator = currentSeparator;
						currentSeparator = undefined;
					}
				}
			});
		}

		const shownElements = this.elements.filter(element => !element.hidden);

		// Sort by value
		if (this.sortByLabel && query) {
			const normalizedSearchValue = query.toLowerCase();
			shownElements.sort((a, b) => {
				return compareEntries(a, b, normalizedSearchValue);
			});
		}

		this.elementsToIndexes = shownElements.reduce((map, element, index) => {
			map.set(element.item ?? element.separator!, index);
			return map;
		}, new Map<QuickPickItem, number>());
		this.list.splice(0, this.list.length, shownElements);
		this.list.setFocus([]);
		this.list.layout();

		this._onChangedAllVisibleChecked.fire(this.getAllVisibleChecked());
		this._onChangedVisibleCount.fire(shownElements.length);

		return true;
	}

	toggleCheckbox() {
		try {
			this._fireCheckedEvents = false;
			const elements = this.list.getFocusedElements();
			const allChecked = this.allVisibleChecked(elements);
			for (const element of elements) {
				element.checked = !allChecked;
			}
		} finally {
			this._fireCheckedEvents = true;
			this.fireCheckedEvents();
		}
	}

	display(display: boolean) {
		this.container.style.display = display ? '' : 'none';
	}

	isDisplayed() {
		return this.container.style.display !== 'none';
	}

	dispose() {
		this.elementDisposables = dispose(this.elementDisposables);
		this.disposables = dispose(this.disposables);
	}

	private fireCheckedEvents() {
		if (this._fireCheckedEvents) {
			this._onChangedAllVisibleChecked.fire(this.getAllVisibleChecked());
			this._onChangedCheckedCount.fire(this.getCheckedCount());
			this._onChangedCheckedElements.fire(this.getCheckedElements());
		}
	}

	private fireButtonTriggered(event: IQuickPickItemButtonEvent<IQuickPickItem>) {
		this._onButtonTriggered.fire(event);
	}

	private fireSeparatorButtonTriggered(event: IQuickPickSeparatorButtonEvent) {
		this._onSeparatorButtonTriggered.fire(event);
	}

	style(styles: IListStyles) {
		this.list.style(styles);
	}

	toggleHover() {
		const element: IListElement | undefined = this.list.getFocusedElements()[0];
		if (!element?.saneTooltip) {
			return;
		}

		// if there's a hover already, hide it (toggle off)
		if (this._lastHover && !this._lastHover.isDisposed) {
			this._lastHover.dispose();
			return;
		}

		// If there is no hover, show it (toggle on)
		const focused = this.list.getFocusedElements()[0];
		if (!focused) {
			return;
		}
		this.showHover(focused);
		const store = new DisposableStore();
		store.add(this.list.onDidChangeFocus(e => {
			if (e.indexes.length) {
				this.showHover(e.elements[0]);
			}
		}));
		if (this._lastHover) {
			store.add(this._lastHover);
		}
		this._toggleHover = store;
		this.elementDisposables.push(this._toggleHover);
	}
}

function matchesContiguousIconAware(query: string, target: IParsedLabelWithIcons): IMatch[] | null {

	const { text, iconOffsets } = target;

	// Return early if there are no icon markers in the word to match against
	if (!iconOffsets || iconOffsets.length === 0) {
		return matchesContiguous(query, text);
	}

	// Trim the word to match against because it could have leading
	// whitespace now if the word started with an icon
	const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, ' ');
	const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;

	// match on value without icon
	const matches = matchesContiguous(query, wordToMatchAgainstWithoutIconsTrimmed);

	// Map matches back to offsets with icon and trimming
	if (matches) {
		for (const match of matches) {
			const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] /* icon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
			match.start += iconOffset;
			match.end += iconOffset;
		}
	}

	return matches;
}

function matchesContiguous(word: string, wordToMatchAgainst: string): IMatch[] | null {
	const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
	if (matchIndex !== -1) {
		return [{ start: matchIndex, end: matchIndex + word.length }];
	}
	return null;
}

function compareEntries(elementA: IListElement, elementB: IListElement, lookFor: string): number {

	const labelHighlightsA = elementA.labelHighlights || [];
	const labelHighlightsB = elementB.labelHighlights || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	if (labelHighlightsA.length === 0 && labelHighlightsB.length === 0) {
		return 0;
	}

	return compareAnything(elementA.saneSortLabel, elementB.saneSortLabel, lookFor);
}

class QuickInputAccessibilityProvider implements IListAccessibilityProvider<IListElement> {

	getWidgetAriaLabel(): string {
		return localize('quickInput', "Quick Input");
	}

	getAriaLabel(element: IListElement): string | null {
		return element.separator?.label
			? `${element.saneAriaLabel}, ${element.separator.label}`
			: element.saneAriaLabel;
	}

	getWidgetRole(): AriaRole {
		return 'listbox';
	}

	getRole(element: IListElement) {
		return element.hasCheckbox ? 'checkbox' : 'option';
	}

	isChecked(element: IListElement) {
		if (!element.hasCheckbox) {
			return undefined;
		}

		return {
			value: element.checked,
			onDidChange: element.onChecked
		};
	}
}
