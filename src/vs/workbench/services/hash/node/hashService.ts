/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class HashService implements IHashService {

	_serviceBrand: any;

	createSHA1(content: string): Promise<string> {
		return Promise.resolve(createHash('sha1').update(content).digest('hex'));
	}
}

registerSingleton(IHashService, HashService, true);