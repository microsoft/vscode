/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { IVirtualDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IMatch } from 'vs/base/common/filters';
import { matchesFuzzyOcticonAware, parseOcticons } from 'vs/base/common/octicon';
import { compareAnything } from 'vs/base/common/comparers';
import { Emitter, Event, mapEvent } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { memoize } from 'vs/base/common/decorators';
import { range } from 'vs/base/common/arrays';
import * as platform from 'vs/base/common/platform';
import { listFocusBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

const $ = dom.$;

interface IListElement {
	index: number;
	item: IQuickPickItem;
	checked: boolean;
}

class ListElement implements IListElement {
	index: number;
	item: IQuickPickItem;
	shouldAlwaysShow = false;
	hidden = false;
	private _onChecked = new Emitter<boolean>();
	onChecked = this._onChecked.event;
	_checked?: boolean;
	get checked() {
		return this._checked;
	}
	set checked(value: boolean) {
		if (value !== this._checked) {
			this._checked = value;
			this._onChecked.fire(value);
		}
	}
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];

	constructor(init: IListElement) {
		assign(this, init);
	}
}

interface IListElementTemplateData {
	checkbox: HTMLInputElement;
	label: IconLabel;
	detail: HighlightedLabel;
	element: ListElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class ListElementRenderer implements IRenderer<ListElement, IListElementTemplateData> {

	static readonly ID = 'listelement';

	get templateId() {
		return ListElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IListElementTemplateData {
		const data: IListElementTemplateData = Object.create(null);
		data.toDisposeElement = [];
		data.toDisposeTemplate = [];

		const entry = dom.append(container, $('.quick-input-list-entry'));

		// Checkbox
		const label = dom.append(entry, $('label.quick-input-list-label'));
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
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true });

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
		data.detail = new HighlightedLabel(detailContainer);

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
		options.descriptionTitle = element.item.description;
		options.descriptionMatches = descriptionHighlights || [];
		data.label.setValue(element.item.label, element.item.description, options);

		// Meta
		data.detail.set(element.item.detail, detailHighlights);
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(data: IListElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class ListElementDelegate implements IVirtualDelegate<ListElement> {

	getHeight(element: ListElement): number {
		return element.item.detail ? 44 : 22;
	}

	getTemplateId(element: ListElement): string {
		return ListElementRenderer.ID;
	}
}

export class QuickInputList {

	private container: HTMLElement;
	private list: WorkbenchList<ListElement>;
	private elements: ListElement[] = [];
	private elementsToIndexes = new Map<IQuickPickItem, number>();
	matchOnDescription = false;
	matchOnDetail = false;
	private _onChangedAllVisibleChecked = new Emitter<boolean>();
	onChangedAllVisibleChecked: Event<boolean> = this._onChangedAllVisibleChecked.event;
	private _onChangedCheckedCount = new Emitter<number>();
	onChangedCheckedCount: Event<number> = this._onChangedCheckedCount.event;
	private _onChangedVisibleCount = new Emitter<number>();
	onChangedVisibleCount: Event<number> = this._onChangedVisibleCount.event;
	private _onChangedCheckedElements = new Emitter<IQuickPickItem[]>();
	onChangedCheckedElements: Event<IQuickPickItem[]> = this._onChangedCheckedElements.event;
	private _onLeave = new Emitter<void>();
	onLeave: Event<void> = this._onLeave.event;
	private _fireCheckedEvents = true;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.container = dom.append(this.parent, $('.quick-input-list'));
		const delegate = new ListElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new ListElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<ListElement>;
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
		this.disposables.push(dom.addDisposableListener(this.container, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space' on checkbox.
				this._onLeave.fire();
			}
		}));
		this.disposables.push(this.list.onSelectionChange(e => {
			if (e.elements.length) {
				this.list.setSelection([]);
			}
		}));
	}

	@memoize
	get onDidChangeFocus() {
		return mapEvent(this.list.onFocusChange, e => e.elements.map(e => e.item));
	}

	@memoize
	get onDidChangeSelection() {
		return mapEvent(this.list.onSelectionChange, e => e.elements.map(e => e.item));
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

	setElements(elements: IQuickPickItem[]): void {
		this.elementDisposables = dispose(this.elementDisposables);
		this.elements = elements.map((item, index) => new ListElement({
			index,
			item,
			checked: false
		}));
		this.elementDisposables.push(...this.elements.map(element => element.onChecked(() => this.fireCheckedEvents())));

		this.elementsToIndexes = this.elements.reduce((map, element, index) => {
			map.set(element.item, index);
			return map;
		}, new Map<IQuickPickItem, number>());
		this.list.splice(0, this.list.length, this.elements);
		this.list.setFocus([]);
		this._onChangedVisibleCount.fire(this.elements.length);
	}

	getFocusedElements() {
		return this.list.getFocusedElements()
			.map(e => e.item);
	}

	setFocusedElements(items: IQuickPickItem[]) {
		this.list.setFocus(items
			.filter(item => this.elementsToIndexes.has(item))
			.map(item => this.elementsToIndexes.get(item)));
	}

	getSelectedElements() {
		return this.list.getSelectedElements()
			.map(e => e.item);
	}

	setSelectedElements(items: IQuickPickItem[]) {
		this.list.setSelection(items
			.filter(item => this.elementsToIndexes.has(item))
			.map(item => this.elementsToIndexes.get(item)));
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

		this.list['focus' + what]();
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
		query = query.trim();

		// Reset filtering
		if (!query) {
			this.elements.forEach(element => {
				element.labelHighlights = undefined;
				element.descriptionHighlights = undefined;
				element.detailHighlights = undefined;
				element.hidden = false;
			});
		}

		// Filter by value (since we support octicons, use octicon aware fuzzy matching)
		else {
			this.elements.forEach(element => {
				const labelHighlights = matchesFuzzyOcticonAware(query, parseOcticons(element.item.label));
				const descriptionHighlights = this.matchOnDescription ? matchesFuzzyOcticonAware(query, parseOcticons(element.item.description || '')) : undefined;
				const detailHighlights = this.matchOnDetail ? matchesFuzzyOcticonAware(query, parseOcticons(element.item.detail || '')) : undefined;

				if (element.shouldAlwaysShow || labelHighlights || descriptionHighlights || detailHighlights) {
					element.labelHighlights = labelHighlights;
					element.descriptionHighlights = descriptionHighlights;
					element.detailHighlights = detailHighlights;
					element.hidden = false;
				} else {
					element.labelHighlights = undefined;
					element.descriptionHighlights = undefined;
					element.detailHighlights = undefined;
					element.hidden = true;
				}
			});
		}

		const shownElements = this.elements.filter(element => !element.hidden);

		// Sort by value
		const normalizedSearchValue = query.toLowerCase();
		shownElements.sort((a, b) => {
			if (!query) {
				return a.index - b.index; // restore natural order
			}
			return compareEntries(a, b, normalizedSearchValue);
		});

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

	return compareAnything(elementA.item.label, elementB.item.label, lookFor);
}

registerThemingParticipant((theme, collector) => {
	// Override inactive focus background with active focus background for single-pick case.
	const listInactiveFocusBackground = theme.getColor(listFocusBackground);
	if (listInactiveFocusBackground) {
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row.focused { background-color:  ${listInactiveFocusBackground}; }`);
		collector.addRule(`.quick-input-list .monaco-list .monaco-list-row.focused:hover { background-color:  ${listInactiveFocusBackground}; }`);
	}
});
