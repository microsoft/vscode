/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { arePolicyReferenceTypesCompatible } from '../../common/policyReference.js';

suite('Policy export reference types', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches equivalent policy types including nullable settings', () => {
		assert.deepStrictEqual({
			boolean: arePolicyReferenceTypesCompatible('boolean', 'boolean'),
			nullableReference: arePolicyReferenceTypesCompatible('boolean', ['boolean', 'null']),
			nullableOwner: arePolicyReferenceTypesCompatible(['boolean', 'null'], 'boolean'),
			nullableArray: arePolicyReferenceTypesCompatible('array', ['null', 'array']),
			unionOrder: arePolicyReferenceTypesCompatible(['string', 'null', 'boolean'], ['boolean', 'string', 'null']),
		}, {
			boolean: true,
			nullableReference: true,
			nullableOwner: true,
			nullableArray: true,
			unionOrder: true,
		});
	});

	test('rejects mismatched non-null policy types', () => {
		assert.deepStrictEqual({
			differentType: arePolicyReferenceTypesCompatible('boolean', 'string'),
			differentNullableType: arePolicyReferenceTypesCompatible('boolean', ['string', 'null']),
			additionalType: arePolicyReferenceTypesCompatible('boolean', ['boolean', 'string', 'null']),
			nullOnly: arePolicyReferenceTypesCompatible('boolean', 'null'),
			missingOwnerType: arePolicyReferenceTypesCompatible(undefined, ['boolean', 'null']),
		}, {
			differentType: false,
			differentNullableType: false,
			additionalType: false,
			nullOnly: false,
			missingOwnerType: false,
		});
	});
});
