/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExplorerViewsService } from 'vs/workbench/parts/explorers/common/explorer';
import { ExplorerViewsService } from 'vs/workbench/parts/explorers/browser/explorerView';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(IExplorerViewsService, ExplorerViewsService);