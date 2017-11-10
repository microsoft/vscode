/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';

suite('CancellationToken', function () {

	test('None', function () {
		assert.equal(CancellationToken.None.isCancellationRequested, false);
		assert.equal(typeof CancellationToken.None.onCancellationRequested, 'function');
	});

	test('cancel before token', function (done) {

		const source = new CancellationTokenSource();
		assert.equal(source.token.isCancellationRequested, false);
		source.cancel();

		assert.equal(source.token.isCancellationRequested, true);

		source.token.onCancellationRequested(function () {
			assert.ok(true);
			done();
		});
	});

	test('cancel happens only once', function () {

		let source = new CancellationTokenSource();
		assert.equal(source.token.isCancellationRequested, false);

		let cancelCount = 0;
		function onCancel() {
			cancelCount += 1;
		}

		source.token.onCancellationRequested(onCancel);

		source.cancel();
		source.cancel();

		assert.equal(cancelCount, 1);
	});

	test('cancel calls all listeners', function () {

		let count = 0;

		let source = new CancellationTokenSource();
		source.token.onCancellationRequested(function () {
			count += 1;
		});
		source.token.onCancellationRequested(function () {
			count += 1;
		});
		source.token.onCancellationRequested(function () {
			count += 1;
		});

		source.cancel();
		assert.equal(count, 3);
	});

	test('token stays the same', function () {

		let source = new CancellationTokenSource();
		let token = source.token;
		assert.ok(token === source.token); // doesn't change on get

		source.cancel();
		assert.ok(token === source.token); // doesn't change after cancel

		source.cancel();
		assert.ok(token === source.token); // doesn't change after 2nd cancel

		source = new CancellationTokenSource();
		source.cancel();
		token = source.token;
		assert.ok(token === source.token); // doesn't change on get
	});
});
