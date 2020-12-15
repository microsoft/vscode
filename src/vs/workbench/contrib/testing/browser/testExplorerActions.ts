/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { ITestSubscriptionItem } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
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

export const enum ViewMode {
	List,
	Tree
}


export class ToggleViewModeAction extends Action {
	static readonly ID = 'workbench.testing.action.toggleViewMode';
	static readonly LABEL = localize('toggleViewMode', "Toggle View Mode");

	constructor(private readonly viewModel: { viewMode: ViewMode, onViewModeChange: Event<ViewMode> }) {
		super(
			'workbench.testing.action.toggleViewMode',
			localize('toggleViewMode', "Toggle View Mode"),
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
	}
}
