/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NativeWorkingCopyHistoryService } from '../common/workingCopyHistoryService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkingCopyHistoryService } from '../common/workingCopyHistory.js';

// Register Service
registerSingleton(IWorkingCopyHistoryService, NativeWorkingCopyHistoryService, InstantiationType.Delayed);
