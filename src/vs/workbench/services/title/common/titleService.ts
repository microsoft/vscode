/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITitleService = createDecorator<ITitleService>('titleService');

export interface ITitleService {
	_serviceBrand: any;

	/**
	 * Set the window title with the given value.
	 */
	setTitle(title: string): void;

	/**
	 * Set the represented file name to the title if any.
	 */
	setRepresentedFilename(path: string): void;
}