/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { toCustomExplorerViewletActionId } from 'vs/workbench/parts/explorers/common/treeExplorer';

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

export class ToggleExternalViewletAction extends Action {
	public static ID = toCustomExplorerViewletActionId('toggle');
	public static LABEL = localize('treeExplorer.toggle', 'Toggle Custom Explorer');

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, name);
	}

	run(): TPromise<any> {
		const extViewlets = this.viewletService.getAllViewlets().filter(viewlet => viewlet.isExternal);

		const picks: IPickOpenEntry[] = [];

		extViewlets.forEach(viewlet => {
			const isEnabled = this.viewletService.isViewletEnabled(viewlet.id);
			const actionLabel = isEnabled ? localize('disable', 'Disable') : localize('enable', 'Enable');
			picks.push({
				id: viewlet.id,
				label: `${actionLabel} ${viewlet.name}`,
				run: () => {
					this.viewletService.toggleViewlet(viewlet.id).then(() => {
						if (isEnabled) {
							// To disable, so open default viewlet
							const defaultViewletId = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getDefaultViewletId();
							this.viewletService.openViewlet(defaultViewletId);
						} else {
							// To enable, so open the viewlet to be enabled
							this.viewletService.openViewlet(viewlet.id);
						}
					});
				}
			});
		});

		return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() => {
			this.quickOpenService.pick(picks, { placeHolder: 'Select Custom Explorer to toggle' }).done();
		});
	}
}

registry.registerWorkbenchAction(
	new SyncActionDescriptor(ToggleExternalViewletAction, ToggleExternalViewletAction.ID, ToggleExternalViewletAction.LABEL),
	'View: Toggle Custom Explorer',
	localize('view', "View")
);
