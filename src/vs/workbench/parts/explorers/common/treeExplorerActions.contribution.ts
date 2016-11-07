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
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { toCustomViewletActionId } from 'vs/workbench/parts/explorers/common/treeExplorer';

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

export class ToggleExtViewletAction extends Action {
	public static ID = toCustomViewletActionId('toggle');
	public static LABEL = localize('toggleCustomExplorer', 'Toggle Custom Explorer');

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, name);
	}

	run(): TPromise<any> {
		const viewletDescriptors = this.viewletService.getViewletDescriptors();

		const picks: IPickOpenEntry[] = viewletDescriptors.map((d) => {
			return {
				id: d.id,
				label: d.name
			};
		});

		viewletDescriptors.forEach(vd => {
			const isEnabled = true;
			const actionLabel = isEnabled ? localize('disable', 'Disable') : localize('enable', 'Enable');
			picks.push({
				id: vd.name,
				label: `${actionLabel} ${vd.name}`
			});

		});

		return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() => {
			this.quickOpenService.pick(picks, { placeHolder: 'Select Custom Explorer to toggle' }).then(pick => {
				if (pick) {
					this.viewletService.toggleViewlet(pick.id);
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
