/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import platform = require('vs/platform/platform');
import workbenchActionRegistry = require('vs/workbench/common/actionRegistry');
import {SelectColorThemeAction} from 'vs/workbench/parts/themes/common/selectColorThemeAction';
import {SelectIconThemeAction} from 'vs/workbench/parts/themes/common/selectIconThemeAction';

const category = nls.localize('preferences', "Preferences");
let workbenchActionsRegistry = <workbenchActionRegistry.IWorkbenchActionRegistry>platform.Registry.as(
	workbenchActionRegistry.Extensions.WorkbenchActions
);

workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(
		SelectColorThemeAction,
		SelectColorThemeAction.ID,
		SelectColorThemeAction.LABEL
	),
	category
);

workbenchActionsRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(
		SelectIconThemeAction,
		SelectIconThemeAction.ID,
		SelectIconThemeAction.LABEL
	),
	category
);