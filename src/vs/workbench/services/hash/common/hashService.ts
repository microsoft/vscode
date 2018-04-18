/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IHashService = createDecorator<IHashService>('hashService');

export interface IHashService {
	_serviceBrand: any;

	/**
	 * Produce a SHA1 hash of the provided content.
	 */
	createSHA1(content: string): string;
}