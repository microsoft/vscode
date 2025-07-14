/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';
import { CodeCoverageDecorations } from './codeCoverageDecorations.js';
import { testingResultsIcon, testingViewIcon } from './icons.js';
import { TestCoverageView } from './testCoverageView.js';
import { TestingDecorationService, TestingDecorations } from './testingDecorations.js';
import { TestingExplorerView } from './testingExplorerView.js';
import { CloseTestPeek, CollapsePeekStack, GoToNextMessageAction, GoToPreviousMessageAction, OpenMessageInEditorAction, TestResultsView, TestingOutputPeekController, TestingPeekOpener, ToggleTestingPeekHistory } from './testingOutputPeek.js';
import { TestingProgressTrigger } from './testingProgressUiService.js';
import { TestingViewPaneContainer } from './testingViewPaneContainer.js';
import { testingConfiguration } from '../common/configuration.js';
import { TestCommandId, Testing } from '../common/constants.js';
import { ITestCoverageService, TestCoverageService } from '../common/testCoverageService.js';
import { ITestExplorerFilterState, TestExplorerFilterState } from '../common/testExplorerFilterState.js';
import { TestId, TestPosition } from '../common/testId.js';
import { canUseProfileWithTest, ITestProfileService, TestProfileService } from '../common/testProfileService.js';
import { ITestResultService, TestResultService } from '../common/testResultService.js';
import { ITestResultStorage, TestResultStorage } from '../common/testResultStorage.js';
import { ITestService } from '../common/testService.js';
import { TestService } from '../common/testServiceImpl.js';
import { ITestItem, ITestRunProfileReference, TestRunProfileBitset } from '../common/testTypes.js';
import { TestingContentProvider } from '../common/testingContentProvider.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import { ITestingContinuousRunService, TestingContinuousRunService } from '../common/testingContinuousRunService.js';
import { ITestingDecorationsService } from '../common/testingDecorations.js';
import { ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { allTestActions, discoverAndRunTests } from './testExplorerActions.js';
import './testingConfigurationUi.js';
import { URI } from '../../../../base/common/uri.js';

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
		accessor.get(ITestExplorerFilterState).reveal.set(typeof testId === 'string' ? testId : testId.extId, undefined);
		accessor.get(IViewsService).openView(Testing.ExplorerViewId, focus);
	}
});
CommandsRegistry.registerCommand({
	id: TestCommandId.StartContinousRunFromExtension,
	handler: async (accessor: ServicesAccessor, profileRef: ITestRunProfileReference, tests: readonly ITestItem[]) => {
		const profiles = accessor.get(ITestProfileService);
		const collection = accessor.get(ITestService).collection;
		const profile = profiles.getControllerProfiles(profileRef.controllerId).find(p => p.profileId === profileRef.profileId);
		if (!profile?.supportsContinuousRun) {
			return;
		}

		const crService = accessor.get(ITestingContinuousRunService);
		for (const test of tests) {
			const found = collection.getNodeById(test.extId);
			if (found && canUseProfileWithTest(profile, found)) {
				crService.start([profile], found.item.extId);
			}
		}
	}
});
CommandsRegistry.registerCommand({
	id: TestCommandId.StopContinousRunFromExtension,
	handler: async (accessor: ServicesAccessor, tests: readonly ITestItem[]) => {
		const crService = accessor.get(ITestingContinuousRunService);
		for (const test of tests) {
			crService.stop(test.extId);
		}
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
	handler: async (accessor: ServicesAccessor, extId: string, opts?: { preserveFocus?: boolean; openToSide?: boolean }) => {
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

		accessor.get(ITestExplorerFilterState).reveal.set(extId, undefined);
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
			: uri,
			{
				openToSide: opts?.openToSide,
				editorOptions: {
					preserveFocus: opts?.preserveFocus,
				}
			}
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

CommandsRegistry.registerCommand({
	id: 'vscode.testing.getControllersWithTests',
	handler: async (accessor: ServicesAccessor) => {
		const testService = accessor.get(ITestService);
		return [...testService.collection.rootItems]
			.filter(r => r.children.size > 0)
			.map(r => r.controllerId);
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.testing.getTestsInFile',
	handler: async (accessor: ServicesAccessor, uri: URI) => {
		const testService = accessor.get(ITestService);
		return [...testService.collection.getNodeByUrl(uri)].map(t => TestId.split(t.item.extId));
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(testingConfiguration);

