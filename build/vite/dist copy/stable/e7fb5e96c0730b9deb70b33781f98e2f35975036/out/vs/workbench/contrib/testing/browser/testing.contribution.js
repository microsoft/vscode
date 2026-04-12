/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';
import { testingConfiguration } from '../common/configuration.js';
import { ITestCoverageService, TestCoverageService } from '../common/testCoverageService.js';
import { ITestExplorerFilterState, TestExplorerFilterState } from '../common/testExplorerFilterState.js';
import { TestId } from '../common/testId.js';
import { canUseProfileWithTest, ITestProfileService, TestProfileService } from '../common/testProfileService.js';
import { ITestResultService, TestResultService } from '../common/testResultService.js';
import { ITestResultStorage, TestResultStorage } from '../common/testResultStorage.js';
import { ITestService } from '../common/testService.js';
import { TestService } from '../common/testServiceImpl.js';
import { TestingChatAgentToolContribution } from '../common/testingChatAgentTool.js';
import { TestingContentProvider } from '../common/testingContentProvider.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import { ITestingContinuousRunService, TestingContinuousRunService } from '../common/testingContinuousRunService.js';
import { ITestingDecorationsService } from '../common/testingDecorations.js';
import { ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { CodeCoverageDecorations } from './codeCoverageDecorations.js';
import { testingResultsIcon, testingViewIcon } from './icons.js';
import { TestCoverageView } from './testCoverageView.js';
import { allTestActions, discoverAndRunTests } from './testExplorerActions.js';
import './testingConfigurationUi.js';
import { TestingDecorations, TestingDecorationService } from './testingDecorations.js';
import { TestingExplorerView } from './testingExplorerView.js';
import { CloseTestPeek, CollapsePeekStack, GoToNextMessageAction, GoToPreviousMessageAction, OpenMessageInEditorAction, TestingOutputPeekController, TestingPeekOpener, TestResultsView, ToggleTestingPeekHistory } from './testingOutputPeek.js';
import { TestingProgressTrigger } from './testingProgressUiService.js';
import { TestingViewPaneContainer } from './testingViewPaneContainer.js';
registerSingleton(ITestService, TestService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestResultStorage, TestResultStorage, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestProfileService, TestProfileService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestCoverageService, TestCoverageService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestingContinuousRunService, TestingContinuousRunService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestResultService, TestResultService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestExplorerFilterState, TestExplorerFilterState, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestingPeekOpener, TestingPeekOpener, 1 /* InstantiationType.Delayed */);
registerSingleton(ITestingDecorationsService, TestingDecorationService, 1 /* InstantiationType.Delayed */);
const viewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: "workbench.view.extension.test" /* Testing.ViewletId */,
    title: localize2('test', 'Testing'),
    ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
    icon: testingViewIcon,
    alwaysUseContainerInfo: true,
    order: 6,
    openCommandActionDescriptor: {
        id: "workbench.view.extension.test" /* Testing.ViewletId */,
        mnemonicTitle: localize({ key: 'miViewTesting', comment: ['&& denotes a mnemonic'] }, "T&&esting"),
        // todo: coordinate with joh whether this is available
        // keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SEMICOLON },
        order: 4,
    },
    hideIfEmpty: true,
}, 0 /* ViewContainerLocation.Sidebar */);
const testResultsViewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: "workbench.panel.testResults" /* Testing.ResultsPanelId */,
    title: localize2('testResultsPanelName', "Test Results"),
    icon: testingResultsIcon,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ["workbench.panel.testResults" /* Testing.ResultsPanelId */, { mergeViewWithContainerWhenSingleView: true }]),
    hideIfEmpty: true,
    order: 3,
}, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
viewsRegistry.registerViews([{
        id: "workbench.panel.testResults.view" /* Testing.ResultsViewId */,
        name: localize2('testResultsPanelName', "Test Results"),
        containerIcon: testingResultsIcon,
        canToggleVisibility: false,
        canMoveView: true,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true),
        ctorDescriptor: new SyncDescriptor(TestResultsView),
    }], testResultsViewContainer);
viewsRegistry.registerViewWelcomeContent("workbench.view.testing" /* Testing.ExplorerViewId */, {
    content: localize('noTestProvidersRegistered', "No tests have been found in this workspace yet."),
});
viewsRegistry.registerViewWelcomeContent("workbench.view.testing" /* Testing.ExplorerViewId */, {
    content: '[' + localize('searchForAdditionalTestExtensions', "Install Additional Test Extensions...") + `](command:${"testing.searchForTestExtension" /* TestCommandId.SearchForTestExtension */})`,
    order: 10
});
viewsRegistry.registerViews([{
        id: "workbench.view.testing" /* Testing.ExplorerViewId */,
        name: localize2('testExplorer', "Test Explorer"),
        ctorDescriptor: new SyncDescriptor(TestingExplorerView),
        canToggleVisibility: true,
        canMoveView: true,
        weight: 80,
        order: -999,
        containerIcon: testingViewIcon,
        when: ContextKeyExpr.greater(TestingContextKeys.providerCount.key, 0),
    }, {
        id: "workbench.view.testCoverage" /* Testing.CoverageViewId */,
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
registerWorkbenchContribution2(TestingContentProvider.ID, TestingContentProvider, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(TestingPeekOpener.ID, TestingPeekOpener, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(TestingProgressTrigger.ID, TestingProgressTrigger, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(TestingChatAgentToolContribution.ID, TestingChatAgentToolContribution, 4 /* WorkbenchPhase.Eventually */);
registerEditorContribution("editor.contrib.testingOutputPeek" /* Testing.OutputPeekContributionId */, TestingOutputPeekController, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorContribution("editor.contrib.testingDecorations" /* Testing.DecorationsContributionId */, TestingDecorations, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorContribution("editor.contrib.coverageDecorations" /* Testing.CoverageDecorationsContributionId */, CodeCoverageDecorations, 3 /* EditorContributionInstantiation.Eventually */);
CommandsRegistry.registerCommand({
    id: '_revealTestInExplorer',
    handler: async (accessor, testId, focus) => {
        accessor.get(ITestExplorerFilterState).reveal.set(typeof testId === 'string' ? testId : testId.extId, undefined);
        accessor.get(IViewsService).openView("workbench.view.testing" /* Testing.ExplorerViewId */, focus);
    }
});
CommandsRegistry.registerCommand({
    id: "testing.startContinuousRunFromExtension" /* TestCommandId.StartContinousRunFromExtension */,
    handler: async (accessor, profileRef, tests) => {
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
    id: "testing.stopContinuousRunFromExtension" /* TestCommandId.StopContinousRunFromExtension */,
    handler: async (accessor, tests) => {
        const crService = accessor.get(ITestingContinuousRunService);
        for (const test of tests) {
            crService.stop(test.extId);
        }
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.peekTestError',
    handler: async (accessor, extId) => {
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
            if (TestId.compare(ownState.item.extId, test.item.extId) === 2 /* TestPosition.IsChild */ && opener.tryPeekFirstError(result, test)) {
                return true;
            }
        }
        return false;
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.revealTest',
    handler: async (accessor, extId, opts) => {
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
        }
        catch {
            // ignored
        }
        if (!isFile) {
            await commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
            return;
        }
        await openerService.open(position
            ? uri.with({ fragment: `L${position.lineNumber}:${position.column}` })
            : uri, {
            openToSide: opts?.openToSide,
            editorOptions: {
                preserveFocus: opts?.preserveFocus,
            }
        });
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.runTestsById',
    handler: async (accessor, group, ...testIds) => {
        const testService = accessor.get(ITestService);
        await discoverAndRunTests(accessor.get(ITestService).collection, accessor.get(IProgressService), testIds, tests => testService.runTests({ group, tests }));
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.testing.getControllersWithTests',
    handler: async (accessor) => {
        const testService = accessor.get(ITestService);
        return [...testService.collection.rootItems]
            .filter(r => r.children.size > 0)
            .map(r => r.controllerId);
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.testing.getTestsInFile',
    handler: async (accessor, uri) => {
        const testService = accessor.get(ITestService);
        return [...testService.collection.getNodeByUrl(uri)].map(t => TestId.split(t.item.extId));
    }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration(testingConfiguration);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvdGVzdGluZy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzdILE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRyxPQUFPLEVBQTJDLFVBQVUsSUFBSSx1QkFBdUIsRUFBeUIsTUFBTSwwQkFBMEIsQ0FBQztBQUNqSixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFbEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekcsT0FBTyxFQUFFLE1BQU0sRUFBZ0IsTUFBTSxxQkFBcUIsQ0FBQztBQUMzRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRTNELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDakUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekQsT0FBTyxFQUFFLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9FLE9BQU8sNkJBQTZCLENBQUM7QUFDckMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLHdCQUF3QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNsUCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN2RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV6RSxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsV0FBVyxvQ0FBNEIsQ0FBQztBQUN4RSxpQkFBaUIsQ0FBQyxrQkFBa0IsRUFBRSxpQkFBaUIsb0NBQTRCLENBQUM7QUFDcEYsaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLG9DQUE0QixDQUFDO0FBQ3RGLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLG1CQUFtQixvQ0FBNEIsQ0FBQztBQUN4RixpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRSwyQkFBMkIsb0NBQTRCLENBQUM7QUFDeEcsaUJBQWlCLENBQUMsa0JBQWtCLEVBQUUsaUJBQWlCLG9DQUE0QixDQUFDO0FBQ3BGLGlCQUFpQixDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixvQ0FBNEIsQ0FBQztBQUNoRyxpQkFBaUIsQ0FBQyxrQkFBa0IsRUFBRSxpQkFBaUIsb0NBQTRCLENBQUM7QUFDcEYsaUJBQWlCLENBQUMsMEJBQTBCLEVBQUUsd0JBQXdCLG9DQUE0QixDQUFDO0FBRW5HLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQTBCLHVCQUF1QixDQUFDLHNCQUFzQixDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDaEksRUFBRSx5REFBbUI7SUFDckIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDO0lBQ25DLGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyx3QkFBd0IsQ0FBQztJQUM1RCxJQUFJLEVBQUUsZUFBZTtJQUNyQixzQkFBc0IsRUFBRSxJQUFJO0lBQzVCLEtBQUssRUFBRSxDQUFDO0lBQ1IsMkJBQTJCLEVBQUU7UUFDNUIsRUFBRSx5REFBbUI7UUFDckIsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQztRQUNsRyxzREFBc0Q7UUFDdEQsa0ZBQWtGO1FBQ2xGLEtBQUssRUFBRSxDQUFDO0tBQ1I7SUFDRCxXQUFXLEVBQUUsSUFBSTtDQUNqQix3Q0FBZ0MsQ0FBQztBQUdsQyxNQUFNLHdCQUF3QixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQTBCLHVCQUF1QixDQUFDLHNCQUFzQixDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDM0ksRUFBRSw0REFBd0I7SUFDMUIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxzQkFBc0IsRUFBRSxjQUFjLENBQUM7SUFDeEQsSUFBSSxFQUFFLGtCQUFrQjtJQUN4QixjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsaUJBQWlCLEVBQUUsNkRBQXlCLEVBQUUsb0NBQW9DLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMvSCxXQUFXLEVBQUUsSUFBSTtJQUNqQixLQUFLLEVBQUUsQ0FBQztDQUNSLHVDQUErQixFQUFFLHdCQUF3QixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFFcEUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBaUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFHekYsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVCLEVBQUUsZ0VBQXVCO1FBQ3pCLElBQUksRUFBRSxTQUFTLENBQUMsc0JBQXNCLEVBQUUsY0FBYyxDQUFDO1FBQ3ZELGFBQWEsRUFBRSxrQkFBa0I7UUFDakMsbUJBQW1CLEVBQUUsS0FBSztRQUMxQixXQUFXLEVBQUUsSUFBSTtRQUNqQixJQUFJLEVBQUUsa0JBQWtCLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7UUFDdEQsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLGVBQWUsQ0FBQztLQUNuRCxDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztBQUU5QixhQUFhLENBQUMsMEJBQTBCLHdEQUF5QjtJQUNoRSxPQUFPLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLGlEQUFpRCxDQUFDO0NBQ2pHLENBQUMsQ0FBQztBQUVILGFBQWEsQ0FBQywwQkFBMEIsd0RBQXlCO0lBQ2hFLE9BQU8sRUFBRSxHQUFHLEdBQUcsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHVDQUF1QyxDQUFDLEdBQUcsYUFBYSwyRUFBb0MsR0FBRztJQUM1SixLQUFLLEVBQUUsRUFBRTtDQUNULENBQUMsQ0FBQztBQUVILGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QixFQUFFLHVEQUF3QjtRQUMxQixJQUFJLEVBQUUsU0FBUyxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7UUFDaEQsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLG1CQUFtQixDQUFDO1FBQ3ZELG1CQUFtQixFQUFFLElBQUk7UUFDekIsV0FBVyxFQUFFLElBQUk7UUFDakIsTUFBTSxFQUFFLEVBQUU7UUFDVixLQUFLLEVBQUUsQ0FBQyxHQUFHO1FBQ1gsYUFBYSxFQUFFLGVBQWU7UUFDOUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDckUsRUFBRTtRQUNGLEVBQUUsNERBQXdCO1FBQzFCLElBQUksRUFBRSxTQUFTLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQztRQUNoRCxjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsZ0JBQWdCLENBQUM7UUFDcEQsbUJBQW1CLEVBQUUsSUFBSTtRQUN6QixXQUFXLEVBQUUsSUFBSTtRQUNqQixNQUFNLEVBQUUsRUFBRTtRQUNWLEtBQUssRUFBRSxDQUFDLEdBQUc7UUFDWCxhQUFhLEVBQUUsZUFBZTtRQUM5QixJQUFJLEVBQUUsa0JBQWtCLENBQUMsa0JBQWtCO0tBQzNDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUVuQixjQUFjLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3hDLGVBQWUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBQzNDLGVBQWUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBQzNDLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ3ZDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMvQixlQUFlLENBQUMsd0JBQXdCLENBQUMsQ0FBQztBQUMxQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUVuQyw4QkFBOEIsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLHVDQUErQixDQUFDO0FBQ2hILDhCQUE4QixDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxpQkFBaUIsb0NBQTRCLENBQUM7QUFDbkcsOEJBQThCLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLHNCQUFzQixvQ0FBNEIsQ0FBQztBQUM3Ryw4QkFBOEIsQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFFLEVBQUUsZ0NBQWdDLG9DQUE0QixDQUFDO0FBRWpJLDBCQUEwQiw0RUFBbUMsMkJBQTJCLDJEQUFtRCxDQUFDO0FBQzVJLDBCQUEwQiw4RUFBb0Msa0JBQWtCLDJEQUFtRCxDQUFDO0FBQ3BJLDBCQUEwQix1RkFBNEMsdUJBQXVCLHFEQUE2QyxDQUFDO0FBRTNJLGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUsdUJBQXVCO0lBQzNCLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxNQUEwQixFQUFFLEtBQWUsRUFBRSxFQUFFO1FBQzFGLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2pILFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSx3REFBeUIsS0FBSyxDQUFDLENBQUM7SUFDckUsQ0FBQztDQUNELENBQUMsQ0FBQztBQUNILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLDhGQUE4QztJQUNoRCxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsVUFBb0MsRUFBRSxLQUEyQixFQUFFLEVBQUU7UUFDaEgsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsVUFBVSxDQUFDO1FBQ3pELE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEgsSUFBSSxDQUFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxDQUFDO1lBQ3JDLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQzdELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDMUIsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsSUFBSSxLQUFLLElBQUkscUJBQXFCLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3BELFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQztBQUNILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLDRGQUE2QztJQUMvQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsS0FBMkIsRUFBRSxFQUFFO1FBQzFFLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM3RCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0lBQ2hDLEVBQUUsRUFBRSxzQkFBc0I7SUFDMUIsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEtBQWEsRUFBRSxFQUFFO1FBQzVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUM7UUFDbEMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2hELElBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWTtZQUM3RCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsaUNBQXlCLElBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUM3SCxPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0lBQ2hDLEVBQUUsRUFBRSxtQkFBbUI7SUFDdkIsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEtBQWEsRUFBRSxJQUF3RCxFQUFFLEVBQUU7UUFDdEgsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFbkQsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLE9BQU87UUFDUixDQUFDO1FBRUQsMkVBQTJFO1FBQzNFLGlEQUFpRDtRQUNqRCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO1FBRTVILFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRSxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFakQsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQyxDQUFDLE1BQU0sV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMzQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ2hCLENBQUM7UUFDRixDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsVUFBVTtRQUNYLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLGNBQWMsQ0FBQyxjQUFjLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEUsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsUUFBUTtZQUNoQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLFFBQVEsQ0FBQyxVQUFVLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDdEUsQ0FBQyxDQUFDLEdBQUcsRUFDTDtZQUNDLFVBQVUsRUFBRSxJQUFJLEVBQUUsVUFBVTtZQUM1QixhQUFhLEVBQUU7Z0JBQ2QsYUFBYSxFQUFFLElBQUksRUFBRSxhQUFhO2FBQ2xDO1NBQ0QsQ0FDRCxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUscUJBQXFCO0lBQ3pCLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxLQUEyQixFQUFFLEdBQUcsT0FBaUIsRUFBRSxFQUFFO1FBQ2hHLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsTUFBTSxtQkFBbUIsQ0FDeEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxVQUFVLEVBQ3JDLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsRUFDOUIsT0FBTyxFQUNQLEtBQUssQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUMvQyxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUsd0NBQXdDO0lBQzVDLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxFQUFFO1FBQzdDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7YUFDMUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO2FBQ2hDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUM1QixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0lBQ2hDLEVBQUUsRUFBRSwrQkFBK0I7SUFDbkMsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLEdBQVEsRUFBRSxFQUFFO1FBQ3ZELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMzRixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyJ9