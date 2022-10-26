/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isDefined } from 'vs/base/common/types';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, ContextKeyGreaterExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IActionableTestTreeElement, TestItemTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import type { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { ITestingOutputTerminalService } from 'vs/workbench/contrib/testing/browser/testingOutputTerminalService';
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { canUseProfileWithTest, ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { expandAndGetTestById, IMainThreadTestCollection, ITestService, testsInFile } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const category = Categories.Test;

const enum ActionOrder {
	// Navigation:
	Refresh = 10,
	Run,
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
	constructor() {
		super({
			id: TestCommandId.HideTestAction,
			title: localize('hideTest', 'Hide Test'),
			menu: {
				id: MenuId.TestItem,
				group: 'builtin@2',
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
	constructor() {
		super({
			id: TestCommandId.UnhideTestAction,
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

export class UnhideAllTestsAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.UnhideAllTestsAction,
			title: localize('unhideAllTests', 'Unhide All Tests'),
		});
	}

	public override run(accessor: ServicesAccessor) {
		const service = accessor.get(ITestService);
		service.excluded.clear();
		return Promise.resolve();
	}
}

const testItemInlineAndInContext = (order: ActionOrder, when?: ContextKeyExpression) => [
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

export class DebugAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.DebugAction,
			title: localize('debug test', 'Debug Test'),
			icon: icons.testingDebugIcon,
			menu: testItemInlineAndInContext(ActionOrder.Debug, TestingContextKeys.hasDebuggableTests.isEqualTo(true)),
		});
	}

	public override run(acessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]): Promise<any> {
		return acessor.get(ITestService).runTests({
			tests: elements.flatMap(e => [...e.tests]),
			group: TestRunProfileBitset.Debug,
		});
	}
}

export class RunUsingProfileAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.RunUsingProfileAction,
			title: localize('testing.runUsing', 'Execute Using Profile...'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				order: ActionOrder.RunUsing,
				group: 'builtin@2',
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
	constructor() {
		super({
			id: TestCommandId.RunAction,
			title: localize('run test', 'Run Test'),
			icon: icons.testingRunIcon,
			menu: testItemInlineAndInContext(ActionOrder.Run, TestingContextKeys.hasRunnableTests.isEqualTo(true)),
		});
	}

	/**
	 * @override
	 */
	public override run(acessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]): Promise<any> {
		return acessor.get(ITestService).runTests({
			tests: elements.flatMap(e => [...e.tests]),
			group: TestRunProfileBitset.Run,
		});
	}
}

export class SelectDefaultTestProfiles extends Action2 {
	constructor() {
		super({
			id: TestCommandId.SelectDefaultTestProfiles,
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
	constructor() {
		super({
			id: TestCommandId.ConfigureTestProfilesAction,
			title: { value: localize('testing.configureProfile', 'Configure Test Profiles'), original: 'Configure Test Profiles' },
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

	constructor() {
		super({
			id: TestCommandId.RunSelectedAction,
			title: localize('runSelectedTests', 'Run Tests'),
			icon: icons.testingRunAllIcon,
		}, TestRunProfileBitset.Run);
	}
}

export class DebugSelectedAction extends ExecuteSelectedAction {
	constructor() {

		super({
			id: TestCommandId.DebugSelectedAction,
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
	constructor() {
		super(
			{
				id: TestCommandId.RunAllAction,
				title: localize('runAllTests', 'Run All Tests'),
				icon: icons.testingRunAllIcon,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyA),
				},
			},
			TestRunProfileBitset.Run,
			localize('noTestProvider', 'No tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class DebugAllAction extends RunOrDebugAllTestsAction {
	constructor() {
		super(
			{
				id: TestCommandId.DebugAllAction,
				title: localize('debugAllTests', 'Debug All Tests'),
				icon: icons.testingDebugIcon,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyA),
				},
			},
			TestRunProfileBitset.Debug,
			localize('noDebugTestProvider', 'No debuggable tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class CancelTestRunAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CancelTestRunAction,
			title: { value: localize('testing.cancelRun', "Cancel Test Run"), original: 'Cancel Test Run' },
			icon: icons.testingCancelIcon,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyX),
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
	constructor() {
		super({
			id: TestCommandId.TestingViewAsListAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.viewAsList', "View as List"), original: 'View as List' },
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
	constructor() {
		super({
			id: TestCommandId.TestingViewAsTreeAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.viewAsTree', "View as Tree"), original: 'View as Tree' },
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
	constructor() {
		super({
			id: TestCommandId.TestingSortByStatusAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.sortByStatus', "Sort by Status"), original: 'Sort by Status' },
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
	constructor() {
		super({
			id: TestCommandId.TestingSortByLocationAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.sortByLocation', "Sort by Location"), original: 'Sort by Location' },
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

export class TestingSortByDurationAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: TestCommandId.TestingSortByDurationAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.sortByDuration', "Sort by Duration"), original: 'Sort by Duration' },
			toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByDuration),
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
		view.viewModel.viewSorting = TestExplorerViewSorting.ByDuration;
	}
}

export class ShowMostRecentOutputAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.ShowMostRecentOutputAction,
			title: { value: localize('testing.showMostRecentOutput', "Show Output"), original: 'Show Output' },
			category,
			icon: Codicon.terminal,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyO),
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
	constructor() {
		super({
			id: TestCommandId.CollapseAllAction,
			viewId: Testing.ExplorerViewId,
			title: { value: localize('testing.collapseAll', "Collapse All Tests"), original: 'Collapse All Tests' },
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
	constructor() {
		super({
			id: TestCommandId.ClearTestResultsAction,
			title: { value: localize('testing.clearResults', "Clear All Results"), original: 'Clear All Results' },
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
	constructor() {
		super({
			id: TestCommandId.GoToTest,
			title: { value: localize('testing.editFocusedTest', "Go to Test"), original: 'Go to Test' },
			icon: Codicon.goToFile,
			menu: testItemInlineAndInContext(ActionOrder.GoToTest, TestingContextKeys.testItemHasUri.isEqualTo(true)),
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
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		const activeControl = editorService.activeTextEditorControl;
		if (!activeEditorPane || !activeControl) {
			return;
		}

		const position = activeControl?.getPosition();
		const model = activeControl?.getModel();
		if (!position || !model || !('uri' in model)) {
			return;
		}

		const testService = accessor.get(ITestService);
		const profileService = accessor.get(ITestProfileService);
		const uriIdentityService = accessor.get(IUriIdentityService);
		const progressService = accessor.get(IProgressService);
		const configurationService = accessor.get(IConfigurationService);

		let bestNodes: InternalTestItem[] = [];
		let bestRange: Range | undefined;

		let bestNodesBefore: InternalTestItem[] = [];
		let bestRangeBefore: Range | undefined;

		const saveBeforeTest = getTestingConfiguration(configurationService, TestingConfigKeys.SaveBeforeTest);
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
		await showDiscoveringWhile(progressService, (async () => {
			for await (const test of testsInFile(testService, uriIdentityService, model.uri)) {
				if (!test.item.range || !(profileService.capabilitiesForTest(test) & this.group)) {
					continue;
				}

				const irange = Range.lift(test.item.range);
				if (irange.containsPosition(position)) {
					if (bestRange && Range.equalsRange(test.item.range, bestRange)) {
						bestNodes.push(test);
					} else {
						bestRange = irange;
						bestNodes = [test];
					}
				} else if (Position.isBefore(irange.getStartPosition(), position)) {
					if (!bestRangeBefore || bestRangeBefore.getStartPosition().isBefore(irange.getStartPosition())) {
						bestRangeBefore = irange;
						bestNodesBefore = [test];
					} else if (irange.equalsRange(bestRangeBefore)) {
						bestNodesBefore.push(test);
					}
				}
			}
		})());

		const testsToRun = bestNodes.length ? bestNodes : bestNodesBefore;
		if (testsToRun.length) {
			await testService.runTests({
				group: this.group,
				tests: bestNodes.length ? bestNodes : bestNodesBefore,
			});
		}
	}
}

export class RunAtCursor extends ExecuteTestAtCursor {
	constructor() {
		super({
			id: TestCommandId.RunAtCursor,
			title: { value: localize('testing.runAtCursor', "Run Test at Cursor"), original: 'Run Test at Cursor' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyC),
			},
		}, TestRunProfileBitset.Run);
	}
}

export class DebugAtCursor extends ExecuteTestAtCursor {
	constructor() {
		super({
			id: TestCommandId.DebugAtCursor,
			title: { value: localize('testing.debugAtCursor', "Debug Test at Cursor"), original: 'Debug Test at Cursor' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyC),
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

		// Iterate through the entire collection and run any tests that are in the
		// uri. See #138007.
		const queue = [testService.collection.rootIds];
		const discovered: InternalTestItem[] = [];
		while (queue.length) {
			for (const id of queue.pop()!) {
				const node = testService.collection.getNodeById(id)!;
				if (node.item.uri?.toString() === demandedUri) {
					discovered.push(node);
				} else {
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

		return undefined;
	}
}

export class RunCurrentFile extends ExecuteTestsInCurrentFile {

	constructor() {
		super({
			id: TestCommandId.RunCurrentFile,
			title: { value: localize('testing.runCurrentFile', "Run Tests in Current File"), original: 'Run Tests in Current File' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyF),
			},
		}, TestRunProfileBitset.Run);
	}
}

export class DebugCurrentFile extends ExecuteTestsInCurrentFile {

	constructor() {
		super({
			id: TestCommandId.DebugCurrentFile,
			title: { value: localize('testing.debugCurrentFile', "Debug Tests in Current File"), original: 'Debug Tests in Current File' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyF),
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
	constructor() {
		super({
			id: TestCommandId.ReRunFailedTests,
			title: { value: localize('testing.reRunFailTests', "Rerun Failed Tests"), original: 'Rerun Failed Tests' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyE),
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
	constructor() {
		super({
			id: TestCommandId.DebugFailedTests,
			title: { value: localize('testing.debugFailTests', "Debug Failed Tests"), original: 'Debug Failed Tests' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyE),
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
	constructor() {
		super({
			id: TestCommandId.ReRunLastRun,
			title: { value: localize('testing.reRunLastRun', "Rerun Last Run"), original: 'Rerun Last Run' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyL),
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
	constructor() {
		super({
			id: TestCommandId.DebugLastRun,
			title: { value: localize('testing.debugLastRun', "Debug Last Run"), original: 'Debug Last Run' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyL),
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
	constructor() {
		super({
			id: TestCommandId.SearchForTestExtension,
			title: { value: localize('testing.searchForTestExtension', "Search for Test Extension"), original: 'Search for Test Extension' },
		});
	}

	public async run(accessor: ServicesAccessor) {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = (await paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true))?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		viewlet.search('@category:"testing"');
		viewlet.focus();
	}
}

export class OpenOutputPeek extends Action2 {
	constructor() {
		super({
			id: TestCommandId.OpenOutputPeek,
			title: { value: localize('testing.openOutputPeek', "Peek Output"), original: 'Peek Output' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyM),
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
	constructor() {
		super({
			id: TestCommandId.ToggleInlineTestOutput,
			title: { value: localize('testing.toggleInlineTestOutput', "Toggle Inline Test Output"), original: 'Toggle Inline Test Output' },
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyI),
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

const refreshMenus = (whenIsRefreshing: boolean): IAction2Options['menu'] => [
	{
		id: MenuId.TestItem,
		group: 'inline',
		order: ActionOrder.Refresh,
		when: ContextKeyExpr.and(
			TestingContextKeys.canRefreshTests.isEqualTo(true),
			TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing),
		),
	},
	{
		id: MenuId.ViewTitle,
		group: 'navigation',
		order: ActionOrder.Refresh,
		when: ContextKeyExpr.and(
			ContextKeyExpr.equals('view', Testing.ExplorerViewId),
			TestingContextKeys.canRefreshTests.isEqualTo(true),
			TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing),
		),
	},
	{
		id: MenuId.CommandPalette,
		when: TestingContextKeys.canRefreshTests.isEqualTo(true),
	},
];

export class RefreshTestsAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.RefreshTestsAction,
			title: { value: localize('testing.refreshTests', "Refresh Tests"), original: 'Refresh Tests' },
			category,
			icon: icons.testingRefreshTests,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyR),
				when: TestingContextKeys.canRefreshTests.isEqualTo(true),
			},
			menu: refreshMenus(false),
		});
	}

	public async run(accessor: ServicesAccessor, ...elements: IActionableTestTreeElement[]) {
		const testService = accessor.get(ITestService);
		const progressService = accessor.get(IProgressService);

		const controllerIds = distinct(
			elements
				.filter((e): e is TestItemTreeElement => e instanceof TestItemTreeElement)
				.map(e => e.test.controllerId)
		);

		return progressService.withProgress({ location: Testing.ViewletId }, async () => {
			if (controllerIds.length) {
				await Promise.all(controllerIds.map(id => testService.refreshTests(id)));
			} else {
				await testService.refreshTests();
			}
		});
	}
}

export class CancelTestRefreshAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CancelTestRefreshAction,
			title: { value: localize('testing.cancelTestRefresh', "Cancel Test Refresh"), original: 'Cancel Test Refresh' },
			category,
			icon: icons.testingCancelRefreshTests,
			menu: refreshMenus(true),
		});
	}

	public async run(accessor: ServicesAccessor) {
		accessor.get(ITestService).cancelRefreshTests();
	}
}

export const allTestActions = [
	// todo: these are disabled until we figure out how we want autorun to work
	// AutoRunOffAction,
	// AutoRunOnAction,
	CancelTestRefreshAction,
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
	RefreshTestsAction,
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
	TestingSortByDurationAction,
	TestingSortByLocationAction,
	TestingSortByStatusAction,
	TestingViewAsListAction,
	TestingViewAsTreeAction,
	ToggleInlineTestOutput,
	UnhideTestAction,
	UnhideAllTestsAction,
];
