/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from 'vs/workbench/common/views';
import { THIRD_PANEL_VIEWLET_ID } from 'vs/workbench/contrib/thirdPanel/browser/thirdPanel';

export class ThirdPanelViewPaneContainer extends ViewPaneContainer {

}

export const thirdPanelViewRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: THIRD_PANEL_VIEWLET_ID,
	title: 'Third Panel',
	ctorDescriptor: new SyncDescriptor(ThirdPanelViewPaneContainer),
	storageId: 'workbench.thirdpanel.views.state',
	order: 1,
	hideIfEmpty: false,
}, ViewContainerLocation.ThirdPanel, { isDefault: true, donotRegisterOpenCommand: true });

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViewWelcomeContent(THIRD_PANEL_VIEWLET_ID, {
	content: 'Third Panel Area',
	when: 'default'
});
