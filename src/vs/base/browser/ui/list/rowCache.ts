/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRenderer } from './list';
import { IDisposable } from 'vs/base/common/lifecycle';
import { $, removeClass } from 'vs/base/browser/dom';

export interface IRow {
	domNode: HTMLElement;
	templateId: string;
	templateData: any;
}

function removeFromParent(element: HTMLElement): void {
	try {
		element.parentElement.removeChild(element);
	} catch (e) {
		// this will throw if this happens due to a blur event, nasty business
	}
}

export class RowCache<T> implements IDisposable {

	private cache: { [templateId: string]: IRow[]; };

	constructor(private renderers: { [templateId: string]: IRenderer<T, any>; }) {
		this.cache = Object.create(null);
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
	 * Releases the row for eventual reuse.
	 */
	release(row: IRow): void {
		if (!row) {
			return;
		}

		this.releaseRow(row);
	}

	private releaseRow(row: IRow): void {
		const {domNode, templateId} = row;
		removeClass(domNode, 'scrolling');
		removeFromParent(domNode);

		const cache = this.getTemplateCache(templateId);
		cache.push(row);
	}

	private getTemplateCache(templateId: string): IRow[] {
		return this.cache[templateId] || (this.cache[templateId] = []);
	}

	private garbageCollect(): void {
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
	}

	dispose(): void {
		this.garbageCollect();
		this.cache = null;
		this.renderers = null;
	}
}