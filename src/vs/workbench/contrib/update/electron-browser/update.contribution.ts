/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/update/node/update.config.contribution';
import * as platform from 'vs/base/common/platform';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ShowCurrentReleaseNotesAction, ProductContribution, UpdateContribution, Win3264BitContribution } from './update';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

const workbench = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

workbench.registerWorkbenchContribution(ProductContribution, LifecyclePhase.Restored);

if (platform.isWindows) {
	if (process.arch === 'ia32') {
		workbench.registerWorkbenchContribution(Win3264BitContribution, LifecyclePhase.Restored);
	}
}

workbench.registerWorkbenchContribution(UpdateContribution, LifecyclePhase.Restored);

// Editor
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(ShowCurrentReleaseNotesAction, ShowCurrentReleaseNotesAction.ID, ShowCurrentReleaseNotesAction.LABEL), 'Show Release Notes');
