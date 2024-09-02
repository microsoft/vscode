/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IGPUStatusMainService = createDecorator<IGPUStatusMainService>('gpuStatusService');

export interface IGPUStatusMainService {
	readonly _serviceBrand: undefined;
	openGPUStatusWindow: (options: OpenGPUStatusWindowOptions) => void;
}

export interface OpenGPUStatusWindowOptions {
	zoomLevel: number;
}
