/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IRuntimeNotebookKernelService = createDecorator<IRuntimeNotebookKernelService>('runtimeNotebookKernelService');

export interface IRuntimeNotebookKernelService {
	readonly _serviceBrand: undefined;
	initialize(): void;
}



