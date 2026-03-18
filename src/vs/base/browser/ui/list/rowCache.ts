/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, isAncestorOfActiveElement, trackFocus } from '../../dom.js';
import { combinedDisposable, IDisposable } from '../../../common/lifecycle.js';
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

	/**
	 * Rows that have been logically removed from the list but are being kept in
	 * the DOM until they lose focus, along with the listener that will complete
	 * the release once focus leaves.
	 */
	private readonly pendingFocusedRows = new Map<IRow, IDisposable>();

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
			isStale = this.transactionNodesPendingRemoval.delete(result.domNode);
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
			// If this row currently contains DOM focus, keep it in the document
			// until focus moves away to avoid an abrupt focus loss.
			if (isAncestorOfActiveElement(domNode)) {
				if (!this.pendingFocusedRows.has(row)) {
					const focusTracker = trackFocus(domNode);
					const blurListener = focusTracker.onDidBlur(() => this.releaseFocusedRow(row));
					this.pendingFocusedRows.set(row, combinedDisposable(focusTracker, blurListener));
				}
				// Do not add to the reuse cache yet — the row must stay alive.
				return;
			}

			if (this.inTransaction) {
				this.transactionNodesPendingRemoval.add(domNode);
			} else {
				this.doRemoveNode(domNode);
			}
		}

		const cache = this.getTemplateCache(templateId);
		cache.push(row);
	}

	/**
	 * Completes the deferred release of a row that was held due to focus.
	 * Called when focus has moved outside the row's DOM node.
	 */
	private releaseFocusedRow(row: IRow): void {
		const listener = this.pendingFocusedRows.get(row);
		if (!listener) {
			return;
		}

		listener.dispose();
		this.pendingFocusedRows.delete(row);

		this.doRemoveNode(row.domNode);

		const cache = this.getTemplateCache(row.templateId);
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
		// Release any rows that were being held due to focus, disposing their templates.
		for (const [row, listener] of this.pendingFocusedRows) {
			listener.dispose();
			const renderer = this.renderers.get(row.templateId);
			if (renderer) {
				renderer.disposeTemplate(row.templateData);
				row.templateData = null;
			}
			row.domNode.remove();
		}
		this.pendingFocusedRows.clear();

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
