/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { ITreeItem } from 'vs/workbench/common/views';
import { ITreeViewsService as ITreeViewsServiceCommon, TreeviewsService } from 'vs/workbench/services/views/common/treeViewsService';

export interface ITreeViewsService extends ITreeViewsServiceCommon<VSDataTransfer, ITreeItem, HTMLElement> { }
export const ITreeViewsService = createDecorator<ITreeViewsService>('treeViewsService');
registerSingleton(ITreeViewsService, TreeviewsService, false);
