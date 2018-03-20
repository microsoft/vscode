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

const $ = dom.$;

export interface ISelectedElement {
	index: number;
	item: object;
	label: string;
	shouldAlwaysShow?: boolean;
	hidden?: boolean;
	selected?: boolean;
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];
}

interface ISelectedElementTemplateData {
	element: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: ISelectedElement;
	toDispose: IDisposable[];
}

class SelectedElementRenderer implements IRenderer<ISelectedElement, ISelectedElementTemplateData> {

	static readonly ID = 'selectedelement';

	get templateId() {
		return SelectedElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISelectedElementTemplateData {
		const data: ISelectedElementTemplateData = Object.create(null);
		data.element = dom.append(container, $('.selected_element'));

		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDispose = [];
		data.toDispose.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => data.context.selected = !data.context.selected));

		dom.append(data.element, data.checkbox);

		data.name = dom.append(data.element, $('span.label'));

		return data;
	}

	renderElement(element: ISelectedElement, index: number, data: ISelectedElementTemplateData): void {
		data.context = element;
		data.name.textContent = element.label;
		data.element.title = data.name.textContent;
		data.checkbox.checked = element.selected;
	}

	disposeTemplate(templateData: ISelectedElementTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class SelectedElementDelegate implements IDelegate<ISelectedElement> {

	getHeight(element: ISelectedElement): number {
		return 22;
	}

	getTemplateId(element: ISelectedElement): string {
		return SelectedElementRenderer.ID;
	}
}

export class QuickInputCheckboxList {

	container: HTMLElement;
	private list: WorkbenchList<ISelectedElement>;
	private elements: ISelectedElement[] = [];

	constructor(
		private parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.container = dom.append(this.parent, $('.quick-input-checkbox-list'));
		const delegate = new SelectedElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new SelectedElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<ISelectedElement>;
	}

	setElements(elements: IPickOpenEntry[]): void {
		this.elements = elements.map((item, index) => ({
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

	setFocus(): void {
		this.list.focusFirst();
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
}

function compareEntries(elementA: ISelectedElement, elementB: ISelectedElement, lookFor: string): number {

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