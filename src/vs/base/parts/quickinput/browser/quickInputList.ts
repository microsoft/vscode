/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider, IListOptions, IListStyles, List } from 'vs/base/browser/ui/list/listWidget';
import { Action } from 'vs/base/common/actions';
import { range } from 'vs/base/common/arrays';
import { getCodiconAriaLabel } from 'vs/base/common/codicons';
import { compareAnything } from 'vs/base/common/comparers';
import { memoize } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { IMatch } from 'vs/base/common/filters';
import { IParsedLabelWithIcons, matchesFuzzyIconAware, parseLabelWithIcons } from 'vs/base/common/iconLabels';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { ltrim } from 'vs/base/common/strings';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IQuickInputOptions } from 'vs/base/parts/quickinput/browser/quickInput';
import { getIconClass } from 'vs/base/parts/quickinput/browser/quickInputUtils';
import { QuickPickItem, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickPickSeparatorButtonEvent } from 'vs/base/parts/quickinput/common/quickInput';
import 'vs/css!./media/quickInput';
import { localize } from 'vs/nls';

const $ = dom.$;

interface IListElement {
	readonly hasCheckbox: boolean;
	readonly index: number;
	readonly item?: IQuickPickItem;
	readonly saneLabel: string;
	readonly saneSortLabel: string;
	readonly saneMeta?: string;
	readonly saneAriaLabel: string;
	readonly saneDescription?: string;
	readonly saneDetail?: string;
	readonly labelHighlights?: IMatch[];
	readonly descriptionHighlights?: IMatch[];
	readonly detailHighlights?: IMatch[];
	readonly checked: boolean;
	readonly separator?: IQuickPickSeparator;
	readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
	readonly fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void;
}

class ListElement implements IListElement, IDisposable {
	hasCheckbox!: boolean;
	index!: number;
	item?: IQuickPickItem;
	saneLabel!: string;
	saneSortLabel!: string;
	saneMeta!: string;
	saneAriaLabel!: string;
	saneDescription?: string;
	saneDetail?: string;
	hidden = false;
	private readonly _onChecked = new Emitter<boolean>();
	onChecked = this._onChecked.event;
	_checked?: boolean;
	get checked() {
		return !!this._checked;
	}
	set checked(value: boolean) {
		if (value !== this._checked) {
			this._checked = value;
			this._onChecked.fire(value);
		}
	}
	separator?: IQuickPickSeparator;
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];
	fireButtonTriggered!: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
	fireSeparatorButtonTriggered!: (event: IQuickPickSeparatorButtonEvent) => void;

	constructor(init: IListElement) {
		Object.assign(this, init);
	}

	dispose() {
		this._onChecked.dispose();
	}
}

interface IListElementTemplateData {
	entry: HTMLDivElement;
	checkbox: HTMLInputElement;
	label: IconLabel;
	keybinding: KeybindingLabel;
	detail: IconLabel;
	separator: HTMLDivElement;
	actionBar: ActionBar;
	element: ListElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class ListElementRenderer implements IListRenderer<ListElement, IListElementTemplateData> {

	static readonly ID = 'listelement';

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

		// Keybinding
		const keybindingContainer = dom.append(row1, $('.quick-input-list-entry-keybinding'));
		data.keybinding = new KeybindingLabel(keybindingContainer, platform.OS);

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
		data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true });

		// Separator
		data.separator = dom.append(data.entry, $('.quick-input-list-separator'));

		// Actions
		data.actionBar = new ActionBar(data.entry);
		data.actionBar.domNode.classList.add('quick-input-list-entry-action-bar');
		data.toDisposeTemplate.push(data.actionBar);

		return data;
	}

	renderElement(element: ListElement, index: number, data: IListElementTemplateData): void {
		data.element = element;
		const mainItem: QuickPickItem = element.item ? element.item : element.separator!;

		data.checkbox.checked = element.checked;
		data.toDisposeElement.push(element.onChecked(checked => data.checkbox.checked = checked));

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		// Label
		const options: IIconLabelValueOptions = Object.create(null);
		options.matches = labelHighlights || [];
		options.descriptionTitle = element.saneDescription;
		options.descriptionMatches = descriptionHighlights || [];
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

		// Meta
		if (element.saneDetail) {
			data.detail.setLabel(element.saneDetail, undefined, {
				matches: detailHighlights,
				title: element.saneDetail
			});
		} /* else {
			// TODO investigate potential detail bleeding into next quickpicks
			data.detail.setLabel('');
		} */

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
			data.actionBar.push(buttons.map((button, index) => {
				let cssClasses = button.iconClass || (button.iconPath ? getIconClass(button.iconPath) : undefined);
				if (button.alwaysVisible) {
					cssClasses = cssClasses ? `${cssClasses} always-visible` : 'always-visible';
				}
				const action = new Action(`id-${index}`, '', cssClasses, true, async () => {
					mainItem.type !== 'separator'
						? element.fireButtonTriggered({
							button,
							item: mainItem
						})
						: element.fireSeparatorButtonTriggered({
							button,
							separator: mainItem
						});
				});
				action.tooltip = button.tooltip || '';
				return action;
			}), { icon: true, label: false });
			data.entry.classList.add('has-actions');
		} else {
			data.entry.classList.remove('has-actions');
		}
	}

	disposeElement(element: ListElement, index: number, data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.actionBar.clear();
	}

	disposeTemplate(data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class ListElementDelegate implements IListVirtualDelegate<ListElement> {

	getHeight(element: ListElement): number {
		if (!element.item) {
			// must be a separator
			return 24;
		}
		return element.saneDetail ? 44 : 22;
	}

	getTemplateId(element: ListElement): string {
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
	private list: List<ListElement>;
	private inputElements: Array<QuickPickItem> = [];
	private elements: ListElement[] = [];
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
	private _fireCheckedEvents = true;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		id: string,
		options: IQuickInputOptions,
	) {
		this.id = id;
		this.container = dom.append(this.parent, $('.quick-input-list'));

		const delegate = new ListElementDelegate();
		const accessibilityProvider = new QuickInputAccessibilityProvider();
		this.list = options.createList('QuickInput', this.container, delegate, [new ListElementRenderer()], {
			identityProvider: { getId: element => element.saneLabel },
			setRowLineHeight: false,
			multipleSelectionSupport: false,
			horizontalScrolling: false,
			accessibilityProvider
		} as IListOptions<ListElement>);
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

	getAllVisibleChecked() {
		return this.allVisibleChecked(this.elements, false);
	}

	private allVisibleChecked(elements: ListElement[], whenNoneVisible = true) {
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
		this.elements = inputElements.reduce((result, item, index) => {
			const previous = index && inputElements[index - 1];
			const saneLabel = item.label ? item.label.replace(/\r?\n/g, ' ') : '';
			const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();

			let saneMeta, saneDescription, saneDetail, labelHighlights, descriptionHighlights, detailHighlights;
			if (item.type !== 'separator') {
				saneMeta = item.meta && item.meta.replace(/\r?\n/g, ' ');
				saneDescription = item.description && item.description.replace(/\r?\n/g, ' ');
				saneDetail = item.detail && item.detail.replace(/\r?\n/g, ' ');
				labelHighlights = item.highlights?.label;
				descriptionHighlights = item.highlights?.description;
				detailHighlights = item.highlights?.detail;
			}
			const saneAriaLabel = item.ariaLabel || [saneLabel, saneDescription, saneDetail]
				.map(s => getCodiconAriaLabel(s))
				.filter(s => !!s)
				.join(', ');

			const hasCheckbox = this.parent.classList.contains('show-checkboxes');

			let separator: IQuickPickSeparator | undefined;
			if (item.type === 'separator') {
				if (!item.buttons) {
					// This separator will be rendered as a part of the list item
					return result;
				}
				separator = item;
			} else if (previous && previous.type === 'separator' && !previous.buttons) {
				separator = previous;
			}

			result.push(new ListElement({
				hasCheckbox,
				index,
				item: item.type !== 'separator' ? item : undefined,
				saneLabel,
				saneSortLabel,
				saneMeta,
				saneAriaLabel,
				saneDescription,
				saneDetail,
				labelHighlights,
				descriptionHighlights,
				detailHighlights,
				checked: false,
				separator,
				fireButtonTriggered,
				fireSeparatorButtonTriggered
			}));
			return result;
		}, [] as ListElement[]);
		this.elementDisposables.push(...this.elements);
		this.elementDisposables.push(...this.elements.map(element => element.onChecked(() => this.fireCheckedEvents())));

		this.elementsToIndexes = this.elements.reduce((map, element, index) => {
			map.set(element.item ?? element.separator!, index);
			return map;
		}, new Map<QuickPickItem, number>());
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

	layout(maxHeight?: number): void {
		this.list.getHTMLElement().style.maxHeight = maxHeight ? `calc(${Math.floor(maxHeight / 44) * 44}px)` : '';
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
					labelHighlights = this.matchOnLabel ? withNullAsUndefined(matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel))) : undefined;
				} else {
					labelHighlights = this.matchOnLabel ? withNullAsUndefined(matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel))) : undefined;
				}
				const descriptionHighlights = this.matchOnDescription ? withNullAsUndefined(matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || ''))) : undefined;
				const detailHighlights = this.matchOnDetail ? withNullAsUndefined(matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || ''))) : undefined;
				const metaHighlights = this.matchOnMeta ? withNullAsUndefined(matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneMeta || ''))) : undefined;

				if (labelHighlights || descriptionHighlights || detailHighlights || metaHighlights) {
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
}

export function matchesContiguousIconAware(query: string, target: IParsedLabelWithIcons): IMatch[] | null {

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

function compareEntries(elementA: ListElement, elementB: ListElement, lookFor: string): number {

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

class QuickInputAccessibilityProvider implements IListAccessibilityProvider<ListElement> {

	getWidgetAriaLabel(): string {
		return localize('quickInput', "Quick Input");
	}

	getAriaLabel(element: ListElement): string | null {
		return element.separator?.label
			? `${element.saneAriaLabel}, ${element.separator.label}`
			: element.saneAriaLabel;
	}

	getWidgetRole() {
		return 'listbox';
	}

	getRole(element: ListElement) {
		return element.hasCheckbox ? 'checkbox' : 'option';
	}

	isChecked(element: ListElement) {
		if (!element.hasCheckbox) {
			return undefined;
		}

		return {
			value: element.checked,
			onDidChange: element.onChecked
		};
	}
}
