/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { toErrorMessage } from 'vs/base/common/errorMessage';

suite('Errors', () => {
	test('Get Error Message', function () {
		assert.strictEqual(toErrorMessage('Foo Bar'), 'Foo Bar');
		assert.strictEqual(toErrorMessage(new Error('Foo Bar')), 'Foo Bar');

		let error: any = new Error();
		error.status = 404;
		error.statusText = 'Not Found';
		assert.strictEqual(toErrorMessage(error), 'Not Found (HTTP 404)');

		error = new Error();
		error.detail = {};
		error.detail.exception = {};
		error.detail.exception.message = 'Foo Bar';
		assert.strictEqual(toErrorMessage(error), 'Foo Bar');

		error = new Error();
		error.detail = {};
		error.detail.error = {};
		error.detail.error.status = 404;
		error.detail.error.statusText = 'Not Found';
		assert.strictEqual(toErrorMessage(error), 'Not Found (HTTP 404)');

		error = new Error();
		error.detail = {};
		error.detail.error = [];

		let foo: any = {};
		error.detail.error.push(foo);
		foo.status = 404;
		foo.statusText = 'Not Found';
		assert.strictEqual(toErrorMessage(error), 'Not Found (HTTP 404)');

		assert(toErrorMessage());
		assert(toErrorMessage(null));
		assert(toErrorMessage({}));
	});
});