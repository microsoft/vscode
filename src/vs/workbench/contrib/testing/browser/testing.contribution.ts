/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingCollectionService, TestingCollectionService } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestingExplorerView, TESTING_EXPLORER_VIEW_ID } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { TESTING_VIEWLET_ID } from 'vs/workbench/contrib/testing/common/testViews';

registerSingleton(ITestService, TestService);
registerSingleton(ITestingCollectionService, TestingCollectionService);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: TESTING_VIEWLET_ID,
	name: localize('testing', "Testing"),
	ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
	icon: testingViewIcon,
	alwaysUseContainerInfo: true,
	order: 5,
	hideIfEmpty: true,
}, ViewContainerLocation.Sidebar);


const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViewWelcomeContent(TESTING_EXPLORER_VIEW_ID, {
	content: localize('noTestProvidersRegistered', "No test providers are registered for this workspace."),
});

viewsRegistry.registerViewWelcomeContent(TESTING_EXPLORER_VIEW_ID, {
	content: localize(
		{
			key: 'searchMarketplaceForTestExtensions',
			comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'],
		},
		"[Search Marketplace](command:{0})",
		`workbench.extensions.search?${encodeURIComponent(JSON.stringify(['@tag:testing']))}`
	),
});

viewsRegistry.registerViews([{
	id: TESTING_EXPLORER_VIEW_ID,
	name: localize('testExplorer', "Test Explorer"),
	ctorDescriptor: new SyncDescriptor(TestingExplorerView),
	canToggleVisibility: true,
	workspace: true,
	canMoveView: true,
	weight: 80,
	order: -999,
	containerIcon: testingViewIcon,
	// temporary until release, at which point we can show the welcome view:
	when: ContextKeyExpr.greater(TestingContextKeys.providerCount.serialize(), 0),
}], viewContainer);
