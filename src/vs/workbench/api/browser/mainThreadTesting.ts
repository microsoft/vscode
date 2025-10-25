/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { WellDefinedPrefixTree } from '../../../base/common/prefixTree.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { Range } from '../../../editor/common/core/range.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { TestCoverage } from '../../contrib/testing/common/testCoverage.js';
import { TestId } from '../../contrib/testing/common/testId.js';
import { ITestProfileService } from '../../contrib/testing/common/testProfileService.js';
import { LiveTestResult } from '../../contrib/testing/common/testResult.js';
import { ITestResultService } from '../../contrib/testing/common/testResultService.js';
import { IMainThreadTestController, ITestService } from '../../contrib/testing/common/testService.js';
import { CoverageDetails, ExtensionRunTestsRequest, IFileCoverage, ITestItem, ITestMessage, ITestRunProfile, ITestRunTask, ResolvedTestRunRequest, TestControllerCapability, TestResultState, TestRunProfileBitset, TestsDiffOp } from '../../contrib/testing/common/testTypes.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostTestingShape, ILocationDto, ITestControllerPatch, MainContext, MainThreadTestingShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadTesting)
export class MainThreadTesting extends Disposable implements MainThreadTestingShape {
	private readonly proxy: ExtHostTestingShape;
	private readonly diffListener = this._register(new MutableDisposable());
	private readonly testProviderRegistrations = new Map<string, {
		instance: IMainThreadTestController;
		label: ISettableObservable<string>;
		capabilities: ISettableObservable<TestControllerCapability>;
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
			getTestsRelatedToCode: (uri, position, token) => this.proxy.$getTestsRelatedToCode(uri, position, token),
		}));

		this._register(this.testService.onDidCancelTestRun(({ runId, taskId }) => {
			this.proxy.$cancelExtensionTestRun(runId, taskId);
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
						getCoverageDetails: (id, testId, token) => this.proxy.$getCoverageDetails(id, testId, token)
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
	public $registerTestController(controllerId: string, _label: string, _capabilities: TestControllerCapability) {
		const disposable = new DisposableStore();
		const label = observableValue(`${controllerId}.label`, _label);
		const capabilities = observableValue(`${controllerId}.cap`, _capabilities);
		const controller: IMainThreadTestController = {
			id: controllerId,
			label,
			capabilities,
			syncTests: () => this.proxy.$syncTests(),
			refreshTests: token => this.proxy.$refreshTests(controllerId, token),
			configureRunProfile: id => this.proxy.$configureRunProfile(controllerId, id),
			runTests: (reqs, token) => this.proxy.$runControllerTests(reqs, token),
			startContinuousRun: (reqs, token) => this.proxy.$startContinuousRun(reqs, token),
			expandTest: (testId, levels) => this.proxy.$expandTest(testId, isFinite(levels) ? levels : -1),
			getRelatedCode: (testId, token) => this.proxy.$getCodeRelatedToTest(testId, token).then(locations =>
				locations.map(l => ({
					uri: URI.revive(l.uri),
					range: Range.lift(l.range)
				})),
			),
		};

		disposable.add(toDisposable(() => this.testProfiles.removeProfile(controllerId)));
		disposable.add(this.testService.registerTestController(controllerId, controller));

		this.testProviderRegistrations.set(controllerId, {
			instance: controller,
			label,
			capabilities,
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

		transaction(tx => {
			if (patch.label !== undefined) {
				controller.label.set(patch.label, tx);
			}

			if (patch.capabilities !== undefined) {
				controller.capabilities.set(patch.capabilities, tx);
			}
		});

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

	/**
	 * @inheritdoc
	 */
	public async $runTests(req: ResolvedTestRunRequest, token: CancellationToken): Promise<string> {
		const result = await this.testService.runResolvedTests(req, token);
		return result.id;
	}

	/**
	 * @inheritdoc
	 */
	public async $getCoverageDetails(resultId: string, taskIndex: number, uri: UriComponents, token: CancellationToken): Promise<CoverageDetails.Serialized[]> {
		const details = await this.resultService.getResult(resultId)
			?.tasks[taskIndex]
			?.coverage.get()
			?.getUri(URI.from(uri))
			?.details(token);

		// Return empty if nothing. Some failure is always possible here because
		// results might be cleared in the meantime.
		return details || [];
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
