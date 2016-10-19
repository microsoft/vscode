/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITreeExplorerViewletService, TreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(ITreeExplorerViewletService, TreeExplorerViewletService);
