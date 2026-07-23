/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { RepoctxTrustViewPane } from './repoctxView.js';

// Native Repoctx IDE view container.
export const REPOCTX_VIEW_CONTAINER_ID = 'workbench.view.repoctx';

const repoctxViewIcon = registerIcon('repoctx-view-icon', Codicon.shield, localize('repoctxViewIcon', "View icon for Repoctx trust evidence."));
const repoctxRefreshIcon = registerIcon('repoctx-refresh-icon', Codicon.refresh, localize('repoctxRefreshIcon', "Icon for refreshing Repoctx evidence."));

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

const viewContainer = viewContainersRegistry.registerViewContainer({
	id: REPOCTX_VIEW_CONTAINER_ID,
	title: localize2('repoctxViewContainer', "Repoctx"),
	icon: repoctxViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [REPOCTX_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: REPOCTX_VIEW_CONTAINER_ID,
	order: 2.5,
}, ViewContainerLocation.Sidebar);

class RepoctxTrustViewDescriptor implements IViewDescriptor {
	readonly id = RepoctxTrustViewPane.ID;
	readonly name: ILocalizedString = RepoctxTrustViewPane.TITLE;
	readonly containerIcon = repoctxViewIcon;
	readonly ctorDescriptor = new SyncDescriptor(RepoctxTrustViewPane);
	readonly order = 1;
	readonly weight = 100;
	readonly canToggleVisibility = false;
	readonly canMoveView = true;
	readonly openCommandActionDescriptor = {
		id: 'workbench.action.openRepoctx',
		title: localize2('openRepoctx', "Open Repoctx"),
	};
}

viewsRegistry.registerViews([new RepoctxTrustViewDescriptor()], viewContainer);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repoctx.refreshEvidence',
			title: localize2('repoctxRefreshEvidence', "Refresh Evidence"),
			icon: repoctxRefreshIcon,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', RepoctxTrustViewPane.ID),
				group: 'navigation',
				order: 1,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.getActiveViewWithId<RepoctxTrustViewPane>(RepoctxTrustViewPane.ID)?.refresh();
	}
});
