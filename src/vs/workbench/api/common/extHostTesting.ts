/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { deepFreeze } from 'vs/base/common/objects';
import { isDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTestingResource, ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ExtHostTestItemEventType, getPrivateApiFor } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestItemImpl } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { OwnedTestCollection, SingleUseTestCollection, TestPosition } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, ISerializedTestResults, ITestItem, RunTestForProviderRequest, TestDiffOpType, TestIdWithSrc, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import type * as vscode from 'vscode';


export class ExtHostTesting implements ExtHostTestingShape {
	private readonly resultsChangedEmitter = new Emitter<void>();
	private readonly controllers = new TestControllers();
	private readonly proxy: MainThreadTestingShape;
	private readonly ownedTests = new OwnedTestCollection();
	private readonly runTracker: TestRunCoordinator;
	private readonly subscriptions: TestSubscriptions;
	private readonly mainThreadSubscriptions = new Map<string, IDisposable>();

	private workspaceObservers: WorkspaceFolderTestObserverFactory;
	private textDocumentObservers: TextDocumentTestObserverFactory;

	public onResultsChanged = this.resultsChangedEmitter.event;
	public results: ReadonlyArray<vscode.TestRunResult> = [];

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
		@IInstantiationService instantionService: IInstantiationService,
		@IExtHostDocumentsAndEditors documents: IExtHostDocumentsAndEditors,
	) {
		this.proxy = rpc.getProxy(MainContext.MainThreadTesting);

		this.subscriptions = instantionService.createInstance(TestSubscriptions, this.ownedTests, this.controllers);
		this.runTracker = new TestRunCoordinator(this.proxy);
		this.workspaceObservers = new WorkspaceFolderTestObserverFactory(this.proxy);
		this.textDocumentObservers = new TextDocumentTestObserverFactory(this.proxy, documents);
	}

	/**
	 * Implements vscode.test.registerTestProvider
	 */
	public registerTestController<T>(extensionId: string, controller: vscode.TestController<T>): vscode.Disposable {
		const controllerId = generateUuid();
		const registration = this.controllers.register(controllerId, controller);
		this.proxy.$registerTestController(controllerId);

		return toDisposable(() => {
			registration.dispose();
			this.proxy.$unregisterTestController(controllerId);
		});
	}

	/**
	 * Implements vscode.test.createTextDocumentTestObserver
	 */
	public createTextDocumentTestObserver(document: vscode.TextDocument) {
		return this.textDocumentObservers.checkout(document.uri);
	}

	/**
	 * Implements vscode.test.createWorkspaceTestObserver
	 */
	public createWorkspaceTestObserver(workspaceFolder: vscode.WorkspaceFolder) {
		return this.workspaceObservers.checkout(workspaceFolder.uri);
	}

	/**
	 * Implements vscode.test.runTests
	 */
	public async runTests(req: vscode.TestRunRequest<unknown>, token = CancellationToken.None) {
		const testListToProviders = (tests: ReadonlyArray<vscode.TestItem<unknown>>) =>
			tests
				.map(this.getInternalTestForReference, this)
				.filter(isDefined)
				.map(t => ({ src: t.src, testId: t.item.extId }));

		await this.proxy.$runTests({
			exclude: req.exclude ? testListToProviders(req.exclude).map(t => t.testId) : undefined,
			tests: testListToProviders(req.tests),
			debug: req.debug
		}, token);
	}

	/**
	 * Implements vscode.test.createTestRun
	 */
	public createTestRun<T>(request: vscode.TestRunRequest<T>, name: string | undefined, persist = true): vscode.TestRun<T> {
		return this.runTracker.createTestRun(request, name, persist);
	}

	/**
	 * Updates test results shown to extensions.
	 * @override
	 */
	public $publishTestResults(results: ISerializedTestResults[]): void {
		this.results = Object.freeze(
			results
				.map(r => deepFreeze(Convert.TestResults.to(r)))
				.concat(this.results)
				.sort((a, b) => b.completedAt - a.completedAt)
				.slice(0, 32),
		);

		this.resultsChangedEmitter.fire();
	}

	/**
	 * Handles a request to read tests for a file, or workspace.
	 * @override
	 */
	public async $subscribeToTests(resource: ExtHostTestingResource, uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);
		const { disposable, info } = await this.subscriptions.subscribeToTests(resource, uri);
		this.mainThreadSubscriptions.set(getTestSubscriptionKey(resource, uri), disposable);

		if (info) {
			this.proxy.$publishDiff(resource, uri, info.collection.reviveDiff());
			info.collection.onDidGenerateDiff(diff => this.proxy.$publishDiff(resource, uri, diff));

			// note: we don't increment the count initially -- this is done by the
			// main thread, incrementing once per extension host. We just push the
			// diff to signal that roots have been discovered.
			info.initialSubscribeP.then(() => info.collection.pushDiff([TestDiffOpType.IncrementPendingExtHosts, -1]));
		}
	}

	/**
	 * Expands the nodes in the test tree. If levels is less than zero, it will
	 * be treated as infinite.
	 * @override
	 */
	public async $expandTest(test: TestIdWithSrc, levels: number) {
		const collection = this.subscriptions.getCollectionById(test.src.tree);
		if (collection) {
			await collection.expand(test.testId, levels < 0 ? Infinity : levels);
			collection.flushDiff();
		}
	}

	/**
	 * Disposes of a previous subscription to tests.
	 * @override
	 */
	public $unsubscribeFromTests(resource: ExtHostTestingResource, uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		this.mainThreadSubscriptions.get(subscriptionKey)?.dispose();
		this.mainThreadSubscriptions.delete(subscriptionKey);
	}

	/**
	 * Receives a test update from the main thread. Called (eventually) whenever
	 * tests change.
	 * @override
	 */
	public $acceptDiff(resource: ExtHostTestingResource, uri: UriComponents, diff: TestsDiff): void {
		if (resource === ExtHostTestingResource.TextDocument) {
			this.textDocumentObservers.acceptDiff(URI.revive(uri), diff);
		} else {
			this.workspaceObservers.acceptDiff(URI.revive(uri), diff);
		}
	}

	/**
	 * Runs tests with the given set of IDs. Allows for test from multiple
	 * providers to be run.
	 * @override
	 */
	public async $runTestsForProvider(req: RunTestForProviderRequest, token: CancellationToken): Promise<void> {
		const controller = this.controllers.get(req.tests[0].src.controller);
		if (!controller) {
			return;
		}

		const includeTests = req.tests
			.map(({ testId, src }) => this.ownedTests.getTestById(testId, src?.tree))
			.filter(isDefined)
			.map(([_tree, test]) => test);

		const excludeTests = req.excludeExtIds
			.map(id => this.ownedTests.getTestById(id))
			.filter(isDefined)
			.filter(([tree, exclude]) =>
				includeTests.some(include => tree.comparePositions(include, exclude) === TestPosition.IsChild),
			);

		if (!includeTests.length) {
			return;
		}

		const publicReq: vscode.TestRunRequest<unknown> = {
			tests: includeTests.map(t => TestItemFilteredWrapper.unwrap(t.actual)),
			exclude: excludeTests.map(([, t]) => TestItemFilteredWrapper.unwrap(t.actual)),
			debug: req.debug,
		};

		const tracker = this.runTracker.prepareForMainThreadTestRun(publicReq, TestRunDto.fromInternal(req), token);

		try {
			await controller.runTests(publicReq, token);
		} finally {
			if (tracker.isRunning && !token.isCancellationRequested) {
				await Event.toPromise(tracker.onEnd);
			}

			this.runTracker.cancelRunById(req.runId);
		}
	}

	/**
	 * Cancels an ongoing test run.
	 */
	public $cancelExtensionTestRun(runId: string | undefined) {
		if (runId === undefined) {
			this.runTracker.cancelAllRuns();
		} else {
			this.runTracker.cancelRunById(runId);
		}
	}

	public $lookupTest(req: TestIdWithSrc): Promise<InternalTestItem | undefined> {
		const owned = this.ownedTests.getTestById(req.testId);
		if (!owned) {
			return Promise.resolve(undefined);
		}

		const { actual, discoverCts, expandLevels, ...item } = owned[1];
		return Promise.resolve(item);
	}

	/**
	 * Gets the internal test item associated with the reference from the extension.
	 */
	private getInternalTestForReference(test: vscode.TestItem<unknown>) {
		// Find workspace items first, then owned tests, then document tests.
		// If a test instance exists in both the workspace and document, prefer
		// the workspace because it's less ephemeral.
		return this.workspaceObservers.getMirroredTestDataByReference(test)
			?? this.subscriptions.getCollectionTestByReference(test)
			?? this.textDocumentObservers.getMirroredTestDataByReference(test);
	}
}

class TestRunTracker<T> extends Disposable {
	private readonly task = new Set<TestRunImpl<T>>();
	private readonly sharedTestIds = new Set<string>();
	private readonly cts: CancellationTokenSource;
	private readonly endEmitter = this._register(new Emitter<void>());
	private disposed = false;

	/**
	 * Fires when a test ends, and no more tests are left running.
	 */
	public readonly onEnd = this.endEmitter.event;

	/**
	 * Gets whether there are any tests running.
	 */
	public get isRunning() {
		return this.task.size > 0;
	}

	/**
	 * Gets the run ID.
	 */
	public get id() {
		return this.dto.id;
	}

	constructor(private readonly dto: TestRunDto, private readonly proxy: MainThreadTestingShape, parentToken?: CancellationToken) {
		super();
		this.cts = this._register(new CancellationTokenSource(parentToken));
		this._register(this.cts.token.onCancellationRequested(() => {
			for (const task of this.task) {
				task.end();
			}
		}));
	}

	public createRun(name: string | undefined) {
		const run = new TestRunImpl(name, this.cts.token, this.dto, this.sharedTestIds, this.proxy, () => {
			this.task.delete(run);
			if (!this.isRunning) {
				this.dispose();
			}
		});

		this.task.add(run);
		return run;
	}

	public override dispose() {
		if (!this.disposed) {
			this.disposed = true;
			this.endEmitter.fire();
			this.cts.cancel();
			super.dispose();
		}
	}
}

/**
 * Queues runs for a single extension and provides the currently-executing
 * run so that `createTestRun` can be properly correlated.
 */
export class TestRunCoordinator {
	private tracked = new Map<vscode.TestRunRequest<unknown>, TestRunTracker<unknown>>();

	public get trackers() {
		return this.tracked.values();
	}

	constructor(private readonly proxy: MainThreadTestingShape) { }

	/**
	 * Registers a request as being invoked by the main thread, so
	 * `$startedExtensionTestRun` is not invoked. The run must eventually
	 * be cancelled manually.
	 */
	public prepareForMainThreadTestRun(req: vscode.TestRunRequest<unknown>, dto: TestRunDto, token: CancellationToken) {
		return this.getTracker(req, dto, token);
	}

	/**
	 * Cancels an existing test run via its cancellation token.
	 */
	public cancelRunById(runId: string) {
		for (const tracker of this.tracked.values()) {
			if (tracker.id === runId) {
				tracker.dispose();
				return;
			}
		}
	}

	/**
	 * Cancels an existing test run via its cancellation token.
	 */
	public cancelAllRuns() {
		for (const tracker of this.tracked.values()) {
			tracker.dispose();
		}
	}


	/**
	 * Implements the public `createTestRun` API.
	 */
	public createTestRun<T>(request: vscode.TestRunRequest<T>, name: string | undefined, persist: boolean): vscode.TestRun<T> {
		const existing = this.tracked.get(request);
		if (existing) {
			return existing.createRun(name);
		}

		// If there is not an existing tracked extension for the request, start
		// a new, detached session.
		const dto = TestRunDto.fromPublic(request);
		this.proxy.$startedExtensionTestRun({
			debug: request.debug,
			exclude: request.exclude?.map(t => t.id) ?? [],
			id: dto.id,
			tests: request.tests.map(t => t.id),
			persist
		});

		const tracker = this.getTracker(request, dto);
		tracker.onEnd(() => this.proxy.$finishedExtensionTestRun(dto.id));
		return tracker.createRun(name);
	}

	private getTracker(req: vscode.TestRunRequest<unknown>, dto: TestRunDto, token?: CancellationToken) {
		const tracker = new TestRunTracker(dto, this.proxy, token);
		this.tracked.set(req, tracker);
		tracker.onEnd(() => this.tracked.delete(req));
		return tracker;
	}
}

export class TestRunDto {
	public static fromPublic(request: vscode.TestRunRequest<unknown>) {
		return new TestRunDto(
			generateUuid(),
			new Set(request.tests.map(t => t.id)),
			new Set(request.exclude?.map(t => t.id) ?? Iterable.empty()),
		);
	}

	public static fromInternal(request: RunTestForProviderRequest) {
		return new TestRunDto(
			request.runId,
			new Set(request.tests.map(t => t.testId)),
			new Set(request.excludeExtIds),
		);
	}

	constructor(
		public readonly id: string,
		private readonly include: ReadonlySet<string>,
		private readonly exclude: ReadonlySet<string>,
	) { }

	public isIncluded(test: vscode.TestItem<unknown>) {
		for (let t: vscode.TestItem<unknown> | undefined = test; t; t = t.parent) {
			if (this.include.has(t.id)) {
				return true;
			} else if (this.exclude.has(t.id)) {
				return false;
			}
		}

		return true;
	}
}

class TestRunImpl<T> implements vscode.TestRun<T> {
	readonly #proxy: MainThreadTestingShape;
	readonly #req: TestRunDto;
	readonly #sharedIds: Set<string>;
	readonly #onEnd: () => void;
	#ended = false;
	public readonly taskId = generateUuid();

	constructor(
		public readonly name: string | undefined,
		public readonly token: CancellationToken,
		dto: TestRunDto,
		sharedTestIds: Set<string>,
		proxy: MainThreadTestingShape,
		onEnd: () => void,
	) {
		this.#onEnd = onEnd;
		this.#proxy = proxy;
		this.#req = dto;
		this.#sharedIds = sharedTestIds;
		proxy.$startedTestRunTask(dto.id, { id: this.taskId, name, running: true });
	}

	setState(test: vscode.TestItem<T>, state: vscode.TestResultState, duration?: number): void {
		if (!this.#ended && this.#req.isIncluded(test)) {
			this.ensureTestIsKnown(test);
			this.#proxy.$updateTestStateInRun(this.#req.id, this.taskId, test.id, state, duration);
		}
	}

	appendMessage(test: vscode.TestItem<T>, message: vscode.TestMessage): void {
		if (!this.#ended && this.#req.isIncluded(test)) {
			this.ensureTestIsKnown(test);
			this.#proxy.$appendTestMessageInRun(this.#req.id, this.taskId, test.id, Convert.TestMessage.from(message));
		}
	}

	appendOutput(output: string): void {
		if (!this.#ended) {
			this.#proxy.$appendOutputToRun(this.#req.id, this.taskId, VSBuffer.fromString(output));
		}
	}

	end(): void {
		if (!this.#ended) {
			this.#ended = true;
			this.#proxy.$finishedTestRunTask(this.#req.id, this.taskId);
			this.#onEnd();
		}
	}

	private ensureTestIsKnown(test: vscode.TestItem<T>) {
		const sent = this.#sharedIds;
		if (sent.has(test.id)) {
			return;
		}

		const chain: ITestItem[] = [];
		while (true) {
			chain.unshift(Convert.TestItem.from(test));

			if (sent.has(test.id)) {
				break;
			}

			sent.add(test.id);
			if (!test.parent) {
				break;
			}

			test = test.parent;
		}

		this.#proxy.$addTestsToRun(this.#req.id, chain);
	}
}

/*
 * A class which wraps a vscode.TestItem that provides the ability to filter a TestItem's children
 * to only the children that are located in a certain vscode.Uri.
 */
export class TestItemFilteredWrapper extends TestItemImpl {
	private static wrapperMap = new WeakMap<vscode.TextDocument, WeakMap<vscode.TestItem<unknown>, TestItemFilteredWrapper>>();

	public static removeFilter(document: vscode.TextDocument): void {
		this.wrapperMap.delete(document);
	}

	// Wraps the TestItem specified in a TestItemFilteredWrapper and pulls from a cache if it already exists.
	public static getWrapperForTestItem(
		item: vscode.TestItem<unknown>,
		filterDocument: vscode.TextDocument,
		parent?: TestItemFilteredWrapper,
	): TestItemFilteredWrapper {
		let innerMap = this.wrapperMap.get(filterDocument);
		if (innerMap?.has(item)) {
			return innerMap.get(item) as TestItemFilteredWrapper;
		}

		if (!innerMap) {
			innerMap = new WeakMap();
			this.wrapperMap.set(filterDocument, innerMap);
		}

		const w = new TestItemFilteredWrapper(item, filterDocument, parent);
		innerMap.set(item, w);
		return w;
	}

	/**
	 * If the TestItem is wrapped, returns the unwrapped item provided
	 * by the extension.
	 */
	public static unwrap<T>(item: vscode.TestItem<T> | TestItemFilteredWrapper) {
		return item instanceof TestItemFilteredWrapper ? item.actual as vscode.TestItem<T> : item;
	}

	private _cachedMatchesFilter: boolean | undefined;
	private disposed?: boolean;
	private readonly disposable = new DisposableStore();

	/**
	 * Gets whether this node, or any of its children, match the document filter.
	 */
	public get hasNodeMatchingFilter(): boolean {
		if (this._cachedMatchesFilter === undefined) {
			return this.refreshMatch();
		} else {
			return this._cachedMatchesFilter;
		}
	}

	private constructor(
		public readonly actual: vscode.TestItem<unknown>,
		private filterDocument: vscode.TextDocument,
		public readonly wrappedParent?: TestItemFilteredWrapper,
	) {
		super(actual.id, actual.label, actual.uri, undefined);
		if (!(actual instanceof TestItemImpl)) {
			throw new Error(`TestItems provided to the VS Code API must extend \`vscode.TestItem\`, but ${actual.id} did not`);
		}

		// the resolveHandler is intentionally omitted here. When creating the test
		// root, we ask the collection to expand infinitely. We must not duplicate
		// call the resolveHandler again from the wrapper..
		this.debuggable = actual.debuggable;
		this.runnable = actual.runnable;
		this.description = actual.description;
		this.error = actual.error;
		this.status = actual.status;
		this.range = actual.range;

		const wrapperApi = getPrivateApiFor(this);
		const actualApi = getPrivateApiFor(actual);
		this.disposable.add(actualApi.bus.event(evt => {
			switch (evt[0]) {
				case ExtHostTestItemEventType.SetProp:
					(this as Record<string, unknown>)[evt[1]] = evt[2];
					break;
				case ExtHostTestItemEventType.NewChild:
					const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(evt[1], this.filterDocument, this);
					getPrivateApiFor(wrapper).parent = actual;
					wrapper.refreshMatch();
					break;
				case ExtHostTestItemEventType.Disposed:
					this.dispose();
					break;
				default:
					wrapperApi.bus.fire(evt);
			}
		}));
	}

	/**
	 * Refreshes the `hasNodeMatchingFilter` state for this item. It matches
	 * if the test itself has a location that matches, or if any of its
	 * children do.
	 */
	public refreshMatch() {
		if (this.disposed) {
			return false;
		}

		const didMatch = this._cachedMatchesFilter;

		// The `children` of the wrapper only include the children who match the
		// filter. Synchronize them.
		for (const rawChild of this.actual.children.values()) {
			const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(rawChild, this.filterDocument, this);
			if (!wrapper.hasNodeMatchingFilter) {
				wrapper.hide();
			} else if (!this.children.has(wrapper.id)) {
				this.addChild(wrapper);
			}
		}

		const nowMatches = this.children.size > 0 || this.actual.uri?.toString() === this.filterDocument.uri.toString();
		this._cachedMatchesFilter = nowMatches;

		if (nowMatches !== didMatch && this.wrappedParent?._cachedMatchesFilter !== undefined) {
			this.wrappedParent.refreshMatch();
		}

		return this._cachedMatchesFilter;
	}

	public hide() {
		if (this.wrappedParent) {
			getPrivateApiFor(this.wrappedParent).children.delete(this.id);
		}

		getPrivateApiFor(this).bus.fire([ExtHostTestItemEventType.Disposed]);
	}

	public override dispose() {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.disposable.dispose();
		this.hide();
		this.wrappedParent?.refreshMatch();

		for (const child of this.children.values()) {
			child.dispose();
		}
	}
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
	revived: vscode.TestItem<never>;
	depth: number;
}

class MirroredChangeCollector extends IncrementalChangeCollector<MirroredCollectionTestItem> {
	private readonly added = new Set<MirroredCollectionTestItem>();
	private readonly updated = new Set<MirroredCollectionTestItem>();
	private readonly removed = new Set<MirroredCollectionTestItem>();

	private readonly alreadyRemoved = new Set<string>();

	public get isEmpty() {
		return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
	}

	constructor(private readonly emitter: Emitter<vscode.TestsChangeEvent>) {
		super();
	}

	/**
	 * @override
	 */
	public override add(node: MirroredCollectionTestItem): void {
		this.added.add(node);
	}

	/**
	 * @override
	 */
	public override update(node: MirroredCollectionTestItem): void {
		Object.assign(node.revived, Convert.TestItem.toPlain(node.item));
		if (!this.added.has(node)) {
			this.updated.add(node);
		}
	}

	/**
	 * @override
	 */
	public override remove(node: MirroredCollectionTestItem): void {
		if (this.added.has(node)) {
			this.added.delete(node);
			return;
		}

		this.updated.delete(node);

		if (node.parent && this.alreadyRemoved.has(node.parent)) {
			this.alreadyRemoved.add(node.item.extId);
			return;
		}

		this.removed.add(node);
	}

	/**
	 * @override
	 */
	public getChangeEvent(): vscode.TestsChangeEvent {
		const { added, updated, removed } = this;
		return {
			get added() { return [...added].map(n => n.revived); },
			get updated() { return [...updated].map(n => n.revived); },
			get removed() { return [...removed].map(n => n.revived); },
		};
	}

	public override complete() {
		if (!this.isEmpty) {
			this.emitter.fire(this.getChangeEvent());
		}
	}
}

/**
 * Maintains tests in this extension host sent from the main thread.
 * @private
 */
export class MirroredTestCollection extends AbstractIncrementalTestCollection<MirroredCollectionTestItem> {
	private changeEmitter = new Emitter<vscode.TestsChangeEvent>();

	/**
	 * Change emitter that fires with the same sematics as `TestObserver.onDidChangeTests`.
	 */
	public readonly onDidChangeTests = this.changeEmitter.event;

	/**
	 * Gets a list of root test items.
	 */
	public get rootTestItems() {
		return this.getAllAsTestItem([...this.roots]);
	}

	/**
	 * Translates the item IDs to TestItems for exposure to extensions.
	 */
	public getAllAsTestItem(itemIds: Iterable<string>) {
		let output: vscode.TestItem<never>[] = [];
		for (const itemId of itemIds) {
			const item = this.items.get(itemId);
			if (item) {
				output.push(item.revived);
			}
		}

		return output;
	}

	/**
	 *
	 * If the test ID exists, returns its underlying ID.
	 */
	public getMirroredTestDataById(itemId: string) {
		return this.items.get(itemId);
	}

	/**
	 * If the test item is a mirrored test item, returns its underlying ID.
	 */
	public getMirroredTestDataByReference(item: vscode.TestItem<unknown>) {
		return this.items.get(item.id);
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, parent?: MirroredCollectionTestItem): MirroredCollectionTestItem {
		return {
			...item,
			// todo@connor4312: make this work well again with children
			revived: Convert.TestItem.toPlain(item.item) as vscode.TestItem<never>,
			depth: parent ? parent.depth + 1 : 0,
			children: new Set(),
		};
	}

	/**
	 * @override
	 */
	protected override createChangeCollector() {
		return new MirroredChangeCollector(this.changeEmitter);
	}
}


interface IObserverData {
	observers: number;
	tests: MirroredTestCollection;
	listener: IDisposable;
	pendingDeletion?: IDisposable;
}

abstract class AbstractTestObserverFactory {
	private readonly resources = new Map<string /* uri */, IObserverData>();

	public checkout(resourceUri: URI): vscode.TestObserver {
		const resourceKey = resourceUri.toString();
		const resource = this.resources.get(resourceKey) ?? this.createObserverData(resourceUri);

		resource.pendingDeletion?.dispose();
		resource.observers++;

		return {
			onDidChangeTest: resource.tests.onDidChangeTests,
			onDidDiscoverInitialTests: new Emitter<void>().event, // todo@connor4312
			get tests() {
				return resource.tests.rootTestItems;
			},
			dispose: once(() => {
				if (!--resource.observers) {
					resource.pendingDeletion = this.eventuallyDispose(resourceUri);
				}
			}),
		};
	}

	/**
	 * Gets the internal test data by its reference, in any observer.
	 */
	public getMirroredTestDataByReference(ref: vscode.TestItem<unknown>) {
		for (const { tests } of this.resources.values()) {
			const v = tests.getMirroredTestDataByReference(ref);
			if (v) {
				return v;
			}
		}

		return undefined;
	}

	/**
	 * Called when no observers are listening for the resource any more. Should
	 * defer unlistening on the resource, and return a disposiable
	 * to halt the process in case new listeners come in.
	 */
	protected eventuallyDispose(resourceUri: URI) {
		return disposableTimeout(() => this.unlisten(resourceUri), 10 * 1000);
	}

	/**
	 * Starts listening to test information for the given resource.
	 */
	protected abstract listen(resourceUri: URI, onDiff: (diff: TestsDiff) => void): IDisposable;

	private createObserverData(resourceUri: URI): IObserverData {
		const tests = new MirroredTestCollection();
		const listener = this.listen(resourceUri, diff => tests.apply(diff));
		const data: IObserverData = { observers: 0, tests, listener };
		this.resources.set(resourceUri.toString(), data);
		return data;
	}

	/**
	 * Called when a resource is no longer in use.
	 */
	protected unlisten(resourceUri: URI) {
		const key = resourceUri.toString();
		const resource = this.resources.get(key);
		if (resource) {
			resource.observers = -1;
			resource.pendingDeletion?.dispose();
			resource.listener.dispose();
			this.resources.delete(key);
		}
	}
}

class WorkspaceFolderTestObserverFactory extends AbstractTestObserverFactory {
	private diffListeners = new Map<string, (diff: TestsDiff) => void>();

	constructor(private readonly proxy: MainThreadTestingShape) {
		super();
	}

	/**
	 * Publishees the diff for the workspace folder with the given uri.
	 */
	public acceptDiff(resourceUri: URI, diff: TestsDiff) {
		this.diffListeners.get(resourceUri.toString())?.(diff);
	}

	/**
	 * @override
	 */
	public listen(resourceUri: URI, onDiff: (diff: TestsDiff) => void) {
		this.proxy.$subscribeToDiffs(ExtHostTestingResource.Workspace, resourceUri);

		const uriString = resourceUri.toString();
		this.diffListeners.set(uriString, onDiff);

		return toDisposable(() => {
			this.proxy.$unsubscribeFromDiffs(ExtHostTestingResource.Workspace, resourceUri);
			this.diffListeners.delete(uriString);
		});
	}
}

class TextDocumentTestObserverFactory extends AbstractTestObserverFactory {
	private diffListeners = new Map<string, (diff: TestsDiff) => void>();

	constructor(private readonly proxy: MainThreadTestingShape, private documents: IExtHostDocumentsAndEditors) {
		super();
	}

	/**
	 * Publishees the diff for the document with the given uri.
	 */
	public acceptDiff(resourceUri: URI, diff: TestsDiff) {
		this.diffListeners.get(resourceUri.toString())?.(diff);
	}

	/**
	 * @override
	 */
	public listen(resourceUri: URI, onDiff: (diff: TestsDiff) => void) {
		const document = this.documents.getDocument(resourceUri);
		if (!document) {
			return toDisposable(() => undefined);
		}

		const uriString = resourceUri.toString();
		this.diffListeners.set(uriString, onDiff);

		this.proxy.$subscribeToDiffs(ExtHostTestingResource.TextDocument, resourceUri);
		return toDisposable(() => {
			this.proxy.$unsubscribeFromDiffs(ExtHostTestingResource.TextDocument, resourceUri);
			this.diffListeners.delete(uriString);
		});
	}
}

const getTestSubscriptionKey = (resource: ExtHostTestingResource, uri: URI) => `${resource}:${uri.toString()}`;

type SubscribeFunction = (controllerId: string, controller: vscode.TestController<unknown>) => void;

class TestControllers extends Disposable {
	private readonly registeredEmitter = this._register(new Emitter<{ controllerId: string, controller: vscode.TestController<unknown> }>());
	private readonly unregisteredEmitter = this._register(new Emitter<{ controllerId: string, controller: vscode.TestController<unknown> }>());
	private readonly value = new Map<string, vscode.TestController<unknown>>();

	public readonly onRegistered = this.registeredEmitter.event;

	public register(controllerId: string, controller: vscode.TestController<unknown>): IDisposable {
		this.value.set(controllerId, controller);
		this.registeredEmitter.fire({ controller, controllerId });
		return toDisposable(() => {
			this.value.delete(controllerId);
			this.unregisteredEmitter.fire({ controller, controllerId });
		});
	}

	public get(controllerId: string) {
		return this.value.get(controllerId);
	}

	[Symbol.iterator]() {
		return this.value[Symbol.iterator]();
	}
}

class TestSubscriptions extends Disposable {
	private readonly subs = new Map<string, {
		collection: SingleUseTestCollection;
		store: IDisposable;
		listeners: number;
		initialSubscribeP: Promise<void>,
		subscribeFn: SubscribeFunction;
	}>();

	constructor(
		private readonly ownedTests: OwnedTestCollection,
		private readonly controllers: TestControllers,
		@IExtHostDocumentsAndEditors private readonly documents: IExtHostDocumentsAndEditors,
		@IExtHostWorkspace private readonly workspace: IExtHostWorkspace,
	) {
		super();

		this._register(controllers.onRegistered(({ controller, controllerId }) => {
			const subs = [...this.subs.values()];
			// give the ext a moment to register things rather than synchronously invoking within activate()
			setTimeout(() => {
				for (const { subscribeFn } of subs) {
					subscribeFn(controllerId, controller);
				}
			}, 0);
		}));
	}


	/**
	 * Gets the test collection for a controller by ID, if one exists.
	 */
	public getCollectionById(treeId: number) {
		return mapFind(this.subs.values(), s => s.collection.treeId === treeId ? s.collection : undefined);
	}

	/**
	 * Gets an internal test from the collection by reference, if it exists.
	 */
	public getCollectionTestByReference(test: vscode.TestItem<unknown>) {
		return mapFind(this.subs.values(), c => c.collection.getTestByReference(test));
	}

	private async createDefaultDocumentTestRoot(folder: vscode.WorkspaceFolder | undefined, document: vscode.TextDocument, controllerId: string, token: CancellationToken) {
		if (!folder) {
			return;
		}

		const { disposable, info } = await this.subscribeToTests(ExtHostTestingResource.Workspace, folder.uri);
		if (!info) {
			return;
		}

		const root = Iterable.find(info.collection.roots, r => r.src.controller === controllerId);
		if (!root) {
			return;
		}

		const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(root.actual, document);
		info.collection.expand(root.actual.id, Infinity);
		wrapper.refreshMatch();

		token.onCancellationRequested(() => {
			TestItemFilteredWrapper.removeFilter(document);
			wrapper.dispose();
			disposable.dispose();
		});

		return wrapper;
	}

	public async subscribeToTests(resource: ExtHostTestingResource, uri: URI) {
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		const existing = this.subs.get(subscriptionKey);
		if (existing) {
			existing.listeners++;
			return { disposable: this.getUnsubscriber(subscriptionKey), info: existing };
		}

		const cancellation = new CancellationTokenSource();
		let method: undefined | ((p: vscode.TestController<unknown>, controllerId: string) => vscode.ProviderResult<vscode.TestItem<unknown>>);
		if (resource === ExtHostTestingResource.TextDocument) {
			let document = this.documents.getDocument(uri);

			// we can ask to subscribe to tests before the documents are populated in
			// the extension host. Try to wait.
			if (!document) {
				const store = new DisposableStore();
				document = await new Promise<ExtHostDocumentData | undefined>(resolve => {
					store.add(disposableTimeout(() => resolve(undefined), 5000));
					store.add(this.documents.onDidAddDocuments(e => {
						const data = e.find(data => data.document.uri.toString() === uri.toString());
						if (data) { resolve(data); }
					}));
				}).finally(() => store.dispose());
			}

			if (document) {
				const folder = await this.workspace.getWorkspaceFolder2(uri, false);
				method = (p, id) => p.createDocumentTestRoot
					? p.createDocumentTestRoot(document!.document, cancellation.token)
					: this.createDefaultDocumentTestRoot(folder, document!.document, id, cancellation.token);
			}
		} else {
			const folder = await this.workspace.getWorkspaceFolder2(uri, false);
			if (folder) {
				method = p => p.createWorkspaceTestRoot(folder, cancellation.token);
			}
		}

		if (!method) {
			return { disposable: toDisposable(() => { }), info: undefined };
		}

		const subscribeFn = async (id: string, provider: vscode.TestController<unknown>) => {
			try {
				const root = await method!(provider, id);
				if (root) {
					collection.addRoot(root, id);
				}
			} catch (e) {
				console.error(e);
			}
		};

		const disposable = new DisposableStore();
		const collection = disposable.add(this.ownedTests.createForHierarchy());
		disposable.add(toDisposable(() => cancellation.dispose(true)));
		const subscribes: Promise<void>[] = [];
		for (const [id, controller] of this.controllers) {
			subscribes.push(subscribeFn(id, controller));
		}

		const initialSubscribeP = Promise.all(subscribes).then(() => undefined);
		const info = { store: disposable, listeners: 1, initialSubscribeP, collection, subscribeFn };
		this.subs.set(subscriptionKey, info);
		return { disposable: this.getUnsubscriber(subscriptionKey), info };
	}

	private getUnsubscriber(key: string) {
		return toDisposable(() => {
			const sub = this.subs.get(key);
			if (sub && --sub.listeners === 0) {
				sub.store.dispose();
				this.subs.delete(key);
			}
		});
	}
}
