/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { WorkspaceStats } from 'vs/workbench/contrib/stats/electron-browser/workspaceStats';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// Register Workspace Stats Contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceStats, LifecyclePhase.Eventually);