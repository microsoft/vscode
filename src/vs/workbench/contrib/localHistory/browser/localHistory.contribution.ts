/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/contrib/localHistory/browser/localHistoryCommands';
import { WorkbenchContributionInstantiation, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { LocalHistoryTimeline } from 'vs/workbench/contrib/localHistory/browser/localHistoryTimeline';

// Register Local History Timeline
registerWorkbenchContribution2(LocalHistoryTimeline.ID, LocalHistoryTimeline, WorkbenchContributionInstantiation.BlockRestore);
