/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/quickInput';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IMatch } from 'vs/base/common/filters';
import { matchesFuzzyOcticonAware, parseOcticons } from 'vs/base/common/octicon';
import { compareAnything } from 'vs/base/common/comparers';
import { Emitter, Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { memoize } from 'vs/base/common/decorators';
import { range } from 'vs/base/common/arrays';
import * as platform from 'vs/base/common/platform';
import { listFocusBackground, pickerGroupBorder, pickerGroupForeground, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { getIconClass } from 'vs/workbench/browser/parts/quickinput/quickInputUtils';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { withNullAsUndefined } from 'vs/base/common/types';

const $ = dom.$;

interface IListElement {
	readonly index: number;
	readonly item: IQuickPickItem;
	readonly saneLabel: string;
	readonly saneDescription?: string;
	readonly saneDetail?: string;
	readonly checked: boolean;
	readonly separator?: IQuickPickSeparator;
	readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
}

class ListElement implements IListElement {
	index: number;
	item: IQuickPickItem;
	saneLabel: string;
	saneDescription?: string;
	saneDetail?: string;
	hidden = false;
	private _onChecked = new Emitter<boolean>();
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
	fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;

	constructor(init: IListElement) {
		assign(this, init);
	}
}

interface IListElementTemplateData {
	entry: HTMLDivElement;
	checkbox: HTMLInputElement;
	label: IconLabel;
	detail: HighlightedLabel;
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
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportOcticons: true });

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
		data.detail = new HighlightedLabel(detailContainer, true);

		// Separator
		data.separator = dom.append(data.entry, $('.quick-input-list-separator'));

		// Actions
		data.actionBar = new ActionBar(data.entry);
		data.actionBar.domNode.classList.add('quick-input-list-entry-action-bar');
		data.toDisposeTemplate.push(data.actionBar);

		return data;
	}

	renderElement(element: ListElement, index: number, data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.element = element;
		data.checkbox.checked = element.checked;
		data.toDisposeElement.push(element.onChecked(checked => data.checkbox.checked = checked));

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		// Label
		const options: IIconLabelValueOptions = Object.create(null);
		options.matches = labelHighlights || [];
		options.descriptionTitle = element.saneDescription;
		options.descriptionMatches = descriptionHighlights || [];
		options.extraClasses = element.item.iconClasses;
		data.label.setLabel(element.saneLabel, element.saneDescription, options);

		// Meta
		data.detail.set(element.saneDetail, detailHighlights);

		// ARIA label
		data.entry.setAttribute('aria-label', [element.saneLabel, element.saneDescription, element.saneDetail]
			.map(s => s && parseOcticons(s).text)
			.filter(s => !!s)
			.join(', '));

		// Separator
		if (element.separator && element.separator.label) {
			data.separator.textContent = element.separator.label;
			data.separator.style.display = null;
		} else {
			data.separator.style.display = 'none';
		}
		if (element.separator) {
			dom.addClass(data.entry, 'quick-input-list-separator-border');
		} else {
			dom.removeClass(data.entry, 'quick-input-list-separator-border');
		}

		// Actions
		data.actionBar.clear();
		const buttons = element.item.buttons;
		if (buttons && buttons.length) {
			data.actionBar.push(buttons.map((button, index) => {
				const action = new Action(`id-${index}`, '', button.iconClass || (button.iconPath ? getIconClass(button.iconPath) : undefined), true, () => {
					element.fireButtonTriggered({
						button,
						item: element.item
					});
					return Promise.resolve();
				});
				action.tooltip = button.tooltip || '';
				return action;
			}), { icon: true, label: false });
			dom.addClass(data.entry, 'has-actions');
		} else {
			dom.removeClass(data.entry, 'has-actions');
		}
	}

	disposeElement(element: ListElement, index: number, data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
	}

	disposeTemplate(data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class ListElementDelegate implements IListVirtualDelegate<ListElement> {

	getHeight(element: ListElement): number {
		return element.saneDetail ? 44 : 22;
	}

	getTemplateId(element: ListElement): string {
		return ListElementRenderer.ID;
	}
}

export class QuickInputList {

	readonly id: string;
	private container: HTMLElement;
	private list: WorkbenchList<ListElement>;
	private inputElements: Array<IQuickPickItem | IQuickPickSeparator>;
	private elements: ListElement[] = [];
	private elementsToIndexes = new Map<IQuickPickItem, number>();
	matchOnDescription = false;
	matchOnDetail = false;
	matchOnLabel = true;
	private _onChangedAllVisibleChecked = new Emitter<boolean>();
	onChangedAllVisibleChecked: Event<boolean> = this._onChangedAllVisibleChecked.event;
	private _onChangedCheckedCount = new Emitter<number>();
	onChangedCheckedCount: Event<number> = this._onChangedCheckedCount.event;
	private _onChangedVisibleCount = new Emitter<number>();
	onChangedVisibleCount: Event<number> = this._onChangedVisibleCount.event;
	private _onChangedCheckedElements = new Emitter<IQuickPickItem[]>();
	onChangedCheckedElements: Event<IQuickPickItem[]> = this._onChangedCheckedElements.event;
	private _onButtonTriggered = new Emitter<IQuickPickItemButtonEvent<IQuickPickItem>>();
	onButtonTriggered = this._onButtonTriggered.event;
	private _onLeave = new Emitter<void>();
	onLeave: Event<void> = this._onLeave.event;
	private _fireCheckedEvents = true;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		id: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.id = id;
		this.container = dom.append(this.parent, $('.quick-input-list'));
		const delegate = new ListElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new ListElementRenderer()], {
			identityProvider: { getId: element => element.saneLabel },
			openController: { shouldOpen: () => false }, // Workaround #58124
			setRowLineHeight: false,
			multipleSelectionSupport: false,
			horizontalScrolling: false
		} as IListOptions<ListElement>);
		this.list.getHTMLElement().id = id;
		this.disposables.push(this.list);
		this.disposables.push(this.list.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggleCheckbox();
					break;
				case KeyCode.KEY_A:
					if (platform.isMacintosh ? e.metaKey : e.ctrlKey) {
						this.list.setFocus(range(this.list.length));
					}
					break;
				case KeyCode.UpArrow:
				case KeyCode.PageUp:
					const focus1 = this.list.getFocus();
					if (focus1.length === 1 && focus1[0] === 0) {
						this._onLeave.fire();
					}
					break;
				case KeyCode.DownArrow:
				case KeyCode.PageDown:
					const focus2 = this.list.getFocus();
					if (focus2.length === 1 && focus2[0] === this.list.length - 1) {
						this._onLeave.fire();
					}
					break;
			}
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
	}

	@memoize
	get onDidChangeFocus() {
		return Event.map(this.list.onFocusChange, e => e.elements.map(e => e.item));
	}

	@memoize
	get onDidChangeSelection() {
		return Event.map(this.list.onSelectionChange, e => e.elements.map(e => e.item));
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

	setElements(inputElements: Array<IQuickPickItem | IQuickPickSeparator>): void {
		this.elementDisposables = dispose(this.elementDisposables);
		const fireButtonTriggered = (event: IQuickPickItemButtonEvent<IQuickPickItem>) => this.fireButtonTriggered(event);
		this.inputElements = inputElements;
		this.elements = inputElements.reduce((result, item, index) => {
			if (item.type !== 'separator') {
				const previous = index && inputElements[index - 1];
				result.push(new ListElement({
					index,
					item,
					saneLabel: item.label && item.label.replace(/\r?\n/g, ' '),
					saneDescription: item.description && item.description.replace(/\r?\n/g, ' '),
					saneDetail: item.detail && item.detail.replace(/\r?\n/g, ' '),
					checked: false,
					separator: previous && previous.type === 'separator' ? previous : undefined,
					fireButtonTriggered
				}));
			}
			return result;
		}, [] as ListElement[]);
		this.elementDisposables.push(...this.elements.map(element => element.onChecked(() => this.fireCheckedEvents())));

		this.elementsToIndexes = this.elements.reduce((map, element, index) => {
			map.set(element.item, index);
			return map;
		}, new Map<IQuickPickItem, number>());
		this.list.splice(0, this.list.length); // Clear focus and selection first, sending the events when the list is empty.
		this.list.splice(0, this.list.length, this.elements);
		this._onChangedVisibleCount.fire(this.elements.length);
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
			this.list.reveal(this.list.getFocus()[0]);
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
			.map(e => e.item);
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
		this.list.getHTMLElement().style.pointerEvents = value ? null : 'none';
	}

	focus(what: 'First' | 'Last' | 'Next' | 'Previous' | 'NextPage' | 'PreviousPage'): void {
		if (!this.list.length) {
			return;
		}

		if ((what === 'Next' || what === 'NextPage') && this.list.getFocus()[0] === this.list.length - 1) {
			what = 'First';
		}
		if ((what === 'Previous' || what === 'PreviousPage') && this.list.getFocus()[0] === 0) {
			what = 'Last';
		}

		(this.list as any)['focus' + what]();
		this.list.reveal(this.list.getFocus()[0]);
	}

	clearFocus() {
		this.list.setFocus([]);
	}

	domFocus() {
		this.list.domFocus();
	}

	layout(): void {
		this.list.layout();
	}

	filter(query: string) {
		if (!(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
			return;
		}
		query = query.trim();

		// Reset filtering
		if (!query) {
			this.elements.forEach(element => {
				element.labelHighlights = undefined;
				element.descriptionHighlights = undefined;
				element.detailHighlights = undefined;
				element.hidden = false;
				const previous = element.index && this.inputElements[element.index - 1];
				element.separator = previous && previous.type === 'separator' ? previous : undefined;
			});
		}

		// Filter by value (since we support octicons, use octicon aware fuzzy matching)
		else {
			this.elements.forEach(element => {
				const labelHighlights = this.matchOnLabel ? withNullAsUndefined(matchesFuzzyOcticonAware(query, parseOcticons(element.saneLabel))) : undefined;
				const descriptionHighlights = this.matchOnDescription ? withNullAsUndefined(matchesFuzzyOcticonAware(query, parseOcticons(element.saneDescription || ''))) : undefined;
				const detailHighlights = this.matchOnDetail ? withNullAsUndefined(matchesFuzzyOcticonAware(query, parseOcticons(element.saneDetail || ''))) : undefined;

				if (labelHighlights || descriptionHighlights || detailHighlights) {
					element.labelHighlights = labelHighlights;
					element.descriptionHighlights = descriptionHighlights;
					element.detailHighlights = detailHighlights;
					element.hidden = false;
				} else {
					element.labelHighlights = undefined;
					element.descriptionHighlights = undefined;
					element.detailHighlights = undefined;
					element.hidden = !element.item.alwaysShow;
				}
				element.separator = undefined;
			});
		}

		const shownElements = this.elements.filter(element => !element.hidden);

		// Sort by value
		if (query) {
			const normalizedSearchValue = query.toLowerCase();
			shownElements.sort((a, b) => {
				return compareEntries(a, b, normalizedSearchValue);
			});
		}

		this.elementsToIndexes = shownElements.reduce((map, element, index) => {
			map.set(element.item, index);
			return map;
		}, new Map<IQuickPickItem, number>());
		this.list.splice(0, this.list.length, shownElements);
		this.list.setFocus([]);
		this.list.layout();

		this._onChangedAllVisibleChecked.fire(this.getAllVisibleChecked());
		this._onChangedVisibleCount.fire(shownElements.length);
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

	return compareAnything(elementA.saneLabel, elementB.saneLabel, lookFor);
}

registerThemingParticipant((theme, collector) => {
	// Override inactive focus background with active focus background for single-pick case.
	const listInactiveFocusBackground = theme.getColor(listFocusBackground);
	if (listInactiveFocusBackground) {
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row.focused { background-color:  ${listInactiveFocusBackground}; }`);
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row.focused:hover { background-color:  ${listInactiveFocusBackground}; }`);
	}
	const activeContrast = theme.getColor(activeContrastBorder);
	if (activeContrast) {
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row.focused { border: 1px dotted ${activeContrast}; }`);
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row { border: 1px solid transparent; }`);
		collector.addRule(`.quick-input-list .monaco-list .quick-input-list-entry { padding: 0 5px; height: 18px; align-items: center; }`);
		collector.addRule(`.quick-input-list .monaco-list .quick-input-list-entry-action-bar { margin-top: 0; }`);
	}
	const pickerGroupBorderColor = theme.getColor(pickerGroupBorder);
	if (pickerGroupBorderColor) {
		collector.addRule(`.quick-input-list .quick-input-list-entry { border-top-color:  ${pickerGroupBorderColor}; }`);
	}
	const pickerGroupForegroundColor = theme.getColor(pickerGroupForeground);
	if (pickerGroupForegroundColor) {
		collector.addRule(`.quick-input-list .quick-input-list-separator { color:  ${pickerGroupForegroundColor}; }`);
	}
});
