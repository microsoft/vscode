/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIntegrityService, IntegrityTestResult } from 'vs/workbench/services/integrity/common/integrity';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class BrowserIntegrityServiceImpl implements IIntegrityService {

	_serviceBrand!: ServiceIdentifier<any>;

	async isPure(): Promise<IntegrityTestResult> {
		return { isPure: true, proof: [] };
	}
}

registerSingleton(IIntegrityService, BrowserIntegrityServiceImpl, true);
