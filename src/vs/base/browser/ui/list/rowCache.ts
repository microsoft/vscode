/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../dom.js';
import { IDisposable } from '../../../common/lifecycle.js';
import { IListRenderer } from './list.js';

export interface IRow {
	domNode: HTMLElement;
	templateId: string;
	templateData: any;
}

export class RowCache<T> implements IDisposable {

	private cache = new Map<string, IRow[]>();

	private readonly transactionNodesPendingRemoval = new Set<HTMLElement>();
	private inTransaction = false;

	constructor(private renderers: Map<string, IListRenderer<T, any>>) { }

	/**
	 * Returns a row either by creating a new one or reusing
	 * a previously released row which shares the same templateId.
	 *
	 * @returns A row and `isReusingConnectedDomNode` if the row's node is already in the dom in a stale position.
	 */
	alloc(templateId: string): { row: IRow; isReusingConnectedDomNode: boolean } {
		let result = this.getTemplateCache(templateId).pop();

		let isStale = false;
		if (result) {
			isStale = this.transactionNodesPendingRemoval.has(result.domNode);
			if (isStale) {
				this.transactionNodesPendingRemoval.delete(result.domNode);
			}
		} else {
			const domNode = $('.monaco-list-row');
			const renderer = this.getRenderer(templateId);
			const templateData = renderer.renderTemplate(domNode);
			result = { domNode, templateId, templateData };
		}

		return { row: result, isReusingConnectedDomNode: isStale };
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

	/**
	 * Begin a set of changes that use the cache. This lets us skip work when a row is removed and then inserted again.
	 */
	transact(makeChanges: () => void) {
		if (this.inTransaction) {
			throw new Error('Already in transaction');
		}

		this.inTransaction = true;

		try {
			makeChanges();
		} finally {
			for (const domNode of this.transactionNodesPendingRemoval) {
				this.doRemoveNode(domNode);
			}

			this.transactionNodesPendingRemoval.clear();
			this.inTransaction = false;
		}
	}

	private releaseRow(row: IRow): void {
		const { domNode, templateId } = row;
		if (domNode) {
			if (this.inTransaction) {
				this.transactionNodesPendingRemoval.add(domNode);
			} else {
				this.doRemoveNode(domNode);
			}
		}

		const cache = this.getTemplateCache(templateId);
		cache.push(row);
	}

	private doRemoveNode(domNode: HTMLElement) {
		domNode.classList.remove('scrolling');
		domNode.remove();
	}

	private getTemplateCache(templateId: string): IRow[] {
		let result = this.cache.get(templateId);

		if (!result) {
			result = [];
			this.cache.set(templateId, result);
		}

		return result;
	}

	dispose(): void {
		this.cache.forEach((cachedRows, templateId) => {
			for (const cachedRow of cachedRows) {
				const renderer = this.getRenderer(templateId);
				renderer.disposeTemplate(cachedRow.templateData);
				cachedRow.templateData = null;
			}
		});

		this.cache.clear();
		this.transactionNodesPendingRemoval.clear();
	}

	private getRenderer(templateId: string): IListRenderer<T, any> {
		const renderer = this.renderers.get(templateId);
		if (!renderer) {
			throw new Error(`No renderer found for ${templateId}`);
		}
		return renderer;
	}
}
