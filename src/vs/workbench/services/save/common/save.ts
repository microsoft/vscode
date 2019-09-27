/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISaveOptions } from 'vs/workbench/services/textfile/common/textfiles';

export const ISaveService = createDecorator<ISaveService>('saveService');

export interface ISaveService {
	_serviceBrand: undefined;

	/**
	 * Saves the resource.
	 *
	 * @param resource the resource to save
	 * @param options optional save options
	 * @return true if the resource was saved.
	 */
	save(resource: URI, options?: ISaveOptions): Promise<boolean>;
}
