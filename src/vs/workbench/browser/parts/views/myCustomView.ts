/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPane, IViewPaneOptions } from './viewPane.js';
import { ViewContainerLocation, IViewsService, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, Extensions as ViewRegistryExtensions } from '../../../common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibleViewInformationService } from '../../../../platform/accessibility/browser/accessibleView.js';

// ✅ Your custom view class
export class MyCustomView extends ViewPane {
	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAccessibleViewInformationService accessibleViewInformationService: IAccessibleViewInformationService
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService,
			accessibleViewInformationService
		);
	}

	override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.innerText = 'Hello from My Custom View!';
	}
}

// ✅ Register view container
const viewContainerRegistry = Registry.as<IViewContainersRegistry>('workbench.containers');
const myContainer = viewContainerRegistry.registerViewContainer({
	id: 'mySidebarViews',
	title: localize('mySidebarViews', 'My Views'),
	hideIfEmpty: false,
	order: 0,
	ctorDescriptor: undefined,
	openCommandActionDescriptor: {
		id: 'myCustomView.open',
		title: localize('openMyView', 'Open My Custom View'),
	},
}, ViewContainerLocation.Right, {
	mergeViewWithContainerWhenSingleView: true
});

// ✅ Register the view itself
const viewsRegistry = Registry.as<IViewsRegistry>(ViewRegistryExtensions.ViewsRegistry);
viewsRegistry.registerViews([
	{
		id: 'myCustomView',
		name: 'My Custom View',
		canMoveView: true,
		ctorDescriptor: {
			ctor: MyCustomView
		},
		container: myContainer,
		order: 1
	}
]);
