/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {TimeKeeperRenderer} from 'vs/base/browser/ui/timer/timer';
import {Action} from 'vs/base/common/actions';

let timeKeeperRenderer: TimeKeeperRenderer = null;

export class ShowPerformanceBox extends Action {

	constructor(id: string, label: string) {
		super(id, label, null, true);
	}

	public run(): TPromise<any> {
		if (timeKeeperRenderer === null) {
			timeKeeperRenderer = new TimeKeeperRenderer(() => {
				timeKeeperRenderer.destroy();
				timeKeeperRenderer = null;
			});
		}
		return TPromise.as(true);
	}
}

// if (false /* Env.enablePerformanceTools */) {
// 	let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
// 	registry.registerWorkbenchAction(new SyncActionDescriptor(ShowPerformanceBox, ID, LABEL));
// }