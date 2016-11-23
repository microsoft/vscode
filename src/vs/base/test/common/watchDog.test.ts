/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { WatchDog } from 'vs/base/common/watchDog';

suite('WatchDog', function () {

	test('start/stop', function (done) {
		const dog = new WatchDog(10, 1);
		dog.onAlert(e => {
			dog.stop();
			assert.ok(e === dog);
			done();
		});
		dog.start();
	});
});
