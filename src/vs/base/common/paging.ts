/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { range } from './arrays.js';
import { CancellationToken, CancellationTokenSource } from './cancellation.js';
import { CancellationError } from './errors.js';
import { Event, Emitter } from './event.js';

/**
 * A Pager is a stateless abstraction over a paged collection.
 */
export interface IPager<T> {
	firstPage: T[];
	total: number;
	pageSize: number;
	getPage(pageIndex: number, cancellationToken: CancellationToken): Promise<T[]>;
}

export interface IIterativePage<T> {
	readonly items: T[];
	readonly hasMore: boolean;
}

export interface IIterativePager<T> {
	readonly firstPage: IIterativePage<T>;
	getNextPage(cancellationToken: CancellationToken): Promise<IIterativePage<T>>;
}

export interface IPageIterator<T> {
	elements: T[];
	total: number;
	hasNextPage: boolean;
	getNextPage(cancellationToken: CancellationToken): Promise<IPageIterator<T>>;
}

interface IPage<T> {
	isResolved: boolean;
	promise: Promise<void> | null;
	cts: CancellationTokenSource | null;
	promiseIndexes: Set<number>;
	elements: T[];
}

function createPage<T>(elements?: T[]): IPage<T> {
	return {
		isResolved: !!elements,
		promise: null,
		cts: null,
		promiseIndexes: new Set<number>(),
		elements: elements || []
	};
}

/**
 * A PagedModel is a stateful model over an abstracted paged collection.
 */
export interface IPagedModel<T> {
	readonly length: number;
	readonly onDidIncrementLength: Event<number>;
	isResolved(index: number): boolean;
	get(index: number): T;
	resolve(index: number, cancellationToken: CancellationToken): Promise<T>;
}

export function singlePagePager<T>(elements: T[]): IPager<T> {
	return {
		firstPage: elements,
		total: elements.length,
		pageSize: elements.length,
		getPage: (pageIndex: number, cancellationToken: CancellationToken): Promise<T[]> => {
			return Promise.resolve(elements);
		}
	};
}

export class PagedModel<T> implements IPagedModel<T> {

	private pager: IPager<T>;
	private pages: IPage<T>[] = [];

	get length(): number { return this.pager.total; }
	readonly onDidIncrementLength = Event.None;

	constructor(arg: IPager<T> | T[]) {
		this.pager = Array.isArray(arg) ? singlePagePager<T>(arg) : arg;

		const totalPages = Math.ceil(this.pager.total / this.pager.pageSize);

		this.pages = [
			createPage(this.pager.firstPage.slice()),
			...range(totalPages - 1).map(() => createPage<T>())
		];
	}

	isResolved(index: number): boolean {
		const pageIndex = Math.floor(index / this.pager.pageSize);
		const page = this.pages[pageIndex];

		return !!page.isResolved;
	}

	get(index: number): T {
		const pageIndex = Math.floor(index / this.pager.pageSize);
		const indexInPage = index % this.pager.pageSize;
		const page = this.pages[pageIndex];

		return page.elements[indexInPage];
	}

	resolve(index: number, cancellationToken: CancellationToken): Promise<T> {
		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}

		const pageIndex = Math.floor(index / this.pager.pageSize);
		const indexInPage = index % this.pager.pageSize;
		const page = this.pages[pageIndex];

		if (page.isResolved) {
			return Promise.resolve(page.elements[indexInPage]);
		}

		if (!page.promise) {
			page.cts = new CancellationTokenSource();
			page.promise = this.pager.getPage(pageIndex, page.cts.token)
				.then(elements => {
					page.elements = elements;
					page.isResolved = true;
					page.promise = null;
					page.cts = null;
				}, err => {
					page.isResolved = false;
					page.promise = null;
					page.cts = null;
					return Promise.reject(err);
				});
		}

		const listener = cancellationToken.onCancellationRequested(() => {
			if (!page.cts) {
				return;
			}

			page.promiseIndexes.delete(index);

			if (page.promiseIndexes.size === 0) {
				page.cts.cancel();
			}
		});

		page.promiseIndexes.add(index);

		return page.promise.then(() => page.elements[indexInPage])
			.finally(() => listener.dispose());
	}
}

export class DelayedPagedModel<T> implements IPagedModel<T> {

	get length(): number { return this.model.length; }
	get onDidIncrementLength() { return this.model.onDidIncrementLength; }

	constructor(private readonly model: IPagedModel<T>, private timeout: number = 500) { }

	isResolved(index: number): boolean {
		return this.model.isResolved(index);
	}

	get(index: number): T {
		return this.model.get(index);
	}

	resolve(index: number, cancellationToken: CancellationToken): Promise<T> {
		return new Promise((c, e) => {
			if (cancellationToken.isCancellationRequested) {
				return e(new CancellationError());
			}

			const timer = setTimeout(() => {
				if (cancellationToken.isCancellationRequested) {
					return e(new CancellationError());
				}

				timeoutCancellation.dispose();
				this.model.resolve(index, cancellationToken).then(c, e);
			}, this.timeout);

			const timeoutCancellation = cancellationToken.onCancellationRequested(() => {
				clearTimeout(timer);
				timeoutCancellation.dispose();
				e(new CancellationError());
			});
		});
	}
}

/**
 * A PageIteratorPager wraps an IPageIterator to provide IPager functionality.
 * It caches pages as they are accessed and supports random page access by
 * sequentially loading pages until the requested page is reached.
 */
export class PageIteratorPager<T> implements IPager<T> {
	private cachedPages: T[][] = [];
	private currentIterator: IPageIterator<T>;
	private isComplete: boolean = false;
	private pendingRequests = new Map<number, Promise<void>>();

	public readonly firstPage: T[];
	public readonly pageSize: number;
	public readonly total: number;

	constructor(initialIterator: IPageIterator<T>) {
		this.currentIterator = initialIterator;
		this.firstPage = [...initialIterator.elements];
		this.pageSize = initialIterator.elements.length || 1; // Use first page size as page size
		this.cachedPages[0] = this.firstPage;
		this.isComplete = !initialIterator.hasNextPage;
		this.total = initialIterator.total;
	}

	async getPage(pageIndex: number, cancellationToken: CancellationToken): Promise<T[]> {
		if (cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}

		// If we already have this page cached, return it
		if (pageIndex < this.cachedPages.length) {
			return this.cachedPages[pageIndex];
		}

		// If we're complete and don't have this page, it doesn't exist
		if (this.isComplete) {
			throw new Error(`Page ${pageIndex} is out of bounds. Total pages: ${this.cachedPages.length}`);
		}


		// Check if there's already a pending request that will load this index
		// (any pending request for an index >= our requested index)
		let promise: Promise<void> | undefined;
		for (const [pendingPageIndex, pendingPromise] of this.pendingRequests) {
			if (pendingPageIndex >= pageIndex) {
				promise = pendingPromise;
				break;
			}
		}

		if (!promise) {
			promise = this.loadPagesUntil(pageIndex, cancellationToken);
			this.pendingRequests.set(pageIndex, promise);
		}

		try {
			await promise;
			if (pageIndex >= this.cachedPages.length) {
				throw new Error(`Page ${pageIndex} is out of bounds. Total pages: ${this.cachedPages.length}`);
			}
			return this.cachedPages[pageIndex];
		} finally {
			if (this.pendingRequests.has(pageIndex)) {
				this.pendingRequests.delete(pageIndex);
			}
		}
	}

	private async loadPagesUntil(targetPageIndex: number, cancellationToken: CancellationToken): Promise<void> {
		while (targetPageIndex >= this.cachedPages.length && this.currentIterator.hasNextPage) {
			if (cancellationToken.isCancellationRequested) {
				throw new CancellationError();
			}

			this.currentIterator = await this.currentIterator.getNextPage(cancellationToken);
			this.cachedPages.push([...this.currentIterator.elements]);
		}
		if (!this.currentIterator.hasNextPage) {
			this.isComplete = true;
		}
	}
}

export class IterativePagedModel<T> implements IPagedModel<T> {

	private items: T[] = [];
	private _hasNextPage = true;
	private readonly _onDidIncrementLength = new Emitter<number>();
	private loadingPromise: Promise<void> | null = null;

	private readonly pager: IIterativePager<T>;

	constructor(pager: IIterativePager<T>) {
		this.pager = pager;
		this.items = [...pager.firstPage.items];
		this._hasNextPage = pager.firstPage.hasMore;
	}

	get onDidIncrementLength(): Event<number> {
		return this._onDidIncrementLength.event;
	}

	/**
	 * Returns actual length + 1 if there are more pages (sentinel approach)
	 */
	get length(): number {
		return this.items.length + (this._hasNextPage ? 1 : 0);
	}

	/**
	 * Sentinel item is never resolved - it triggers loading
	 */
	isResolved(index: number): boolean {
		if (index === this.items.length && this._hasNextPage) {
			return false; // This will trigger resolve() call
		}
		return index < this.items.length;
	}

	get(index: number): T {
		if (index < this.items.length) {
			return this.items[index];
		}
		throw new Error('Item not resolved yet');
	}

	/**
	 * When sentinel item is accessed, load next page
	 */
	async resolve(index: number, cancellationToken: CancellationToken): Promise<T> {
		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}

		// If trying to resolve the sentinel item, load next page
		if (index === this.items.length && this._hasNextPage) {
			await this.loadNextPage(cancellationToken);
		}

		// After loading, the requested index should now be valid
		if (index < this.items.length) {
			return this.items[index];
		}

		throw new Error('Index out of bounds');
	}

	private async loadNextPage(cancellationToken: CancellationToken): Promise<void> {
		if (!this._hasNextPage) {
			return;
		}

		// If already loading, return the cached promise
		if (this.loadingPromise) {
			await this.loadingPromise;
			return;
		}

		const pagePromise = this.pager.getNextPage(cancellationToken);

		this.loadingPromise = pagePromise
			.then(page => {
				this.items.push(...page.items);
				this._hasNextPage = page.hasMore;

				// Clear the loading promise before firing the event
				// so that event handlers can trigger loading the next page if needed
				this.loadingPromise = null;

				// Fire length update event
				this._onDidIncrementLength.fire(this.length);
			}, err => {
				this.loadingPromise = null;
				throw err;
			});

		await this.loadingPromise;
	}

	dispose(): void {
		this._onDidIncrementLength.dispose();
	}
}

/**
 * Similar to array.map, `mapPager` lets you map the elements of an
 * abstract paged collection to another type.
 */
export function mapPager<T, R>(pager: IPager<T>, fn: (t: T) => R): IPager<R> {
	return {
		firstPage: pager.firstPage.map(fn),
		total: pager.total,
		pageSize: pager.pageSize,
		getPage: (pageIndex, token) => pager.getPage(pageIndex, token).then(r => r.map(fn))
	};
}
