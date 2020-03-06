/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { UserDataSyncWorkbenchContribution } from 'vs/workbench/contrib/userDataSync/browser/userDataSync';
import { UserDataSyncViewContribution } from 'vs/workbench/contrib/userDataSync/browser/userDataSyncView';

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, LifecyclePhase.Ready);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncViewContribution, LifecyclePhase.Ready);
