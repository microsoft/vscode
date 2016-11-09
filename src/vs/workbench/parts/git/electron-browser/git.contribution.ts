/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerContributions } from 'vs/workbench/parts/git/browser/gitWorkbenchContributions';
import { ElectronGitService } from 'vs/workbench/parts/git/electron-browser/electronGitService';
import { IGitService } from 'vs/workbench/parts/git/common/git';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actionRegistry';
import { CloneAction } from './gitActions';

registerContributions();

// Register Service
registerSingleton(IGitService, ElectronGitService);

const workbenchActionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
const category = localize('git', "Git");

workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CloneAction, CloneAction.ID, CloneAction.LABEL), 'Git: Clone', category);