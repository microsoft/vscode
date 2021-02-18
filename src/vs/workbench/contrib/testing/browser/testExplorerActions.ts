/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isDefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyAndExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { FocusedViewContext } from 'vs/workbench/common/views';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { TestingExplorerView, TestingExplorerViewModel } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestExplorerViewMode, TestExplorerViewSorting, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { InternalTestItem, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestingAutoRun } from 'vs/workbench/contrib/testing/common/testingAutoRun';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestResult, ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService, waitForAllRoots, waitForAllTests } from 'vs/workbench/contrib/testing/common/testService';
import { IWorkspaceTestCollectionService } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const category = localize('testing.category', 'Test');

const enum ActionOrder {
	// Navigation:
	Run = 10,
	Debug,
	AutoRun,
	Collapse,

	// Submenu:
	DisplayMode,
	Sort,
	Refresh,
}

export class DebugAction extends Action {
	constructor(
		private readonly tests: Iterable<TestIdWithProvider>,
		isRunning: boolean,
		@ITestService private readonly testService: ITestService
	) {
		super(
			'testing.run',
			localize('debug test', 'Debug Test'),
			'test-action ' + ThemeIcon.asClassName(icons.testingDebugIcon),
			/* enabled= */ !isRunning
		);
	}

	/**
	 * @override
	 */
	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [...this.tests],
			debug: true,
		});
	}
}

export class RunAction extends Action {
	constructor(
		private readonly tests: Iterable<TestIdWithProvider>,
		isRunning: boolean,
		@ITestService private readonly testService: ITestService
	) {
		super(
			'testing.run',
			localize('run test', 'Run Test'),
			'test-action ' + ThemeIcon.asClassName(icons.testingRunIcon),
			/* enabled= */ !isRunning,
		);
	}

	/**
	 * @override
	 */
	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [...this.tests],
			debug: false,
		});
	}
}

abstract class RunOrDebugSelectedAction extends ViewAction<TestingExplorerView> {
	constructor(id: string, title: string, icon: ThemeIcon, private readonly debug: boolean) {
		super({
			id,
			title,
			icon,
			viewId: Testing.ExplorerViewId,
			f1: true,
			category,
			precondition: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
		});
	}

	/**
	 * @override
	 */
	public runInView(accessor: ServicesAccessor, view: TestingExplorerView): Promise<ITestResult | undefined> {
		const tests = this.getActionableTests(accessor.get(IWorkspaceTestCollectionService), view.viewModel);
		if (!tests.length) {
			return Promise.resolve(undefined);
		}

		return accessor.get(ITestService).runTests({ tests, debug: this.debug });
	}

	private getActionableTests(testCollection: IWorkspaceTestCollectionService, viewModel: TestingExplorerViewModel) {
		const selected = viewModel.getSelectedTests();
		const tests: TestIdWithProvider[] = [];
		if (!selected.length) {
			for (const folder of testCollection.workspaceFolders()) {
				for (const child of folder.getChildren()) {
					if (this.filter(child)) {
						tests.push({ testId: child.id, providerId: child.providerId });
					}
				}
			}
		} else {
			for (const item of selected) {
				if (item?.test && this.filter(item.test)) {
					tests.push({ testId: item.test.id, providerId: item.test.providerId });
				}
			}
		}

		return tests;
	}

	protected abstract filter(item: InternalTestItem): boolean;
}

export class RunSelectedAction extends RunOrDebugSelectedAction {
	constructor(
	) {
		super(
			'testing.runSelected',
			localize('runSelectedTests', 'Run Selected Tests'),
			icons.testingRunIcon,
			false,
		);
	}

	/**
	 * @override
	 */
	public filter({ item }: InternalTestItem) {
		return item.runnable;
	}
}

export class DebugSelectedAction extends RunOrDebugSelectedAction {
	constructor() {
		super(
			'testing.debugSelected',
			localize('debugSelectedTests', 'Debug Selected Tests'),
			icons.testingDebugIcon,
			true,
		);
	}

	/**
	 * @override
	 */
	public filter({ item }: InternalTestItem) {
		return item.debuggable;
	}
}

abstract class RunOrDebugAllAllAction extends Action2 {
	constructor(id: string, title: string, icon: ThemeIcon, private readonly debug: boolean, private noTestsFoundError: string) {
		super({
			id,
			title,
			icon,
			f1: true,
			category,
			menu: {
				id: MenuId.ViewTitle,
				order: debug ? ActionOrder.Debug : ActionOrder.Run,
				group: 'navigation',
				when: ContextKeyAndExpr.create([
					ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId),
					ContextKeyEqualsExpr.create(TestingContextKeys.isRunning.serialize(), false),
				])
			}
		});
	}

	public async run(accessor: ServicesAccessor) {
		const testService = accessor.get(ITestService);
		const workspace = accessor.get(IWorkspaceContextService);
		const notifications = accessor.get(INotificationService);

		const tests: TestIdWithProvider[] = [];
		await Promise.all(workspace.getWorkspace().folders.map(async (folder) => {
			const ref = testService.subscribeToDiffs(ExtHostTestingResource.Workspace, folder.uri);
			try {
				await waitForAllRoots(ref.object);

				for (const root of ref.object.rootIds) {
					const node = ref.object.getNodeById(root);
					if (node && (this.debug ? node.item.debuggable : node.item.runnable)) {
						tests.push({ testId: node.id, providerId: node.providerId });
					}
				}
			} finally {
				ref.dispose();
			}
		}));

		if (tests.length === 0) {
			notifications.info(this.noTestsFoundError);
			return;
		}

		await testService.runTests({ tests, debug: this.debug });
	}
}

export class RunAllAction extends RunOrDebugAllAllAction {
	constructor() {
		super(
			'testing.runAll',
			localize('runAllTests', 'Run All Tests'),
			icons.testingRunAllIcon,
			false,
			localize('noTestProvider', 'No tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class DebugAllAction extends RunOrDebugAllAllAction {
	constructor() {
		super(
			'testing.debugAll',
			localize('debugAllTests', 'Debug All Tests'),
			icons.testingDebugIcon,
			true,
			localize('noDebugTestProvider', 'No debuggable tests found in this workspace. You may need to install a test provider extension'),
		);
	}
}

export class CancelTestRunAction extends Action2 {
	constructor() {
		super({
			id: 'testing.cancelRun',
			title: localize('testing.cancelRun', "Cancel Test Run"),
			icon: icons.testingCancelIcon,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Run,
				group: 'navigation',
				when: ContextKeyAndExpr.create([
					ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId),
					ContextKeyEqualsExpr.create(TestingContextKeys.isRunning.serialize(), true),
				])
			}
		});
	}

	/**
	 * @override
	 */
	public async run(accessor: ServicesAccessor) {
		const testService = accessor.get(ITestService);
		for (const run of testService.testRuns) {
			testService.cancelTestRun(run);
		}
	}
}

export class TestingViewAsListAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.viewAsList',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.viewAsList', "View as List"),
			f1: false,
			toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.List),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.DisplayMode,
				group: 'viewAs',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
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
			id: 'testing.viewAsTree',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.viewAsTree', "View as Tree"),
			f1: false,
			toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.Tree),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.DisplayMode,
				group: 'viewAs',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
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


export class TestingSortByNameAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.sortByName',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.sortByName', "Sort by Name"),
			f1: false,
			toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByName),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Sort,
				group: 'sortBy',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewSorting = TestExplorerViewSorting.ByName;
	}
}

export class TestingSortByLocationAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.sortByLocation',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.sortByLocation', "Sort by Location"),
			f1: false,
			toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByLocation),
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Sort,
				group: 'sortBy',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
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

export class CollapseAllAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.collapseAll',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.collapseAll', "Collapse All Tests"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Collapse,
				group: 'navigation',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
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

export class RefreshTestsAction extends Action2 {
	constructor() {
		super({
			id: 'testing.refreshTests',
			title: localize('testing.refresh', "Refresh Tests"),
			category,
			f1: true,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Refresh,
				group: 'refresh',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
		accessor.get(ITestService).resubscribeToAllTests();
	}
}

export class ClearTestResultsAction extends Action2 {
	constructor() {
		super({
			id: 'testing.clearTestResults',
			title: localize('testing.clearResults', "Clear All Results"),
			category,
			f1: true
		});
	}

	/**
	 * @override
	 */
	public run(accessor: ServicesAccessor) {
		accessor.get(ITestResultService).clear();
	}
}

export class EditFocusedTest extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.editFocusedTest',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.editFocusedTest', "Open Focused Test in Editor"),
			f1: false,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
				primary: KeyCode.Enter | KeyMod.Alt,
			},
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		const selected = view.viewModel.tree.getFocus().find(isDefined);
		if (selected) {
			view.viewModel.openEditorForItem(selected, false);
		}
	}
}

export class ToggleAutoRun extends Action2 {
	constructor() {
		super({
			id: 'testing.toggleautoRun',
			title: localize('testing.toggleautoRun', "Toggle Auto Run"),
			f1: true,
			toggled: TestingContextKeys.autoRun.isEqualTo(true),
			icon: icons.testingAutorunIcon,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.AutoRun,
				group: 'navigation',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
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

abstract class RunOrDebugAtCursor extends Action2 {
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
		const collection = testService.subscribeToDiffs(ExtHostTestingResource.TextDocument, model.uri);

		let bestDepth = -1;
		let bestNode: InternalTestItem | undefined;

		try {
			await waitForAllTests(collection.object);
			const queue: [depth: number, nodes: Iterable<string>][] = [[0, collection.object.rootIds]];
			while (queue.length > 0) {
				const [depth, candidates] = queue.pop()!;
				for (const id of candidates) {
					const candidate = collection.object.getNodeById(id);
					if (candidate) {
						if (depth > bestDepth && this.filter(candidate) && candidate.item.location?.range.containsPosition(position)) {
							bestDepth = depth;
							bestNode = candidate;
						}

						queue.push([depth + 1, candidate.children]);
					}
				}
			}

			if (bestNode) {
				await this.runTest(testService, bestNode);
			}
		} finally {
			collection.dispose();
		}
	}

	protected abstract filter(node: InternalTestItem): boolean;

	protected abstract runTest(service: ITestService, node: InternalTestItem): Promise<ITestResult>;
}

export class RunAtCursor extends RunOrDebugAtCursor {
	constructor() {
		super({
			id: 'testing.runAtCursor',
			title: localize('testing.runAtCursor', "Run Test at Cursor"),
			f1: true,
			category,
		});
	}

	protected filter(node: InternalTestItem): boolean {
		return node.item.runnable;
	}

	protected runTest(service: ITestService, node: InternalTestItem): Promise<ITestResult> {
		return service.runTests({ debug: false, tests: [{ testId: node.id, providerId: node.providerId }] });
	}
}

export class DebugAtCursor extends RunOrDebugAtCursor {
	constructor() {
		super({
			id: 'testing.debugAtCursor',
			title: localize('testing.debugAtCursor', "Debug Test at Cursor"),
			f1: true,
			category,
		});
	}

	protected filter(node: InternalTestItem): boolean {
		return node.item.debuggable;
	}

	protected runTest(service: ITestService, node: InternalTestItem): Promise<ITestResult> {
		return service.runTests({ debug: true, tests: [{ testId: node.id, providerId: node.providerId }] });
	}
}


abstract class RunOrDebugCurrentFile extends Action2 {
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
		const collection = testService.subscribeToDiffs(ExtHostTestingResource.TextDocument, model.uri);

		try {
			await waitForAllTests(collection.object);

			const roots = [...collection.object.rootIds]
				.map(r => collection.object.getNodeById(r))
				.filter(isDefined)
				.filter(n => this.filter(n));

			if (roots.length) {
				await this.runTest(testService, roots);
			}
		} finally {
			collection.dispose();
		}
	}

	protected abstract filter(node: InternalTestItem): boolean;

	protected abstract runTest(service: ITestService, node: InternalTestItem[]): Promise<ITestResult>;
}

export class RunCurrentFile extends RunOrDebugCurrentFile {
	constructor() {
		super({
			id: 'testing.runCurrentFile',
			title: localize('testing.runCurrentFile', "Run Tests in Current File"),
			f1: true,
			category,
		});
	}

	protected filter(node: InternalTestItem): boolean {
		return node.item.runnable;
	}

	protected runTest(service: ITestService, nodes: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({ debug: false, tests: nodes.map(node => ({ testId: node.id, providerId: node.providerId })) });
	}
}

export class DebugCurrentFile extends RunOrDebugCurrentFile {
	constructor() {
		super({
			id: 'testing.debugCurrentFile',
			title: localize('testing.debugCurrentFile', "Debug Tests in Current File"),
			f1: true,
			category,
		});
	}

	protected filter(node: InternalTestItem): boolean {
		return node.item.debuggable;
	}

	protected runTest(service: ITestService, nodes: InternalTestItem[]): Promise<ITestResult> {
		return service.runTests({ debug: true, tests: nodes.map(node => ({ testId: node.id, providerId: node.providerId })) });
	}
}
