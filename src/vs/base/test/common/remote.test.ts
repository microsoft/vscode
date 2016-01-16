/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { marshallObject, demarshallObject } from 'vs/base/common/marshalling';
import { ProxiesMarshallingContribution } from 'vs/base/common/remote';
import { TPromise} from 'vs/base/common/winjs.base';

suite('Remote', () => {
	test('bug #17587:[plugin] Language plugin can\'t define a TokenTypeClassificationSupport#wordDefinition', () => {

		var contrib = new ProxiesMarshallingContribution({
			callOnRemote: () => TPromise.as(true)
		});

		var initial = {
			$__CREATE__PROXY__REQUEST: 'myId',
			member: /test/g
		};
		var transported = demarshallObject(marshallObject(initial, contrib), contrib);

		assert.equal(transported.$__IS_REMOTE_OBJ, true);
		assert(transported.member instanceof RegExp);
		assert.equal(transported.member.source, 'test');
		assert.equal(transported.member.global, true);
		assert.equal(transported.member.ignoreCase, false);
		assert.equal(transported.member.multiline, false);
	});
});