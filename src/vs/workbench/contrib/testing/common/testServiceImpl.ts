/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, IReference } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { AbstractIncrementalTestCollection, getTestSubscriptionKey, IncrementalTestCollectionItem, InternalTestItem, RunTestsRequest, TestDiffOpType, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestResult, ITestResultService, LiveTestResult } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestCollection, ITestService, MainTestController, TestDiffListener } from 'vs/workbench/contrib/testing/common/testService';

type TestLocationIdent = { resource: ExtHostTestingResource, uri: URI };

const workspaceUnsubscribeDelay = 30_000;
const documentUnsubscribeDelay = 5_000;

export class TestService extends Disposable implements ITestService {
	declare readonly _serviceBrand: undefined;
	private testControllers = new Map<string, MainTestController>();
	private readonly testSubscriptions = new Map<string, {
		collection: MainThreadTestCollection;
		ident: TestLocationIdent;
		onDiff: Emitter<TestsDiff>;
		disposeTimeout?: IDisposable,
		listeners: number;
	}>();

	private readonly subscribeEmitter = new Emitter<TestLocationIdent>();
	private readonly unsubscribeEmitter = new Emitter<TestLocationIdent>();
	private readonly busyStateChangeEmitter = new Emitter<TestLocationIdent & { busy: boolean }>();
	private readonly changeProvidersEmitter = new Emitter<{ delta: number }>();
	private readonly providerCount: IContextKey<number>;
	private readonly runningTests = new Map<RunTestsRequest, CancellationTokenSource>();
	private rootProviderCount = 0;

	constructor(@IContextKeyService contextKeyService: IContextKeyService, @INotificationService private readonly notificationService: INotificationService, @ITestResultService private readonly testResults: ITestResultService) {
		super();
		this.providerCount = TestingContextKeys.providerCount.bindTo(contextKeyService);
	}

	/**
	 * Gets currently running tests.
	 */
	public get testRuns() {
		return this.runningTests.keys();
	}

	/**
	 * Gets the current provider count.
	 */
	public get providers() {
		return this.providerCount.get() || 0;
	}

	/**
	 * Fired when extension hosts should pull events from their test factories.
	 */
	public readonly onShouldSubscribe = this.subscribeEmitter.event;

	/**
	 * Fired when extension hosts should stop pulling events from their test factories.
	 */
	public readonly onShouldUnsubscribe = this.unsubscribeEmitter.event;

	/**
	 * Fired when the number of providers change.
	 */
	public readonly onDidChangeProviders = this.changeProvidersEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onBusyStateChange = this.busyStateChangeEmitter.event;

	/**
	 * @inheritdoc
	 */
	public get subscriptions() {
		return [...this.testSubscriptions].map(([, s]) => s.ident);
	}

	/**
	 * @inheritdoc
	 */
	public cancelTestRun(req: RunTestsRequest) {
		this.runningTests.get(req)?.cancel();
	}

	/**
	 * @inheritdoc
	 */
	public async lookupTest(test: TestIdWithProvider) {
		for (const { collection } of this.testSubscriptions.values()) {
			const node = collection.getNodeById(test.testId);
			if (node) {
				return node;
			}
		}

		return this.testControllers.get(test.providerId)?.lookupTest(test);
	}

	/**
	 * @inheritdoc
	 */
	public updateRootProviderCount(delta: number) {
		this.rootProviderCount += delta;
	}


	/**
	 * @inheritdoc
	 */
	public async runTests(req: RunTestsRequest, token = CancellationToken.None): Promise<ITestResult> {
		const subscriptions = [...this.testSubscriptions.values()]
			.filter(v => req.tests.some(t => v.collection.getNodeById(t.testId)))
			.map(s => this.subscribeToDiffs(s.ident.resource, s.ident.uri));
		const result = this.testResults.push(LiveTestResult.from(subscriptions.map(s => s.object), req));

		try {
			const tests = groupBy(req.tests, (a, b) => a.providerId === b.providerId ? 0 : 1);
			const cancelSource = new CancellationTokenSource(token);
			this.runningTests.set(req, cancelSource);

			const requests = tests.map(group => {
				const providerId = group[0].providerId;
				const controller = this.testControllers.get(providerId);
				return controller?.runTests(
					{ runId: result.id, providerId, debug: req.debug, ids: group.map(t => t.testId) },
					cancelSource.token,
				).catch(err => {
					this.notificationService.error(localize('testError', 'An error occurred attempting to run tests: {0}', err.message));
				});
			});

			await Promise.all(requests);
			return result;
		} finally {
			this.runningTests.delete(req);
			subscriptions.forEach(s => s.dispose());
			result.markComplete();
		}
	}

	/**
	 * @inheritdoc
	 */
	public resubscribeToAllTests() {
		for (const subscription of this.testSubscriptions.values()) {
			this.unsubscribeEmitter.fire(subscription.ident);
			const diff = subscription.collection.clear();
			subscription.onDiff.fire(diff);
			this.subscribeEmitter.fire(subscription.ident);
		}
	}

	/**
	 * @inheritdoc
	 */
	public subscribeToDiffs(resource: ExtHostTestingResource, uri: URI, acceptDiff?: TestDiffListener): IReference<IMainThreadTestCollection> {
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		let subscription = this.testSubscriptions.get(subscriptionKey);
		if (!subscription) {
			subscription = {
				ident: { resource, uri },
				collection: new MainThreadTestCollection(this.rootProviderCount),
				listeners: 0,
				onDiff: new Emitter(),
			};
			this.subscribeEmitter.fire({ resource, uri });
			this.testSubscriptions.set(subscriptionKey, subscription);
		} else if (subscription.disposeTimeout) {
			subscription.disposeTimeout.dispose();
			subscription.disposeTimeout = undefined;
		}

		subscription.listeners++;

		if (acceptDiff) {
			acceptDiff(subscription.collection.getReviverDiff());
		}

		const listener = acceptDiff && subscription.onDiff.event(acceptDiff);
		return {
			object: subscription.collection,
			dispose: () => {
				listener?.dispose();

				if (--subscription!.listeners > 0) {
					return;
				}


				subscription!.disposeTimeout = disposableTimeout(
					() => {
						this.unsubscribeEmitter.fire({ resource, uri });
						this.testSubscriptions.delete(subscriptionKey);
					},
					resource === ExtHostTestingResource.TextDocument ? documentUnsubscribeDelay : workspaceUnsubscribeDelay,
				);
			}
		};
	}

	/**
	 * @inheritdoc
	 */
	public publishDiff(resource: ExtHostTestingResource, uri: UriComponents, diff: TestsDiff) {
		const sub = this.testSubscriptions.get(getTestSubscriptionKey(resource, URI.revive(uri)));
		if (sub) {
			sub.collection.apply(diff);
			// console.log('accept', sub.collection, diff);
			sub.onDiff.fire(diff);
		}
	}

	/**
	 * @inheritdoc
	 */
	public registerTestController(id: string, controller: MainTestController): void {
		this.testControllers.set(id, controller);
		this.providerCount.set(this.testControllers.size);
		this.changeProvidersEmitter.fire({ delta: 1 });
	}

	/**
	 * @inheritdoc
	 */
	public unregisterTestController(id: string): void {
		this.testControllers.delete(id);
		this.providerCount.set(this.testControllers.size);
		this.changeProvidersEmitter.fire({ delta: -1 });
	}
}

export class MainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> implements IMainThreadTestCollection {
	private pendingRootChangeEmitter = new Emitter<number>();
	private busyProvidersChangeEmitter = new Emitter<number>();
	private _busyProviders = 0;

	/**
	 * @inheritdoc
	 */
	public get pendingRootProviders() {
		return this._pendingRootProviders;
	}

	/**
	 * @inheritdoc
	 */
	public get busyProviders() {
		return this._busyProviders;
	}

	/**
	 * @inheritdoc
	 */
	public get rootIds() {
		return this.roots;
	}

	/**
	 * @inheritdoc
	 */
	public get all() {
		return this.getIterator();
	}


	public readonly onPendingRootProvidersChange = this.pendingRootChangeEmitter.event;
	public readonly onBusyProvidersChange = this.busyProvidersChangeEmitter.event;

	constructor(private _pendingRootProviders: number) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	public getNodeById(id: string) {
		return this.items.get(id);
	}

	/**
	 * @inheritdoc
	 */
	public getReviverDiff() {
		const ops: TestsDiff = [
			[TestDiffOpType.DeltaDiscoverComplete, this._busyProviders],
			[TestDiffOpType.DeltaRootsComplete, this._pendingRootProviders],
		];

		const queue = [this.roots];
		while (queue.length) {
			for (const child of queue.pop()!) {
				const item = this.items.get(child)!;
				ops.push([TestDiffOpType.Add, { id: item.id, providerId: item.providerId, item: item.item, parent: item.parent }]);
				queue.push(item.children);
			}
		}

		return ops;
	}

	/**
	 * Clears everything from the collection, and returns a diff that applies
	 * that action.
	 */
	public clear() {
		const ops: TestsDiff = [];
		for (const root of this.roots) {
			ops.push([TestDiffOpType.Remove, root]);
		}

		this.roots.clear();
		this.items.clear();

		return ops;
	}

	/**
	 * @override
	 */
	protected updateBusyProviders(delta: number) {
		this._busyProviders += delta;
		this.busyProvidersChangeEmitter.fire(this._busyProviders);
	}

	/**
	 * @override
	 */
	protected updatePendingRoots(delta: number) {
		this._pendingRootProviders += delta;
		this.pendingRootChangeEmitter.fire(this._pendingRootProviders);
	}

	/**
	 * @override
	 */
	protected createItem(internal: InternalTestItem): IncrementalTestCollectionItem {
		return { ...internal, children: new Set() };
	}

	private *getIterator() {
		const queue = [this.rootIds];
		while (queue.length) {
			for (const id of queue.pop()!) {
				const node = this.getNodeById(id)!;
				yield node;
				queue.push(node.children);
			}
		}
	}
}
