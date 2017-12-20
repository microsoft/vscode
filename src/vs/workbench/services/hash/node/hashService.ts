/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createHash } from 'crypto';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';

export class HashService implements IHashService {

	_serviceBrand: any;

	public createSHA1(content: string): string {
		return createHash('sha1').update(content).digest('hex');
	}
}