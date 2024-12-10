/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IChecksumService = createDecorator<IChecksumService>('checksumService');

export interface IChecksumService {

	readonly _serviceBrand: undefined;

	/**
	 * Computes the checksum of the contents of the resource.
	 */
	checksum(resource: URI): Promise<string>;
}
