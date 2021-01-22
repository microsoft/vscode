/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyAndExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ShowViewletAction2 } from 'vs/workbench/browser/viewlet';
import { CATEGORIES } from 'vs/workbench/common/actions';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { TestingExplorerView, TestingExplorerViewModel } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestExplorerViewGrouping, TestExplorerViewMode, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { EMPTY_TEST_RESULT, InternalTestItem, RunTestsResult, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { IWorkspaceTestCollectionService } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService, waitForAllRoots } from 'vs/workbench/contrib/testing/common/testService';
import { INotificationService } from 'vs/platform/notification/common/notification';

const category = localize('testing.category', 'Test');

const enum ActionOrder {
	Run = 10,
	Debug,
	Refresh,
	Collapse,
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

abstract class RunOrDebugAction extends ViewAction<TestingExplorerView> {
	constructor(id: string, title: string, icon: ThemeIcon, private readonly debug: boolean) {
		super({
			id,
			title,
			icon,
			viewId: Testing.ExplorerViewId,
			f1: true,
			category,
		});
	}

	/**
	 * @override
	 */
	public runInView(accessor: ServicesAccessor, view: TestingExplorerView): Promise<RunTestsResult> {
		const tests = this.getActionableTests(accessor.get(IWorkspaceTestCollectionService), view.viewModel);
		if (!tests.length) {
			return Promise.resolve(EMPTY_TEST_RESULT);
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

export class RunSelectedAction extends RunOrDebugAction {
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

export class DebugSelectedAction extends RunOrDebugAction {
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
			const handle = testService.subscribeToDiffs(ExtHostTestingResource.Workspace, folder.uri);
			try {
				await waitForAllRoots(handle.collection);

				for (const root of handle.collection.rootIds) {
					const node = handle.collection.getNodeById(root);
					if (node && (this.debug ? node.item.debuggable : node.item.runnable)) {
						tests.push({ testId: node.id, providerId: node.providerId });
					}
				}
			} finally {
				handle.dispose();
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
				order: 10,
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
				order: 10,
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


export class TestingGroupByLocationAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.groupByLocation',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.groupByLocation', "Sort by Name"),
			f1: false,
			toggled: TestingContextKeys.viewGrouping.isEqualTo(TestExplorerViewGrouping.ByLocation),
			menu: {
				id: MenuId.ViewTitle,
				order: 10,
				group: 'groupBy',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewGrouping = TestExplorerViewGrouping.ByLocation;
	}
}

export class TestingGroupByStatusAction extends ViewAction<TestingExplorerView> {
	constructor() {
		super({
			id: 'testing.groupByStatus',
			viewId: Testing.ExplorerViewId,
			title: localize('testing.groupByStatus', "Sort by Status"),
			f1: false,
			toggled: TestingContextKeys.viewGrouping.isEqualTo(TestExplorerViewGrouping.ByStatus),
			menu: {
				id: MenuId.ViewTitle,
				order: 10,
				group: 'groupBy',
				when: ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId)
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(_accessor: ServicesAccessor, view: TestingExplorerView) {
		view.viewModel.viewGrouping = TestExplorerViewGrouping.ByStatus;
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
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				order: ActionOrder.Refresh,
				group: 'navigation',
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

export class ShowTestView extends ShowViewletAction2 {
	constructor() {
		super({
			// matches old test action for back-compat
			id: 'workbench.view.extension.test',
			title: localize('showTestViewley', "Show Test"),
			category: CATEGORIES.View.value,
			f1: true,
		});
	}

	protected viewletId() {
		return Testing.ViewletId;
	}
}
