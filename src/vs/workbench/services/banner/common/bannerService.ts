/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IBannerService = createDecorator<IBannerService>('bannerService');

export interface IBannerService {
	readonly _serviceBrand: undefined;

	setBannerVisibility(visible: boolean): void;
}
