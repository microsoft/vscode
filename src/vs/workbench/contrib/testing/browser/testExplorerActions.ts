/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyAndExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingCollectionService } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestingExplorerView, TestingExplorerViewModel } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestExplorerViewMode, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { EMPTY_TEST_RESULT, InternalTestItem, RunTestsResult, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export class FilterableAction extends Action {
	private visChangeEmitter = new Emitter<boolean>();

	public onDidChangeVisibility = this.visChangeEmitter.event;
	public isVisible = true;

	protected _setVisible(isVisible: boolean) {
		if (isVisible !== this.isVisible) {
			this.isVisible = isVisible;
			this.visChangeEmitter.fire(isVisible);
		}
	}
}

export const filterVisibleActions = (actions: ReadonlyArray<Action>) =>
	actions.filter(a => !(a instanceof FilterableAction) || a.isVisible);

export class DebugAction extends Action {
	constructor(
		private readonly test: InternalTestItem,
		@ITestService private readonly testService: ITestService
	) {
		super(
			'action.run',
			localize('debug test', 'Debug Test'),
			'test-action ' + ThemeIcon.asClassName(icons.testingDebugIcon),
			/* enabled= */ test.item.state.runState !== TestRunState.Running
		);
	}

	/**
	 * @override
	 */
	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [{ testId: this.test.id, providerId: this.test.providerId }],
			debug: true,
		});
	}
}

export class RunAction extends Action {
	constructor(
		private readonly test: InternalTestItem,
		@ITestService private readonly testService: ITestService
	) {
		super(
			'action.run',
			localize('run test', 'Run Test'),
			'test-action ' + ThemeIcon.asClassName(icons.testingRunIcon),
			/* enabled= */ test.item.state.runState !== TestRunState.Running,
		);
	}

	/**
	 * @override
	 */
	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [{ testId: this.test.id, providerId: this.test.providerId }],
			debug: false,
		});
	}
}

abstract class RunOrDebugAction extends ViewAction<TestingExplorerView> {
	constructor(id: string, title: string, icon: ThemeIcon) {
		super({
			id,
			title,
			icon,
			viewId: Testing.ExplorerViewId,
			menu: {
				id: MenuId.ViewTitle,
				order: 10,
				group: 'navigation',
				when: ContextKeyAndExpr.create([
					ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId),
					ContextKeyEqualsExpr.create(TestingContextKeys.isRunning.serialize(), false),
				])
			}
		});
	}

	/**
	 * @override
	 */
	public runInView(accessor: ServicesAccessor, view: TestingExplorerView): Promise<RunTestsResult> {
		const tests = this.getActionableTests(accessor.get(ITestingCollectionService), view.viewModel);
		if (!tests.length) {
			return Promise.resolve(EMPTY_TEST_RESULT);
		}

		return accessor.get(ITestService).runTests({ tests, debug: this.debug() });
	}

	private getActionableTests(testCollection: ITestingCollectionService, viewModel: TestingExplorerViewModel) {
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

	protected abstract debug(): boolean;
	protected abstract filter(item: InternalTestItem): boolean;
}

export class RunSelectedAction extends RunOrDebugAction {
	constructor(
	) {
		super(
			'action.runSelected',
			localize('runSelectedTests', 'Run Selected Tests'),
			icons.testingRunIcon,
		);
	}

	/**
	 * @override
	 */
	public debug() {
		return false;
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
			'action.debugSelected',
			localize('debugSelectedTests', 'Debug Selected Tests'),
			icons.testingDebugIcon,
		);
	}

	/**
	 * @override
	 */
	public debug() {
		return true;
	}

	/**
	 * @override
	 */
	public filter({ item }: InternalTestItem) {
		return item.debuggable;
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
				order: 10,
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
