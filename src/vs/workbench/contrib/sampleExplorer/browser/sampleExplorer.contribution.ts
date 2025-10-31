/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { SampleExplorerViewsContribution } from './sampleExplorerViewlet.js';

// Register Sample Explorer views
registerWorkbenchContribution2(SampleExplorerViewsContribution.ID, SampleExplorerViewsContribution, WorkbenchPhase.BlockStartup);
