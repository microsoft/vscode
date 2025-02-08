/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IPartsSplash } from '../../../../platform/theme/common/themeService.js';

export const ISplashStorageService = createDecorator<ISplashStorageService>('ISplashStorageService');

export interface ISplashStorageService {

	readonly _serviceBrand: undefined;

	saveWindowSplash(splash: IPartsSplash): Promise<void>;
}
