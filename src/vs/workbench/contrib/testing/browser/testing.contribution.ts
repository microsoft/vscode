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
import { IProgressService } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { TestingDecorations } from 'vs/workbench/contrib/testing/browser/testingDecorations';
import { ITestExplorerFilterState, TestExplorerFilterState } from 'vs/workbench/contrib/testing/browser/testingExplorerFilter';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { CloseTestPeek, TestingOutputPeekController, TestingPeekOpener } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { ITestingOutputTerminalService, TestingOutputTerminalService } from 'vs/workbench/contrib/testing/browser/testingOutputTerminalService';
import { ITestingProgressUiService, TestingProgressUiService } from 'vs/workbench/contrib/testing/browser/testingProgressUiService';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { testingConfiguation } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { TestIdPath, ITestIdWithSrc, identifyTest } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestingAutoRun, TestingAutoRun } from 'vs/workbench/contrib/testing/common/testingAutoRun';
import { TestingContentProvider } from 'vs/workbench/contrib/testing/common/testingContentProvider';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { ITestResultService, TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestResultStorage, TestResultStorage } from 'vs/workbench/contrib/testing/common/testResultStorage';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { allTestActions, runTestsByPath } from './testExplorerActions';

registerSingleton(ITestService, TestService);
registerSingleton(ITestResultStorage, TestResultStorage);
registerSingleton(ITestResultService, TestResultService);
registerSingleton(ITestExplorerFilterState, TestExplorerFilterState);
registerSingleton(ITestingAutoRun, TestingAutoRun, true);
registerSingleton(ITestingOutputTerminalService, TestingOutputTerminalService, true);
registerSingleton(ITestingPeekOpener, TestingPeekOpener);
registerSingleton(ITestingProgressUiService, TestingProgressUiService);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ViewletId,
	title: localize('test', "Testing"),
	ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
	icon: testingViewIcon,
	alwaysUseContainerInfo: true,
	order: 6,
	openCommandActionDescriptor: {
		id: Testing.ViewletId,
		mnemonicTitle: localize({ key: 'miViewTesting', comment: ['&& denotes a mnemonic'] }, "T&&esting"),
		// todo: coordinate with joh whether this is available
		// keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SEMICOLON },
		order: 4,
	},
	hideIfEmpty: true,
}, ViewContainerLocation.Sidebar);

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize('noTestProvidersRegistered', "No tests have been found in this workspace yet."),
});

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize(
		{
			key: 'searchMarketplaceForTestExtensions',
			comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'],
		},
		"[Find Test Extensions](command:{0})",
		'testing.searchForTestExtension'
	),
	order: 10
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
	when: ContextKeyExpr.greater(TestingContextKeys.providerCount.key, 0),
}], viewContainer);

allTestActions.forEach(registerAction2);
registerAction2(CloseTestPeek);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingContentProvider, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingPeekOpener, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingProgressUiService, LifecyclePhase.Eventually);

registerEditorContribution(Testing.OutputPeekContributionId, TestingOutputPeekController);
registerEditorContribution(Testing.DecorationsContributionId, TestingDecorations);

CommandsRegistry.registerCommand({
	id: 'vscode.runTests',
	handler: async (accessor: ServicesAccessor, tests: ITestIdWithSrc[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: false, tests });
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.debugTests',
	handler: async (accessor: ServicesAccessor, tests: ITestIdWithSrc[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: true, tests });
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.revealTestInExplorer',
	handler: async (accessor: ServicesAccessor, pathToTest: TestIdPath) => {
		accessor.get(ITestExplorerFilterState).reveal.value = pathToTest;
		accessor.get(IViewsService).openView(Testing.ExplorerViewId);
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.peekTestError',
	handler: async (accessor: ServicesAccessor, extId: string) => {
		const lookup = accessor.get(ITestResultService).getStateById(extId);
		if (lookup) {
			accessor.get(ITestingPeekOpener).tryPeekFirstError(lookup[0], lookup[1]);
		}
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.runTestsByPath',
	handler: async (accessor: ServicesAccessor, debug: boolean, ...pathToTests: TestIdPath[]) => {
		const testService = accessor.get(ITestService);
		await runTestsByPath(
			accessor.get(ITestService).collection,
			accessor.get(IProgressService),
			pathToTests,
			tests => testService.runTests({
				debug: false,
				tests: tests.map(identifyTest),
			}),
		);
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(testingConfiguation);
