/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Iterable } from 'vs/base/common/iterator';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isDefined } from 'vs/base/common/types';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyGreaterExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { FocusedViewContext } from 'vs/workbench/common/views';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IActionableTestTreeElement, TestItemTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import type { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { ITestingOutputTerminalService } from 'vs/workbench/contrib/testing/browser/testingOutputTerminalService';
import { TestExplorerViewMode, TestExplorerViewSorting, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestingAutoRun } from 'vs/workbench/contrib/testing/common/testingAutoRun';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { canUseProfileWithTest, ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { expandAndGetTestById, IMainThreadTestCollection, ITestService, testsInFile } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

const category = CATEGORIES.Test;

const enum ActionOrder {
	// Navigation:
	Run = 10,
	Debug,
	Coverage,
	RunUsing,
	AutoRun,

	// Submenu:
	Collapse,
	ClearResults,
	DisplayMode,
	Sort,
	GoToTest,
	HideTest,
}

const hasAnyTestProvider = ContextKeyGreaterExpr.create(TestingContextKeys.providerCount.key, 0);

export class HideTestAction extends Action2 {
	public static readonly ID = 'testing.hideTest';
	constructor() {
		super({
			id: HideTestAction.ID,
			title: localize('hideTest', 'Hide Test'),
			menu: {
				id: MenuId.TestItem,
				when: TestingContextKeys.testItemIsHidden.isEqualTo(false)
			},
		});
	}

	public override run(accessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]) {
		const service = accessor.get(ITestService);
		for (const element of elements) {
			if (element instanceof TestItemTreeElement) {
				service.excluded.toggle(element.test, true);
			}
		}
		return Promise.resolve();
	}
}

export class UnhideTestAction extends Action2 {
	public static readonly ID = 'testing.unhideTest';
	constructor() {
		super({
			id: UnhideTestAction.ID,
			title: localize('unhideTest', 'Unhide Test'),
			menu: {
				id: MenuId.TestItem,
				order: ActionOrder.HideTest,
				when: TestingContextKeys.testItemIsHidden.isEqualTo(true)
			},
		});
	}

	public override run(accessor: ServicesAccessor, ...elements: InternalTestItem[]) {
		const service = accessor.get(ITestService);
		for (const element of elements) {
			if (element instanceof TestItemTreeElement) {
				service.excluded.toggle(element.test, false);
			}
		}
		return Promise.resolve();
	}
}

export class DebugAction extends Action2 {
	public static readonly ID = 'testing.debug';
	constructor() {
		super({
			id: DebugAction.ID,
			title: localize('debug test', 'Debug Test'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				group: 'inline',
				order: ActionOrder.Debug,
				when: TestingContextKeys.hasDebuggableTests.isEqualTo(true),
			},
		});
	}

	public override run(acessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]): Promise<any> {
		return acessor.get(ITestService).runTests({
			tests: [...Iterable.concatNested(elements.map(e => e.tests))],
			group: TestRunProfileBitset.Debug,
		});
	}
}

export class RunUsingProfileAction extends Action2 {
	public static readonly ID = 'testing.runUsing';
	constructor() {
		super({
			id: RunUsingProfileAction.ID,
			title: localize('testing.runUsing', 'Execute Using Profile...'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				order: ActionOrder.RunUsing,
				when: TestingContextKeys.hasNonDefaultProfile.isEqualTo(true),
			},
		});
	}

	public override async run(acessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]): Promise<any> {
		const testElements = elements.filter((e): e is TestItemTreeElement => e instanceof TestItemTreeElement);
		if (testElements.length === 0) {
			return;
		}

		const commandService = acessor.get(ICommandService);
		const testService = acessor.get(ITestService);
		const profile: ITestRunProfile | undefined = await commandService.executeCommand('vscode.pickTestProfile', {
			onlyForTest: testElements[0].test,
		});
		if (!profile) {
			return;
		}

		testService.runResolvedTests({
			targets: [{
				profileGroup: profile.group,
				profileId: profile.profileId,
				controllerId: profile.controllerId,
				testIds: testElements.filter(t => canUseProfileWithTest(profile, t.test)).map(t => t.test.item.extId)
			}]
		});
	}
}

export class RunAction extends Action2 {
	public static readonly ID = 'testing.run';
	constructor() {
		super({
			id: RunAction.ID,
			title: localize('run test', 'Run Test'),
			icon: icons.testingRunIcon,
			menu: {
				id: MenuId.TestItem,
				group: 'inline',
				order: ActionOrder.Run,
				when: TestingContextKeys.hasRunnableTests.isEqualTo(true),
			},
		});
	}

	/**
	 * @override
	 */
	public override run(acessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]): Promise<any> {
		return acessor.get(ITestService).runTests({
			tests: [...Iterable.concatNested(elements.map(e => e.tests))],
			group: TestRunProfileBitset.Run,
		});
	}
}

export class SelectDefaultTestProfiles extends Action2 {
	public static readonly ID = 'testing.selectDefaultTestProfiles';
	constructor() {
		super({
			id: SelectDefaultTestProfiles.ID,
			title: localize('testing.selectDefaultTestProfiles', 'Select Default Profile'),
			icon: icons.testingUpdateProfiles,
			category,
		});
	}

	public override async run(acessor: ServicesAccessor, onlyGroup: TestRunProfileBitset) {
		const commands = acessor.get(ICommandService);
		const testProfileService = acessor.get(ITestProfileService);
		const profiles = await commands.executeCommand<ITestRunProfile[]>('vscode.pickMultipleTestProfiles', {
			showConfigureButtons: false,
			selected: testProfileService.getGroupDefaultProfiles(onlyGroup),
			onlyGroup,
		});

		if (profiles?.length) {
			testProfileService.setGroupDefaultProfiles(onlyGroup, profiles);
		}
	}
}

export class ConfigureTestProfilesAction extends Action2 {
	public static readonly ID = 'testing.configureProfile';
	constructor() {
		super({
			id: ConfigureTestProfilesAction.ID,
			title: localize('testing.configureProfile', 'Configure Test Profiles'),
			icon: icons.testingUpdateProfiles,
			f1: true,
			category,
			menu: {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasConfigurableProfile.isEqualTo(true),
			},
		});
	}

	public override async run(acessor: ServicesAccessor, onlyGroup?: TestRunProfileBitset) {
		const commands = acessor.get(ICommandService);
		const testProfileService = acessor.get(ITestProfileService);
		const profile = await commands.executeCommand<ITestRunProfile>('vscode.pickTestProfile', {
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

abstract class ExecuteSelectedAction extends ViewAction<TestingExplorerView> {
	constructor(options: IAction2Options, private readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: [{
				id: MenuId.ViewTitle,
				order: group === TestRunProfileBitset.Run
					? ActionOrder.Run
					: group === TestRunProfileBitset.Debug
						? ActionOrder.Debug
						: ActionOrder.Coverage,
				group: 'navigation',
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', Testing.ExplorerViewId),
					TestingContextKeys.isRunning.isEqualTo(false),
					TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
				)
			}],
			category,
			viewId: Testing.ExplorerViewId,
		});
	}

	/**
	 * @override
	 */
	public runInView(accessor: ServicesAccessor, view: TestingExplorerView): Promise<ITestResult | undefined> {
		const { include, exclude } = view.getSelectedOrVisibleItems();
		return accessor.get(ITestService).runTests({ tests: include, exclude, group: this.group });
	}
}

export class RunSelectedAction extends ExecuteSelectedAction {
	public static readonly ID = 'testing.runSelected';

	constructor() {
		super({
			id: RunSelectedAction.ID,
			title: localize('runSelectedTests', 'Run Tests'),
			icon: icons.testingRunAllIcon,
		}, TestRunProfileBitset.Run);
	}
}

export class DebugSelectedAction extends ExecuteSelectedAction {
	public static readonly ID = 'testing.debugSelected';
	constructor() {

		super({
			id: DebugSelectedAction.ID,
			title: localize('debugSelectedTests', 'Debug Tests'),
			icon: icons.testingDebugAllIcon,
		}, TestRunProfileBitset.Debug);
	}
}

const showDiscoveringWhile = <R>(progress: IProgressService, task: Promise<R>): Promise<R> => {
	return progress.withProgress(
		{
			location: ProgressLocation.Window,
			title: localize('discoveringTests', 'Discovering Tests'),
		},
		() => task,
	);
};

abstract class RunOrDebugAllTestsAction extends Action2 {
	constructor(options: IAction2Options, private readonly group: TestRunProfileBitset, private noTestsFoundError: string) {
		super({
			...options,
			category,
			menu: [{
				id: MenuId.CommandPalette,
				when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
			}]
		});
	}

	public async run(accessor: ServicesAccessor) {
		const testService = accessor.get(ITestService);
		const notifications = accessor.get(INotificationService);

		const roots = [...testService.collection.rootItems];
		if (!roots.length) {
			notifications.info(this.noTestsFoundError);
			return;
		}

		await testService.runTests({ tests: roots, group: this.group });
	}
}

export class RunAllAction extends RunOrDebugAllTestsAction {
	public static readonly ID = 'testing.runAll';
	constructor() {
		super(
			{
				id: RunAllAction.ID,
				title: localize('runAllTests', 'Run All Tests'),
				icon: icons.testingRunAllIcon,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_A),
				},
			},
			TestRunProfileBitset.Run,
			localize('noTestProvider', 'No tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class DebugAllAction extends RunOrDebugAllTestsAction {
	public static readonly ID = 'testing.debugAll';
	constructor() {
		super(
			{
				id: DebugAllAction.ID,
				title: localize('debugAllTests', 'Debug All Tests'),
				icon: icons.testingDebugIcon,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_A),
				},
			},
			TestRunProfileBitset.Debug,
			localize('noDebugTestProvider', 'No debuggable tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class CancelTestRunAction extends Action2 {
	public static readonly ID = 'testing.cancelRun';
	constructor() {
		super({
			id: CancelTestRunAction.ID,
			title: localize('testing.cancelRun', "Cancel Test Run"),
			icon: icons.testingCancelIcon,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_X),
			},
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Run,
				group: 'navigation',
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', Testing.ExplorerViewId),
					ContextKeyExpr.equals(TestingContextKeys.isRunning.serialize(), true),
				)
			}
		});
	}

	/**
	 * @override
	 */
	public async run(accessor: ServicesAccessor) {
		const resultService = accessor.get(ITestResultService);
		const testService = accessor.get(ITestService);
		for (const run of resultService.results) {
			if (!run.completedAt) {
				testService.cancelTestRun(run.id);
			}
		}
	}
}

export class TestingViewAsListAction extends ViewAction<TestingExplorerView> {
	public static readonly ID = 'testing.viewAsList';
	constructor() {
		super({
			id: TestingViewAsListAction.ID,
			viewId: Testing.ExplorerViewId,
			title: localize('testing.viewAsList', "View as List"),
			toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.List),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.DisplayMode,
				group: 'viewAs',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewMode = TestExplorerViewMode.List;
	}
}

export class TestingViewAsTreeAction extends ViewAction<TestingExplorerView> {
	public static readonly ID = 'testing.viewAsTree';
	constructor() {
		super({
			id: TestingViewAsTreeAction.ID,
			viewId: Testing.ExplorerViewId,
			title: localize('testing.viewAsTree', "View as Tree"),
			toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.Tree),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.DisplayMode,
				group: 'viewAs',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewMode = TestExplorerViewMode.Tree;
	}
}


export class TestingSortByStatusAction extends ViewAction<TestingExplorerView> {
	public static readonly ID = 'testing.sortByStatus';
	constructor() {
		super({
			id: TestingSortByStatusAction.ID,
			viewId: Testing.ExplorerViewId,
			title: localize('testing.sortByStatus', "Sort by Status"),
			toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByStatus),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Sort,
				group: 'sortBy',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewSorting = TestExplorerViewSorting.ByStatus;
	}
}

export class TestingSortByLocationAction extends ViewAction<TestingExplorerView> {
	public static readonly ID = 'testing.sortByLocation';
	constructor() {
		super({
			id: TestingSortByLocationAction.ID,
			viewId: Testing.ExplorerViewId,
			title: localize('testing.sortByLocation', "Sort by Location"),
			toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByLocation),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Sort,
				group: 'sortBy',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewSorting = TestExplorerViewSorting.ByLocation;
	}
}

export class ShowMostRecentOutputAction extends Action2 {
	public static readonly ID = 'testing.showMostRecentOutput';
	constructor() {
		super({
			id: ShowMostRecentOutputAction.ID,
			title: localize('testing.showMostRecentOutput', "Show Output"),
			category,
			icon: Codicon.terminal,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_O),
			},
			precondition: TestingContextKeys.hasAnyResults.isEqualTo(true),
			menu: [{
				id: MenuId.ViewTitle,
				order: ActionOrder.Collapse,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId),
			}, {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasAnyResults.isEqualTo(true)
			}]
		});
	}

	public run(accessor: ServicesAccessor) {
		const result = accessor.get(ITestResultService).results[0];
		accessor.get(ITestingOutputTerminalService).open(result);
	}
}

export class CollapseAllAction extends ViewAction<TestingExplorerView> {
	public static readonly ID = 'testing.collapseAll';
	constructor() {
		super({
			id: CollapseAllAction.ID,
			viewId: Testing.ExplorerViewId,
			title: localize('testing.collapseAll', "Collapse All Tests"),
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Collapse,
				group: 'displayAction',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.collapseAll();
	}
}

export class ClearTestResultsAction extends Action2 {
	public static readonly ID = 'testing.clearTestResults';
	constructor() {
		super({
			id: ClearTestResultsAction.ID,
			title: localize('testing.clearResults', "Clear All Results"),
			category,
			icon: Codicon.trash,
			menu: [{
				id: MenuId.TestPeekTitle,
			}, {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasAnyResults.isEqualTo(true),
			}, {
				id: MenuId.ViewTitle,
				order: ActionOrder.ClearResults,
				group: 'displayAction',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}],
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
		accessor.get(ITestResultService).clear();
	}
}

export class GoToTest extends Action2 {
	public static readonly ID = 'testing.editFocusedTest';
	constructor() {
		super({
			id: GoToTest.ID,
			title: localize('testing.editFocusedTest', "Go to Test"),
			icon: Codicon.goToFile,
			menu: {
				id: MenuId.TestItem,
				when: TestingContextKeys.testItemHasUri.isEqualTo(true),
				order: ActionOrder.GoToTest,
				group: 'inline',
			},
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
				primary: KeyCode.Enter | KeyMod.Alt,
			},
		});
	}

	public override async run(accessor: ServicesAccessor, element?: IActionableTestTreeElement, preserveFocus?: boolean) {
		if (element && element instanceof TestItemTreeElement) {
			accessor.get(ICommandService).executeCommand('vscode.revealTest', element.test.item.extId, preserveFocus);
		}
	}
}

abstract class ToggleAutoRun extends Action2 {
	public static readonly ID = 'testing.toggleautoRun';

	constructor(title: string, whenToggleIs: boolean) {
		super({
			id: ToggleAutoRun.ID,
			title,
			icon: icons.testingAutorunIcon,
			toggled: whenToggleIs === true ? ContextKeyExpr.true() : ContextKeyExpr.false(),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.AutoRun,
				group: 'navigation',
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', Testing.ExplorerViewId),
					TestingContextKeys.autoRun.isEqualTo(whenToggleIs)
				)
			}
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
		accessor.get(ITestingAutoRun).toggle();
	}
}

export class AutoRunOnAction extends ToggleAutoRun {
	constructor() {
		super(localize('testing.turnOnAutoRun', "Turn On Auto Run"), false);
	}
}

export class AutoRunOffAction extends ToggleAutoRun {
	constructor() {
		super(localize('testing.turnOffAutoRun', "Turn Off Auto Run"), true);
	}
}


abstract class ExecuteTestAtCursor extends Action2 {
	constructor(options: IAction2Options, protected readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: {
				id: MenuId.CommandPalette,
				when: hasAnyTestProvider,
			},
		});
	}

	/**
	 * @override
	 */
	public async run(accessor: ServicesAccessor) {
		const control = accessor.get(IEditorService).activeTextEditorControl;
		const position = control?.getPosition();
		const model = control?.getModel();
		if (!position || !model || !('uri' in model)) {
			return;
		}

		const testService = accessor.get(ITestService);
		let bestNode: InternalTestItem | undefined;

		await showDiscoveringWhile(accessor.get(IProgressService), (async () => {
			for await (const test of testsInFile(testService.collection, model.uri)) {
				if (test.item.range && Range.containsPosition(test.item.range, position)) {
					bestNode = test;
				}
			}
		})());


		if (bestNode) {
			await testService.runTests({
				group: this.group,
				tests: [bestNode],
			});
		}
	}
}

export class RunAtCursor extends ExecuteTestAtCursor {
	public static readonly ID = 'testing.runAtCursor';
	constructor() {
		super({
			id: RunAtCursor.ID,
			title: localize('testing.runAtCursor', "Run Test at Cursor"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_C),
			},
		}, TestRunProfileBitset.Run);
	}
}

export class DebugAtCursor extends ExecuteTestAtCursor {
	public static readonly ID = 'testing.debugAtCursor';
	constructor() {
		super({
			id: DebugAtCursor.ID,
			title: localize('testing.debugAtCursor', "Debug Test at Cursor"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_C),
			},
		}, TestRunProfileBitset.Debug);
	}
}

abstract class ExecuteTestsInCurrentFile extends Action2 {
	constructor(options: IAction2Options, protected readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
			},
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
		const control = accessor.get(IEditorService).activeTextEditorControl;
		const position = control?.getPosition();
		const model = control?.getModel();
		if (!position || !model || !('uri' in model)) {
			return;
		}

		const testService = accessor.get(ITestService);

		const demandedUri = model.uri.toString();
		for (const test of testService.collection.all) {
			if (test.item.uri?.toString() === demandedUri) {
				return testService.runTests({
					tests: [test],
					group: this.group,
				});
			}
		}

		return undefined;
	}
}

export class RunCurrentFile extends ExecuteTestsInCurrentFile {
	public static readonly ID = 'testing.runCurrentFile';

	constructor() {
		super({
			id: RunCurrentFile.ID,
			title: localize('testing.runCurrentFile', "Run Tests in Current File"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_F),
			},
		}, TestRunProfileBitset.Run);
	}
}

export class DebugCurrentFile extends ExecuteTestsInCurrentFile {
	public static readonly ID = 'testing.debugCurrentFile';

	constructor() {
		super({
			id: DebugCurrentFile.ID,
			title: localize('testing.debugCurrentFile', "Debug Tests in Current File"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_F),
			},
		}, TestRunProfileBitset.Debug);
	}
}

export const discoverAndRunTests = async (
	collection: IMainThreadTestCollection,
	progress: IProgressService,
	ids: ReadonlyArray<string>,
	runTests: (tests: ReadonlyArray<InternalTestItem>) => Promise<ITestResult>,
): Promise<ITestResult | undefined> => {
	const todo = Promise.all(ids.map(p => expandAndGetTestById(collection, p)));
	const tests = (await showDiscoveringWhile(progress, todo)).filter(isDefined);
	return tests.length ? await runTests(tests) : undefined;
};

abstract class RunOrDebugExtsByPath extends Action2 {
	/**
	 * @override
	 */
	public async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const testService = accessor.get(ITestService);
		await discoverAndRunTests(
			accessor.get(ITestService).collection,
			accessor.get(IProgressService),
			[...this.getTestExtIdsToRun(accessor, ...args)],
			tests => this.runTest(testService, tests),
		);
	}

	protected abstract getTestExtIdsToRun(accessor: ServicesAccessor, ...args: unknown[]): Iterable<string>;

	protected abstract runTest(service: ITestService, node: readonly InternalTestItem[]): Promise<ITestResult>;
}

abstract class RunOrDebugFailedTests extends RunOrDebugExtsByPath {
	constructor(options: IAction2Options) {
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
	protected getTestExtIdsToRun(accessor: ServicesAccessor) {
		const { results } = accessor.get(ITestResultService);
		const ids = new Set<string>();
		for (let i = results.length - 1; i >= 0; i--) {
			const resultSet = results[i];
			for (const test of resultSet.tests) {
				if (isFailedState(test.ownComputedState)) {
					ids.add(test.item.extId);
				} else {
					ids.delete(test.item.extId);
				}
			}
		}

		return ids;
	}
}

abstract class RunOrDebugLastRun extends RunOrDebugExtsByPath {
	constructor(options: IAction2Options) {
		super({
			...options,
			menu: {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.and(
					hasAnyTestProvider,
					TestingContextKeys.hasAnyResults.isEqualTo(true),
				),
			},
		});
	}

	/**
	 * @inheritdoc
	 */
	protected *getTestExtIdsToRun(accessor: ServicesAccessor, runId?: string): Iterable<string> {
		const resultService = accessor.get(ITestResultService);
		const lastResult = runId ? resultService.results.find(r => r.id === runId) : resultService.results[0];
		if (!lastResult) {
			return;
		}

		for (const test of lastResult.request.targets) {
			for (const testId of test.testIds) {
				yield testId;
			}
		}
	}
}

export class ReRunFailedTests extends RunOrDebugFailedTests {
	public static readonly ID = 'testing.reRunFailTests';
	constructor() {
		super({
			id: ReRunFailedTests.ID,
			title: localize('testing.reRunFailTests', "Rerun Failed Tests"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_E),
			},
		});
	}

	protected runTest(service: ITestService, internalTests: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({
			group: TestRunProfileBitset.Run,
			tests: internalTests,
		});
	}
}

export class DebugFailedTests extends RunOrDebugFailedTests {
	public static readonly ID = 'testing.debugFailTests';
	constructor() {
		super({
			id: DebugFailedTests.ID,
			title: localize('testing.debugFailTests', "Debug Failed Tests"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_E),
			},
		});
	}

	protected runTest(service: ITestService, internalTests: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({
			group: TestRunProfileBitset.Debug,
			tests: internalTests,
		});
	}
}

export class ReRunLastRun extends RunOrDebugLastRun {
	public static readonly ID = 'testing.reRunLastRun';
	constructor() {
		super({
			id: ReRunLastRun.ID,
			title: localize('testing.reRunLastRun', "Rerun Last Run"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_L),
			},
		});
	}

	protected runTest(service: ITestService, internalTests: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({
			group: TestRunProfileBitset.Run,
			tests: internalTests,
		});
	}
}

export class DebugLastRun extends RunOrDebugLastRun {
	public static readonly ID = 'testing.debugLastRun';
	constructor() {
		super({
			id: DebugLastRun.ID,
			title: localize('testing.debugLastRun', "Debug Last Run"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_L),
			},
		});
	}

	protected runTest(service: ITestService, internalTests: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({
			group: TestRunProfileBitset.Debug,
			tests: internalTests,
		});
	}
}

export class SearchForTestExtension extends Action2 {
	public static readonly ID = 'testing.searchForTestExtension';
	constructor() {
		super({
			id: SearchForTestExtension.ID,
			title: localize('testing.searchForTestExtension', "Search for Test Extension"),
		});
	}

	public async run(accessor: ServicesAccessor) {
		const viewletService = accessor.get(IViewletService);
		const viewlet = (await viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true))?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		viewlet.search('@category:"testing"');
		viewlet.focus();
	}
}

export class OpenOutputPeek extends Action2 {
	public static readonly ID = 'testing.openOutputPeek';
	constructor() {
		super({
			id: OpenOutputPeek.ID,
			title: localize('testing.openOutputPeek', "Peek Output"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyCode.KEY_M),
			},
			menu: {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasAnyResults.isEqualTo(true),
			},
		});
	}

	public async run(accessor: ServicesAccessor) {
		accessor.get(ITestingPeekOpener).open();
	}
}

export class ToggleInlineTestOutput extends Action2 {
	public static readonly ID = 'testing.toggleInlineTestOutput';
	constructor() {
		super({
			id: ToggleInlineTestOutput.ID,
			title: localize('testing.toggleInlineTestOutput', "Toggle Inline Test Output"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, KeyMod.CtrlCmd | KeyCode.KEY_I),
			},
			menu: {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasAnyResults.isEqualTo(true),
			},
		});
	}

	public async run(accessor: ServicesAccessor) {
		const testService = accessor.get(ITestService);
		testService.showInlineOutput.value = !testService.showInlineOutput.value;
	}
}

export const allTestActions = [
	// todo: these are disabled until we figure out how we want autorun to work
	// AutoRunOffAction,
	// AutoRunOnAction,
	CancelTestRunAction,
	ClearTestResultsAction,
	CollapseAllAction,
	ConfigureTestProfilesAction,
	DebugAction,
	DebugAllAction,
	DebugAtCursor,
	DebugCurrentFile,
	DebugFailedTests,
	DebugLastRun,
	DebugSelectedAction,
	GoToTest,
	HideTestAction,
	OpenOutputPeek,
	ReRunFailedTests,
	ReRunLastRun,
	RunAction,
	RunAllAction,
	RunAtCursor,
	RunCurrentFile,
	RunSelectedAction,
	RunUsingProfileAction,
	SearchForTestExtension,
	SelectDefaultTestProfiles,
	ShowMostRecentOutputAction,
	TestingSortByLocationAction,
	TestingSortByStatusAction,
	TestingViewAsListAction,
	TestingViewAsTreeAction,
	ToggleInlineTestOutput,
	UnhideTestAction,
];
