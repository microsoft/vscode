/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { localize } from 'vs/nls';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { isTestItem, ITestingCollectionService, ITestSubscriptionItem } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestingExplorerViewModel } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { EMPTY_TEST_RESULT, RunTestsResult } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export class DebugAction extends Action {
	constructor(
		private readonly test: ITestSubscriptionItem,
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
		private readonly test: ITestSubscriptionItem,
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

abstract class RunOrDebugAction extends Action {
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

		this._register(testService.onTestRunStarted(this.updateEnablementState, this));
		this._register(testService.onTestRunCompleted(this.updateEnablementState, this));
		this._register(viewModel.onDidChangeSelection(this.updateEnablementState, this));
	}

	public run(): Promise<RunTestsResult> {
		const tests = [...this.getActionableTests()];
		if (!tests.length) {
			return Promise.resolve(EMPTY_TEST_RESULT);
		}

		return this.testService.runTests({ tests, debug: false });
	}

	private updateEnablementState() {
		if (Iterable.first(this.testService.testRuns) !== undefined) {
			this._setEnabled(false);
		} else {
			this._setEnabled(Iterable.first(this.getActionableTests()) !== undefined);
		}
	}

	private *getActionableTests() {
		const selected = this.viewModel.getSelectedTests();
		for (const item of selected.length ? selected : this.testCollection.workspaceFolders()) {
			if (!item) {
				continue;
			}

			if (isTestItem(item)) {
				if (this.filter(item)) {
					yield { testId: item.id, providerId: item.providerId };
				}
			} else {
				for (const child of item.getChildren()) {
					if (this.filter(child)) {
						yield { testId: child.id, providerId: child.providerId };
					}
				}
			}
		}
	}

	protected abstract debug(): boolean;
	protected abstract filter(item: ITestSubscriptionItem): boolean;
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

	public filter({ item }: ITestSubscriptionItem) {
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

	public filter({ item }: ITestSubscriptionItem) {
		return item.runnable;
	}
}

export const enum ViewMode {
	List,
	Tree
}

export class ToggleViewModeAction extends Action {
	constructor(private readonly viewModel: { viewMode: ViewMode, onViewModeChange: Event<ViewMode> }) {
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
