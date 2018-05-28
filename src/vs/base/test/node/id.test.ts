/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { getMachineId } from 'vs/base/node/id';

suite('ID', () => {

	test('getMachineId', function () {
		return getMachineId().then(id => {
			assert.ok(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(id), `Expected a MAC address: ${id}`);
		});
	});
});