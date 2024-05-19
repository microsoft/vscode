/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWebUtilsService = createDecorator<IWebUtilsService>('webUtilsService');

export interface IWebUtilsService {
	readonly _serviceBrand: undefined;

	readonly getPathForFile: (file: File) => string
}
