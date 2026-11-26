/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { SizeIdentifier, SizeValue } from './sizeUtils.js';
import { IColorTheme } from './themeService.js';

export const ISizeService = createDecorator<ISizeService>('sizeService');
export const SIZE_CUSTOMIZATIONS_SETTING = 'workbench.sizeCustomizations';

/** Resolves validated semantic sizes for both CSS and programmatic consumers. */
export interface ISizeService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSizes: Event<void>;
	getSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined;
}
