/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const IRenameSymbolTrackerService = createDecorator<IRenameSymbolTrackerService>('renameSymbolTrackerService');

export interface IRenameSymbolTrackerService {
	readonly _serviceBrand: undefined;

}
