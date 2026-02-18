/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import test from 'node:test';

test('extension module exports activate and deactivate', async () => {
	const extension = await import('../extension');
	assert.equal(typeof extension.activate, 'function');
	assert.equal(typeof extension.deactivate, 'function');
});
