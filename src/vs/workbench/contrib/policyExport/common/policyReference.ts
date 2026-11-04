/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { PolicyDto } from './policyDto.js';

/** Nullable settings accept the same managed values; null represents an unset personal preference. */
export function arePolicyReferenceTypesCompatible(policyType: PolicyDto['type'], referenceType: string | string[]): boolean {
	const policyTypes = (Array.isArray(policyType) ? policyType : [policyType]).filter(type => type !== 'null').sort();
	const referenceTypes = (Array.isArray(referenceType) ? referenceType : [referenceType]).filter(type => type !== 'null').sort();
	return equals(policyTypes, referenceTypes);
}
