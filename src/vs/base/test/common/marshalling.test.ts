/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IMarshallingContribution, marshallObjectAndStringify, parseAndDemarshallObject } from 'vs/base/common/marshalling';

class ObjWithRegExp {

	public member:RegExp;

	constructor(something:RegExp) {
		this.member = something;
	}
}

suite('Marshalling', () => {
	test('bug #17587:[plugin] Language plugin can\'t define a TokenTypeClassificationSupport#wordDefinition', () => {

		var simpleMarshallingContrib: IMarshallingContribution = {
			canSerialize: (obj:any) => {
				return obj instanceof ObjWithRegExp;
			},
			serialize: (obj:any, serialize:(obj:any)=>any) => {
				return {
					$ObjWithRegExp: true,
					member: serialize(obj.member)
				};
			},
			canDeserialize: (obj:any) => {
				return (obj.$ObjWithRegExp === true);
			},
			deserialize: (obj:any, deserialize:(obj:any)=>any) => {
				return new ObjWithRegExp(deserialize(obj.member));
			}
		};

		var initial = new ObjWithRegExp(/test/g);
		var transported = <ObjWithRegExp>parseAndDemarshallObject(marshallObjectAndStringify(initial, simpleMarshallingContrib), simpleMarshallingContrib);

		assert(transported instanceof ObjWithRegExp);
		assert(transported.member instanceof RegExp);
		assert.equal(transported.member.source, 'test');
		assert.equal(transported.member.global, true);
		assert.equal(transported.member.ignoreCase, false);
		assert.equal(transported.member.multiline, false);
	});
});