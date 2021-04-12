/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { deepFreeze } from 'vs/base/common/objects';
import { isDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtHostTestingResource, ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { Disposable, TestItem as TestItemImpl, TestItemHookProperty } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { OwnedTestCollection, SingleUseTestCollection, TestPosition } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, ISerializedTestResults, RunTestForProviderRequest, TestDiffOpType, TestIdWithSrc, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import type * as vscode from 'vscode';

const getTestSubscriptionKey = (resource: ExtHostTestingResource, uri: URI) => `${resource}:${uri.toString()}`;

export class ExtHostTesting implements ExtHostTestingShape {
	private readonly resultsChangedEmitter = new Emitter<void>();
	private readonly providers = new Map<string, vscode.TestProvider>();
	private readonly proxy: MainThreadTestingShape;
	private readonly ownedTests = new OwnedTestCollection();
	private readonly testSubscriptions = new Map<string, {
		collection: SingleUseTestCollection;
		store: IDisposable;
		subscribeFn: (id: string, provider: vscode.TestProvider) => void;
	}>();

	private workspaceObservers: WorkspaceFolderTestObserverFactory;
	private textDocumentObservers: TextDocumentTestObserverFactory;

	public onResultsChanged = this.resultsChangedEmitter.event;
	public results: ReadonlyArray<vscode.TestRunResult> = [];

	constructor(@IExtHostRpcService rpc: IExtHostRpcService, @IExtHostDocumentsAndEditors private readonly documents: IExtHostDocumentsAndEditors, @IExtHostWorkspace private readonly workspace: IExtHostWorkspace) {
		this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
		this.workspaceObservers = new WorkspaceFolderTestObserverFactory(this.proxy);
		this.textDocumentObservers = new TextDocumentTestObserverFactory(this.proxy, documents);
	}

	/**
	 * Implements vscode.test.registerTestProvider
	 */
	public registerTestProvider<T extends vscode.TestItem>(provider: vscode.TestProvider<T>): vscode.Disposable {
		const providerId = generateUuid();
		this.providers.set(providerId, provider);
		this.proxy.$registerTestProvider(providerId);

		// give the ext a moment to register things rather than synchronously invoking within activate()
		const toSubscribe = [...this.testSubscriptions.keys()];
		setTimeout(() => {
			for (const subscription of toSubscribe) {
				this.testSubscriptions.get(subscription)?.subscribeFn(providerId, provider);
			}
		}, 0);

		return new Disposable(() => {
			this.providers.delete(providerId);
			this.proxy.$unregisterTestProvider(providerId);
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
	public async runTests(req: vscode.TestRunRequest<vscode.TestItem>, token = CancellationToken.None) {
		const testListToProviders = (tests: ReadonlyArray<vscode.TestItem>) =>
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
	 * Implements vscode.test.publishTestResults
	 */
	public publishExtensionProvidedResults(results: vscode.TestRunResult, persist: boolean): void {
		this.proxy.$publishExtensionProvidedResults(Convert.TestResults.from(generateUuid(), results), persist);
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
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		if (this.testSubscriptions.has(subscriptionKey)) {
			return;
		}

		const cancellation = new CancellationTokenSource();
		let method: undefined | ((p: vscode.TestProvider) => vscode.ProviderResult<vscode.TestItem>);
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
				method = p => p.provideDocumentTestRoot
					? p.provideDocumentTestRoot(document!.document, cancellation.token)
					: createDefaultDocumentTestRoot(p, document!.document, folder, cancellation.token);
			}
		} else {
			const folder = await this.workspace.getWorkspaceFolder2(uri, false);
			if (folder) {
				method = p => p.provideWorkspaceTestRoot(folder, cancellation.token);
			}
		}

		if (!method) {
			return;
		}

		const subscribeFn = async (id: string, provider: vscode.TestProvider) => {
			try {
				const root = await method!(provider);
				if (root) {
					collection.addRoot(root, id);
				}
			} catch (e) {
				console.error(e);
			}
		};

		const disposable = new DisposableStore();
		const collection = disposable.add(this.ownedTests.createForHierarchy(
			diff => this.proxy.$publishDiff(resource, uriComponents, diff)));
		disposable.add(toDisposable(() => cancellation.dispose(true)));
		for (const [id, provider] of this.providers) {
			subscribeFn(id, provider);
		}

		// note: we don't increment the root count initially -- this is done by the
		// main thread, incrementing once per extension host. We just push the
		// diff to signal that roots have been discovered.
		collection.pushDiff([TestDiffOpType.DeltaRootsComplete, -1]);
		this.testSubscriptions.set(subscriptionKey, { store: disposable, collection, subscribeFn });
	}

	/**
	 * Expands the nodes in the test tree. If levels is less than zero, it will
	 * be treated as infinite.
	 * @override
	 */
	public async $expandTest(test: TestIdWithSrc, levels: number) {
		const sub = mapFind(this.testSubscriptions.values(), s => s.collection.treeId === test.src.tree ? s : undefined);
		await sub?.collection.expand(test.testId, levels < 0 ? Infinity : levels);
		this.flushCollectionDiffs();
	}

	/**
	 * Disposes of a previous subscription to tests.
	 * @override
	 */
	public $unsubscribeFromTests(resource: ExtHostTestingResource, uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		this.testSubscriptions.get(subscriptionKey)?.store.dispose();
		this.testSubscriptions.delete(subscriptionKey);
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
	public async $runTestsForProvider(req: RunTestForProviderRequest, cancellation: CancellationToken): Promise<void> {
		const provider = this.providers.get(req.tests[0].src.provider);
		if (!provider) {
			return;
		}

		const includeTests = req.tests
			.map(({ testId, src }) => this.ownedTests.getTestById(testId, src.tree))
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

		const isExcluded = (test: vscode.TestItem) => {
			// for test providers that don't support excluding natively,
			// make sure not to report excluded result otherwise summaries will be off.
			for (const [tree, exclude] of excludeTests) {
				const e = tree.comparePositions(exclude, test.id);
				if (e === TestPosition.IsChild || e === TestPosition.IsSame) {
					return true;
				}
			}

			return false;
		};

		try {
			await provider.runTests({
				appendOutput: message => {
					this.proxy.$appendOutputToRun(req.runId, VSBuffer.fromString(message));
				},
				appendMessage: (test, message) => {
					if (!isExcluded(test)) {
						this.flushCollectionDiffs();
						this.proxy.$appendTestMessageInRun(req.runId, test.id, Convert.TestMessage.from(message));
					}
				},
				setState: (test, state, duration) => {
					if (!isExcluded(test)) {
						this.flushCollectionDiffs();
						this.proxy.$updateTestStateInRun(req.runId, test.id, state, duration);
					}
				},
				tests: includeTests.map(t => TestItemFilteredWrapper.unwrap(t.actual)),
				exclude: excludeTests.map(([, t]) => TestItemFilteredWrapper.unwrap(t.actual)),
				debug: req.debug,
			}, cancellation);

			for (const { collection } of this.testSubscriptions.values()) {
				collection.flushDiff(); // ensure all states are updated
			}

			return;
		} catch (e) {
			console.error(e); // so it appears to attached debuggers
			throw e;
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
	 * Flushes diff information for all collections to ensure state in the
	 * main thread is updated.
	 */
	private flushCollectionDiffs() {
		for (const { collection } of this.testSubscriptions.values()) {
			collection.flushDiff();
		}
	}

	/**
	 * Gets the internal test item associated with the reference from the extension.
	 */
	private getInternalTestForReference(test: vscode.TestItem) {
		// Find workspace items first, then owned tests, then document tests.
		// If a test instance exists in both the workspace and document, prefer
		// the workspace because it's less ephemeral.
		return this.workspaceObservers.getMirroredTestDataByReference(test)
			?? mapFind(this.testSubscriptions.values(), c => c.collection.getTestByReference(test))
			?? this.textDocumentObservers.getMirroredTestDataByReference(test);
	}
}

export const createDefaultDocumentTestRoot = async <T extends vscode.TestItem>(
	provider: vscode.TestProvider<T>,
	document: vscode.TextDocument,
	folder: vscode.WorkspaceFolder | undefined,
	token: CancellationToken,
) => {
	if (!folder) {
		return;
	}

	const root = await provider.provideWorkspaceTestRoot(folder, token);
	if (!root) {
		return;
	}

	token.onCancellationRequested(() => {
		TestItemFilteredWrapper.removeFilter(document);
	});

	return TestItemFilteredWrapper.getWrapperForTestItem(root, document);
};

/*
 * A class which wraps a vscode.TestItem that provides the ability to filter a TestItem's children
 * to only the children that are located in a certain vscode.Uri.
 */
export class TestItemFilteredWrapper<T extends vscode.TestItem = vscode.TestItem> extends TestItemImpl {
	private static wrapperMap = new WeakMap<vscode.TextDocument, WeakMap<vscode.TestItem, TestItemFilteredWrapper>>();
	public static removeFilter(document: vscode.TextDocument): void {
		this.wrapperMap.delete(document);
	}

	// Wraps the TestItem specified in a TestItemFilteredWrapper and pulls from a cache if it already exists.
	public static getWrapperForTestItem<T extends vscode.TestItem>(
		item: T,
		filterDocument: vscode.TextDocument,
		parent?: TestItemFilteredWrapper<T>,
	): TestItemFilteredWrapper<T> {
		let innerMap = this.wrapperMap.get(filterDocument);
		if (innerMap?.has(item)) {
			return innerMap.get(item) as TestItemFilteredWrapper<T>;
		}

		if (!innerMap) {
			innerMap = new WeakMap<vscode.TestItem, TestItemFilteredWrapper>();
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
	public static unwrap(item: vscode.TestItem) {
		return item instanceof TestItemFilteredWrapper ? item.actual : item;
	}

	private _cachedMatchesFilter: boolean | undefined;

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
		public readonly actual: T,
		private filterDocument: vscode.TextDocument,
		public readonly parent?: TestItemFilteredWrapper<T>,
	) {
		super(actual.id, actual.label, actual.uri, actual.expandable);
		if (!(actual instanceof TestItemImpl)) {
			throw new Error(`TestItems provided to the VS Code API must extend \`vscode.TestItem\`, but ${actual.id} did not`);
		}

		(actual as TestItemImpl)[TestItemHookProperty] = {
			setProp: (key, value) => (this as Record<string, unknown>)[key] = value,
			created: child => TestItemFilteredWrapper.getWrapperForTestItem(child, this.filterDocument, this).refreshMatch(),
			invalidate: () => this.invalidate(),
			delete: child => this.children.delete(child),
		};
	}

	/**
	 * Refreshes the `hasNodeMatchingFilter` state for this item. It matches
	 * if the test itself has a location that matches, or if any of its
	 * children do.
	 */
	private refreshMatch() {
		const didMatch = this._cachedMatchesFilter;

		// The `children` of the wrapper only include the children who match the
		// filter. Synchronize them.
		for (const rawChild of this.actual.children) {
			const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(rawChild, this.filterDocument, this);
			if (wrapper.hasNodeMatchingFilter) {
				this.children.add(wrapper);
			} else {
				this.children.delete(wrapper);
			}
		}

		const nowMatches = this.children.size > 0 || this.actual.uri.toString() === this.filterDocument.uri.toString();
		this._cachedMatchesFilter = nowMatches;

		if (nowMatches !== didMatch) {
			this.parent?.refreshMatch();
		}

		return this._cachedMatchesFilter;
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
	public get rootTestItems() {
		return this.getAllAsTestItem([...this.roots]);
	}

	/**
	 * Translates the item IDs to TestItems for exposure to extensions.
	 */
	public getAllAsTestItem(itemIds: Iterable<string>) {
		let output: vscode.TestItem[] = [];
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
	public getMirroredTestDataByReference(ref: vscode.TestItem) {
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
	protected abstract listen(resourceUri: URI, onDiff: (diff: TestsDiff) => void): Disposable;

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

		return new Disposable(() => {
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
			return new Disposable(() => undefined);
		}

		const uriString = resourceUri.toString();
		this.diffListeners.set(uriString, onDiff);

		this.proxy.$subscribeToDiffs(ExtHostTestingResource.TextDocument, resourceUri);
		return new Disposable(() => {
			this.proxy.$unsubscribeFromDiffs(ExtHostTestingResource.TextDocument, resourceUri);
			this.diffListeners.delete(uriString);
		});
	}
}
