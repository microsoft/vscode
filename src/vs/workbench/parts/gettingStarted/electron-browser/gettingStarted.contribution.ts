/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import {GettingStarted} from 'vs/workbench/parts/gettingStarted/electron-browser/gettingStarted';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';

(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	GettingStarted
);