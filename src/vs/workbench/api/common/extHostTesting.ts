/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshalling';
import { deepFreeze } from 'vs/base/common/objects';
import { isDefined } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestItemImpl } from 'vs/workbench/api/common/extHostTypes';
import { SingleUseTestCollection, TestPosition } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { AbstractIncrementalTestCollection, CoverageDetails, IFileCoverage, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, ISerializedTestResults, ITestIdWithSrc, ITestItem, RunTestForControllerRequest, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import type * as vscode from 'vscode';

export class ExtHostTesting implements ExtHostTestingShape {
	private readonly resultsChangedEmitter = new Emitter<void>();
	private readonly controllers = new Map</* controller ID */ string, {
		controller: vscode.TestController,
		collection: SingleUseTestCollection,
	}>();
	private readonly proxy: MainThreadTestingShape;
	private readonly runTracker: TestRunCoordinator;
	private readonly observer: TestObservers;

	public onResultsChanged = this.resultsChangedEmitter.event;
	public results: ReadonlyArray<vscode.TestRunResult> = [];

	constructor(@IExtHostRpcService rpc: IExtHostRpcService, commands: ExtHostCommands) {
		this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
		this.observer = new TestObservers(this.proxy);
		this.runTracker = new TestRunCoordinator(this.proxy);

		commands.registerArgumentProcessor({
			processArgument: arg =>
				arg?.$mid === MarshalledId.TestItemContext ? Convert.TestItem.toItemFromContext(arg) : arg,
		});
	}

	/**
	 * Implements vscode.test.registerTestProvider
	 */
	public createTestController(controllerId: string): vscode.TestController {
		const disposable = new DisposableStore();
		const collection = disposable.add(new SingleUseTestCollection(controllerId));
		const initialExpand = disposable.add(new RunOnceScheduler(() => collection.expand(collection.root.id, 0), 0));

		const controller: vscode.TestController = {
			root: collection.root,
			get id() {
				return controllerId;
			},
			createTestRun: (request, name, persist = true) => {
				return this.runTracker.createTestRun(controllerId, request, name, persist);
			},
			createTestItem(id: string, label: string, parent: vscode.TestItem, uri: vscode.Uri, data?: unknown) {
				if (!(parent instanceof TestItemImpl)) {
					throw new Error(`The "parent" passed in for TestItem ${id} is invalid`);
				}

				return new TestItemImpl(id, label, uri, data, parent);
			},
			set resolveChildrenHandler(fn) {
				collection.resolveHandler = fn;
				if (fn) {
					initialExpand.schedule();
				}
			},
			get resolveChildrenHandler() {
				return collection.resolveHandler;
			},
			dispose: () => {
				disposable.dispose();
			},
		};

		this.proxy.$registerTestController(controllerId);
		disposable.add(toDisposable(() => this.proxy.$unregisterTestController(controllerId)));

		this.controllers.set(controllerId, { controller, collection });
		disposable.add(toDisposable(() => this.controllers.delete(controllerId)));

		disposable.add(collection.onDidGenerateDiff(diff => this.proxy.$publishDiff(controllerId, diff)));

		return controller;
	}

	/**
	 * Implements vscode.test.createTestObserver
	 */
	public createTestObserver() {
		return this.observer.checkout();
	}


	/**
	 * Implements vscode.test.runTests
	 */
	public async runTests(req: vscode.TestRunRequest, token = CancellationToken.None) {
		const testListToProviders = (tests: ReadonlyArray<vscode.TestItem>) =>
			tests
				.map(this.getInternalTestForReference, this)
				.filter(isDefined)
				.map(t => ({ controllerId: t.controllerId, testId: t.item.extId }));

		await this.proxy.$runTests({
			exclude: req.exclude ? testListToProviders(req.exclude).map(t => t.testId) : undefined,
			tests: testListToProviders(req.tests),
			debug: req.debug
		}, token);
	}

	/**
	 * @inheritdoc
	 */
	$provideFileCoverage(runId: string, taskId: string, token: CancellationToken): Promise<IFileCoverage[]> {
		return Iterable.find(this.runTracker.trackers, t => t.id === runId)?.getCoverage(taskId)?.provideFileCoverage(token) ?? Promise.resolve([]);
	}

	/**
	 * @inheritdoc
	 */
	$resolveFileCoverage(runId: string, taskId: string, fileIndex: number, token: CancellationToken): Promise<CoverageDetails[]> {
		return Iterable.find(this.runTracker.trackers, t => t.id === runId)?.getCoverage(taskId)?.resolveFileCoverage(fileIndex, token) ?? Promise.resolve([]);
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
	 * Expands the nodes in the test tree. If levels is less than zero, it will
	 * be treated as infinite.
	 */
	public async $expandTest({ controllerId, testId }: ITestIdWithSrc, levels: number) {
		const collection = this.controllers.get(controllerId)?.collection;
		if (collection) {
			await collection.expand(testId, levels < 0 ? Infinity : levels);
			collection.flushDiff();
		}
	}

	/**
	 * Receives a test update from the main thread. Called (eventually) whenever
	 * tests change.
	 */
	public $acceptDiff(diff: TestsDiff): void {
		this.observer.applyDiff(diff);
	}

	/**
	 * Runs tests with the given set of IDs. Allows for test from multiple
	 * providers to be run.
	 * @override
	 */
	public async $runControllerTests(req: RunTestForControllerRequest, token: CancellationToken): Promise<void> {
		const lookup = this.controllers.get(req.controllerId);
		if (!lookup) {
			return;
		}

		const { controller, collection } = lookup;
		const includeTests = req.testIds
			.map((testId) => collection.tree.get(testId))
			.filter(isDefined);

		const excludeTests = req.excludeExtIds
			.map(id => lookup.collection.tree.get(id))
			.filter(isDefined)
			.filter(exclude => includeTests.some(
				include => collection.tree.comparePositions(include, exclude) === TestPosition.IsChild,
			));

		if (!includeTests.length) {
			return;
		}

		const publicReq: vscode.TestRunRequest = {
			tests: includeTests.map(t => t.actual),
			exclude: excludeTests.map(t => t.actual),
			debug: req.debug,
		};

		const tracker = this.runTracker.prepareForMainThreadTestRun(publicReq, TestRunDto.fromInternal(req), token);

		try {
			await controller.runHandler?.(publicReq, token);
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

	/**
	 * Gets the internal test item associated with the reference from the extension.
	 */
	private getInternalTestForReference(test: vscode.TestItem) {
		return mapFind(this.controllers.values(), ({ collection }) => collection.getTestByReference(test))
			?? this.observer.getMirroredTestDataByReference(test);
	}
}

class TestRunTracker extends Disposable {
	private readonly tasks = new Map</* task ID */string, { run: TestRunImpl, coverage: TestRunCoverageBearer }>();
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
		return this.tasks.size > 0;
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
			for (const { run } of this.tasks.values()) {
				run.end();
			}
		}));
	}

	public getCoverage(taskId: string) {
		return this.tasks.get(taskId)?.coverage;
	}

	public createRun(name: string | undefined) {
		const taskId = generateUuid();
		const coverage = new TestRunCoverageBearer(this.proxy, this.dto.id, taskId);
		const run = new TestRunImpl(name, this.cts.token, taskId, coverage, this.dto, this.sharedTestIds, this.proxy, () => {
			this.tasks.delete(run.taskId);
			if (!this.isRunning) {
				this.dispose();
			}
		});

		this.tasks.set(run.taskId, { run, coverage });
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
	private tracked = new Map<vscode.TestRunRequest, TestRunTracker>();

	public get trackers() {
		return this.tracked.values();
	}

	constructor(private readonly proxy: MainThreadTestingShape) { }

	/**
	 * Registers a request as being invoked by the main thread, so
	 * `$startedExtensionTestRun` is not invoked. The run must eventually
	 * be cancelled manually.
	 */
	public prepareForMainThreadTestRun(req: vscode.TestRunRequest, dto: TestRunDto, token: CancellationToken) {
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
	public createTestRun(controllerId: string, request: vscode.TestRunRequest, name: string | undefined, persist: boolean): vscode.TestRun {
		const existing = this.tracked.get(request);
		if (existing) {
			return existing.createRun(name);
		}

		// If there is not an existing tracked extension for the request, start
		// a new, detached session.
		const dto = TestRunDto.fromPublic(controllerId, request);
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

	private getTracker(req: vscode.TestRunRequest, dto: TestRunDto, token?: CancellationToken) {
		const tracker = new TestRunTracker(dto, this.proxy, token);
		this.tracked.set(req, tracker);
		tracker.onEnd(() => this.tracked.delete(req));
		return tracker;
	}
}

export class TestRunDto {
	public static fromPublic(controllerId: string, request: vscode.TestRunRequest) {
		return new TestRunDto(
			controllerId,
			generateUuid(),
			new Set(request.tests.map(t => t.id)),
			new Set(request.exclude?.map(t => t.id) ?? Iterable.empty()),
		);
	}

	public static fromInternal(request: RunTestForControllerRequest) {
		return new TestRunDto(
			request.controllerId,
			request.runId,
			new Set(request.testIds),
			new Set(request.excludeExtIds),
		);
	}

	constructor(
		public readonly controllerId: string,
		public readonly id: string,
		private readonly include: ReadonlySet<string>,
		private readonly exclude: ReadonlySet<string>,
	) { }

	public isIncluded(test: vscode.TestItem) {
		for (let t: vscode.TestItem | undefined = test; t; t = t.parent) {
			if (this.include.has(t.id)) {
				return true;
			} else if (this.exclude.has(t.id)) {
				return false;
			}
		}

		return false;
	}
}

class TestRunCoverageBearer {
	private _coverageProvider?: vscode.TestCoverageProvider;
	private fileCoverage?: Promise<vscode.FileCoverage[] | null | undefined>;

	public set coverageProvider(provider: vscode.TestCoverageProvider | undefined) {
		if (this._coverageProvider) {
			throw new Error('The TestCoverageProvider cannot be replaced after being provided');
		}

		if (!provider) {
			return;
		}

		this._coverageProvider = provider;
		this.proxy.$signalCoverageAvailable(this.runId, this.taskId);
	}

	public get coverageProvider() {
		return this._coverageProvider;
	}

	constructor(
		private readonly proxy: MainThreadTestingShape,
		private readonly runId: string,
		private readonly taskId: string,
	) {
	}

	public async provideFileCoverage(token: CancellationToken): Promise<IFileCoverage[]> {
		if (!this._coverageProvider) {
			return [];
		}

		if (!this.fileCoverage) {
			this.fileCoverage = (async () => this._coverageProvider!.provideFileCoverage(token))();
		}

		try {
			const coverage = await this.fileCoverage;
			return coverage?.map(Convert.TestCoverage.fromFile) ?? [];
		} catch (e) {
			this.fileCoverage = undefined;
			throw e;
		}
	}

	public async resolveFileCoverage(index: number, token: CancellationToken): Promise<CoverageDetails[]> {
		const fileCoverage = await this.fileCoverage;
		let file = fileCoverage?.[index];
		if (!this._coverageProvider || !fileCoverage || !file) {
			return [];
		}

		if (!file.detailedCoverage) {
			file = fileCoverage[index] = await this._coverageProvider.resolveFileCoverage?.(file, token) ?? file;
		}

		return file.detailedCoverage?.map(Convert.TestCoverage.fromDetailed) ?? [];
	}
}

class TestRunImpl implements vscode.TestRun {
	readonly #proxy: MainThreadTestingShape;
	readonly #req: TestRunDto;
	readonly #sharedIds: Set<string>;
	readonly #onEnd: () => void;
	readonly #coverage: TestRunCoverageBearer;
	#ended = false;

	public set coverageProvider(provider: vscode.TestCoverageProvider | undefined) {
		this.#coverage.coverageProvider = provider;
	}

	public get coverageProvider() {
		return this.#coverage.coverageProvider;
	}

	constructor(
		public readonly name: string | undefined,
		public readonly token: CancellationToken,
		public readonly taskId: string,
		coverage: TestRunCoverageBearer,
		dto: TestRunDto,
		sharedTestIds: Set<string>,
		proxy: MainThreadTestingShape,
		onEnd: () => void,
	) {
		this.#onEnd = onEnd;
		this.#proxy = proxy;
		this.#req = dto;
		this.#coverage = coverage;
		this.#sharedIds = sharedTestIds;
		proxy.$startedTestRunTask(dto.id, { id: this.taskId, name, running: true });
	}

	setState(test: vscode.TestItem, state: vscode.TestResultState, duration?: number): void {
		if (!this.#ended && this.#req.isIncluded(test)) {
			this.ensureTestIsKnown(test);
			this.#proxy.$updateTestStateInRun(this.#req.id, this.taskId, test.id, state, duration);
		}
	}

	appendMessage(test: vscode.TestItem, message: vscode.TestMessage): void {
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

	private ensureTestIsKnown(test: vscode.TestItem) {
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

		this.#proxy.$addTestsToRun(this.#req.controllerId, this.#req.id, chain);
	}
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
	revived: vscode.TestItem;
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
	public get rootTests() {
		return super.roots;
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
	public getMirroredTestDataByReference(item: vscode.TestItem) {
		return this.items.get(item.id);
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, parent?: MirroredCollectionTestItem): MirroredCollectionTestItem {
		return {
			...item,
			// todo@connor4312: make this work well again with children
			revived: Convert.TestItem.toPlain(item.item) as vscode.TestItem,
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

class TestObservers {
	private current?: {
		observers: number;
		tests: MirroredTestCollection;
	};

	constructor(private readonly proxy: MainThreadTestingShape) {
	}

	public checkout(): vscode.TestObserver {
		if (!this.current) {
			this.current = this.createObserverData();
		}

		const current = this.current;
		current.observers++;

		return {
			onDidChangeTest: current.tests.onDidChangeTests,
			get tests() { return [...current.tests.rootTests].map(t => t.revived); },
			dispose: once(() => {
				if (--current.observers === 0) {
					this.proxy.$unsubscribeFromDiffs();
					this.current = undefined;
				}
			}),
		};
	}

	/**
	 * Gets the internal test data by its reference.
	 */
	public getMirroredTestDataByReference(ref: vscode.TestItem) {
		return this.current?.tests.getMirroredTestDataByReference(ref);
	}

	/**
	 * Applies test diffs to the current set of observed tests.
	 */
	public applyDiff(diff: TestsDiff) {
		this.current?.tests.apply(diff);
	}

	private createObserverData() {
		const tests = new MirroredTestCollection();
		this.proxy.$subscribeToDiffs();
		return { observers: 0, tests, };
	}
}
