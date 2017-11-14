/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { NodeCachedDataManager } from 'vs/workbench/parts/cache/node/nodeCachedDataManager';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// Register NodeCachedDataManager Contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NodeCachedDataManager, LifecyclePhase.Eventually);