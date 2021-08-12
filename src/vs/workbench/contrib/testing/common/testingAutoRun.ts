/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AutoRunMode, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { InternalTestItem, TestDiffOpType, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { isRunningTests, ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { getCollectionItemParents, ITestService } from 'vs/workbench/contrib/testing/common/testService';

export interface ITestingAutoRun {
	/**
	 * Toggles autorun on or off.
	 */
	toggle(): void;
}

export const ITestingAutoRun = createDecorator<ITestingAutoRun>('testingAutoRun');

export class TestingAutoRun extends Disposable implements ITestingAutoRun {
	private enabled: IContextKey<boolean>;
	private runner = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly results: ITestResultService,
		@IConfigurationService private readonly configuration: IConfigurationService,
	) {
		super();
		this.enabled = TestingContextKeys.autoRun.bindTo(contextKeyService);

		this._register(configuration.onDidChangeConfiguration(evt => {
			if (evt.affectsConfiguration(TestingConfigKeys.AutoRunMode) && this.enabled.get()) {
				this.runner.value = this.makeRunner();
			}
		}));
	}

	/**
	 * @inheritdoc
	 */
	public toggle(): void {
		const enabled = this.enabled.get();
		if (enabled) {
			this.runner.value = undefined;
		} else {
			this.runner.value = this.makeRunner();
		}

		this.enabled.set(!enabled);
	}

	/**
	 * Creates the runner. Is triggered when tests are marked as retired.
	 * Runs them on a debounce.
	 */
	private makeRunner() {
		const rerunIds = new Map<string, InternalTestItem>();
		const store = new DisposableStore();
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		let delay = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoRunDelay);

		store.add(this.configuration.onDidChangeConfiguration(() => {
			delay = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoRunDelay);
		}));

		const scheduler = store.add(new RunOnceScheduler(async () => {
			if (rerunIds.size === 0) {
				return;
			}

			const tests = [...rerunIds.values()];
			rerunIds.clear();
			await this.testService.runTests({ group: TestRunProfileBitset.Run, tests, isAutoRun: true });

			if (rerunIds.size > 0) {
				scheduler.schedule(delay);
			}
		}, delay));

		const addToRerun = (test: InternalTestItem) => {
			rerunIds.set(test.item.extId, test);
			if (!isRunningTests(this.results)) {
				scheduler.schedule(delay);
			}
		};

		const removeFromRerun = (test: InternalTestItem) => {
			rerunIds.delete(test.item.extId);
			if (rerunIds.size === 0) {
				scheduler.cancel();
			}
		};

		store.add(this.results.onTestChanged(evt => {
			if (evt.reason === TestResultItemChangeReason.Retired) {
				addToRerun(evt.item);
			} else if ((evt.reason === TestResultItemChangeReason.OwnStateChange || evt.reason === TestResultItemChangeReason.ComputedStateChange)) {
				removeFromRerun(evt.item);
			}
		}));

		store.add(this.results.onResultsChanged(evt => {
			if ('completed' in evt && !isRunningTests(this.results) && rerunIds.size) {
				scheduler.schedule(0);
			}
		}));

		if (getTestingConfiguration(this.configuration, TestingConfigKeys.AutoRunMode) === AutoRunMode.AllInWorkspace) {

			store.add(this.testService.onDidProcessDiff(diff => {
				for (const entry of diff) {
					if (entry[0] === TestDiffOpType.Add) {
						const test = entry[1];
						const isQueued = Iterable.some(
							getCollectionItemParents(this.testService.collection, test),
							t => rerunIds.has(test.item.extId),
						);

						const state = this.results.getStateById(test.item.extId);
						if (!isQueued && (!state || state[1].retired)) {
							addToRerun(test);
						}
					}
				}
			}));


			for (const root of this.testService.collection.rootItems) {
				addToRerun(root);
			}
		}

		return store;
	}
}
