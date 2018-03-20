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
import { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';

const $ = dom.$;

interface ISelectableElement {
	index: number;
	item: object;
	label: string;
	selected: boolean;
}

class SelectableElement implements ISelectableElement {
	index: number;
	item: object;
	label: string;
	shouldAlwaysShow = false;
	hidden = false;
	private _onSelected = new Emitter<boolean>();
	onSelected = this._onSelected.event;
	_selected: boolean;
	get selected() {
		return this._selected;
	}
	set selected(value: boolean) {
		if (value !== this._selected) {
			this._selected = value;
			this._onSelected.fire(value);
		}
	}
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];

	constructor(init: ISelectableElement) {
		assign(this, init);
	}
}

interface ISelectedElementTemplateData {
	element: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: SelectableElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class SelectedElementRenderer implements IRenderer<SelectableElement, ISelectedElementTemplateData> {

	static readonly ID = 'selectedelement';

	get templateId() {
		return SelectedElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISelectedElementTemplateData {
		const data: ISelectedElementTemplateData = Object.create(null);
		data.element = dom.append(container, $('.selected_element'));

		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDisposeElement = [];
		data.toDisposeTemplate = [];
		data.toDisposeTemplate.push(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			data.context.selected = data.checkbox.checked;
		}));

		dom.append(data.element, data.checkbox);

		data.name = dom.append(data.element, $('span.label'));

		return data;
	}

	renderElement(element: SelectableElement, index: number, data: ISelectedElementTemplateData): void {
		dispose(data.toDisposeElement);
		data.context = element;
		data.name.textContent = element.label;
		data.element.title = data.name.textContent;
		data.checkbox.checked = element.selected;
		data.toDisposeElement.push(element.onSelected(selected => data.checkbox.checked = selected));
	}

	disposeTemplate(data: ISelectedElementTemplateData): void {
		dispose(data.toDisposeTemplate);
	}
}

class SelectedElementDelegate implements IDelegate<SelectableElement> {

	getHeight(element: SelectableElement): number {
		return 22;
	}

	getTemplateId(element: SelectableElement): string {
		return SelectedElementRenderer.ID;
	}
}

export class QuickInputCheckboxList {

	private container: HTMLElement;
	private list: WorkbenchList<SelectableElement>;
	private elements: SelectableElement[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.container = dom.append(this.parent, $('.quick-input-checkbox-list'));
		const delegate = new SelectedElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new SelectedElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<SelectableElement>;
		this.disposables.push(this.list);
		this.disposables.push(this.list.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Space) {
				this.toggleCheckbox();
			}
		}));
	}

	setElements(elements: IPickOpenEntry[]): void {
		this.elements = elements.map((item, index) => new SelectableElement({
			index,
			item,
			label: item.label,
			selected: !!item.selected
		}));
		this.list.splice(0, this.list.length, this.elements);
	}

	getSelectedElements() {
		return this.elements.filter(e => e.selected)
			.map(e => e.item);
	}

	focus(what: 'Next' | 'Previous' | 'NextPage' | 'PreviousPage'): void {
		this.list['focus' + what]();
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
				const labelHighlights = matchesFuzzyOcticonAware(query, parseOcticons(element.label));
				const descriptionHighlights = undefined; // TODO matchesFuzzyOcticonAware(query, parseOcticons(element.description));
				const detailHighlights = undefined; // TODO matchesFuzzyOcticonAware(query, parseOcticons(element.detail));

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
		this.list.layout();
		if (query) {
			this.list.focusFirst();
		}
	}

	toggleCheckbox() {
		const elements = this.list.getFocusedElements();
		for (const element of elements) {
			element.selected = !element.selected;
		}
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}

function compareEntries(elementA: SelectableElement, elementB: SelectableElement, lookFor: string): number {

	const labelHighlightsA = elementA.labelHighlights || [];
	const labelHighlightsB = elementB.labelHighlights || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	return compareAnything(elementA.label, elementB.label, lookFor);
}