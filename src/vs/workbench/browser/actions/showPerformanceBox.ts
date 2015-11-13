/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise} from 'vs/base/common/winjs.base';
import {TimeKeeperRenderer} from 'vs/base/browser/ui/timer/timer';
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/browser/actionRegistry';
import {INullService} from 'vs/platform/instantiation/common/instantiation';

const ID = 'workbench.action.showPerfBox';
const LABEL = 'Display Performance Box';

let timeKeeperRenderer: TimeKeeperRenderer = null;

export class ShowPerformanceBox extends Action {

	constructor(id: string, label: string, @INullService ns: any) {
		super(id, label, null, true);
	}

	public run(): Promise {
		if (timeKeeperRenderer === null) {
			timeKeeperRenderer = new TimeKeeperRenderer(() => {
				timeKeeperRenderer.destroy();
				timeKeeperRenderer = null;
			});
		}
		return Promise.as(true);
	}
}

if (false /* Env.enablePerformanceTools */) {
	let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
	registry.registerWorkbenchAction(new SyncActionDescriptor(ShowPerformanceBox, ID, LABEL));
}