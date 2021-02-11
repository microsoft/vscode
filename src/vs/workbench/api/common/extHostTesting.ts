/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtHostTestingResource, ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { TestItem, TestState } from 'vs/workbench/api/common/extHostTypeConverters';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { OwnedTestCollection, SingleUseTestCollection } from 'vs/workbench/contrib/testing/common/ownedTestCollection';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, InternalTestItemWithChildren, InternalTestResults, RunTestForProviderRequest, TestDiffOpType, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
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

	public onLastResultsChanged = this.resultsChangedEmitter.event;
	public lastResults?: vscode.TestResults;

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
	public async runTests(req: vscode.TestRunOptions<vscode.TestItem>, token = CancellationToken.None) {
		await this.proxy.$runTests({
			tests: req.tests
				// Find workspace items first, then owned tests, then document tests.
				// If a test instance exists in both the workspace and document, prefer
				// the workspace because it's less ephemeral.
				.map(this.getInternalTestForReference, this)
				.filter(isDefined)
				.map(item => ({ providerId: item.providerId, testId: item.id })),
			debug: req.debug
		}, token);
	}


	/**
	 * Updates test results shown to extensions.
	 * @override
	 */
	public $publishTestResults(results: InternalTestResults): void {
		const convert = (item: InternalTestItemWithChildren): vscode.RequiredTestItem =>
			({ ...TestItem.toShallow(item.item), children: item.children.map(convert) });

		this.lastResults = { tests: results.tests.map(convert) };
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

		let method: undefined | ((p: vscode.TestProvider) => vscode.TestHierarchy<vscode.TestItem> | undefined);
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
				method = p => p.createDocumentTestHierarchy
					? p.createDocumentTestHierarchy(document!.document)
					: this.createDefaultDocumentTestHierarchy(p, document!.document, folder);
			}
		} else {
			const folder = await this.workspace.getWorkspaceFolder2(uri, false);
			if (folder) {
				method = p => p.createWorkspaceTestHierarchy?.(folder);
			}
		}

		if (!method) {
			return;
		}

		const subscribeFn = (id: string, provider: vscode.TestProvider) => {
			try {
				const hierarchy = method!(provider);
				if (!hierarchy) {
					return;
				}

				collection.pushDiff([TestDiffOpType.DeltaDiscoverComplete, 1]);
				disposable.add(hierarchy);
				collection.addRoot(hierarchy.root, id);
				Promise.resolve(hierarchy.discoveredInitialTests).then(() => collection.pushDiff([TestDiffOpType.DeltaDiscoverComplete, -1]));
				hierarchy.onDidChangeTest(e => collection.onItemChange(e, id));
				hierarchy.onDidInvalidateTest?.(e => {
					const internal = collection.getTestByReference(e);
					if (!internal) {
						console.warn(`Received a TestProvider.onDidInvalidateTest for a test that does not currently exist.`);
					} else {
						this.proxy.$retireTest(internal.item.extId);
					}
				});
			} catch (e) {
				console.error(e);
			}
		};

		const disposable = new DisposableStore();
		const collection = disposable.add(this.ownedTests.createForHierarchy(diff => this.proxy.$publishDiff(resource, uriComponents, diff)));
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
		const provider = this.providers.get(req.providerId);
		if (!provider || !provider.runTests) {
			return;
		}

		const tests = req.ids.map(id => this.ownedTests.getTestById(id)?.actual)
			.filter(isDefined)
			// Only send the actual TestItem's to the user to run.
			.map(t => t instanceof TestItemFilteredWrapper ? t.actual : t);
		if (!tests.length) {
			return;
		}

		try {
			await provider.runTests({
				setState: (test, state) => {
					const internal = this.getInternalTestForReference(test);
					if (internal) {
						this.flushCollectionDiffs();
						this.proxy.$updateTestStateInRun(req.runId, internal.id, TestState.from(state));
					}
				}, tests, debug: req.debug
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

	public $lookupTest(req: TestIdWithProvider): Promise<InternalTestItem | undefined> {
		const owned = this.ownedTests.getTestById(req.testId);
		if (!owned) {
			return Promise.resolve(undefined);
		}

		const { actual, previousChildren, previousEquals, ...item } = owned;
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

	private createDefaultDocumentTestHierarchy(provider: vscode.TestProvider, document: vscode.TextDocument, folder: vscode.WorkspaceFolder | undefined): vscode.TestHierarchy<vscode.TestItem> | undefined {
		if (!folder) {
			return;
		}

		const workspaceHierarchy = provider.createWorkspaceTestHierarchy?.(folder);
		if (!workspaceHierarchy) {
			return;
		}

		const onDidChangeTest = new Emitter<vscode.TestItem>();
		workspaceHierarchy.onDidChangeTest(node => {
			const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(node, document);
			const previouslySeen = wrapper.hasNodeMatchingFilter;

			if (previouslySeen) {
				// reset cache and get whether you can currently see the TestItem.
				wrapper.reset();
				const currentlySeen = wrapper.hasNodeMatchingFilter;

				if (currentlySeen) {
					onDidChangeTest.fire(wrapper);
					return;
				}

				// Fire the event to say that the current visible parent has changed.
				onDidChangeTest.fire(wrapper.visibleParent);
				return;
			}

			const previousParent = wrapper.visibleParent;
			wrapper.reset();
			const currentlySeen = wrapper.hasNodeMatchingFilter;

			// It wasn't previously seen and isn't currently seen so
			// nothing has actually changed.
			if (!currentlySeen) {
				return;
			}

			// The test is now visible so we need to refresh the cache
			// of the previous visible parent and fire that it has changed.
			previousParent.reset();
			onDidChangeTest.fire(previousParent);
		});

		return {
			root: TestItemFilteredWrapper.getWrapperForTestItem(workspaceHierarchy.root, document),
			dispose: () => {
				onDidChangeTest.dispose();
				TestItemFilteredWrapper.removeFilter(document);
			},
			onDidChangeTest: onDidChangeTest.event
		};
	}
}

/*
 * A class which wraps a vscode.TestItem that provides the ability to filter a TestItem's children
 * to only the children that are located in a certain vscode.Uri.
 */
export class TestItemFilteredWrapper implements vscode.TestItem {
	private static wrapperMap = new WeakMap<vscode.TextDocument, WeakMap<vscode.TestItem, TestItemFilteredWrapper>>();
	public static removeFilter(document: vscode.TextDocument): void {
		this.wrapperMap.delete(document);
	}

	// Wraps the TestItem specified in a TestItemFilteredWrapper and pulls from a cache if it already exists.
	public static getWrapperForTestItem(item: vscode.TestItem, filterDocument: vscode.TextDocument, parent?: TestItemFilteredWrapper): TestItemFilteredWrapper {
		let innerMap = this.wrapperMap.get(filterDocument);
		if (innerMap?.has(item)) {
			return innerMap.get(item)!;
		}

		if (!innerMap) {
			innerMap = new WeakMap<vscode.TestItem, TestItemFilteredWrapper>();
			this.wrapperMap.set(filterDocument, innerMap);

		}

		const w = new TestItemFilteredWrapper(item, filterDocument, parent);
		innerMap.set(item, w);
		return w;
	}

	public get label() {
		return this.actual.label;
	}

	public get debuggable() {
		return this.actual.debuggable;
	}

	public get description() {
		return this.actual.description;
	}

	public get location() {
		return this.actual.location;
	}

	public get runnable() {
		return this.actual.runnable;
	}

	public get children() {
		// We only want children that match the filter.
		return this.getWrappedChildren().filter(child => child.hasNodeMatchingFilter);
	}

	public get visibleParent(): TestItemFilteredWrapper {
		return this.hasNodeMatchingFilter ? this : this.parent!.visibleParent;
	}

	private matchesFilter: boolean | undefined;

	// Determines if the TestItem matches the filter. This would be true if:
	// 1. We don't have a parent (because the root is the workspace root node)
	// 2. The URI of the current node matches the filter URI
	// 3. Some child of the current node matches the filter URI
	public get hasNodeMatchingFilter(): boolean {
		if (this.matchesFilter === undefined) {
			this.matchesFilter = !this.parent
				|| this.actual.location?.uri.toString() === this.filterDocument.uri.toString()
				|| this.getWrappedChildren().some(child => child.hasNodeMatchingFilter);
		}

		return this.matchesFilter;
	}

	// Reset the cache of whether or not you can see a node from a particular node
	// up to it's visible parent.
	public reset(): void {
		if (this !== this.visibleParent) {
			this.parent?.reset();
		}
		this.matchesFilter = undefined;
	}


	private constructor(public readonly actual: vscode.TestItem, private filterDocument: vscode.TextDocument, private readonly parent?: TestItemFilteredWrapper) {
		this.getWrappedChildren();
	}

	private getWrappedChildren() {
		return this.actual.children?.map(t => TestItemFilteredWrapper.getWrapperForTestItem(t, this.filterDocument, this)) || [];
	}
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
	revived: vscode.TestItem;
	depth: number;
	wrapped?: vscode.RequiredTestItem;
}

class MirroredChangeCollector extends IncrementalChangeCollector<MirroredCollectionTestItem> {
	private readonly added = new Set<MirroredCollectionTestItem>();
	private readonly updated = new Set<MirroredCollectionTestItem>();
	private readonly removed = new Set<MirroredCollectionTestItem>();

	private readonly alreadyRemoved = new Set<string>();

	public get isEmpty() {
		return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
	}

	constructor(private readonly collection: MirroredTestCollection, private readonly emitter: Emitter<vscode.TestChangeEvent>) {
		super();
	}

	/**
	 * @override
	 */
	public add(node: MirroredCollectionTestItem): void {
		this.added.add(node);
	}

	/**
	 * @override
	 */
	public update(node: MirroredCollectionTestItem): void {
		Object.assign(node.revived, TestItem.toShallow(node.item));
		if (!this.added.has(node)) {
			this.updated.add(node);
		}
	}

	/**
	 * @override
	 */
	public remove(node: MirroredCollectionTestItem): void {
		if (this.added.has(node)) {
			this.added.delete(node);
			return;
		}

		this.updated.delete(node);

		if (node.parent && this.alreadyRemoved.has(node.parent)) {
			this.alreadyRemoved.add(node.id);
			return;
		}

		this.removed.add(node);
	}

	/**
	 * @override
	 */
	public getChangeEvent(): vscode.TestChangeEvent {
		const { collection, added, updated, removed } = this;
		return {
			get added() { return [...added].map(collection.getPublicTestItem, collection); },
			get updated() { return [...updated].map(collection.getPublicTestItem, collection); },
			get removed() { return [...removed].map(collection.getPublicTestItem, collection); },
			get commonChangeAncestor() {
				let ancestorPath: MirroredCollectionTestItem[] | undefined;
				const buildAncestorPath = (node: MirroredCollectionTestItem | undefined) => {
					if (!node) {
						return undefined;
					}

					// add the node and all its parents to the list of ancestors. If
					// the node is detached, do not return a path (its parent will
					// also have been passed to remove() and be present)
					const path: MirroredCollectionTestItem[] = new Array(node.depth + 1);
					for (let i = node.depth; i >= 0; i--) {
						if (!node) {
							return undefined; // detached child
						}

						path[node.depth] = node;
						node = node.parent ? collection.getMirroredTestDataById(node.parent) : undefined;
					}

					return path;
				};

				const addAncestorPath = (node: MirroredCollectionTestItem) => {
					// fast path: if the common ancestor is already the root, no more work to do
					if (ancestorPath && ancestorPath.length === 0) {
						return;
					}

					const thisPath = buildAncestorPath(node);
					if (!thisPath) {
						return;
					}

					if (!ancestorPath) {
						ancestorPath = thisPath;
						return;
					}

					// removes node from the path to the ancestor that don't match
					// the corresponding node in *this* path.
					for (let i = ancestorPath.length - 1; i >= 0; i--) {
						if (ancestorPath[i] !== thisPath[i]) {
							ancestorPath.pop();
						}
					}
				};

				const addParentAncestor = (node: MirroredCollectionTestItem) => {
					if (ancestorPath && ancestorPath.length === 0) {
						// no-op
					} else if (node.parent === null) {
						ancestorPath = [];
					} else {
						const parent = collection.getMirroredTestDataById(node.parent);
						if (parent) {
							addAncestorPath(parent);
						}
					}
				};

				for (const node of added) { addParentAncestor(node); }
				for (const node of updated) { addAncestorPath(node); }
				for (const node of removed) { addParentAncestor(node); }

				const ancestor = ancestorPath && ancestorPath[ancestorPath.length - 1];
				return ancestor ? collection.getPublicTestItem(ancestor) : null;
			},
		};
	}

	public complete() {
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
	private changeEmitter = new Emitter<vscode.TestChangeEvent>();

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
	public getAllAsTestItem(itemIds: Iterable<string>): vscode.RequiredTestItem[] {
		let output: vscode.RequiredTestItem[] = [];
		for (const itemId of itemIds) {
			const item = this.items.get(itemId);
			if (item) {
				output.push(this.getPublicTestItem(item));
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
		const id = getMirroredItemId(item);
		return id ? this.items.get(id) : undefined;
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, parent?: MirroredCollectionTestItem): MirroredCollectionTestItem {
		return { ...item, revived: TestItem.toShallow(item.item), depth: parent ? parent.depth + 1 : 0, children: new Set() };
	}

	/**
	 * @override
	 */
	protected createChangeCollector() {
		return new MirroredChangeCollector(this, this.changeEmitter);
	}

	/**
	 * Gets the public test item instance for the given mirrored record.
	 */
	public getPublicTestItem(item: MirroredCollectionTestItem): vscode.RequiredTestItem {
		if (!item.wrapped) {
			item.wrapped = new TestItemFromMirror(item, this);
		}

		return item.wrapped;
	}
}

const getMirroredItemId = (item: vscode.TestItem) => {
	return (item as any)[MirroredItemId] as string | undefined;
};

const MirroredItemId = Symbol('MirroredItemId');

class TestItemFromMirror implements vscode.RequiredTestItem {
	readonly #internal: MirroredCollectionTestItem;
	readonly #collection: MirroredTestCollection;

	public get id() { return this.#internal.revived.id!; }
	public get label() { return this.#internal.revived.label; }
	public get description() { return this.#internal.revived.description; }
	public get location() { return this.#internal.revived.location; }
	public get runnable() { return this.#internal.revived.runnable ?? true; }
	public get debuggable() { return this.#internal.revived.debuggable ?? false; }
	public get children() {
		return this.#collection.getAllAsTestItem(this.#internal.children);
	}

	get [MirroredItemId]() { return this.#internal.id; }

	constructor(internal: MirroredCollectionTestItem, collection: MirroredTestCollection) {
		this.#internal = internal;
		this.#collection = collection;
	}

	public toJSON() {
		const serialized: vscode.RequiredTestItem & TestIdWithProvider = {
			id: this.id,
			label: this.label,
			description: this.description,
			location: this.location,
			runnable: this.runnable,
			debuggable: this.debuggable,
			children: this.children.map(c => (c as TestItemFromMirror).toJSON()),

			providerId: this.#internal.providerId,
			testId: this.#internal.id,
		};

		return serialized;
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
