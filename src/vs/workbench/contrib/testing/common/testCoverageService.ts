/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey, observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { TestingConfigKeys } from './configuration.js';
import { Testing } from './constants.js';
import { TestCoverage } from './testCoverage.js';
import { TestId } from './testId.js';
import { ITestRunTaskResults } from './testResult.js';
import { ITestResultService } from './testResultService.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

export const ITestCoverageService = createDecorator<ITestCoverageService>('testCoverageService');

export interface ITestCoverageService {
	readonly _serviceBrand: undefined;

	/**
	 * Settable observable that can be used to show the test coverage instance
	 * currently in the editor.
	 */
	readonly selected: IObservable<TestCoverage | undefined>;

	/**
	 * Filter to per-test coverage from the given test ID.
	 */
	readonly filterToTest: ISettableObservable<TestId | undefined>;

	/**
	 * Whether inline coverage is shown.
	 */
	readonly showInline: ISettableObservable<boolean>;

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
	private readonly lastOpenCts = this._register(new MutableDisposable<CancellationTokenSource>());

	public readonly selected = observableValue<TestCoverage | undefined>('testCoverage', undefined);
	public readonly filterToTest = observableValue<TestId | undefined>('filterToTest', undefined);
	public readonly showInline = observableValue('inlineCoverage', false);

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITestResultService resultService: ITestResultService,
		@IConfigurationService configService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		const toolbarConfig = observableConfigValue(TestingConfigKeys.CoverageToolbarEnabled, true, configService);
		this._register(bindContextKey(
			TestingContextKeys.coverageToolbarEnabled,
			contextKeyService,
			reader => toolbarConfig.read(reader),
		));

		this._register(bindContextKey(
			TestingContextKeys.inlineCoverageEnabled,
			contextKeyService,
			reader => this.showInline.read(reader),
		));

		this._register(bindContextKey(
			TestingContextKeys.isTestCoverageOpen,
			contextKeyService,
			reader => !!this.selected.read(reader),
		));

		this._register(bindContextKey(
			TestingContextKeys.hasPerTestCoverage,
			contextKeyService,
			reader => !Iterable.isEmpty(this.selected.read(reader)?.allPerTestIDs()),
		));

		this._register(bindContextKey(
			TestingContextKeys.isCoverageFilteredToTest,
			contextKeyService,
			reader => !!this.filterToTest.read(reader),
		));

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

		transaction(tx => {
			// todo: may want to preserve this if coverage for that test in the new run?
			this.filterToTest.set(undefined, tx);
			this.selected.set(coverage, tx);
		});

		if (focus && !cts.token.isCancellationRequested) {
			this.viewsService.openView(Testing.CoverageViewId, true);
		}
	}

	/** @inheritdoc */
	public closeCoverage() {
		this.selected.set(undefined, undefined);
	}
}
