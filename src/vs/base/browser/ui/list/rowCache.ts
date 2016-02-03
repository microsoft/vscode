/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRendererMap } from './list';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as DOM from 'vs/base/browser/dom';

export interface IRow {
	element: HTMLElement;
	templateId: string;
	templateData: any;
}

function getLastScrollTime(element: HTMLElement): number {
	var value = element.getAttribute('last-scroll-time');
	return value ? parseInt(value, 10) : 0;
}

function removeFromParent(element: HTMLElement): void {
	try {
		element.parentElement.removeChild(element);
	} catch (e) {
		// this will throw if this happens due to a blur event, nasty business
	}
}

export class RowCache<T> implements IDisposable {

	private cache: { [templateId:string]: IRow[]; };
	private scrollingRow: IRow;

	constructor(private renderers: IRendererMap<T>) {
		this.cache = { '': [] };
		this.scrollingRow = null;
	}

	public alloc(templateId: string): IRow {
		let result = this.getTemplateCache(templateId).pop();

		if (!result) {
			const content = document.createElement('div');
			content.className = 'content';

			const row = document.createElement('div');
			row.appendChild(content);

			const renderer = this.renderers[templateId];

			result = {
				element: row,
				templateId: templateId,
				templateData: renderer.renderTemplate(content)
			};
		}

		return result;
	}

	public release(templateId: string, row: IRow): void {
		var lastScrollTime = getLastScrollTime(row.element);

		if (!lastScrollTime) {
			removeFromParent(row.element);
			this.getTemplateCache(templateId).push(row);
			return;
		}

		if (this.scrollingRow) {
			var lastKnownScrollTime = getLastScrollTime(this.scrollingRow.element);

			if (lastKnownScrollTime > lastScrollTime) {
				removeFromParent(row.element);
				this.getTemplateCache(templateId).push(row);
				return;
			}

			if (this.scrollingRow.element.parentElement) {
				removeFromParent(this.scrollingRow.element);
				DOM.removeClass(this.scrollingRow.element, 'scrolling');
				this.getTemplateCache(this.scrollingRow.templateId).push(this.scrollingRow);
			}
		}

		this.scrollingRow = row;
		DOM.addClass(this.scrollingRow.element, 'scrolling');
	}

	private getTemplateCache(templateId: string): IRow[] {
		return this.cache[templateId] || (this.cache[templateId] = []);
	}

	public garbageCollect(): void {
		if (this.cache) {
			Object.keys(this.cache).forEach(templateId => {
				this.cache[templateId].forEach(cachedRow => {
					const renderer = this.renderers[templateId];
					renderer.disposeTemplate(cachedRow.templateData);
					cachedRow.element = null;
					cachedRow.templateData = null;
				});

				delete this.cache[templateId];
			});
		}

		if (this.scrollingRow) {
			const renderer = this.renderers[this.scrollingRow.templateId];
			renderer.disposeTemplate(this.scrollingRow.templateData);
			this.scrollingRow = null;
		}
	}

	public dispose(): void {
		this.garbageCollect();
		this.cache = null;
		this.renderers = null;
	}
}