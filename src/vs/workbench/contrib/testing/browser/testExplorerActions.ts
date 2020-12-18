/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { localize } from 'vs/nls';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { ITestingCollectionService } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestingExplorerViewModel } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { EMPTY_TEST_RESULT, InternalTestItem, RunTestsResult } from 'vs/workbench/contrib/testing/common/testCollection';
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

	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [{ testId: this.test.id, providerId: this.test.providerId }],
			debug: false,
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

	public run(): Promise<any> {
		return this.testService.runTests({
			tests: [{ testId: this.test.id, providerId: this.test.providerId }],
			debug: false,
		});
	}
}

abstract class RunOrDebugAction extends FilterableAction {
	constructor(
		private readonly viewModel: TestingExplorerViewModel,
		id: string,
		label: string,
		className: string,
		@ITestingCollectionService private readonly testCollection: ITestingCollectionService,
		@ITestService private readonly testService: ITestService,
	) {
		super(
			id,
			label,
			'test-action ' + className,
			/* enabled= */ Iterable.first(testService.testRuns) === undefined,
		);

		this._register(testService.onTestRunStarted(this.updateVisibility, this));
		this._register(testService.onTestRunCompleted(this.updateVisibility, this));
		this._register(viewModel.onDidChangeSelection(this.updateEnablementState, this));
	}

	public run(): Promise<RunTestsResult> {
		const tests = [...this.getActionableTests()];
		if (!tests.length) {
			return Promise.resolve(EMPTY_TEST_RESULT);
		}

		return this.testService.runTests({ tests, debug: false });
	}

	private updateVisibility() {
		this._setVisible(Iterable.isEmpty(this.testService.testRuns));
	}

	private updateEnablementState() {
		this._setEnabled(!Iterable.isEmpty(this.getActionableTests()));
	}

	private *getActionableTests() {
		const selected = this.viewModel.getSelectedTests();
		if (!selected.length) {
			for (const folder of this.testCollection.workspaceFolders()) {
				for (const child of folder.getChildren()) {
					if (this.filter(child)) {
						yield { testId: child.id, providerId: child.providerId };
					}
				}
			}
		} else {
			for (const item of selected) {
				if (item?.test && this.filter(item.test)) {
					yield { testId: item.test.id, providerId: item.test.providerId };
				}
			}
		}
	}

	protected abstract debug(): boolean;
	protected abstract filter(item: InternalTestItem): boolean;
}

export class RunSelectedAction extends RunOrDebugAction {
	constructor(
		viewModel: TestingExplorerViewModel,
		@ITestingCollectionService testCollection: ITestingCollectionService,
		@ITestService testService: ITestService,
	) {
		super(
			viewModel,
			'action.runSelected',
			localize('runSelectedTests', 'Run Selected Tests'),
			ThemeIcon.asClassName(icons.testingRunIcon),
			testCollection,
			testService,
		);
	}

	public debug() {
		return false;
	}

	public filter({ item }: InternalTestItem) {
		return item.runnable;
	}
}

export class DebugSelectedAction extends RunOrDebugAction {
	constructor(
		viewModel: TestingExplorerViewModel,
		@ITestingCollectionService testCollection: ITestingCollectionService,
		@ITestService testService: ITestService,
	) {
		super(
			viewModel,
			'action.debugSelected',
			localize('debugSelectedTests', 'Debug Selected Tests'),
			ThemeIcon.asClassName(icons.testingDebugIcon),
			testCollection,
			testService,
		);
	}

	public debug() {
		return true;
	}

	public filter({ item }: InternalTestItem) {
		return item.debuggable;
	}
}

export class CancelTestRunAction extends FilterableAction {
	constructor(@ITestService private readonly testService: ITestService) {
		super(
			'action.cancelRun',
			localize('cancelRunTests', 'Cancel Test Run'),
			ThemeIcon.asClassName(icons.testingCancelIcon),
		);

		this._register(testService.onTestRunStarted(this.updateVisibility, this));
		this._register(testService.onTestRunCompleted(this.updateVisibility, this));
		this.updateVisibility();
	}

	private updateVisibility() {
		this._setVisible(!Iterable.isEmpty(this.testService.testRuns));
	}

	public async run(): Promise<void> {
		for (const run of this.testService.testRuns) {
			this.testService.cancelTestRun(run);
		}
	}
}

export const enum ViewMode {
	List,
	Tree
}

export const enum ViewGrouping {
	ByTree,
	ByStatus,
}

export class ToggleViewModeAction extends Action {
	constructor(private readonly viewModel: TestingExplorerViewModel) {
		super(
			'workbench.testing.action.toggleViewMode',
			localize('toggleViewMode', "View as List"),
		);
		this._register(viewModel.onViewModeChange(this.onDidChangeMode, this));
		this.onDidChangeMode(this.viewModel.viewMode);
	}

	async run(): Promise<void> {
		this.viewModel.viewMode = this.viewModel.viewMode === ViewMode.List
			? ViewMode.Tree
			: ViewMode.List;
	}

	private onDidChangeMode(mode: ViewMode): void {
		const iconClass = ThemeIcon.asClassName(mode === ViewMode.List ? icons.testingShowAsList : icons.testingShowAsTree);
		this.class = iconClass;
		this.checked = mode === ViewMode.List;
	}
}

export class ToggleViewGroupingAction extends Action {
	constructor(private readonly viewModel: TestingExplorerViewModel) {
		super(
			'workbench.testing.action.toggleViewMode',
			localize('toggleViewMode', "View as List"),
		);
		this._register(viewModel.onViewModeChange(this.onDidChangeMode, this));
		this.onDidChangeMode(this.viewModel.viewMode);
	}

	async run(): Promise<void> {
		this.viewModel.viewMode = this.viewModel.viewMode === ViewMode.List
			? ViewMode.Tree
			: ViewMode.List;
	}

	private onDidChangeMode(mode: ViewMode): void {
		const iconClass = ThemeIcon.asClassName(mode === ViewMode.List ? icons.testingShowAsList : icons.testingShowAsTree);
		this.class = iconClass;
		this.checked = mode === ViewMode.List;
	}
}
