/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
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

const $ = dom.$;

interface ICheckableElement {
	index: number;
	item: IPickOpenEntry;
	checked: boolean;
}

class CheckableElement implements ICheckableElement {
	index: number;
	item: IPickOpenEntry;
	shouldAlwaysShow = false;
	hidden = false;
	private _onChecked = new Emitter<boolean>();
	onChecked = this._onChecked.event;
	_checked: boolean;
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

	constructor(init: ICheckableElement) {
		assign(this, init);
	}
}

interface ICheckableElementTemplateData {
	checkbox: HTMLInputElement;
	label: IconLabel;
	detail: HighlightedLabel;
	element: CheckableElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class CheckableElementRenderer implements IRenderer<CheckableElement, ICheckableElementTemplateData> {

	static readonly ID = 'checkableelement';

	get templateId() {
		return CheckableElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ICheckableElementTemplateData {
		const data: ICheckableElementTemplateData = Object.create(null);

		const entry = dom.append(container, $('.quick-input-checkbox-list-entry'));
		const label = dom.append(entry, $('label.quick-input-checkbox-list-label'));

		// Entry
		data.checkbox = <HTMLInputElement>dom.append(label, $('input.quick-input-checkbox-list-checkbox'));
		data.checkbox.type = 'checkbox';
		data.toDisposeElement = [];
		data.toDisposeTemplate = [];
		data.toDisposeTemplate.push(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			data.element.checked = data.checkbox.checked;
		}));

		const rows = dom.append(label, $('.quick-input-checkbox-list-rows'));
		const row1 = dom.append(rows, $('.quick-input-checkbox-list-row'));
		const row2 = dom.append(rows, $('.quick-input-checkbox-list-row'));

		// Label
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true });

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-checkbox-list-label-meta'));
		data.detail = new HighlightedLabel(detailContainer);

		return data;
	}

	renderElement(element: CheckableElement, index: number, data: ICheckableElementTemplateData): void {
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

	disposeTemplate(data: ICheckableElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class CheckableElementDelegate implements IDelegate<CheckableElement> {

	getHeight(element: CheckableElement): number {
		return element.item.detail ? 44 : 22;
	}

	getTemplateId(element: CheckableElement): string {
		return CheckableElementRenderer.ID;
	}
}

export class QuickInputCheckboxList {

	private container: HTMLElement;
	private list: WorkbenchList<CheckableElement>;
	private elements: CheckableElement[] = [];
	matchOnDescription = false;
	matchOnDetail = false;
	private _onAllVisibleCheckedChanged = new Emitter<boolean>(); // TODO: Debounce
	onAllVisibleCheckedChanged: Event<boolean> = this._onAllVisibleCheckedChanged.event;
	private _onCheckedCountChanged = new Emitter<number>(); // TODO: Debounce
	onCheckedCountChanged: Event<number> = this._onCheckedCountChanged.event;
	private _onLeave = new Emitter<void>();
	onLeave: Event<void> = this._onLeave.event;
	private _fireCheckedEvents = true;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.container = dom.append(this.parent, $('.quick-input-checkbox-list'));
		const delegate = new CheckableElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new CheckableElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<CheckableElement>;
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
					const focus1 = this.list.getFocus();
					if (focus1.length === 1 && focus1[0] === 0) {
						this._onLeave.fire();
					}
					break;
				case KeyCode.DownArrow:
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
	get onFocusChange() {
		return mapEvent(this.list.onFocusChange, e => e.elements.map(e => e.item));
	}

	getAllVisibleChecked() {
		return this.allVisibleChecked(this.elements, false);
	}

	private allVisibleChecked(elements: CheckableElement[], whenNoneVisible = true) {
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

	setElements(elements: IPickOpenEntry[]): void {
		this.elementDisposables = dispose(this.elementDisposables);
		this.elements = elements.map((item, index) => new CheckableElement({
			index,
			item,
			checked: !!item.picked
		}));
		this.elementDisposables.push(...this.elements.map(element => element.onChecked(() => this.fireCheckedEvents())));
		this.list.splice(0, this.list.length, this.elements);
		this.list.setSelection([]);
		this.list.focusFirst();
	}

	getCheckedElements() {
		return this.elements.filter(e => e.checked)
			.map(e => e.item);
	}

	focus(what: 'First' | 'Last' | 'Next' | 'Previous' | 'NextPage' | 'PreviousPage'): void {
		this.list['focus' + what]();
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

		// Sort by value
		const normalizedSearchValue = query.toLowerCase();
		this.elements.sort((a, b) => {
			if (!query) {
				return a.index - b.index; // restore natural order
			}
			return compareEntries(a, b, normalizedSearchValue);
		});

		this.list.splice(0, this.list.length, this.elements.filter(element => !element.hidden));
		this.list.setSelection([]);
		this.list.focusFirst();
		this.list.layout();

		this._onAllVisibleCheckedChanged.fire(this.getAllVisibleChecked());
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

	dispose() {
		this.elementDisposables = dispose(this.elementDisposables);
		this.disposables = dispose(this.disposables);
	}

	private fireCheckedEvents() {
		if (this._fireCheckedEvents) {
			this._onAllVisibleCheckedChanged.fire(this.getAllVisibleChecked());
			this._onCheckedCountChanged.fire(this.getCheckedCount());
		}
	}
}

function compareEntries(elementA: CheckableElement, elementB: CheckableElement, lookFor: string): number {

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