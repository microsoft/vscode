/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { computeSHA1Hash } from 'vs/base/common/hash';

export class BrowserHashService implements IHashService {

	_serviceBrand: any;

	createSHA1(content: string): string {
		return computeSHA1Hash(content);
	}
}

registerSingleton(IHashService, BrowserHashService, true);