/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NativeWorkingCopyHistoryService } from '../common/workingCopyHistoryService';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkingCopyHistoryService } from '../common/workingCopyHistory';

// Register Service
registerSingleton(IWorkingCopyHistoryService, NativeWorkingCopyHistoryService, InstantiationType.Delayed);
