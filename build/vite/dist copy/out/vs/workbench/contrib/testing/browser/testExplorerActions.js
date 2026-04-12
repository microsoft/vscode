/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { SymbolNavigationAction } from '../../../../editor/contrib/gotoSymbol/browser/goToCommands.js';
import { ReferencesModel } from '../../../../editor/contrib/gotoSymbol/browser/referencesModel.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { PeekContext } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyGreaterExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { widgetClose } from '../../../../platform/theme/common/iconRegistry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { TestItemTreeElement } from './explorerProjections/index.js';
import * as icons from './icons.js';
import { testConfigurationGroupNames } from '../common/constants.js';
import { getTestingConfiguration } from '../common/configuration.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { TestId } from '../common/testId.js';
import { ITestProfileService, canUseProfileWithTest } from '../common/testProfileService.js';
import { ITestResultService } from '../common/testResultService.js';
import { ITestService, expandAndGetTestById, testsInFile, testsUnderUri } from '../common/testService.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import { ITestingContinuousRunService } from '../common/testingContinuousRunService.js';
import { ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { isFailedState } from '../common/testingStates.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
const category = Categories.Test;
var ActionOrder;
(function (ActionOrder) {
    // Navigation:
    ActionOrder[ActionOrder["Refresh"] = 10] = "Refresh";
    ActionOrder[ActionOrder["Run"] = 11] = "Run";
    ActionOrder[ActionOrder["Debug"] = 12] = "Debug";
    ActionOrder[ActionOrder["Coverage"] = 13] = "Coverage";
    ActionOrder[ActionOrder["RunContinuous"] = 14] = "RunContinuous";
    ActionOrder[ActionOrder["RunUsing"] = 15] = "RunUsing";
    // Submenu:
    ActionOrder[ActionOrder["Collapse"] = 16] = "Collapse";
    ActionOrder[ActionOrder["ClearResults"] = 17] = "ClearResults";
    ActionOrder[ActionOrder["DisplayMode"] = 18] = "DisplayMode";
    ActionOrder[ActionOrder["Sort"] = 19] = "Sort";
    ActionOrder[ActionOrder["GoToTest"] = 20] = "GoToTest";
    ActionOrder[ActionOrder["HideTest"] = 21] = "HideTest";
    ActionOrder[ActionOrder["ContinuousRunTest"] = 2147483647] = "ContinuousRunTest";
})(ActionOrder || (ActionOrder = {}));
const hasAnyTestProvider = ContextKeyGreaterExpr.create(TestingContextKeys.providerCount.key, 0);
const LABEL_RUN_TESTS = localize2('runSelectedTests', "Run Tests");
const LABEL_DEBUG_TESTS = localize2('debugSelectedTests', "Debug Tests");
const LABEL_COVERAGE_TESTS = localize2('coverageSelectedTests', "Run Tests with Coverage");
export class HideTestAction extends Action2 {
    constructor() {
        super({
            id: "testing.hideTest" /* TestCommandId.HideTestAction */,
            title: localize2('hideTest', 'Hide Test'),
            menu: {
                id: MenuId.TestItem,
                group: 'builtin@2',
                when: TestingContextKeys.testItemIsHidden.isEqualTo(false)
            },
        });
    }
    run(accessor, ...elements) {
        const service = accessor.get(ITestService);
        for (const element of elements) {
            service.excluded.toggle(element.test, true);
        }
        return Promise.resolve();
    }
}
export class UnhideTestAction extends Action2 {
    constructor() {
        super({
            id: "testing.unhideTest" /* TestCommandId.UnhideTestAction */,
            title: localize2('unhideTest', 'Unhide Test'),
            menu: {
                id: MenuId.TestItem,
                order: 21 /* ActionOrder.HideTest */,
                when: TestingContextKeys.testItemIsHidden.isEqualTo(true)
            },
        });
    }
    run(accessor, ...elements) {
        const service = accessor.get(ITestService);
        for (const element of elements) {
            if (element instanceof TestItemTreeElement) {
                service.excluded.toggle(element.test, false);
            }
        }
        return Promise.resolve();
    }
}
export class UnhideAllTestsAction extends Action2 {
    constructor() {
        super({
            id: "testing.unhideAllTests" /* TestCommandId.UnhideAllTestsAction */,
            title: localize2('unhideAllTests', 'Unhide All Tests'),
        });
    }
    run(accessor) {
        const service = accessor.get(ITestService);
        service.excluded.clear();
        return Promise.resolve();
    }
}
const testItemInlineAndInContext = (order, when) => [
    {
        id: MenuId.TestItem,
        group: 'inline',
        order,
        when,
    }, {
        id: MenuId.TestItem,
        group: 'builtin@1',
        order,
        when,
    }
];
class RunVisibleAction extends ViewAction {
    constructor(bitset, desc) {
        super({
            ...desc,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
        });
        this.bitset = bitset;
    }
    /**
     * @override
     */
    runInView(accessor, view, ...elements) {
        const { include, exclude } = view.getTreeIncludeExclude(this.bitset, elements.map(e => e.test));
        return accessor.get(ITestService).runTests({
            tests: include,
            exclude,
            group: this.bitset,
        });
    }
}
export class DebugAction extends RunVisibleAction {
    constructor() {
        super(4 /* TestRunProfileBitset.Debug */, {
            id: "testing.debug" /* TestCommandId.DebugAction */,
            title: localize2('debug test', 'Debug Test'),
            icon: icons.testingDebugIcon,
            menu: testItemInlineAndInContext(12 /* ActionOrder.Debug */, TestingContextKeys.hasDebuggableTests.isEqualTo(true)),
        });
    }
}
export class CoverageAction extends RunVisibleAction {
    constructor() {
        super(8 /* TestRunProfileBitset.Coverage */, {
            id: "testing.coverage" /* TestCommandId.RunWithCoverageAction */,
            title: localize2('run with cover test', 'Run Test with Coverage'),
            icon: icons.testingCoverageIcon,
            menu: testItemInlineAndInContext(13 /* ActionOrder.Coverage */, TestingContextKeys.hasCoverableTests.isEqualTo(true)),
        });
    }
}
export class RunUsingProfileAction extends Action2 {
    constructor() {
        super({
            id: "testing.runUsing" /* TestCommandId.RunUsingProfileAction */,
            title: localize2('testing.runUsing', 'Execute Using Profile...'),
            icon: icons.testingDebugIcon,
            menu: {
                id: MenuId.TestItem,
                order: 15 /* ActionOrder.RunUsing */,
                group: 'builtin@2',
                when: TestingContextKeys.hasNonDefaultProfile.isEqualTo(true),
            },
        });
    }
    async run(acessor, ...elements) {
        const commandService = acessor.get(ICommandService);
        const testService = acessor.get(ITestService);
        const profile = await commandService.executeCommand('vscode.pickTestProfile', {
            onlyForTest: elements[0].test,
        });
        if (!profile) {
            return;
        }
        testService.runResolvedTests({
            group: profile.group,
            targets: [{
                    profileId: profile.profileId,
                    controllerId: profile.controllerId,
                    testIds: elements.filter(t => canUseProfileWithTest(profile, t.test)).map(t => t.test.item.extId)
                }]
        });
    }
}
export class RunAction extends RunVisibleAction {
    constructor() {
        super(2 /* TestRunProfileBitset.Run */, {
            id: "testing.run" /* TestCommandId.RunAction */,
            title: localize2('run test', 'Run Test'),
            icon: icons.testingRunIcon,
            menu: testItemInlineAndInContext(11 /* ActionOrder.Run */, TestingContextKeys.hasRunnableTests.isEqualTo(true)),
        });
    }
}
export class SelectDefaultTestProfiles extends Action2 {
    constructor() {
        super({
            id: "testing.selectDefaultTestProfiles" /* TestCommandId.SelectDefaultTestProfiles */,
            title: localize2('testing.selectDefaultTestProfiles', 'Select Default Profile'),
            icon: icons.testingUpdateProfiles,
            category,
        });
    }
    async run(acessor, onlyGroup) {
        const commands = acessor.get(ICommandService);
        const testProfileService = acessor.get(ITestProfileService);
        const profiles = await commands.executeCommand('vscode.pickMultipleTestProfiles', {
            showConfigureButtons: false,
            selected: testProfileService.getGroupDefaultProfiles(onlyGroup),
            onlyGroup,
        });
        if (profiles?.length) {
            testProfileService.setGroupDefaultProfiles(onlyGroup, profiles);
        }
    }
}
export class ContinuousRunTestAction extends Action2 {
    constructor() {
        super({
            id: "testing.toggleContinuousRunForTest" /* TestCommandId.ToggleContinousRunForTest */,
            title: localize2('testing.toggleContinuousRunOn', 'Turn on Continuous Run'),
            icon: icons.testingTurnContinuousRunOn,
            precondition: ContextKeyExpr.or(TestingContextKeys.isContinuousModeOn.isEqualTo(true), TestingContextKeys.isParentRunningContinuously.isEqualTo(false)),
            toggled: {
                condition: TestingContextKeys.isContinuousModeOn.isEqualTo(true),
                icon: icons.testingContinuousIsOn,
                title: localize('testing.toggleContinuousRunOff', 'Turn off Continuous Run'),
            },
            menu: testItemInlineAndInContext(2147483647 /* ActionOrder.ContinuousRunTest */, TestingContextKeys.supportsContinuousRun.isEqualTo(true)),
        });
    }
    async run(accessor, ...elements) {
        const crService = accessor.get(ITestingContinuousRunService);
        for (const element of elements) {
            const id = element.test.item.extId;
            if (crService.isSpecificallyEnabledFor(id)) {
                crService.stop(id);
                continue;
            }
            crService.start(2 /* TestRunProfileBitset.Run */, id);
        }
    }
}
export class ContinuousRunUsingProfileTestAction extends Action2 {
    constructor() {
        super({
            id: "testing.continuousRunUsingForTest" /* TestCommandId.ContinousRunUsingForTest */,
            title: localize2('testing.startContinuousRunUsing', 'Start Continous Run Using...'),
            icon: icons.testingDebugIcon,
            menu: [
                {
                    id: MenuId.TestItem,
                    order: 14 /* ActionOrder.RunContinuous */,
                    group: 'builtin@2',
                    when: ContextKeyExpr.and(TestingContextKeys.supportsContinuousRun.isEqualTo(true), TestingContextKeys.isContinuousModeOn.isEqualTo(false))
                }
            ],
        });
    }
    async run(accessor, ...elements) {
        const crService = accessor.get(ITestingContinuousRunService);
        const profileService = accessor.get(ITestProfileService);
        const notificationService = accessor.get(INotificationService);
        const quickInputService = accessor.get(IQuickInputService);
        for (const element of elements) {
            const selected = await selectContinuousRunProfiles(crService, notificationService, quickInputService, [{ profiles: profileService.getControllerProfiles(element.test.controllerId) }]);
            if (selected.length) {
                crService.start(selected, element.test.item.extId);
            }
        }
    }
}
export class ConfigureTestProfilesAction extends Action2 {
    constructor() {
        super({
            id: "testing.configureProfile" /* TestCommandId.ConfigureTestProfilesAction */,
            title: localize2('testing.configureProfile', "Configure Test Profiles"),
            icon: icons.testingUpdateProfiles,
            f1: true,
            category,
            menu: {
                id: MenuId.CommandPalette,
                when: TestingContextKeys.hasConfigurableProfile.isEqualTo(true),
            },
        });
    }
    async run(acessor, onlyGroup) {
        const commands = acessor.get(ICommandService);
        const testProfileService = acessor.get(ITestProfileService);
        const profile = await commands.executeCommand('vscode.pickTestProfile', {
            placeholder: localize('configureProfile', 'Select a profile to update'),
            showConfigureButtons: false,
            onlyConfigurable: true,
            onlyGroup,
        });
        if (profile) {
            testProfileService.configure(profile.controllerId, profile.profileId);
        }
    }
}
const continuousMenus = (whenIsContinuousOn) => [
    {
        id: MenuId.ViewTitle,
        group: 'navigation',
        order: 15 /* ActionOrder.RunUsing */,
        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */), TestingContextKeys.supportsContinuousRun.isEqualTo(true), TestingContextKeys.isContinuousModeOn.isEqualTo(whenIsContinuousOn)),
    },
    {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.supportsContinuousRun.isEqualTo(true),
    },
];
class StopContinuousRunAction extends Action2 {
    constructor() {
        super({
            id: "testing.stopContinuousRun" /* TestCommandId.StopContinousRun */,
            title: localize2('testing.stopContinuous', 'Stop Continuous Run'),
            category,
            icon: icons.testingTurnContinuousRunOff,
            menu: continuousMenus(true),
        });
    }
    run(accessor) {
        accessor.get(ITestingContinuousRunService).stop();
    }
}
function selectContinuousRunProfiles(crs, notificationService, quickInputService, profilesToPickFrom) {
    const items = [];
    for (const { controller, profiles } of profilesToPickFrom) {
        for (const profile of profiles) {
            if (profile.supportsContinuousRun) {
                items.push({
                    label: profile.label || controller?.label.get() || '',
                    description: controller?.label.get(),
                    profile,
                });
            }
        }
    }
    if (items.length === 0) {
        notificationService.info(localize('testing.noProfiles', 'No test continuous run-enabled profiles were found'));
        return Promise.resolve([]);
    }
    // special case: don't bother to quick a pickpick if there's only a single profile
    if (items.length === 1) {
        return Promise.resolve([items[0].profile]);
    }
    const qpItems = [];
    const selectedItems = [];
    const lastRun = crs.lastRunProfileIds;
    items.sort((a, b) => a.profile.group - b.profile.group
        || a.profile.controllerId.localeCompare(b.profile.controllerId)
        || a.label.localeCompare(b.label));
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (i === 0 || items[i - 1].profile.group !== item.profile.group) {
            qpItems.push({ type: 'separator', label: testConfigurationGroupNames[item.profile.group] });
        }
        qpItems.push(item);
        if (lastRun.has(item.profile.profileId)) {
            selectedItems.push(item);
        }
    }
    const disposables = new DisposableStore();
    const quickpick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    quickpick.title = localize('testing.selectContinuousProfiles', 'Select profiles to run when files change:');
    quickpick.canSelectMany = true;
    quickpick.items = qpItems;
    quickpick.selectedItems = selectedItems;
    quickpick.show();
    return new Promise(resolve => {
        disposables.add(quickpick.onDidAccept(() => {
            resolve(quickpick.selectedItems.map(i => i.profile));
            disposables.dispose();
        }));
        disposables.add(quickpick.onDidHide(() => {
            resolve([]);
            disposables.dispose();
        }));
    });
}
class StartContinuousRunAction extends Action2 {
    constructor() {
        super({
            id: "testing.startContinuousRun" /* TestCommandId.StartContinousRun */,
            title: localize2('testing.startContinuous', "Start Continuous Run"),
            category,
            icon: icons.testingTurnContinuousRunOn,
            menu: continuousMenus(false),
        });
    }
    async run(accessor) {
        const crs = accessor.get(ITestingContinuousRunService);
        const profileService = accessor.get(ITestProfileService);
        const lastRunProfiles = [...profileService.all()].flatMap(p => p.profiles.filter(p => crs.lastRunProfileIds.has(p.profileId)));
        if (lastRunProfiles.length) {
            return crs.start(lastRunProfiles);
        }
        const selected = await selectContinuousRunProfiles(crs, accessor.get(INotificationService), accessor.get(IQuickInputService), accessor.get(ITestProfileService).all());
        if (selected.length) {
            crs.start(selected);
        }
    }
}
class ExecuteSelectedAction extends ViewAction {
    constructor(options, group) {
        super({
            ...options,
            menu: [{
                    id: MenuId.ViewTitle,
                    order: group === 2 /* TestRunProfileBitset.Run */
                        ? 11 /* ActionOrder.Run */
                        : group === 4 /* TestRunProfileBitset.Debug */
                            ? 12 /* ActionOrder.Debug */
                            : 13 /* ActionOrder.Coverage */,
                    group: 'navigation',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */), TestingContextKeys.isRunning.isEqualTo(false), TestingContextKeys.capabilityToContextKey[group].isEqualTo(true))
                }],
            category,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
        });
        this.group = group;
    }
    /**
     * @override
     */
    runInView(accessor, view) {
        const { include, exclude } = view.getTreeIncludeExclude(this.group);
        return accessor.get(ITestService).runTests({ tests: include, exclude, group: this.group });
    }
}
export class GetSelectedProfiles extends Action2 {
    constructor() {
        super({ id: "testing.getSelectedProfiles" /* TestCommandId.GetSelectedProfiles */, title: localize2('getSelectedProfiles', 'Get Selected Profiles') });
    }
    /**
     * @override
     */
    run(accessor) {
        const profiles = accessor.get(ITestProfileService);
        return [
            ...profiles.getGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */),
            ...profiles.getGroupDefaultProfiles(4 /* TestRunProfileBitset.Debug */),
            ...profiles.getGroupDefaultProfiles(8 /* TestRunProfileBitset.Coverage */),
        ].map(p => ({
            controllerId: p.controllerId,
            label: p.label,
            kind: p.group & 8 /* TestRunProfileBitset.Coverage */
                ? 3 /* ExtTestRunProfileKind.Coverage */
                : p.group & 4 /* TestRunProfileBitset.Debug */
                    ? 2 /* ExtTestRunProfileKind.Debug */
                    : 1 /* ExtTestRunProfileKind.Run */,
        }));
    }
}
export class GetExplorerSelection extends ViewAction {
    constructor() {
        super({ id: "_testing.getExplorerSelection" /* TestCommandId.GetExplorerSelection */, title: localize2('getExplorerSelection', 'Get Explorer Selection'), viewId: "workbench.view.testing" /* Testing.ExplorerViewId */ });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        const { include, exclude } = view.getTreeIncludeExclude(2 /* TestRunProfileBitset.Run */, undefined, 'selected');
        const mapper = (i) => i.item.extId;
        return { include: include.map(mapper), exclude: exclude.map(mapper) };
    }
}
export class RunSelectedAction extends ExecuteSelectedAction {
    constructor() {
        super({
            id: "testing.runSelected" /* TestCommandId.RunSelectedAction */,
            title: LABEL_RUN_TESTS,
            icon: icons.testingRunAllIcon,
        }, 2 /* TestRunProfileBitset.Run */);
    }
}
export class DebugSelectedAction extends ExecuteSelectedAction {
    constructor() {
        super({
            id: "testing.debugSelected" /* TestCommandId.DebugSelectedAction */,
            title: LABEL_DEBUG_TESTS,
            icon: icons.testingDebugAllIcon,
        }, 4 /* TestRunProfileBitset.Debug */);
    }
}
export class CoverageSelectedAction extends ExecuteSelectedAction {
    constructor() {
        super({
            id: "testing.coverageSelected" /* TestCommandId.CoverageSelectedAction */,
            title: LABEL_COVERAGE_TESTS,
            icon: icons.testingCoverageAllIcon,
        }, 8 /* TestRunProfileBitset.Coverage */);
    }
}
const showDiscoveringWhile = (progress, task) => {
    return progress.withProgress({
        location: 10 /* ProgressLocation.Window */,
        title: localize('discoveringTests', 'Discovering Tests'),
    }, () => task);
};
class RunOrDebugAllTestsAction extends Action2 {
    constructor(options, group, noTestsFoundError) {
        super({
            ...options,
            category,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
                }]
        });
        this.group = group;
        this.noTestsFoundError = noTestsFoundError;
    }
    async run(accessor) {
        const testService = accessor.get(ITestService);
        const notifications = accessor.get(INotificationService);
        const roots = [...testService.collection.rootItems].filter(r => r.children.size
            || r.expand === 1 /* TestItemExpandState.Expandable */ || r.expand === 2 /* TestItemExpandState.BusyExpanding */);
        if (!roots.length) {
            notifications.info(this.noTestsFoundError);
            return;
        }
        await testService.runTests({ tests: roots, group: this.group });
    }
}
export class RunAllAction extends RunOrDebugAllTestsAction {
    constructor() {
        super({
            id: "testing.runAll" /* TestCommandId.RunAllAction */,
            title: localize2('runAllTests', 'Run All Tests'),
            icon: icons.testingRunAllIcon,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 31 /* KeyCode.KeyA */),
            },
        }, 2 /* TestRunProfileBitset.Run */, localize('noTestProvider', 'No tests found in this workspace. You may need to install a test provider extension'));
    }
}
export class DebugAllAction extends RunOrDebugAllTestsAction {
    constructor() {
        super({
            id: "testing.debugAll" /* TestCommandId.DebugAllAction */,
            title: localize2('debugAllTests', 'Debug All Tests'),
            icon: icons.testingDebugIcon,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */),
            },
        }, 4 /* TestRunProfileBitset.Debug */, localize('noDebugTestProvider', 'No debuggable tests found in this workspace. You may need to install a test provider extension'));
    }
}
export class CoverageAllAction extends RunOrDebugAllTestsAction {
    constructor() {
        super({
            id: "testing.coverageAll" /* TestCommandId.RunAllWithCoverageAction */,
            title: localize2('runAllWithCoverage', 'Run All Tests with Coverage'),
            icon: icons.testingCoverageIcon,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */),
            },
        }, 8 /* TestRunProfileBitset.Coverage */, localize('noCoverageTestProvider', 'No tests with coverage runners found in this workspace. You may need to install a test provider extension'));
    }
}
export class CancelTestRunAction extends Action2 {
    constructor() {
        super({
            id: "testing.cancelRun" /* TestCommandId.CancelTestRunAction */,
            title: localize2('testing.cancelRun', 'Cancel Test Run'),
            icon: icons.testingCancelIcon,
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */),
            },
            menu: [{
                    id: MenuId.ViewTitle,
                    order: 11 /* ActionOrder.Run */,
                    group: 'navigation',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */), ContextKeyExpr.equals(TestingContextKeys.isRunning.serialize(), true))
                }, {
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.isRunning,
                }]
        });
    }
    /**
     * @override
     */
    async run(accessor, resultId, taskId) {
        const resultService = accessor.get(ITestResultService);
        const testService = accessor.get(ITestService);
        if (resultId) {
            testService.cancelTestRun(resultId, taskId);
        }
        else {
            for (const run of resultService.results) {
                if (!run.completedAt) {
                    testService.cancelTestRun(run.id);
                }
            }
        }
    }
}
export class TestingViewAsListAction extends ViewAction {
    constructor() {
        super({
            id: "testing.viewAsList" /* TestCommandId.TestingViewAsListAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.viewAsList', 'View as List'),
            toggled: TestingContextKeys.viewMode.isEqualTo("list" /* TestExplorerViewMode.List */),
            menu: {
                id: MenuId.ViewTitle,
                order: 18 /* ActionOrder.DisplayMode */,
                group: 'viewAs',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.viewMode = "list" /* TestExplorerViewMode.List */;
    }
}
export class TestingViewAsTreeAction extends ViewAction {
    constructor() {
        super({
            id: "testing.viewAsTree" /* TestCommandId.TestingViewAsTreeAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.viewAsTree', 'View as Tree'),
            toggled: TestingContextKeys.viewMode.isEqualTo("true" /* TestExplorerViewMode.Tree */),
            menu: {
                id: MenuId.ViewTitle,
                order: 18 /* ActionOrder.DisplayMode */,
                group: 'viewAs',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.viewMode = "true" /* TestExplorerViewMode.Tree */;
    }
}
export class TestingSortByStatusAction extends ViewAction {
    constructor() {
        super({
            id: "testing.sortByStatus" /* TestCommandId.TestingSortByStatusAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.sortByStatus', 'Sort by Status'),
            toggled: TestingContextKeys.viewSorting.isEqualTo("status" /* TestExplorerViewSorting.ByStatus */),
            menu: {
                id: MenuId.ViewTitle,
                order: 19 /* ActionOrder.Sort */,
                group: 'sortBy',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.viewSorting = "status" /* TestExplorerViewSorting.ByStatus */;
    }
}
export class TestingSortByLocationAction extends ViewAction {
    constructor() {
        super({
            id: "testing.sortByLocation" /* TestCommandId.TestingSortByLocationAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.sortByLocation', 'Sort by Location'),
            toggled: TestingContextKeys.viewSorting.isEqualTo("location" /* TestExplorerViewSorting.ByLocation */),
            menu: {
                id: MenuId.ViewTitle,
                order: 19 /* ActionOrder.Sort */,
                group: 'sortBy',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.viewSorting = "location" /* TestExplorerViewSorting.ByLocation */;
    }
}
export class TestingSortByDurationAction extends ViewAction {
    constructor() {
        super({
            id: "testing.sortByDuration" /* TestCommandId.TestingSortByDurationAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.sortByDuration', 'Sort by Duration'),
            toggled: TestingContextKeys.viewSorting.isEqualTo("duration" /* TestExplorerViewSorting.ByDuration */),
            menu: {
                id: MenuId.ViewTitle,
                order: 19 /* ActionOrder.Sort */,
                group: 'sortBy',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.viewSorting = "duration" /* TestExplorerViewSorting.ByDuration */;
    }
}
export class ShowMostRecentOutputAction extends Action2 {
    constructor() {
        super({
            id: "testing.showMostRecentOutput" /* TestCommandId.ShowMostRecentOutputAction */,
            title: localize2('testing.showMostRecentOutput', 'Show Output'),
            category,
            icon: Codicon.terminal,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */),
            },
            precondition: TestingContextKeys.hasAnyResults.isEqualTo(true),
            menu: [{
                    id: MenuId.ViewTitle,
                    order: 16 /* ActionOrder.Collapse */,
                    group: 'navigation',
                    when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */),
                }, {
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.hasAnyResults.isEqualTo(true)
                }]
        });
    }
    async run(accessor) {
        const viewService = accessor.get(IViewsService);
        const testView = await viewService.openView("workbench.panel.testResults.view" /* Testing.ResultsViewId */, true);
        testView?.showLatestRun();
    }
}
export class CollapseAllAction extends ViewAction {
    constructor() {
        super({
            id: "testing.collapseAll" /* TestCommandId.CollapseAllAction */,
            viewId: "workbench.view.testing" /* Testing.ExplorerViewId */,
            title: localize2('testing.collapseAll', 'Collapse All Tests'),
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.ViewTitle,
                order: 16 /* ActionOrder.Collapse */,
                group: 'displayAction',
                when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
            }
        });
    }
    /**
     * @override
     */
    runInView(_accessor, view) {
        view.viewModel.collapseAll();
    }
}
export class ClearTestResultsAction extends Action2 {
    constructor() {
        super({
            id: "testing.clearTestResults" /* TestCommandId.ClearTestResultsAction */,
            title: localize2('testing.clearResults', 'Clear All Results'),
            category,
            icon: Codicon.clearAll,
            menu: [{
                    id: MenuId.TestPeekTitle,
                }, {
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.hasAnyResults.isEqualTo(true),
                }, {
                    id: MenuId.ViewTitle,
                    order: 17 /* ActionOrder.ClearResults */,
                    group: 'displayAction',
                    when: ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */)
                }, {
                    id: MenuId.ViewTitle,
                    order: 17 /* ActionOrder.ClearResults */,
                    group: 'navigation',
                    when: ContextKeyExpr.equals('view', "workbench.panel.testResults.view" /* Testing.ResultsViewId */)
                }],
        });
    }
    /**
     * @override
     */
    run(accessor) {
        accessor.get(ITestResultService).clear();
    }
}
export class GoToTest extends Action2 {
    constructor() {
        super({
            id: "testing.editFocusedTest" /* TestCommandId.GoToTest */,
            title: localize2('testing.editFocusedTest', 'Go to Test'),
            icon: Codicon.goToFile,
            menu: {
                id: MenuId.TestItem,
                group: 'builtin@1',
                order: 20 /* ActionOrder.GoToTest */,
                when: TestingContextKeys.testItemHasUri.isEqualTo(true),
            },
            keybinding: {
                weight: 100 /* KeybindingWeight.EditorContrib */ - 10,
                when: FocusedViewContext.isEqualTo("workbench.view.testing" /* Testing.ExplorerViewId */),
                primary: 3 /* KeyCode.Enter */ | 512 /* KeyMod.Alt */,
            },
        });
    }
    async run(accessor, element, preserveFocus) {
        if (!element) {
            const view = accessor.get(IViewsService).getActiveViewWithId("workbench.view.testing" /* Testing.ExplorerViewId */);
            element = view?.focusedTreeElements[0];
        }
        if (element && element instanceof TestItemTreeElement) {
            accessor.get(ICommandService).executeCommand('vscode.revealTest', element.test.item.extId, preserveFocus);
        }
    }
}
async function getTestsAtCursor(testService, uriIdentityService, uri, position, filter) {
    // testsInFile will descend in the test tree. We assume that as we go
    // deeper, ranges get more specific. We'll want to run all tests whose
    // range is equal to the most specific range we find (see #133519)
    //
    // If we don't find any test whose range contains the position, we pick
    // the closest one before the position. Again, if we find several tests
    // whose range is equal to the closest one, we run them all.
    let bestNodes = [];
    let bestRange;
    let bestNodesBefore = [];
    let bestRangeBefore;
    for await (const tests of testsInFile(testService, uriIdentityService, uri)) {
        for (const test of tests) {
            if (!test.item.range || filter?.(test) === false) {
                continue;
            }
            const irange = Range.lift(test.item.range);
            if (irange.containsPosition(position)) {
                if (bestRange && Range.equalsRange(test.item.range, bestRange)) {
                    // check that a parent isn't already included (#180760)
                    if (!bestNodes.some(b => TestId.isChild(b.item.extId, test.item.extId))) {
                        bestNodes.push(test);
                    }
                }
                else {
                    bestRange = irange;
                    bestNodes = [test];
                }
            }
            else if (Position.isBefore(irange.getStartPosition(), position)) {
                if (!bestRangeBefore || bestRangeBefore.getStartPosition().isBefore(irange.getStartPosition())) {
                    bestRangeBefore = irange;
                    bestNodesBefore = [test];
                }
                else if (irange.equalsRange(bestRangeBefore) && !bestNodesBefore.some(b => TestId.isChild(b.item.extId, test.item.extId))) {
                    bestNodesBefore.push(test);
                }
            }
        }
    }
    return bestNodes.length ? bestNodes : bestNodesBefore;
}
var EditorContextOrder;
(function (EditorContextOrder) {
    EditorContextOrder[EditorContextOrder["RunAtCursor"] = 0] = "RunAtCursor";
    EditorContextOrder[EditorContextOrder["DebugAtCursor"] = 1] = "DebugAtCursor";
    EditorContextOrder[EditorContextOrder["RunInFile"] = 2] = "RunInFile";
    EditorContextOrder[EditorContextOrder["DebugInFile"] = 3] = "DebugInFile";
    EditorContextOrder[EditorContextOrder["GoToRelated"] = 4] = "GoToRelated";
    EditorContextOrder[EditorContextOrder["PeekRelated"] = 5] = "PeekRelated";
})(EditorContextOrder || (EditorContextOrder = {}));
class ExecuteTestAtCursor extends Action2 {
    constructor(options, group) {
        super({
            ...options,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: hasAnyTestProvider,
                }, {
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: group === 2 /* TestRunProfileBitset.Run */ ? 0 /* EditorContextOrder.RunAtCursor */ : 1 /* EditorContextOrder.DebugAtCursor */,
                    when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group]),
                }]
        });
        this.group = group;
    }
    /**
     * @override
     */
    async run(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        let editor = codeEditorService.getActiveCodeEditor();
        if (!activeEditorPane || !editor) {
            return;
        }
        if (editor instanceof EmbeddedCodeEditorWidget) {
            editor = editor.getParentEditor();
        }
        const position = editor?.getPosition();
        const model = editor?.getModel();
        if (!position || !model || !('uri' in model)) {
            return;
        }
        const testService = accessor.get(ITestService);
        const profileService = accessor.get(ITestProfileService);
        const uriIdentityService = accessor.get(IUriIdentityService);
        const progressService = accessor.get(IProgressService);
        const configurationService = accessor.get(IConfigurationService);
        const saveBeforeTest = getTestingConfiguration(configurationService, "testing.saveBeforeTest" /* TestingConfigKeys.SaveBeforeTest */);
        if (saveBeforeTest) {
            await editorService.save({ editor: activeEditorPane.input, groupId: activeEditorPane.group.id });
            await testService.syncTests();
        }
        // testsInFile will descend in the test tree. We assume that as we go
        // deeper, ranges get more specific. We'll want to run all tests whose
        // range is equal to the most specific range we find (see #133519)
        //
        // If we don't find any test whose range contains the position, we pick
        // the closest one before the position. Again, if we find several tests
        // whose range is equal to the closest one, we run them all.
        const testsToRun = await showDiscoveringWhile(progressService, getTestsAtCursor(testService, uriIdentityService, model.uri, position, test => !!(profileService.capabilitiesForTest(test.item) & this.group)));
        if (testsToRun.length) {
            await testService.runTests({ group: this.group, tests: testsToRun });
            return;
        }
        const relatedTests = await testService.getTestsRelatedToCode(model.uri, position);
        if (relatedTests.length) {
            await testService.runTests({ group: this.group, tests: relatedTests });
            return;
        }
        if (editor) {
            MessageController.get(editor)?.showMessage(localize('noTestsAtCursor', "No tests found here"), position);
        }
    }
}
export class RunAtCursor extends ExecuteTestAtCursor {
    constructor() {
        super({
            id: "testing.runAtCursor" /* TestCommandId.RunAtCursor */,
            title: localize2('testing.runAtCursor', 'Run Test at Cursor'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 33 /* KeyCode.KeyC */),
            },
        }, 2 /* TestRunProfileBitset.Run */);
    }
}
export class DebugAtCursor extends ExecuteTestAtCursor {
    constructor() {
        super({
            id: "testing.debugAtCursor" /* TestCommandId.DebugAtCursor */,
            title: localize2('testing.debugAtCursor', 'Debug Test at Cursor'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */),
            },
        }, 4 /* TestRunProfileBitset.Debug */);
    }
}
export class CoverageAtCursor extends ExecuteTestAtCursor {
    constructor() {
        super({
            id: "testing.coverageAtCursor" /* TestCommandId.CoverageAtCursor */,
            title: localize2('testing.coverageAtCursor', 'Run Test at Cursor with Coverage'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */),
            },
        }, 8 /* TestRunProfileBitset.Coverage */);
    }
}
class ExecuteTestsUnderUriAction extends Action2 {
    constructor(options, group) {
        super({
            ...options,
            menu: [{
                    id: MenuId.ExplorerContext,
                    when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
                    group: '6.5_testing',
                    order: (group === 2 /* TestRunProfileBitset.Run */ ? 11 /* ActionOrder.Run */ : 12 /* ActionOrder.Debug */) + 0.1,
                }],
        });
        this.group = group;
    }
    async run(accessor, uri) {
        const testService = accessor.get(ITestService);
        const notificationService = accessor.get(INotificationService);
        const tests = await Iterable.asyncToArray(testsUnderUri(testService, accessor.get(IUriIdentityService), uri));
        if (!tests.length) {
            notificationService.notify({ message: localize('noTests', 'No tests found in the selected file or folder'), severity: Severity.Info });
            return;
        }
        return testService.runTests({ tests, group: this.group });
    }
}
class RunTestsUnderUri extends ExecuteTestsUnderUriAction {
    constructor() {
        super({
            id: "testing.run.uri" /* TestCommandId.RunByUri */,
            title: LABEL_RUN_TESTS,
            category,
        }, 2 /* TestRunProfileBitset.Run */);
    }
}
class DebugTestsUnderUri extends ExecuteTestsUnderUriAction {
    constructor() {
        super({
            id: "testing.debug.uri" /* TestCommandId.DebugByUri */,
            title: LABEL_DEBUG_TESTS,
            category,
        }, 4 /* TestRunProfileBitset.Debug */);
    }
}
class CoverageTestsUnderUri extends ExecuteTestsUnderUriAction {
    constructor() {
        super({
            id: "testing.coverage.uri" /* TestCommandId.CoverageByUri */,
            title: LABEL_COVERAGE_TESTS,
            category,
        }, 8 /* TestRunProfileBitset.Coverage */);
    }
}
class ExecuteTestsInCurrentFile extends Action2 {
    constructor(options, group) {
        super({
            ...options,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
                }, {
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: group === 2 /* TestRunProfileBitset.Run */ ? 2 /* EditorContextOrder.RunInFile */ : 3 /* EditorContextOrder.DebugInFile */,
                    when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group]),
                }],
        });
        this.group = group;
    }
    async _runByUris(accessor, files) {
        const uriIdentity = accessor.get(IUriIdentityService);
        const testService = accessor.get(ITestService);
        const discovered = [];
        for (const uri of files) {
            for await (const files of testsInFile(testService, uriIdentity, uri, undefined, true)) {
                for (const file of files) {
                    discovered.push(file);
                }
            }
        }
        if (discovered.length) {
            const r = await testService.runTests({ tests: discovered, group: this.group });
            return { completedAt: r.completedAt };
        }
        return { completedAt: undefined };
    }
    /**
     * @override
     */
    run(accessor, files) {
        if (files?.length) {
            return this._runByUris(accessor, files);
        }
        const uriIdentity = accessor.get(IUriIdentityService);
        let editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
        if (!editor) {
            return;
        }
        if (editor instanceof EmbeddedCodeEditorWidget) {
            editor = editor.getParentEditor();
        }
        const position = editor?.getPosition();
        const model = editor?.getModel();
        if (!position || !model || !('uri' in model)) {
            return;
        }
        const testService = accessor.get(ITestService);
        // Iterate through the entire collection and run any tests that are in the
        // uri. See #138007.
        const queue = [testService.collection.rootIds];
        const discovered = [];
        while (queue.length) {
            for (const id of queue.pop()) {
                const node = testService.collection.getNodeById(id);
                if (uriIdentity.extUri.isEqual(node.item.uri, model.uri)) {
                    discovered.push(node);
                }
                else {
                    queue.push(node.children);
                }
            }
        }
        if (discovered.length) {
            return testService.runTests({
                tests: discovered,
                group: this.group,
            });
        }
        if (editor) {
            MessageController.get(editor)?.showMessage(localize('noTestsInFile', "No tests found in this file"), position);
        }
        return undefined;
    }
}
export class RunCurrentFile extends ExecuteTestsInCurrentFile {
    constructor() {
        super({
            id: "testing.runCurrentFile" /* TestCommandId.RunCurrentFile */,
            title: localize2('testing.runCurrentFile', 'Run Tests in Current File'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 36 /* KeyCode.KeyF */),
            },
        }, 2 /* TestRunProfileBitset.Run */);
    }
}
export class DebugCurrentFile extends ExecuteTestsInCurrentFile {
    constructor() {
        super({
            id: "testing.debugCurrentFile" /* TestCommandId.DebugCurrentFile */,
            title: localize2('testing.debugCurrentFile', 'Debug Tests in Current File'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */),
            },
        }, 4 /* TestRunProfileBitset.Debug */);
    }
}
export class CoverageCurrentFile extends ExecuteTestsInCurrentFile {
    constructor() {
        super({
            id: "testing.coverageCurrentFile" /* TestCommandId.CoverageCurrentFile */,
            title: localize2('testing.coverageCurrentFile', 'Run Tests with Coverage in Current File'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 36 /* KeyCode.KeyF */),
            },
        }, 8 /* TestRunProfileBitset.Coverage */);
    }
}
export const discoverAndRunTests = async (collection, progress, ids, runTests) => {
    const todo = Promise.all(ids.map(p => expandAndGetTestById(collection, p)));
    const tests = (await showDiscoveringWhile(progress, todo)).filter(isDefined);
    return tests.length ? await runTests(tests) : undefined;
};
class RunOrDebugExtsByPath extends Action2 {
    /**
     * @override
     */
    async run(accessor, ...args) {
        const testService = accessor.get(ITestService);
        await discoverAndRunTests(accessor.get(ITestService).collection, accessor.get(IProgressService), [...this.getTestExtIdsToRun(accessor, ...args)], tests => this.runTest(testService, tests));
    }
}
class RunOrDebugFailedTests extends RunOrDebugExtsByPath {
    constructor(options) {
        super({
            ...options,
            menu: {
                id: MenuId.CommandPalette,
                when: hasAnyTestProvider,
            },
        });
    }
    /**
     * @inheritdoc
     */
    getTestExtIdsToRun(accessor) {
        const { results } = accessor.get(ITestResultService);
        const ids = new Set();
        for (let i = results.length - 1; i >= 0; i--) {
            const resultSet = results[i];
            for (const test of resultSet.tests) {
                if (isFailedState(test.ownComputedState)) {
                    ids.add(test.item.extId);
                }
                else {
                    ids.delete(test.item.extId);
                }
            }
        }
        return ids;
    }
}
class RunOrDebugLastRun extends Action2 {
    constructor(options) {
        super({
            ...options,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(hasAnyTestProvider, TestingContextKeys.hasAnyResults.isEqualTo(true)),
            },
        });
    }
    getLastTestRunRequest(accessor, runId) {
        const resultService = accessor.get(ITestResultService);
        const lastResult = runId ? resultService.results.find(r => r.id === runId) : resultService.results[0];
        return lastResult?.request;
    }
    /** @inheritdoc */
    async run(accessor, runId) {
        const resultService = accessor.get(ITestResultService);
        const lastResult = runId ? resultService.results.find(r => r.id === runId) : resultService.results[0];
        if (!lastResult) {
            return;
        }
        const req = lastResult.request;
        const testService = accessor.get(ITestService);
        const profileService = accessor.get(ITestProfileService);
        const profileExists = (t) => profileService.getControllerProfiles(t.controllerId).some(p => p.profileId === t.profileId);
        await discoverAndRunTests(testService.collection, accessor.get(IProgressService), req.targets.flatMap(t => t.testIds), tests => {
            // If we're requesting a re-run in the same group and have the same profiles
            // as were used before, then use those exactly. Otherwise guess naively.
            if (this.getGroup() & req.group && req.targets.every(profileExists)) {
                return testService.runResolvedTests({
                    targets: req.targets,
                    group: req.group,
                    exclude: req.exclude,
                });
            }
            else {
                return testService.runTests({ tests, group: this.getGroup() });
            }
        });
    }
}
export class ReRunFailedTests extends RunOrDebugFailedTests {
    constructor() {
        super({
            id: "testing.reRunFailTests" /* TestCommandId.ReRunFailedTests */,
            title: localize2('testing.reRunFailTests', 'Rerun Failed Tests'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 35 /* KeyCode.KeyE */),
            },
        });
    }
    runTest(service, internalTests) {
        return service.runTests({
            group: 2 /* TestRunProfileBitset.Run */,
            tests: internalTests,
        });
    }
}
export class DebugFailedTests extends RunOrDebugFailedTests {
    constructor() {
        super({
            id: "testing.debugFailTests" /* TestCommandId.DebugFailedTests */,
            title: localize2('testing.debugFailTests', 'Debug Failed Tests'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 35 /* KeyCode.KeyE */),
            },
        });
    }
    runTest(service, internalTests) {
        return service.runTests({
            group: 4 /* TestRunProfileBitset.Debug */,
            tests: internalTests,
        });
    }
}
export class ReRunLastRun extends RunOrDebugLastRun {
    constructor() {
        super({
            id: "testing.reRunLastRun" /* TestCommandId.ReRunLastRun */,
            title: localize2('testing.reRunLastRun', 'Rerun Last Run'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 42 /* KeyCode.KeyL */),
            },
        });
    }
    getGroup() {
        return 2 /* TestRunProfileBitset.Run */;
    }
}
export class DebugLastRun extends RunOrDebugLastRun {
    constructor() {
        super({
            id: "testing.debugLastRun" /* TestCommandId.DebugLastRun */,
            title: localize2('testing.debugLastRun', 'Debug Last Run'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 42 /* KeyCode.KeyL */),
            },
        });
    }
    getGroup() {
        return 4 /* TestRunProfileBitset.Debug */;
    }
}
export class CoverageLastRun extends RunOrDebugLastRun {
    constructor() {
        super({
            id: "testing.coverageLastRun" /* TestCommandId.CoverageLastRun */,
            title: localize2('testing.coverageLastRun', 'Rerun Last Run with Coverage'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 42 /* KeyCode.KeyL */),
            },
        });
    }
    getGroup() {
        return 8 /* TestRunProfileBitset.Coverage */;
    }
}
class RunOrDebugFailedFromLastRun extends Action2 {
    constructor(options) {
        super({
            ...options,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.and(hasAnyTestProvider, TestingContextKeys.hasAnyResults.isEqualTo(true)),
            },
        });
    }
    /** @inheritdoc */
    async run(accessor, runId) {
        const resultService = accessor.get(ITestResultService);
        const testService = accessor.get(ITestService);
        const progressService = accessor.get(IProgressService);
        const lastResult = runId ? resultService.results.find(r => r.id === runId) : resultService.results[0];
        if (!lastResult) {
            return;
        }
        const failedTestIds = new Set();
        for (const test of lastResult.tests) {
            if (isFailedState(test.ownComputedState)) {
                failedTestIds.add(test.item.extId);
            }
        }
        if (failedTestIds.size === 0) {
            return;
        }
        await discoverAndRunTests(testService.collection, progressService, Array.from(failedTestIds), tests => testService.runTests({ tests, group: this.getGroup() }));
    }
}
export class ReRunFailedFromLastRun extends RunOrDebugFailedFromLastRun {
    constructor() {
        super({
            id: "testing.reRunFailedFromLastRun" /* TestCommandId.ReRunFailedFromLastRun */,
            title: localize2('testing.reRunFailedFromLastRun', 'Rerun Failed Tests from Last Run'),
            category,
        });
    }
    getGroup() {
        return 2 /* TestRunProfileBitset.Run */;
    }
}
export class DebugFailedFromLastRun extends RunOrDebugFailedFromLastRun {
    constructor() {
        super({
            id: "testing.debugFailedFromLastRun" /* TestCommandId.DebugFailedFromLastRun */,
            title: localize2('testing.debugFailedFromLastRun', 'Debug Failed Tests from Last Run'),
            category,
        });
    }
    getGroup() {
        return 4 /* TestRunProfileBitset.Debug */;
    }
}
export class SearchForTestExtension extends Action2 {
    constructor() {
        super({
            id: "testing.searchForTestExtension" /* TestCommandId.SearchForTestExtension */,
            title: localize2('testing.searchForTestExtension', 'Search for Test Extension'),
        });
    }
    async run(accessor) {
        accessor.get(IExtensionsWorkbenchService).openSearch('@category:"testing"');
    }
}
export class OpenOutputPeek extends Action2 {
    constructor() {
        super({
            id: "testing.openOutputPeek" /* TestCommandId.OpenOutputPeek */,
            title: localize2('testing.openOutputPeek', 'Peek Output'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 43 /* KeyCode.KeyM */),
            },
            menu: {
                id: MenuId.CommandPalette,
                when: TestingContextKeys.hasAnyResults.isEqualTo(true),
            },
        });
    }
    async run(accessor) {
        accessor.get(ITestingPeekOpener).open();
    }
}
export class ToggleInlineTestOutput extends Action2 {
    constructor() {
        super({
            id: "testing.toggleInlineTestOutput" /* TestCommandId.ToggleInlineTestOutput */,
            title: localize2('testing.toggleInlineTestOutput', 'Toggle Inline Test Output'),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */),
            },
            menu: {
                id: MenuId.CommandPalette,
                when: TestingContextKeys.hasAnyResults.isEqualTo(true),
            },
        });
    }
    async run(accessor) {
        const testService = accessor.get(ITestService);
        testService.showInlineOutput.value = !testService.showInlineOutput.value;
    }
}
const refreshMenus = (whenIsRefreshing) => [
    {
        id: MenuId.TestItem,
        group: 'inline',
        order: 10 /* ActionOrder.Refresh */,
        when: ContextKeyExpr.and(TestingContextKeys.canRefreshTests.isEqualTo(true), TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)),
    },
    {
        id: MenuId.ViewTitle,
        group: 'navigation',
        order: 10 /* ActionOrder.Refresh */,
        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', "workbench.view.testing" /* Testing.ExplorerViewId */), TestingContextKeys.canRefreshTests.isEqualTo(true), TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)),
    },
    {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.canRefreshTests.isEqualTo(true),
    },
];
export class RefreshTestsAction extends Action2 {
    constructor() {
        super({
            id: "testing.refreshTests" /* TestCommandId.RefreshTestsAction */,
            title: localize2('testing.refreshTests', 'Refresh Tests'),
            category,
            icon: icons.testingRefreshTests,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 48 /* KeyCode.KeyR */),
                when: TestingContextKeys.canRefreshTests.isEqualTo(true),
            },
            menu: refreshMenus(false),
        });
    }
    async run(accessor, ...elements) {
        const testService = accessor.get(ITestService);
        const progressService = accessor.get(IProgressService);
        const controllerIds = distinct(elements.filter(isDefined).map(e => e.test.controllerId));
        return progressService.withProgress({ location: "workbench.view.extension.test" /* Testing.ViewletId */ }, async () => {
            if (controllerIds.length) {
                await Promise.all(controllerIds.map(id => testService.refreshTests(id)));
            }
            else {
                await testService.refreshTests();
            }
        });
    }
}
export class CancelTestRefreshAction extends Action2 {
    constructor() {
        super({
            id: "testing.cancelTestRefresh" /* TestCommandId.CancelTestRefreshAction */,
            title: localize2('testing.cancelTestRefresh', 'Cancel Test Refresh'),
            category,
            icon: icons.testingCancelRefreshTests,
            menu: refreshMenus(true),
        });
    }
    async run(accessor) {
        accessor.get(ITestService).cancelRefreshTests();
    }
}
export class CleareCoverage extends Action2 {
    constructor() {
        super({
            id: "testing.coverage.close" /* TestCommandId.CoverageClear */,
            title: localize2('testing.clearCoverage', 'Clear Coverage'),
            icon: widgetClose,
            category,
            menu: [{
                    id: MenuId.ViewTitle,
                    group: 'navigation',
                    order: 10 /* ActionOrder.Refresh */,
                    when: ContextKeyExpr.equals('view', "workbench.view.testCoverage" /* Testing.CoverageViewId */)
                }, {
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.isTestCoverageOpen.isEqualTo(true),
                }]
        });
    }
    run(accessor) {
        accessor.get(ITestCoverageService).closeCoverage();
    }
}
export class OpenCoverage extends Action2 {
    constructor() {
        super({
            id: "testing.openCoverage" /* TestCommandId.OpenCoverage */,
            title: localize2('testing.openCoverage', 'Open Coverage'),
            category,
            menu: [{
                    id: MenuId.CommandPalette,
                    when: TestingContextKeys.hasAnyResults.isEqualTo(true),
                }]
        });
    }
    run(accessor) {
        const results = accessor.get(ITestResultService).results;
        const task = results.length && results[0].tasks.find(r => r.coverage);
        if (!task) {
            const notificationService = accessor.get(INotificationService);
            notificationService.info(localize('testing.noCoverage', 'No coverage information available on the last test run.'));
            return;
        }
        accessor.get(ITestCoverageService).openCoverage(task, true);
    }
}
class TestNavigationAction extends SymbolNavigationAction {
    runEditorCommand(accessor, editor, ...args) {
        this.testService = accessor.get(ITestService);
        this.uriIdentityService = accessor.get(IUriIdentityService);
        return super.runEditorCommand(accessor, editor, ...args);
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeTestsCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleTests || 'peek';
    }
}
class GoToRelatedTestAction extends TestNavigationAction {
    async _getLocationModel(_languageFeaturesService, model, position, token) {
        const tests = await this.testService.getTestsRelatedToCode(model.uri, position, token);
        return new ReferencesModel(tests.map(t => t.item.uri && ({ uri: t.item.uri, range: t.item.range || new Range(1, 1, 1, 1) })).filter(isDefined), localize('relatedTests', 'Related Tests'));
    }
    _getNoResultFoundMessage() {
        return localize('noTestFound', 'No related tests found.');
    }
}
class GoToRelatedTest extends GoToRelatedTestAction {
    constructor() {
        super({
            openToSide: false,
            openInPeek: false,
            muteMessage: false
        }, {
            id: "testing.goToRelatedTest" /* TestCommandId.GoToRelatedTest */,
            title: localize2('testing.goToRelatedTest', 'Go to Related Test'),
            category,
            precondition: ContextKeyExpr.and(
            // todo@connor4312: make this more explicit based on cursor position
            ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key), TestingContextKeys.canGoToRelatedTest),
            menu: [{
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: 4 /* EditorContextOrder.GoToRelated */,
                }]
        });
    }
}
class PeekRelatedTest extends GoToRelatedTestAction {
    constructor() {
        super({
            openToSide: false,
            openInPeek: true,
            muteMessage: false
        }, {
            id: "testing.peekRelatedTest" /* TestCommandId.PeekRelatedTest */,
            title: localize2('testing.peekToRelatedTest', 'Peek Related Test'),
            category,
            precondition: ContextKeyExpr.and(TestingContextKeys.canGoToRelatedTest, 
            // todo@connor4312: make this more explicit based on cursor position
            ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key), PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            menu: [{
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: 5 /* EditorContextOrder.PeekRelated */,
                }]
        });
    }
}
class GoToRelatedCodeAction extends TestNavigationAction {
    async _getLocationModel(_languageFeaturesService, model, position, token) {
        const testsAtCursor = await getTestsAtCursor(this.testService, this.uriIdentityService, model.uri, position);
        const code = await Promise.all(testsAtCursor.map(t => this.testService.getCodeRelatedToTest(t)));
        return new ReferencesModel(code.flat(), localize('relatedCode', 'Related Code'));
    }
    _getNoResultFoundMessage() {
        return localize('noRelatedCode', 'No related code found.');
    }
}
class GoToRelatedCode extends GoToRelatedCodeAction {
    constructor() {
        super({
            openToSide: false,
            openInPeek: false,
            muteMessage: false
        }, {
            id: "testing.goToRelatedCode" /* TestCommandId.GoToRelatedCode */,
            title: localize2('testing.goToRelatedCode', 'Go to Related Code'),
            category,
            precondition: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.canGoToRelatedCode),
            menu: [{
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: 4 /* EditorContextOrder.GoToRelated */,
                }]
        });
    }
}
class PeekRelatedCode extends GoToRelatedCodeAction {
    constructor() {
        super({
            openToSide: false,
            openInPeek: true,
            muteMessage: false
        }, {
            id: "testing.peekRelatedCode" /* TestCommandId.PeekRelatedCode */,
            title: localize2('testing.peekToRelatedCode', 'Peek Related Code'),
            category,
            precondition: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.canGoToRelatedCode, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            menu: [{
                    id: MenuId.EditorContext,
                    group: 'testing',
                    order: 5 /* EditorContextOrder.PeekRelated */,
                }]
        });
    }
}
export class ToggleResultsViewLayoutAction extends Action2 {
    constructor() {
        super({
            id: "testing.toggleResultsViewLayout" /* TestCommandId.ToggleResultsViewLayoutAction */,
            title: localize2('testing.toggleResultsViewLayout', 'Toggle Tree Position'),
            category,
            icon: Codicon.arrowSwap,
            menu: {
                id: MenuId.ViewTitle,
                order: 18 /* ActionOrder.DisplayMode */,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', "workbench.panel.testResults.view" /* Testing.ResultsViewId */)
            }
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const currentLayout = getTestingConfiguration(configurationService, "testing.resultsView.layout" /* TestingConfigKeys.ResultsViewLayout */);
        const newLayout = currentLayout === "treeLeft" /* TestingResultsViewLayout.TreeLeft */ ? "treeRight" /* TestingResultsViewLayout.TreeRight */ : "treeLeft" /* TestingResultsViewLayout.TreeLeft */;
        await configurationService.updateValue("testing.resultsView.layout" /* TestingConfigKeys.ResultsViewLayout */, newLayout);
    }
}
export const allTestActions = [
    CancelTestRefreshAction,
    CancelTestRunAction,
    CleareCoverage,
    ClearTestResultsAction,
    CollapseAllAction,
    ConfigureTestProfilesAction,
    ContinuousRunTestAction,
    ContinuousRunUsingProfileTestAction,
    CoverageAction,
    CoverageAllAction,
    CoverageAtCursor,
    CoverageCurrentFile,
    CoverageLastRun,
    CoverageSelectedAction,
    CoverageTestsUnderUri,
    DebugAction,
    DebugAllAction,
    DebugAtCursor,
    DebugCurrentFile,
    DebugFailedTests,
    DebugLastRun,
    DebugSelectedAction,
    DebugTestsUnderUri,
    GetExplorerSelection,
    GetSelectedProfiles,
    GoToRelatedCode,
    GoToRelatedTest,
    GoToTest,
    HideTestAction,
    OpenCoverage,
    OpenOutputPeek,
    PeekRelatedCode,
    PeekRelatedTest,
    RefreshTestsAction,
    ReRunFailedTests,
    ReRunLastRun,
    RunAction,
    RunAllAction,
    RunAtCursor,
    RunCurrentFile,
    RunSelectedAction,
    RunTestsUnderUri,
    RunUsingProfileAction,
    SearchForTestExtension,
    SelectDefaultTestProfiles,
    ShowMostRecentOutputAction,
    StartContinuousRunAction,
    StopContinuousRunAction,
    TestingSortByDurationAction,
    TestingSortByLocationAction,
    TestingSortByStatusAction,
    TestingViewAsListAction,
    TestingViewAsTreeAction,
    ToggleInlineTestOutput,
    ToggleResultsViewLayoutAction,
    UnhideAllTestsAction,
    UnhideTestAction,
    ReRunFailedFromLastRun,
    DebugFailedFromLastRun,
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdEV4cGxvcmVyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0RXhwbG9yZXJBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUc3RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUVwSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVB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