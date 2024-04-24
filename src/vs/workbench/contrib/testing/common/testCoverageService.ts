/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IObservable, observableValue } from 'vs/base/common/observable';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestRunTaskResults } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export const ITestCoverageService = createDecorator<ITestCoverageService>('testCoverageService');

export interface ITestCoverageService {
	readonly _serviceBrand: undefined;

	/**
	 * Settable observable that can be used to show the test coverage instance
	 * currently in the editor.
	 */
	readonly selected: IObservable<TestCoverage | undefined>;

	/**
	 * Opens a test coverage report from a task, optionally focusing it in the editor.
	 */
	openCoverage(task: ITestRunTaskResults, focus?: boolean): Promise<void>;

	/**
	 * Closes any open coverage.
	 */
	closeCoverage(): void;
}

export class TestCoverageService extends Disposable implements ITestCoverageService {
	declare readonly _serviceBrand: undefined;
	private readonly _isOpenKey: IContextKey<boolean>;
	private readonly lastOpenCts = this._register(new MutableDisposable<CancellationTokenSource>());

	public readonly selected = observableValue<TestCoverage | undefined>('testCoverage', undefined);

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITestResultService resultService: ITestResultService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();
		this._isOpenKey = TestingContextKeys.isTestCoverageOpen.bindTo(contextKeyService);

		this._register(resultService.onResultsChanged(evt => {
			if ('completed' in evt) {
				const coverage = evt.completed.tasks.find(t => t.coverage.get());
				if (coverage) {
					this.openCoverage(coverage, false);
				} else {
					this.closeCoverage();
				}
			} else if ('removed' in evt && this.selected.get()) {
				const taskId = this.selected.get()?.fromTaskId;
				if (evt.removed.some(e => e.tasks.some(t => t.id === taskId))) {
					this.closeCoverage();
				}
			}
		}));
	}

	/** @inheritdoc */
	public async openCoverage(task: ITestRunTaskResults, focus = true) {
		this.lastOpenCts.value?.cancel();
		const cts = this.lastOpenCts.value = new CancellationTokenSource();
		const coverage = task.coverage.get();
		if (!coverage) {
			return;
		}

		this.selected.set(coverage, undefined);
		this._isOpenKey.set(true);

		if (focus && !cts.token.isCancellationRequested) {
			this.viewsService.openView(Testing.CoverageViewId, true);
		}
	}

	/** @inheritdoc */
	public closeCoverage() {
		this._isOpenKey.set(false);
		this.selected.set(undefined, undefined);
	}
}
