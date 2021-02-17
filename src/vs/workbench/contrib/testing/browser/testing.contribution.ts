/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { TestingDecorations } from 'vs/workbench/contrib/testing/browser/testingDecorations';
import { ITestExplorerFilterState, TestExplorerFilterState } from 'vs/workbench/contrib/testing/browser/testingExplorerFilter';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { CloseTestPeek, ITestingPeekOpener, TestingOutputPeekController, TestingPeekOpener } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { testingConfiguation } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestingAutoRun, TestingAutoRun } from 'vs/workbench/contrib/testing/common/testingAutoRun';
import { TestingContentProvider } from 'vs/workbench/contrib/testing/common/testingContentProvider';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestResultService, TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { IWorkspaceTestCollectionService, WorkspaceTestCollectionService } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import * as Action from './testExplorerActions';

registerSingleton(ITestService, TestService);
registerSingleton(ITestResultService, TestResultService);
registerSingleton(ITestExplorerFilterState, TestExplorerFilterState);
registerSingleton(ITestingAutoRun, TestingAutoRun, true);
registerSingleton(ITestingPeekOpener, TestingPeekOpener);
registerSingleton(IWorkspaceTestCollectionService, WorkspaceTestCollectionService);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ViewletId,
	title: localize('test', "Test"),
	ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
	icon: testingViewIcon,
	alwaysUseContainerInfo: true,
	order: 6,
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
registerAction2(Action.TestingSortByNameAction);
registerAction2(Action.TestingSortByLocationAction);
registerAction2(Action.RefreshTestsAction);
registerAction2(Action.CollapseAllAction);
registerAction2(Action.RunAllAction);
registerAction2(Action.DebugAllAction);
registerAction2(Action.EditFocusedTest);
registerAction2(Action.ClearTestResultsAction);
registerAction2(Action.ToggleAutoRun);
registerAction2(Action.DebugAtCursor);
registerAction2(Action.RunAtCursor);
registerAction2(Action.DebugCurrentFile);
registerAction2(Action.RunCurrentFile);
registerAction2(Action.ReRunFailedTests);
registerAction2(Action.DebugFailedTests);
registerAction2(Action.ReRunLastRun);
registerAction2(Action.DebugLastRun);
registerAction2(CloseTestPeek);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingContentProvider, LifecyclePhase.Eventually);

registerEditorContribution(Testing.OutputPeekContributionId, TestingOutputPeekController);
registerEditorContribution(Testing.DecorationsContributionId, TestingDecorations);

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

CommandsRegistry.registerCommand({
	id: 'vscode.revealTestInExplorer',
	handler: async (accessor: ServicesAccessor, extId: string) => {
		accessor.get(ITestExplorerFilterState).reveal.value = extId;
		accessor.get(IViewsService).openView(Testing.ExplorerViewId);
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.peekTestError',
	handler: async (accessor: ServicesAccessor, extId: string) => {
		const lookup = accessor.get(ITestResultService).getStateByExtId(extId);
		if (lookup) {
			accessor.get(ITestingPeekOpener).tryPeekFirstError(lookup[0], lookup[1]);
		}
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(testingConfiguation);
