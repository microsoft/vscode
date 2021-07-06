/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { MainThreadTestCollection } from 'vs/workbench/contrib/testing/common/mainThreadTestCollection';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { RunTestsRequest, ITestIdWithSrc, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService, MainTestController } from 'vs/workbench/contrib/testing/common/testService';

export class TestService extends Disposable implements ITestService {
	declare readonly _serviceBrand: undefined;
	private testControllers = new Map<string, MainTestController>();

	private readonly cancelExtensionTestRunEmitter = new Emitter<{ runId: string | undefined }>();
	private readonly processDiffEmitter = new Emitter<TestsDiff>();
	private readonly providerCount: IContextKey<number>;
	private readonly hasRunnable: IContextKey<boolean>;
	private readonly hasDebuggable: IContextKey<boolean>;
	/**
	 * Cancellation for runs requested by the user being managed by the UI.
	 * Test runs initiated by extensions are not included here.
	 */
	private readonly uiRunningTests = new Map<string /* run ID */, CancellationTokenSource>();

	/**
	 * @inheritdoc
	 */
	public readonly excludeTests = MutableObservableValue.stored(new StoredValue<ReadonlySet<string>>({
		key: 'excludedTestItems',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.USER,
		serialization: {
			deserialize: v => new Set(JSON.parse(v)),
			serialize: v => JSON.stringify([...v])
		},
	}, this.storageService), new Set());

	/**
	 * @inheritdoc
	 */
	public readonly onDidProcessDiff = this.processDiffEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onDidCancelTestRun = this.cancelExtensionTestRunEmitter.event;

	/**
	* @inheritdoc
	 */
	public readonly collection = new MainThreadTestCollection(this.expandTest.bind(this));

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITestResultService private readonly testResults: ITestResultService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) {
		super();
		this.providerCount = TestingContextKeys.providerCount.bindTo(contextKeyService);
		this.hasDebuggable = TestingContextKeys.hasDebuggableTests.bindTo(contextKeyService);
		this.hasRunnable = TestingContextKeys.hasRunnableTests.bindTo(contextKeyService);
	}

	/**
	 * @inheritdoc
	 */
	public async expandTest(test: ITestIdWithSrc, levels: number) {
		await this.testControllers.get(test.controllerId)?.expandTest(test, levels);
	}

	/**
	 * @inheritdoc
	 */
	public clearExcludedTests() {
		this.excludeTests.value = new Set();
	}

	/**
	 * @inheritdoc
	 */
	public setTestExcluded(testId: string, exclude = !this.excludeTests.value.has(testId)) {
		const newSet = new Set(this.excludeTests.value);
		if (exclude) {
			newSet.add(testId);
		} else {
			newSet.delete(testId);
		}

		if (newSet.size !== this.excludeTests.value.size) {
			this.excludeTests.value = newSet;
		}
	}


	/**
	 * @inheritdoc
	 */
	public cancelTestRun(runId?: string) {
		this.cancelExtensionTestRunEmitter.fire({ runId });

		if (runId === undefined) {
			for (const runCts of this.uiRunningTests.values()) {
				runCts.cancel();
			}
		} else {
			this.uiRunningTests.get(runId)?.cancel();
		}
	}

	/**
	 * @inheritdoc
	 */
	public async runTests(req: RunTestsRequest, token = CancellationToken.None): Promise<ITestResult> {
		if (!req.exclude) {
			req.exclude = [...this.excludeTests.value];
		}

		const result = this.testResults.createLiveResult(req);
		const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('testTrust', "Running tests may execute code in your workspace."),
		});

		if (!trust) {
			result.markComplete();
			return result;
		}

		try {
			const tests = groupBy(req.tests, (a, b) => a.controllerId === b.controllerId ? 0 : 1);
			const cancelSource = new CancellationTokenSource(token);
			this.uiRunningTests.set(result.id, cancelSource);

			const requests = tests.map(
				group => this.testControllers.get(group[0].controllerId)?.runTests(
					{
						runId: result.id,
						debug: req.debug,
						excludeExtIds: req.exclude ?? [],
						testIds: group.map(g => g.testId),
						controllerId: group[0].controllerId,
					},
					cancelSource.token,
				).catch(err => {
					this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', err.message));
				})
			);

			await Promise.all(requests);
			return result;
		} finally {
			this.uiRunningTests.delete(result.id);
			result.markComplete();
		}
	}

	/**
	 * @inheritdoc
	 */
	public resubscribeToAllTests() {
		// todo
	}

	/**
	 * @inheritdoc
	 */
	public publishDiff(_controllerId: string, diff: TestsDiff) {
		this.collection.apply(diff);
		this.hasDebuggable.set(Iterable.some(this.collection.all, t => t.item.debuggable));
		this.hasRunnable.set(Iterable.some(this.collection.all, t => t.item.runnable));
		this.processDiffEmitter.fire(diff);
	}

	/**
	 * @inheritdoc
	 */
	public registerTestController(id: string, controller: MainTestController): IDisposable {
		this.testControllers.set(id, controller);
		this.providerCount.set(this.testControllers.size);

		return toDisposable(() => {
			if (this.testControllers.delete(id)) {
				this.providerCount.set(this.testControllers.size);
			}
		});
	}
}


