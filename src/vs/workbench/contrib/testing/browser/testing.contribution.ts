/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingCollectionService, TestingCollectionService } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import * as Action from './testExplorerActions';

registerSingleton(ITestService, TestService);
registerSingleton(ITestingCollectionService, TestingCollectionService);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ViewletId,
	name: localize('testing', "Testing"),
	ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
	icon: testingViewIcon,
	alwaysUseContainerInfo: true,
	order: 5,
	hideIfEmpty: true,
}, ViewContainerLocation.Sidebar);


const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize('noTestProvidersRegistered', "No test providers are registered for this workspace."),
});

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
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
	id: Testing.ExplorerViewId,
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

registerAction2(Action.TestingViewAsListAction);
registerAction2(Action.TestingViewAsTreeAction);
registerAction2(Action.CancelTestRunAction);
registerAction2(Action.RunSelectedAction);
registerAction2(Action.DebugSelectedAction);
registerAction2(Action.TestingGroupByLocationAction);
registerAction2(Action.TestingGroupByStatusAction);
registerAction2(Action.RefreshTestsAction);

CommandsRegistry.registerCommand({
	id: 'vscode.runTests',
	handler: async (accessor: ServicesAccessor, tests: TestIdWithProvider[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: false, tests: tests.filter(t => t.providerId && t.testId) });
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.debugTests',
	handler: async (accessor: ServicesAccessor, tests: TestIdWithProvider[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: true, tests: tests.filter(t => t.providerId && t.testId) });
	}
});
