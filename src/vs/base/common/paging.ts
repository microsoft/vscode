/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ArraySet } from 'vs/base/common/set';
import { isArray } from 'vs/base/common/types';

/**
 * A Pager is a stateless abstraction over a paged collection.
 */
export interface IPager<T> {
	firstPage: T[];
	total: number;
	pageSize: number;
	getPage(pageIndex: number): TPromise<T[]>;
}

interface IPage<T> {
	isResolved: boolean;
	promise: TPromise<any>;
	promiseIndexes: ArraySet<number>;
	elements: T[];
}

/**
 * A PagedModel is a stateful model over an abstracted paged collection.
 */
export interface IPagedModel<T> {
	length: number;
	isResolved(index: number): boolean;
	get(index: number): T;
	resolve(index: number): TPromise<T>;
}

export function singlePagePager<T>(elements: T[]): IPager<T> {
	return {
		firstPage: elements,
		total: elements.length,
		pageSize: elements.length,
		getPage: null
	};
}

export class PagedModel<T> implements IPagedModel<T> {

	private pager: IPager<T>;
	private pages: IPage<T>[] = [];

	get length(): number { return this.pager.total; }

	constructor(private arg: IPager<T> | T[], private pageTimeout: number = 500) {
		this.pager = isArray(arg) ? singlePagePager<T>(arg) : arg;

		this.pages = [{ isResolved: true, promise: null, promiseIndexes: new ArraySet<number>(), elements: this.pager.firstPage.slice() }];

		const totalPages = Math.ceil(this.pager.total / this.pager.pageSize);

		for (let i = 0, len = totalPages - 1; i < len; i++) {
			this.pages.push({ isResolved: false, promise: null, promiseIndexes: new ArraySet<number>(), elements: [] });
		}
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

	resolve(index: number): TPromise<T> {
		const pageIndex = Math.floor(index / this.pager.pageSize);
		const indexInPage = index % this.pager.pageSize;
		const page = this.pages[pageIndex];

		if (page.isResolved) {
			return TPromise.as(page.elements[indexInPage]);
		}

		if (!page.promise) {
			page.promise = TPromise.timeout(this.pageTimeout)
				.then(() => this.pager.getPage(pageIndex))
				.then(elements => {
					page.elements = elements;
					page.isResolved = true;
					page.promise = null;
				}, err => {
					page.isResolved = false;
					page.promise = null;
					return TPromise.wrapError(err);
				});
		}

		return new TPromise<T>((c, e) => {
			page.promiseIndexes.set(index);
			page.promise.done(() => c(page.elements[indexInPage]));
		}, () => {
			if (!page.promise) {
				return;
			}

			page.promiseIndexes.unset(index);

			if (page.promiseIndexes.size === 0) {
				page.promise.cancel();
			}
		});
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
		getPage: pageIndex => pager.getPage(pageIndex).then(r => r.map(fn))
	};
}

/**
 * Merges two pagers.
 */
export function mergePagers<T>(one: IPager<T>, other: IPager<T>): IPager<T> {
	return {
		firstPage: [...one.firstPage, ...other.firstPage],
		total: one.total + other.total,
		pageSize: one.pageSize + other.pageSize,
		getPage(pageIndex: number): TPromise<T[]> {
			return TPromise.join([one.getPage(pageIndex), other.getPage(pageIndex)])
				.then(([onePage, otherPage]) => [...onePage, ...otherPage]);
		}
	};
}