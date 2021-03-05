/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';

suite('UUID', () => {
	test('generation', () => {
		const asHex = uuid.v4().asHex();
		assert.equal(asHex.length, 36);
		assert.equal(asHex[14], '4');
		assert.ok(asHex[19] === '8' || asHex[19] === '9' || asHex[19] === 'a' || asHex[19] === 'b');
	});

	test('parse', () => {
		const id = uuid.v4();
		const asHext = id.asHex();
		const id2 = uuid.parse(asHext);
		assert.equal(id.asHex(), id2.asHex());
	});
});
