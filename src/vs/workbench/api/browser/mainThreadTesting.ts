/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ISettableObservable, transaction } from 'vs/base/common/observable';
import { WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestController, ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { CoverageDetails, ExtensionRunTestsRequest, IFileCoverage, ITestItem, ITestMessage, ITestRunProfile, ITestRunTask, ResolvedTestRunRequest, TestResultState, TestRunProfileBitset, TestsDiffOp } from 'vs/workbench/contrib/testing/common/testTypes';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ExtHostContext, ExtHostTestingShape, ILocationDto, ITestControllerPatch, MainContext, MainThreadTestingShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTesting extends Disposable implements MainThreadTestingShape {
	private readonly proxy: ExtHostTestingShape;
	private readonly diffListener = this._register(new MutableDisposable());
	private readonly testProviderRegistrations = new Map<string, {
		instance: IMainThreadTestController;
		label: MutableObservableValue<string>;
		canRefresh: MutableObservableValue<boolean>;
		disposable: IDisposable;
	}>();

	constructor(
		extHostContext: IExtHostContext,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ITestService private readonly testService: ITestService,
		@ITestProfileService private readonly testProfiles: ITestProfileService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);

		this._register(this.testService.registerExtHost({
			provideTestFollowups: (req, token) => this.proxy.$provideTestFollowups(req, token),
			executeTestFollowup: id => this.proxy.$executeTestFollowup(id),
			disposeTestFollowups: ids => this.proxy.$disposeTestFollowups(ids),
		}));

		this._register(this.testService.onDidCancelTestRun(({ runId }) => {
			this.proxy.$cancelExtensionTestRun(runId);
		}));

		this._register(Event.debounce(testProfiles.onDidChange, (_last, e) => e)(() => {
			const obj: Record</* controller id */string, /* profile id */ number[]> = {};
			for (const group of [TestRunProfileBitset.Run, TestRunProfileBitset.Debug, TestRunProfileBitset.Coverage]) {
				for (const profile of this.testProfiles.getGroupDefaultProfiles(group)) {
					obj[profile.controllerId] ??= [];
					obj[profile.controllerId].push(profile.profileId);
				}
			}

			this.proxy.$setDefaultRunProfiles(obj);
		}));

		this._register(resultService.onResultsChanged(evt => {
			if ('completed' in evt) {
				const serialized = evt.completed.toJSONWithMessages();
				if (serialized) {
					this.proxy.$publishTestResults([serialized]);
				}
			} else if ('removed' in evt) {
				evt.removed.forEach(r => {
					if (r instanceof LiveTestResult) {
						this.proxy.$disposeRun(r.id);
					}
				});
			}
		}));
	}

	/**
	 * @inheritdoc
	 */
	$markTestRetired(testIds: string[] | undefined): void {
		let tree: WellDefinedPrefixTree<undefined> | undefined;
		if (testIds) {
			tree = new WellDefinedPrefixTree();
			for (const id of testIds) {
				tree.insert(TestId.fromString(id).path, undefined);
			}
		}

		for (const result of this.resultService.results) {
			// all non-live results are already entirely outdated
			if (result instanceof LiveTestResult) {
				result.markRetired(tree);
			}
		}
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
	$addTestsToRun(controllerId: string, runId: string, tests: ITestItem.Serialized[]): void {
		this.withLiveRun(runId, r => r.addTestChainToRun(controllerId,
			tests.map(t => ITestItem.deserialize(this.uriIdentityService, t))));
	}

	/**
	 * @inheritdoc
	 */
	$appendCoverage(runId: string, taskId: string, coverage: IFileCoverage.Serialized): void {
		this.withLiveRun(runId, run => {
			const task = run.tasks.find(t => t.id === taskId);
			if (!task) {
				return;
			}

			const deserialized = IFileCoverage.deserialize(this.uriIdentityService, coverage);

			transaction(tx => {
				let value = task.coverage.read(undefined);
				if (!value) {
					value = new TestCoverage(run, taskId, this.uriIdentityService, {
						getCoverageDetails: (id, token) => this.proxy.$getCoverageDetails(id, token)
							.then(r => r.map(CoverageDetails.deserialize)),
					});
					value.append(deserialized, tx);
					(task.coverage as ISettableObservable<TestCoverage>).set(value, tx);
				} else {
					value.append(deserialized, tx);
				}
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
	public $appendTestMessagesInRun(runId: string, taskId: string, testId: string, messages: ITestMessage.Serialized[]): void {
		const r = this.resultService.getResult(runId);
		if (r && r instanceof LiveTestResult) {
			for (const message of messages) {
				r.appendMessage(testId, taskId, ITestMessage.deserialize(this.uriIdentityService, message));
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	public $registerTestController(controllerId: string, labelStr: string, canRefreshValue: boolean) {
		const disposable = new DisposableStore();
		const label = disposable.add(new MutableObservableValue(labelStr));
		const canRefresh = disposable.add(new MutableObservableValue(canRefreshValue));
		const controller: IMainThreadTestController = {
			id: controllerId,
			label,
			canRefresh,
			syncTests: () => this.proxy.$syncTests(),
			refreshTests: token => this.proxy.$refreshTests(controllerId, token),
			configureRunProfile: id => this.proxy.$configureRunProfile(controllerId, id),
			runTests: (reqs, token) => this.proxy.$runControllerTests(reqs, token),
			startContinuousRun: (reqs, token) => this.proxy.$startContinuousRun(reqs, token),
			expandTest: (testId, levels) => this.proxy.$expandTest(testId, isFinite(levels) ? levels : -1),
		};

		disposable.add(toDisposable(() => this.testProfiles.removeProfile(controllerId)));
		disposable.add(this.testService.registerTestController(controllerId, controller));

		this.testProviderRegistrations.set(controllerId, {
			instance: controller,
			label,
			canRefresh,
			disposable
		});
	}

	/**
	 * @inheritdoc
	 */
	public $updateController(controllerId: string, patch: ITestControllerPatch) {
		const controller = this.testProviderRegistrations.get(controllerId);
		if (!controller) {
			return;
		}

		if (patch.label !== undefined) {
			controller.label.value = patch.label;
		}

		if (patch.canRefresh !== undefined) {
			controller.canRefresh.value = patch.canRefresh;
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
		this.proxy.$acceptDiff(this.testService.collection.getReviverDiff().map(TestsDiffOp.serialize));
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
	public $publishDiff(controllerId: string, diff: TestsDiffOp.Serialized[]): void {
		this.testService.publishDiff(controllerId,
			diff.map(d => TestsDiffOp.deserialize(this.uriIdentityService, d)));
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
