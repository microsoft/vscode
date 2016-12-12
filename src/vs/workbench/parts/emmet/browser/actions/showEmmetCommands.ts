/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/platform';

import { QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

const EMMET_COMMANDS_PREFIX = '>Emmet: ';

class ShowEmmetCommandsAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEmmetCommands';
	public static LABEL = nls.localize('showEmmetCommands', "Show Emmet Commands");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, EMMET_COMMANDS_PREFIX, quickOpenService);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEmmetCommandsAction, ShowEmmetCommandsAction.ID, ShowEmmetCommandsAction.LABEL), 'Show Emmet Commands');
