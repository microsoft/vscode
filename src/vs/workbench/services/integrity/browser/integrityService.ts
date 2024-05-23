/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIntegrityService, IntegrityTestResult } from 'vs/workbench/services/integrity/common/integrity';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class IntegrityService implements IIntegrityService {

	declare readonly _serviceBrand: undefined;

	async isPure(): Promise<IntegrityTestResult> {
		return { isPure: true, proof: [] };
	}
}

registerSingleton(IIntegrityService, IntegrityService, InstantiationType.Delayed);
