/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IPager, PagedModel } from 'vs/base/common/paging';
import { TPromise } from 'vs/base/common/winjs.base';

suite('PagedModel', () => {

	let model: PagedModel<number>;

	setup(() => {
		const pager: IPager<number> = {
			firstPage: [0, 1, 2, 3, 4],
			pageSize: 5,
			total: 100,
			getPage: pageIndex => TPromise.as([0, 1, 2, 3, 4].map(i => i + (pageIndex * 5)))
		};

		model = new PagedModel(pager, 0);
	});

	test('isResolved', () => {
		assert(model.isResolved(0));
		assert(model.isResolved(1));
		assert(model.isResolved(2));
		assert(model.isResolved(3));
		assert(model.isResolved(4));
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));
		assert(!model.isResolved(99));
	});

	test('resolve single', () => {
		assert(!model.isResolved(5));

		return model.resolve(5).then(() => {
			assert(model.isResolved(5));
		});
	});

	test('resolve page', () => {
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		return model.resolve(5).then(() => {
			assert(model.isResolved(5));
			assert(model.isResolved(6));
			assert(model.isResolved(7));
			assert(model.isResolved(8));
			assert(model.isResolved(9));
			assert(!model.isResolved(10));
		});
	});

	test('resolve page 2', () => {
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		return model.resolve(10).then(() => {
			assert(!model.isResolved(5));
			assert(!model.isResolved(6));
			assert(!model.isResolved(7));
			assert(!model.isResolved(8));
			assert(!model.isResolved(9));
			assert(model.isResolved(10));
		});
	});
});