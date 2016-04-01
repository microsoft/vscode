/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export interface IPager<T> {
	firstPage: T[];
	total: number;
	pageSize: number;
	getPage(pageIndex: number): TPromise<T[]>;
}

interface IPage<T> {
	isResolved: boolean;
	promise: TPromise<any>;
	elements: T[];
}

export class PagedModel<T> {

	private pages: IPage<T>[] = [];

	get length(): number { return this.pager.total; }

	constructor(private pager: IPager<T>) {
		this.pages = [{ isResolved: true, promise: null, elements: pager.firstPage.slice() }];

		const totalPages = Math.ceil(pager.total / pager.pageSize);

		for (let i = 0, len = totalPages - 1; i < len; i++) {
			this.pages.push({ isResolved: false, promise: null, elements: [] });
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
			page.promise = this.pager.getPage(pageIndex).then(elements => {
				page.elements = elements;
				page.isResolved = true;
				page.promise = null;
			});
		}

		return page.promise.then(() => page.elements[indexInPage]);
	}
}

export function mapPager<T,R>(pager: IPager<T>, fn: (t: T) => R): IPager<R> {
	return {
		firstPage: pager.firstPage.map(fn),
		total: pager.total,
		pageSize: pager.pageSize,
		getPage: pageIndex => pager.getPage(pageIndex).then(r => r.map(fn))
	};
}