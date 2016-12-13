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
import { CloneAction } from './gitActions';
import { GitContentProvider } from '../common/gitContentProvider';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';

registerContributions();

// Register Service
registerSingleton(IGitService, ElectronGitService);

const category = localize('git', "Git");

Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(CloneAction, CloneAction.ID, CloneAction.LABEL), 'Git: Clone', category);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(GitContentProvider);