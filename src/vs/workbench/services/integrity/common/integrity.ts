/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IIntegrityService = createDecorator<IIntegrityService>('integrityService');

export interface ChecksumPair {
	uri: URI;
	actual: string;
	expected: string;
	isPure: boolean;
}

export interface IntegrityTestResult {
	isPure: boolean;
	proof: ChecksumPair[];
}

export interface IIntegrityService {
	readonly _serviceBrand: undefined;

	isPure(): Promise<IntegrityTestResult>;
}
