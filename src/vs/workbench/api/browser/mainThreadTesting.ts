/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { ExtensionRunTestsRequest, ITestItem, ITestMessage, ITestRunProfile, ITestRunTask, ResolvedTestRunRequest, SerializedTestMessage, TestDiffOpType, TestResultState, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestController, ITestRootProvider, ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ExtHostContext, ExtHostTestingShape, IExtHostContext, ILocationDto, MainContext, MainThreadTestingShape } from '../common/extHost.protocol';

const reviveDiff = (diff: TestsDiff) => {
	for (const entry of diff) {
		if (entry[0] === TestDiffOpType.Add || entry[0] === TestDiffOpType.Update) {
			const item = entry[1];
			if (item.item?.uri) {
				item.item.uri = URI.revive(item.item.uri);
			}
			if (item.item?.range) {
				item.item.range = Range.lift(item.item.range);
			}
		}
	}
};

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTesting extends Disposable implements MainThreadTestingShape, ITestRootProvider {
	private readonly proxy: ExtHostTestingShape;
	private readonly diffListener = this._register(new MutableDisposable());
	private readonly testProviderRegistrations = new Map<string, {
		instance: IMainThreadTestController;
		label: MutableObservableValue<string>;
		disposable: IDisposable
	}>();

	constructor(
		extHostContext: IExtHostContext,
		@ITestService private readonly testService: ITestService,
		@ITestProfileService private readonly testProfiles: ITestProfileService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);

		const prevResults = resultService.results.map(r => r.toJSON()).filter(isDefined);
		if (prevResults.length) {
			this.proxy.$publishTestResults(prevResults);
		}

		this._register(this.testService.onDidCancelTestRun(({ runId }) => {
			this.proxy.$cancelExtensionTestRun(runId);
		}));

		this._register(resultService.onResultsChanged(evt => {
			const results = 'completed' in evt ? evt.completed : ('inserted' in evt ? evt.inserted : undefined);
			const serialized = results?.toJSON();
			if (serialized) {
				this.proxy.$publishTestResults([serialized]);
			}
		}));
	}

	/**
	 * @inheritdoc
	 */
	$publishTestRunProfile(profile: ITestRunProfile): void {
		const controller = this.testProviderRegistrations.get(profile.controllerId);
		if (controller) {
			this.testProfiles.addProfile(controller.instance, profile);
		}
	}

	/**
	 * @inheritdoc
	 */
	$updateTestRunConfig(controllerId: string, profileId: number, update: Partial<ITestRunProfile>): void {
		this.testProfiles.updateProfile(controllerId, profileId, update);
	}

	/**
	 * @inheritdoc
	 */
	$removeTestProfile(controllerId: string, profileId: number): void {
		this.testProfiles.removeProfile(controllerId, profileId);
	}

	/**
	 * @inheritdoc
	 */
	$addTestsToRun(controllerId: string, runId: string, tests: ITestItem[]): void {
		for (const test of tests) {
			test.uri = URI.revive(test.uri);
			if (test.range) {
				test.range = Range.lift(test.range);
			}
		}

		this.withLiveRun(runId, r => r.addTestChainToRun(controllerId, tests));
	}

	/**
	 * @inheritdoc
	 */
	$signalCoverageAvailable(runId: string, taskId: string): void {
		this.withLiveRun(runId, run => {
			const task = run.tasks.find(t => t.id === taskId);
			if (!task) {
				return;
			}

			(task.coverage as MutableObservableValue<TestCoverage>).value = new TestCoverage({
				provideFileCoverage: token => this.proxy.$provideFileCoverage(runId, taskId, token),
				resolveFileCoverage: (i, token) => this.proxy.$resolveFileCoverage(runId, taskId, i, token),
			});
		});
	}

	/**
	 * @inheritdoc
	 */
	$startedExtensionTestRun(req: ExtensionRunTestsRequest): void {
		this.resultService.createLiveResult(req);
	}

	/**
	 * @inheritdoc
	 */
	$startedTestRunTask(runId: string, task: ITestRunTask): void {
		this.withLiveRun(runId, r => r.addTask(task));
	}

	/**
	 * @inheritdoc
	 */
	$finishedTestRunTask(runId: string, taskId: string): void {
		this.withLiveRun(runId, r => r.markTaskComplete(taskId));
	}

	/**
	 * @inheritdoc
	 */
	$finishedExtensionTestRun(runId: string): void {
		this.withLiveRun(runId, r => r.markComplete());
	}

	/**
	 * @inheritdoc
	 */
	public $updateTestStateInRun(runId: string, taskId: string, testId: string, state: TestResultState, duration?: number): void {
		this.withLiveRun(runId, r => r.updateState(testId, taskId, state, duration));
	}

	/**
	 * @inheritdoc
	 */
	public $appendOutputToRun(runId: string, taskId: string, output: VSBuffer, locationDto?: ILocationDto, testId?: string): void {
		const location = locationDto && {
			uri: URI.revive(locationDto.uri),
			range: Range.lift(locationDto.range)
		};

		this.withLiveRun(runId, r => r.appendOutput(output, taskId, location, testId));
	}


	/**
	 * @inheritdoc
	 */
	public $appendTestMessagesInRun(runId: string, taskId: string, testId: string, messages: SerializedTestMessage[]): void {
		const r = this.resultService.getResult(runId);
		if (r && r instanceof LiveTestResult) {
			for (const message of messages) {
				if (message.location) {
					message.location.uri = URI.revive(message.location.uri);
					message.location.range = Range.lift(message.location.range);
				}

				r.appendMessage(testId, taskId, message as ITestMessage);
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	public $registerTestController(controllerId: string, labelStr: string) {
		const disposable = new DisposableStore();
		const label = new MutableObservableValue(labelStr);
		const controller: IMainThreadTestController = {
			id: controllerId,
			label,
			configureRunProfile: id => this.proxy.$configureRunProfile(controllerId, id),
			runTests: (req, token) => this.proxy.$runControllerTests(req, token),
			expandTest: (testId, levels) => this.proxy.$expandTest(testId, isFinite(levels) ? levels : -1),
		};


		disposable.add(toDisposable(() => this.testProfiles.removeProfile(controllerId)));
		disposable.add(this.testService.registerTestController(controllerId, controller));

		this.testProviderRegistrations.set(controllerId, {
			instance: controller,
			label,
			disposable
		});
	}

	/**
	 * @inheritdoc
	 */
	public $updateControllerLabel(controllerId: string, label: string) {
		const controller = this.testProviderRegistrations.get(controllerId);
		if (controller) {
			controller.label.value = label;
		}
	}

	/**
	 * @inheritdoc
	 */
	public $unregisterTestController(controllerId: string) {
		this.testProviderRegistrations.get(controllerId)?.disposable.dispose();
		this.testProviderRegistrations.delete(controllerId);
	}

	/**
	 * @inheritdoc
	 */
	public $subscribeToDiffs(): void {
		this.proxy.$acceptDiff(this.testService.collection.getReviverDiff());
		this.diffListener.value = this.testService.onDidProcessDiff(this.proxy.$acceptDiff, this.proxy);
	}

	/**
	 * @inheritdoc
	 */
	public $unsubscribeFromDiffs(): void {
		this.diffListener.clear();
	}

	/**
	 * @inheritdoc
	 */
	public $publishDiff(controllerId: string, diff: TestsDiff): void {
		reviveDiff(diff);
		this.testService.publishDiff(controllerId, diff);
	}

	public async $runTests(req: ResolvedTestRunRequest, token: CancellationToken): Promise<string> {
		const result = await this.testService.runResolvedTests(req, token);
		return result.id;
	}

	public override dispose() {
		super.dispose();
		for (const subscription of this.testProviderRegistrations.values()) {
			subscription.disposable.dispose();
		}
		this.testProviderRegistrations.clear();
	}

	private withLiveRun<T>(runId: string, fn: (run: LiveTestResult) => T): T | undefined {
		const r = this.resultService.getResult(runId);
		return r && r instanceof LiveTestResult ? fn(r) : undefined;
	}
}
