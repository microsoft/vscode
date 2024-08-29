/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from 'vs/workbench/common/views';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from 'vs/workbench/contrib/files/browser/fileConstants';
import { CodeCoverageDecorations } from 'vs/workbench/contrib/testing/browser/codeCoverageDecorations';
import { testingResultsIcon, testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { TestCoverageView } from 'vs/workbench/contrib/testing/browser/testCoverageView';
import { TestingDecorationService, TestingDecorations } from 'vs/workbench/contrib/testing/browser/testingDecorations';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { CloseTestPeek, CollapsePeekStack, GoToNextMessageAction, GoToPreviousMessageAction, OpenMessageInEditorAction, TestResultsView, TestingOutputPeekController, TestingPeekOpener, ToggleTestingPeekHistory } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { TestingProgressTrigger } from 'vs/workbench/contrib/testing/browser/testingProgressUiService';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { testingConfiguration } from 'vs/workbench/contrib/testing/common/configuration';
import { TestCommandId, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { ITestCoverageService, TestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { ITestExplorerFilterState, TestExplorerFilterState } from 'vs/workbench/contrib/testing/common/testExplorerFilterState';
import { TestId, TestPosition } from 'vs/workbench/contrib/testing/common/testId';
import { ITestProfileService, TestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResultService, TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestResultStorage, TestResultStorage } from 'vs/workbench/contrib/testing/common/testResultStorage';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { ITestItem, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContentProvider } from 'vs/workbench/contrib/testing/common/testingContentProvider';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingContinuousRunService, TestingContinuousRunService } from 'vs/workbench/contrib/testing/common/testingContinuousRunService';
import { ITestingDecorationsService } from 'vs/workbench/contrib/testing/common/testingDecorations';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { allTestActions, discoverAndRunTests } from './testExplorerActions';
import './testingConfigurationUi';

registerSingleton(ITestService, TestService, InstantiationType.Delayed);
registerSingleton(ITestResultStorage, TestResultStorage, InstantiationType.Delayed);
registerSingleton(ITestProfileService, TestProfileService, InstantiationType.Delayed);
registerSingleton(ITestCoverageService, TestCoverageService, InstantiationType.Delayed);
registerSingleton(ITestingContinuousRunService, TestingContinuousRunService, InstantiationType.Delayed);
registerSingleton(ITestResultService, TestResultService, InstantiationType.Delayed);
registerSingleton(ITestExplorerFilterState, TestExplorerFilterState, InstantiationType.Delayed);
registerSingleton(ITestingPeekOpener, TestingPeekOpener, InstantiationType.Delayed);
registerSingleton(ITestingDecorationsService, TestingDecorationService, InstantiationType.Delayed);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ViewletId,
	title: localize2('test', 'Testing'),
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


const testResultsViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ResultsPanelId,
	title: localize2('testResultsPanelName', "Test Results"),
	icon: testingResultsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [Testing.ResultsPanelId, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	order: 3,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);


viewsRegistry.registerViews([{
	id: Testing.ResultsViewId,
	name: localize2('testResultsPanelName', "Test Results"),
	containerIcon: testingResultsIcon,
	canToggleVisibility: false,
	canMoveView: true,
	when: TestingContextKeys.hasAnyResults.isEqualTo(true),
	ctorDescriptor: new SyncDescriptor(TestResultsView),
}], testResultsViewContainer);

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize('noTestProvidersRegistered', "No tests have been found in this workspace yet."),
});

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: '[' + localize('searchForAdditionalTestExtensions', "Install Additional Test Extensions...") + `](command:${TestCommandId.SearchForTestExtension})`,
	order: 10
});

viewsRegistry.registerViews([{
	id: Testing.ExplorerViewId,
	name: localize2('testExplorer', "Test Explorer"),
	ctorDescriptor: new SyncDescriptor(TestingExplorerView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 80,
	order: -999,
	containerIcon: testingViewIcon,
	when: ContextKeyExpr.greater(TestingContextKeys.providerCount.key, 0),
}, {
	id: Testing.CoverageViewId,
	name: localize2('testCoverage', "Test Coverage"),
	ctorDescriptor: new SyncDescriptor(TestCoverageView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 80,
	order: -998,
	containerIcon: testingViewIcon,
	when: TestingContextKeys.isTestCoverageOpen,
}], viewContainer);

allTestActions.forEach(registerAction2);
registerAction2(OpenMessageInEditorAction);
registerAction2(GoToPreviousMessageAction);
registerAction2(GoToNextMessageAction);
registerAction2(CloseTestPeek);
registerAction2(ToggleTestingPeekHistory);
registerAction2(CollapsePeekStack);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingContentProvider, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingPeekOpener, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingProgressTrigger, LifecyclePhase.Eventually);

registerEditorContribution(Testing.OutputPeekContributionId, TestingOutputPeekController, EditorContributionInstantiation.AfterFirstRender);
registerEditorContribution(Testing.DecorationsContributionId, TestingDecorations, EditorContributionInstantiation.AfterFirstRender);
registerEditorContribution(Testing.CoverageDecorationsContributionId, CodeCoverageDecorations, EditorContributionInstantiation.Eventually);

CommandsRegistry.registerCommand({
	id: '_revealTestInExplorer',
	handler: async (accessor: ServicesAccessor, testId: string | ITestItem, focus?: boolean) => {
		accessor.get(ITestExplorerFilterState).reveal.value = typeof testId === 'string' ? testId : testId.extId;
		accessor.get(IViewsService).openView(Testing.ExplorerViewId, focus);
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.peekTestError',
	handler: async (accessor: ServicesAccessor, extId: string) => {
		const lookup = accessor.get(ITestResultService).getStateById(extId);
		if (!lookup) {
			return false;
		}

		const [result, ownState] = lookup;
		const opener = accessor.get(ITestingPeekOpener);
		if (opener.tryPeekFirstError(result, ownState)) { // fast path
			return true;
		}

		for (const test of result.tests) {
			if (TestId.compare(ownState.item.extId, test.item.extId) === TestPosition.IsChild && opener.tryPeekFirstError(result, test)) {
				return true;
			}
		}

		return false;
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.revealTest',
	handler: async (accessor: ServicesAccessor, extId: string) => {
		const test = accessor.get(ITestService).collection.getNodeById(extId);
		if (!test) {
			return;
		}
		const commandService = accessor.get(ICommandService);
		const fileService = accessor.get(IFileService);
		const openerService = accessor.get(IOpenerService);

		const { range, uri } = test.item;
		if (!uri) {
			return;
		}

		// If an editor has the file open, there are decorations. Try to adjust the
		// revealed range to those decorations (#133441).
		const position = accessor.get(ITestingDecorationsService).getDecoratedTestPosition(uri, extId) || range?.getStartPosition();

		accessor.get(ITestExplorerFilterState).reveal.value = extId;
		accessor.get(ITestingPeekOpener).closeAllPeeks();

		let isFile = true;
		try {
			if (!(await fileService.stat(uri)).isFile) {
				isFile = false;
			}
		} catch {
			// ignored
		}

		if (!isFile) {
			await commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
			return;
		}

		await openerService.open(position
			? uri.with({ fragment: `L${position.lineNumber}:${position.column}` })
			: uri
		);
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.runTestsById',
	handler: async (accessor: ServicesAccessor, group: TestRunProfileBitset, ...testIds: string[]) => {
		const testService = accessor.get(ITestService);
		await discoverAndRunTests(
			accessor.get(ITestService).collection,
			accessor.get(IProgressService),
			testIds,
			tests => testService.runTests({ group, tests }),
		);
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(testingConfiguration);

