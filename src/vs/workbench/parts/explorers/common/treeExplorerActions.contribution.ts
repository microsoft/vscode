/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IActivityService } from 'vs/workbench/services/activity/common/activityService';

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

export class ToggleExtViewletAction extends Action {
	public static ID = 'workbench.action.customTreeExplorer.toggle';
	public static LABEL = localize('toggleCustomExplorer', 'Toggle Custom Explorer');

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IActivityService private activityService: IActivityService
	) {
		super(id, name);
	}

	run(): TPromise<any> {
		const infoForExtViewlets = this.activityService.getInfoForExtViewlets();

		const picks: IPickOpenEntry[] = [];
		for (let viewletId in infoForExtViewlets) {
			const { isEnabled, treeLabel } = infoForExtViewlets[viewletId];
			const actionLabel = isEnabled ? localize('disable', 'Disable') : localize('enable', 'Enable');
			picks.push({
				id: viewletId,
				label: `${actionLabel} ${treeLabel}`
			});
		}

		return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() => {
			this.quickOpenService.pick(picks, { placeHolder: 'Select Custom Explorer to toggle' }).then(pick => {
				if (pick) {
					this.activityService.toggleExtViewlet(pick.id);
				}
			});
		});
	}
}

registry.registerWorkbenchAction(
	new SyncActionDescriptor(ToggleExtViewletAction, ToggleExtViewletAction.ID, ToggleExtViewletAction.LABEL),
	'View: Toggle Custom Explorer',
	localize('view', "View")
);
