/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Iterable } from 'vs/base/common/iterator';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, ContextKeyExpression, ContextKeyGreaterExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { widgetClose } from 'vs/platform/theme/common/iconRegistry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID, IExtensionsViewPaneContainer } from 'vs/workbench/contrib/extensions/common/extensions';
import { TestExplorerTreeElement, TestItemTreeElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestResultsView } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { TestingConfigKeys, getTestingConfiguration } from 'vs/workbench/contrib/testing/common/configuration';
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing, testConfigurationGroupNames } from 'vs/workbench/contrib/testing/common/constants';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestProfileService, canUseProfileWithTest } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestCollection, IMainThreadTestController, ITestService, expandAndGetTestById, testsInFile, testsUnderUri } from 'vs/workbench/contrib/testing/common/testService';
import { ExtTestRunProfileKind, ITestRunProfile, InternalTestItem, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingContinuousRunService } from 'vs/workbench/contrib/testing/common/testingContinuousRunService';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

const category = Categories.Test;

const enum ActionOrder {
	// Navigation:
	Refresh = 10,
	Run,
	Debug,
	Coverage,
	RunContinuous,
	RunUsing,

	// Submenu:
	Collapse,
	ClearResults,
	DisplayMode,
	Sort,
	GoToTest,
	HideTest,
	ContinuousRunTest = -1 >>> 1, // max int, always at the end to avoid shifting on hover
}

const hasAnyTestProvider = ContextKeyGreaterExpr.create(TestingContextKeys.providerCount.key, 0);

const LABEL_RUN_TESTS = localize2('runSelectedTests', "Run Tests");
const LABEL_DEBUG_TESTS = localize2('debugSelectedTests', "Debug Tests");
const LABEL_COVERAGE_TESTS = localize2('coverageSelectedTests', "Run Tests with Coverage");

export class HideTestAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.HideTestAction,
			title: localize2('hideTest', 'Hide Test'),
			menu: {
				id: MenuId.TestItem,
				group: 'builtin@2',
				when: TestingContextKeys.testItemIsHidden.isEqualTo(false)
			},
		});
	}

	public override run(accessor: ServicesAccessor, ...elements: TestItemTreeElement[]) {
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
			id: TestCommandId.UnhideTestAction,
			title: localize2('unhideTest', 'Unhide Test'),
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
			title: localize2('unhideAllTests', 'Unhide All Tests'),
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

abstract class RunVisibleAction extends ViewAction<TestingExplorerView> {
	constructor(private readonly bitset: TestRunProfileBitset, desc: Readonly<IAction2Options>) {
		super({
			...desc,
			viewId: Testing.ExplorerViewId,
		});
	}

	/**
	 * @override
	 */
	public runInView(accessor: ServicesAccessor, view: TestingExplorerView, ...elements: TestItemTreeElement[]): Promise<unknown> {
		const { include, exclude } = view.getTreeIncludeExclude(elements.map(e => e.test));
		return accessor.get(ITestService).runTests({
			tests: include,
			exclude,
			group: this.bitset,
		});
	}
}

export class DebugAction extends RunVisibleAction {
	constructor() {
		super(TestRunProfileBitset.Debug, {
			id: TestCommandId.DebugAction,
			title: localize2('debug test', 'Debug Test'),
			icon: icons.testingDebugIcon,
			menu: testItemInlineAndInContext(ActionOrder.Debug, TestingContextKeys.hasDebuggableTests.isEqualTo(true)),
		});
	}
}

export class CoverageAction extends RunVisibleAction {
	constructor() {
		super(TestRunProfileBitset.Coverage, {
			id: TestCommandId.RunWithCoverageAction,
			title: localize2('run with cover test', 'Run Test with Coverage'),
			icon: icons.testingCoverageIcon,
			menu: testItemInlineAndInContext(ActionOrder.Coverage, TestingContextKeys.hasCoverableTests.isEqualTo(true)),
		});
	}
}

export class RunUsingProfileAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.RunUsingProfileAction,
			title: localize2('testing.runUsing', 'Execute Using Profile...'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				order: ActionOrder.RunUsing,
				group: 'builtin@2',
				when: TestingContextKeys.hasNonDefaultProfile.isEqualTo(true),
			},
		});
	}

	public override async run(acessor: ServicesAccessor, ...elements: TestItemTreeElement[]): Promise<any> {
		const commandService = acessor.get(ICommandService);
		const testService = acessor.get(ITestService);
		const profile: ITestRunProfile | undefined = await commandService.executeCommand('vscode.pickTestProfile', {
			onlyForTest: elements[0].test,
		});
		if (!profile) {
			return;
		}

		testService.runResolvedTests({
			targets: [{
				profileGroup: profile.group,
				profileId: profile.profileId,
				controllerId: profile.controllerId,
				testIds: elements.filter(t => canUseProfileWithTest(profile, t.test)).map(t => t.test.item.extId)
			}]
		});
	}
}

export class RunAction extends RunVisibleAction {
	constructor() {
		super(TestRunProfileBitset.Run, {
			id: TestCommandId.RunAction,
			title: localize2('run test', 'Run Test'),
			icon: icons.testingRunIcon,
			menu: testItemInlineAndInContext(ActionOrder.Run, TestingContextKeys.hasRunnableTests.isEqualTo(true)),
		});
	}
}

export class SelectDefaultTestProfiles extends Action2 {
	constructor() {
		super({
			id: TestCommandId.SelectDefaultTestProfiles,
			title: localize2('testing.selectDefaultTestProfiles', 'Select Default Profile'),
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

export class ContinuousRunTestAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.ToggleContinousRunForTest,
			title: localize2('testing.toggleContinuousRunOn', 'Turn on Continuous Run'),
			icon: icons.testingTurnContinuousRunOn,
			precondition: ContextKeyExpr.or(
				TestingContextKeys.isContinuousModeOn.isEqualTo(true),
				TestingContextKeys.isParentRunningContinuously.isEqualTo(false)
			),
			toggled: {
				condition: TestingContextKeys.isContinuousModeOn.isEqualTo(true),
				icon: icons.testingContinuousIsOn,
				title: localize('testing.toggleContinuousRunOff', 'Turn off Continuous Run'),
			},
			menu: testItemInlineAndInContext(ActionOrder.ContinuousRunTest, TestingContextKeys.supportsContinuousRun.isEqualTo(true)),
		});
	}

	public override async run(accessor: ServicesAccessor, ...elements: TestItemTreeElement[]): Promise<any> {
		const crService = accessor.get(ITestingContinuousRunService);
		for (const element of elements) {
			const id = element.test.item.extId;
			if (crService.isSpecificallyEnabledFor(id)) {
				crService.stop(id);
				continue;
			}

			crService.start(TestRunProfileBitset.Run, id);
		}
	}
}

export class ContinuousRunUsingProfileTestAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.ContinousRunUsingForTest,
			title: localize2('testing.startContinuousRunUsing', 'Start Continous Run Using...'),
			icon: icons.testingDebugIcon,
			menu: [
				{
					id: MenuId.TestItem,
					order: ActionOrder.RunContinuous,
					group: 'builtin@2',
					when: ContextKeyExpr.and(
						TestingContextKeys.supportsContinuousRun.isEqualTo(true),
						TestingContextKeys.isContinuousModeOn.isEqualTo(false),
					)
				}
			],
		});
	}

	public override async run(accessor: ServicesAccessor, ...elements: TestItemTreeElement[]): Promise<any> {
		const crService = accessor.get(ITestingContinuousRunService);
		const profileService = accessor.get(ITestProfileService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		for (const element of elements) {
			const selected = await selectContinuousRunProfiles(crService, notificationService, quickInputService,
				[{ profiles: profileService.getControllerProfiles(element.test.controllerId) }]);

			if (selected.length) {
				crService.start(selected, element.test.item.extId);
			}
		}
	}
}

export class ConfigureTestProfilesAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.ConfigureTestProfilesAction,
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

const continuousMenus = (whenIsContinuousOn: boolean): IAction2Options['menu'] => [
	{
		id: MenuId.ViewTitle,
		group: 'navigation',
		order: ActionOrder.RunUsing,
		when: ContextKeyExpr.and(
			ContextKeyExpr.equals('view', Testing.ExplorerViewId),
			TestingContextKeys.supportsContinuousRun.isEqualTo(true),
			TestingContextKeys.isContinuousModeOn.isEqualTo(whenIsContinuousOn),
		),
	},
	{
		id: MenuId.CommandPalette,
		when: TestingContextKeys.supportsContinuousRun.isEqualTo(true),
	},
];

class StopContinuousRunAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.StopContinousRun,
			title: localize2('testing.stopContinuous', 'Stop Continuous Run'),
			category,
			icon: icons.testingTurnContinuousRunOff,
			menu: continuousMenus(true),
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ITestingContinuousRunService).stop();
	}
}

function selectContinuousRunProfiles(
	crs: ITestingContinuousRunService,
	notificationService: INotificationService,
	quickInputService: IQuickInputService,
	profilesToPickFrom: Iterable<Readonly<{
		controller?: IMainThreadTestController;
		profiles: ITestRunProfile[];
	}>>,
): Promise<ITestRunProfile[]> {
	type ItemType = IQuickPickItem & { profile: ITestRunProfile };

	const items: ItemType[] = [];
	for (const { controller, profiles } of profilesToPickFrom) {
		for (const profile of profiles) {
			if (profile.supportsContinuousRun) {
				items.push({
					label: profile.label || controller?.label.value || '',
					description: controller?.label.value,
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

	const qpItems: (ItemType | IQuickPickSeparator)[] = [];
	const selectedItems: ItemType[] = [];
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

	const quickpick = quickInputService.createQuickPick<IQuickPickItem & { profile: ITestRunProfile }>();
	quickpick.title = localize('testing.selectContinuousProfiles', 'Select profiles to run when files change:');
	quickpick.canSelectMany = true;
	quickpick.items = qpItems;
	quickpick.selectedItems = selectedItems;
	quickpick.show();
	return new Promise((resolve, reject) => {
		quickpick.onDidAccept(() => {
			resolve(quickpick.selectedItems.map(i => i.profile));
			quickpick.dispose();
		});

		quickpick.onDidHide(() => {
			resolve([]);
			quickpick.dispose();
		});
	});
}

class StartContinuousRunAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.StartContinousRun,
			title: localize2('testing.startContinuous', "Start Continuous Run"),
			category,
			icon: icons.testingTurnContinuousRunOn,
			menu: continuousMenus(false),
		});
	}
	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const crs = accessor.get(ITestingContinuousRunService);
		const selected = await selectContinuousRunProfiles(crs, accessor.get(INotificationService), accessor.get(IQuickInputService), accessor.get(ITestProfileService).all());
		if (selected.length) {
			crs.start(selected);
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
		const { include, exclude } = view.getTreeIncludeExclude();
		return accessor.get(ITestService).runTests({ tests: include, exclude, group: this.group });
	}
}

export class GetSelectedProfiles extends Action2 {
	constructor() {
		super({ id: TestCommandId.GetSelectedProfiles, title: localize2('getSelectedProfiles', 'Get Selected Profiles') });
	}

	/**
	 * @override
	 */
	public override run(accessor: ServicesAccessor) {
		const profiles = accessor.get(ITestProfileService);
		return [
			...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Run),
			...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Debug),
			...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Coverage),
		].map(p => ({
			controllerId: p.controllerId,
			label: p.label,
			kind: p.group & TestRunProfileBitset.Coverage
				? ExtTestRunProfileKind.Coverage
				: p.group & TestRunProfileBitset.Debug
					? ExtTestRunProfileKind.Debug
					: ExtTestRunProfileKind.Run,
		}));
	}
}

export class GetExplorerSelection extends ViewAction<TestingExplorerView> {
	constructor() {
		super({ id: TestCommandId.GetExplorerSelection, title: localize2('getExplorerSelection', 'Get Explorer Selection'), viewId: Testing.ExplorerViewId });
	}

	/**
	 * @override
	 */
	public override runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		const { include, exclude } = view.getTreeIncludeExclude(undefined, undefined, 'selected');
		const mapper = (i: InternalTestItem) => i.item.extId;
		return { include: include.map(mapper), exclude: exclude.map(mapper) };
	}
}

export class RunSelectedAction extends ExecuteSelectedAction {
	constructor() {
		super({
			id: TestCommandId.RunSelectedAction,
			title: LABEL_RUN_TESTS,
			icon: icons.testingRunAllIcon,
		}, TestRunProfileBitset.Run);
	}
}

export class DebugSelectedAction extends ExecuteSelectedAction {
	constructor() {
		super({
			id: TestCommandId.DebugSelectedAction,
			title: LABEL_DEBUG_TESTS,
			icon: icons.testingDebugAllIcon,
		}, TestRunProfileBitset.Debug);
	}
}

export class CoverageSelectedAction extends ExecuteSelectedAction {
	constructor() {
		super({
			id: TestCommandId.CoverageSelectedAction,
			title: LABEL_COVERAGE_TESTS,
			icon: icons.testingCoverageAllIcon,
		}, TestRunProfileBitset.Coverage);
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
				title: localize2('runAllTests', 'Run All Tests'),
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
				title: localize2('debugAllTests', 'Debug All Tests'),
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

export class CoverageAllAction extends RunOrDebugAllTestsAction {
	constructor() {
		super(
			{
				id: TestCommandId.RunAllWithCoverageAction,
				title: localize2('runAllWithCoverage', 'Run All Tests with Coverage'),
				icon: icons.testingCoverageIcon,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA),
				},
			},
			TestRunProfileBitset.Coverage,
			localize('noCoverageTestProvider', 'No tests with coverage runners found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class CancelTestRunAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CancelTestRunAction,
			title: localize2('testing.cancelRun', 'Cancel Test Run'),
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
			title: localize2('testing.viewAsList', 'View as List'),
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
			title: localize2('testing.viewAsTree', 'View as Tree'),
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
			title: localize2('testing.sortByStatus', 'Sort by Status'),
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
			title: localize2('testing.sortByLocation', 'Sort by Location'),
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
			title: localize2('testing.sortByDuration', 'Sort by Duration'),
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
			title: localize2('testing.showMostRecentOutput', 'Show Output'),
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

	public async run(accessor: ServicesAccessor) {
		const viewService = accessor.get(IViewsService);
		const testView = await viewService.openView<TestResultsView>(Testing.ResultsViewId, true);
		testView?.showLatestRun();
	}
}

export class CollapseAllAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: TestCommandId.CollapseAllAction,
			viewId: Testing.ExplorerViewId,
			title: localize2('testing.collapseAll', 'Collapse All Tests'),
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
				order: ActionOrder.ClearResults,
				group: 'displayAction',
				when: ContextKeyExpr.equals('view', Testing.ExplorerViewId)
			}, {
				id: MenuId.ViewTitle,
				order: ActionOrder.ClearResults,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', Testing.ResultsViewId)
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
			title: localize2('testing.editFocusedTest', 'Go to Test'),
			icon: Codicon.goToFile,
			menu: testItemInlineAndInContext(ActionOrder.GoToTest, TestingContextKeys.testItemHasUri.isEqualTo(true)),
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
				primary: KeyCode.Enter | KeyMod.Alt,
			},
		});
	}

	public override async run(accessor: ServicesAccessor, element?: TestExplorerTreeElement, preserveFocus?: boolean) {
		if (!element) {
			const view = accessor.get(IViewsService).getActiveViewWithId<TestingExplorerView>(Testing.ExplorerViewId);
			element = view?.focusedTreeElements[0];
		}

		if (element && element instanceof TestItemTreeElement) {
			accessor.get(ICommandService).executeCommand('vscode.revealTest', element.test.item.extId, preserveFocus);
		}
	}
}

abstract class ExecuteTestAtCursor extends Action2 {
	constructor(options: IAction2Options, protected readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: [{
				id: MenuId.CommandPalette,
				when: hasAnyTestProvider,
			}, {
				id: MenuId.EditorContext,
				group: 'testing',
				order: group === TestRunProfileBitset.Run ? ActionOrder.Run : ActionOrder.Debug,
				when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group]),
			}]
		});
	}

	/**
	 * @override
	 */
	public async run(accessor: ServicesAccessor) {
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
						// check that a parent isn't already included (#180760)
						if (!bestNodes.some(b => TestId.isChild(b.item.extId, test.item.extId))) {
							bestNodes.push(test);
						}
					} else {
						bestRange = irange;
						bestNodes = [test];
					}
				} else if (Position.isBefore(irange.getStartPosition(), position)) {
					if (!bestRangeBefore || bestRangeBefore.getStartPosition().isBefore(irange.getStartPosition())) {
						bestRangeBefore = irange;
						bestNodesBefore = [test];
					} else if (irange.equalsRange(bestRangeBefore) && !bestNodesBefore.some(b => TestId.isChild(b.item.extId, test.item.extId))) {
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
		} else if (editor) {
			MessageController.get(editor)?.showMessage(localize('noTestsAtCursor', "No tests found here"), position);
		}
	}
}

export class RunAtCursor extends ExecuteTestAtCursor {
	constructor() {
		super({
			id: TestCommandId.RunAtCursor,
			title: localize2('testing.runAtCursor', 'Run Test at Cursor'),
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
			title: localize2('testing.debugAtCursor', 'Debug Test at Cursor'),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyC),
			},
		}, TestRunProfileBitset.Debug);
	}
}

export class CoverageAtCursor extends ExecuteTestAtCursor {
	constructor() {
		super({
			id: TestCommandId.CoverageAtCursor,
			title: localize2('testing.coverageAtCursor', 'Run Test at Cursor with Coverage'),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC),
			},
		}, TestRunProfileBitset.Coverage);
	}
}

abstract class ExecuteTestsUnderUriAction extends Action2 {
	constructor(options: IAction2Options, protected readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: [{
				id: MenuId.ExplorerContext,
				when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
				group: '6.5_testing',
				order: (group === TestRunProfileBitset.Run ? ActionOrder.Run : ActionOrder.Debug) + 0.1,
			}],
		});
	}

	public override async run(accessor: ServicesAccessor, uri: URI): Promise<unknown> {
		const testService = accessor.get(ITestService);
		const notificationService = accessor.get(INotificationService);
		const tests = await Iterable.asyncToArray(testsUnderUri(
			testService,
			accessor.get(IUriIdentityService),
			uri
		));

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
			id: TestCommandId.RunByUri,
			title: LABEL_RUN_TESTS,
			category,
		}, TestRunProfileBitset.Run);
	}
}

class DebugTestsUnderUri extends ExecuteTestsUnderUriAction {
	constructor() {
		super({
			id: TestCommandId.DebugByUri,
			title: LABEL_DEBUG_TESTS,
			category,
		}, TestRunProfileBitset.Debug);
	}
}

class CoverageTestsUnderUri extends ExecuteTestsUnderUriAction {
	constructor() {
		super({
			id: TestCommandId.CoverageByUri,
			title: LABEL_COVERAGE_TESTS,
			category,
		}, TestRunProfileBitset.Coverage);
	}
}

abstract class ExecuteTestsInCurrentFile extends Action2 {
	constructor(options: IAction2Options, protected readonly group: TestRunProfileBitset) {
		super({
			...options,
			menu: [{
				id: MenuId.CommandPalette,
				when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
			}, {
				id: MenuId.EditorContext,
				group: 'testing',
				// add 0.1 to be after the "at cursor" commands
				order: (group === TestRunProfileBitset.Run ? ActionOrder.Run : ActionOrder.Debug) + 0.1,
				when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group]),
			}],
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
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

		if (editor) {
			MessageController.get(editor)?.showMessage(localize('noTestsInFile', "No tests found in this file"), position);
		}

		return undefined;
	}
}

export class RunCurrentFile extends ExecuteTestsInCurrentFile {

	constructor() {
		super({
			id: TestCommandId.RunCurrentFile,
			title: localize2('testing.runCurrentFile', 'Run Tests in Current File'),
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
			title: localize2('testing.debugCurrentFile', 'Debug Tests in Current File'),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyF),
			},
		}, TestRunProfileBitset.Debug);
	}
}

export class CoverageCurrentFile extends ExecuteTestsInCurrentFile {
	constructor() {
		super({
			id: TestCommandId.CoverageCurrentFile,
			title: localize2('testing.coverageCurrentFile', 'Run Tests with Coverage in Current File'),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF),
			},
		}, TestRunProfileBitset.Coverage);
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
			title: localize2('testing.reRunFailTests', 'Rerun Failed Tests'),
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
			title: localize2('testing.debugFailTests', 'Debug Failed Tests'),
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
			title: localize2('testing.reRunLastRun', 'Rerun Last Run'),
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
			title: localize2('testing.debugLastRun', 'Debug Last Run'),
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

export class CoverageLastRun extends RunOrDebugLastRun {
	constructor() {
		super({
			id: TestCommandId.CoverageLastRun,
			title: localize2('testing.coverageLastRun', 'Rerun Last Run with Coverage'),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL),
			},
		});
	}

	protected runTest(service: ITestService, internalTests: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({
			group: TestRunProfileBitset.Coverage,
			tests: internalTests,
		});
	}
}

export class SearchForTestExtension extends Action2 {
	constructor() {
		super({
			id: TestCommandId.SearchForTestExtension,
			title: localize2('testing.searchForTestExtension', 'Search for Test Extension'),
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
			title: localize2('testing.openOutputPeek', 'Peek Output'),
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
			title: localize2('testing.toggleInlineTestOutput', 'Toggle Inline Test Output'),
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
			title: localize2('testing.refreshTests', 'Refresh Tests'),
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

	public async run(accessor: ServicesAccessor, ...elements: TestItemTreeElement[]) {
		const testService = accessor.get(ITestService);
		const progressService = accessor.get(IProgressService);

		const controllerIds = distinct(elements.filter(isDefined).map(e => e.test.controllerId));
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
			title: localize2('testing.cancelTestRefresh', 'Cancel Test Refresh'),
			category,
			icon: icons.testingCancelRefreshTests,
			menu: refreshMenus(true),
		});
	}

	public async run(accessor: ServicesAccessor) {
		accessor.get(ITestService).cancelRefreshTests();
	}
}

export class CleareCoverage extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CoverageClear,
			title: localize2('testing.clearCoverage', 'Clear Coverage'),
			icon: widgetClose,
			category,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: ActionOrder.Refresh,
				when: ContextKeyExpr.equals('view', Testing.CoverageViewId)
			}, {
				id: MenuId.CommandPalette,
				when: TestingContextKeys.isTestCoverageOpen.isEqualTo(true),
			}]
		});
	}

	public override run(accessor: ServicesAccessor) {
		accessor.get(ITestCoverageService).closeCoverage();
	}
}

export class OpenCoverage extends Action2 {
	constructor() {
		super({
			id: TestCommandId.OpenCoverage,
			title: localize2('testing.openCoverage', 'Open Coverage'),
			category,
			menu: [{
				id: MenuId.CommandPalette,
				when: TestingContextKeys.hasAnyResults.isEqualTo(true),
			}]
		});
	}

	public override run(accessor: ServicesAccessor) {
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

export const allTestActions = [
	CancelTestRefreshAction,
	CancelTestRunAction,
	ClearTestResultsAction,
	CleareCoverage,
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
	GoToTest,
	HideTestAction,
	OpenCoverage,
	OpenOutputPeek,
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
	UnhideAllTestsAction,
	UnhideTestAction,
];
