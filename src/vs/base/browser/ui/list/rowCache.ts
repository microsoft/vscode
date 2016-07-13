/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRenderer } from './list';
import { IDisposable } from 'vs/base/common/lifecycle';
import { emmet as $, addClass, removeClass } from 'vs/base/browser/dom';

export interface IRow {
	domNode: HTMLElement;
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

	constructor(private renderers: { [templateId: string]: IRenderer<T, any>; }) {
		this.cache = Object.create(null);
		this.scrollingRow = null;
	}

	/**
	 * Returns a row either by creating a new one or reusing
	 * a previously released row which shares the same templateId.
	 */
	alloc(templateId: string): IRow {
		let result = this.getTemplateCache(templateId).pop();

		if (!result) {
			const domNode = $('.monaco-list-row');
			const renderer = this.renderers[templateId];
			const templateData = renderer.renderTemplate(domNode);
			result = { domNode, templateId, templateData };
		}

		return result;
	}

	/**
	 * Releases the row for eventual reuse. The row's domNode
	 * will eventually be removed from its parent, given that
	 * it is not the currently scrolling row (for OS X ballistic
	 * scrolling).
	 */
	release(row: IRow): void {
		if (!row) {
			return;
		}

		var lastScrollTime = getLastScrollTime(row.domNode);

		if (!lastScrollTime) {
			removeFromParent(row.domNode);
			this.getTemplateCache(row.templateId).push(row);
			return;
		}

		if (this.scrollingRow) {
			var lastKnownScrollTime = getLastScrollTime(this.scrollingRow.domNode);

			if (lastKnownScrollTime > lastScrollTime) {
				removeFromParent(row.domNode);
				this.getTemplateCache(row.templateId).push(row);
				return;
			}

			if (this.scrollingRow.domNode.parentElement) {
				removeFromParent(this.scrollingRow.domNode);
				removeClass(this.scrollingRow.domNode, 'scrolling');
				this.getTemplateCache(this.scrollingRow.templateId).push(this.scrollingRow);
			}
		}

		this.scrollingRow = row;
		addClass(this.scrollingRow.domNode, 'scrolling');
	}

	private getTemplateCache(templateId: string): IRow[] {
		return this.cache[templateId] || (this.cache[templateId] = []);
	}

	garbageCollect(): void {
		if (this.cache) {
			Object.keys(this.cache).forEach(templateId => {
				this.cache[templateId].forEach(cachedRow => {
					const renderer = this.renderers[templateId];
					renderer.disposeTemplate(cachedRow.templateData);
					cachedRow.domNode = null;
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

	dispose(): void {
		this.garbageCollect();
		this.cache = null;
		this.renderers = null;
	}
}