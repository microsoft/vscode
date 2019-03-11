/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { computeSHA1Hash } from 'vs/base/common/hash';

export const IHashService = createDecorator<IHashService>('hashService');

export interface IHashService {
	_serviceBrand: any;

	/**
	 * Produce a SHA1 hash of the provided content.
	 */
	createSHA1(content: string): string;
}

export class HashService implements IHashService {

	_serviceBrand: any;

	createSHA1(content: string): string {
		return computeSHA1Hash(content);
	}
}

registerSingleton(IHashService, HashService, true);