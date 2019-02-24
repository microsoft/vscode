/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SimpleHashService implements IHashService {

	_serviceBrand: any;

	createSHA1(content: string): string {
		return btoa(content);
	}
}

registerSingleton(IHashService, SimpleHashService, true);