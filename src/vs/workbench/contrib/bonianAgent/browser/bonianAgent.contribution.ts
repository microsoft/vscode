/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { BonianAgentViewPane } from './bonianAgentViewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';

const VIEW_ID = 'workbench.view.bonianAgent';
const CONTAINER_ID = 'workbench.view.extension.bonianAgentContainer';

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: CONTAINER_ID,
	title: localize2('bonianAgent', 'Bonian Agent'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: Codicon.robot,
	hideIfEmpty: true,
	order: 10,
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: VIEW_ID,
	name: localize2('bonianAgent', 'Bonian Agent'),
	canToggleVisibility: false,
	canMoveView: false,
	ctorDescriptor: new SyncDescriptor(BonianAgentViewPane),
}], viewContainer);

registerAction2(class SendToAgentAction extends Action2 {
	constructor() {
		super({
			id: 'bonianAgent.sendToAgent',
			title: localize2('sendToAgent', 'Send to Bonian Agent'),
			menu: [{
				id: MenuId.ExplorerContext,
				when: ContextKeyExpr.regex('resourceFilename', /\.(png|jpg|jpeg|svg)$/i),
				group: 'navigation'
			}]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await viewsService.openView(VIEW_ID, true) as BonianAgentViewPane | undefined;

		const uri = args[0];
		if (uri && view) {
			view.startPipeline(uri.toString());
		}
	}
});
