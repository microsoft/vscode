/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { throttle } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { once } from 'vs/base/common/functional';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtHostTestingResource, ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { TestItem } from 'vs/workbench/api/common/extHostTypeConverters';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { AbstractIncrementalTestCollection, EMPTY_TEST_RESULT, IncrementalTestCollectionItem, InternalTestItem, RunTestForProviderRequest, RunTestsResult, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import type * as vscode from 'vscode';

const getTestSubscriptionKey = (resource: ExtHostTestingResource, uri: URI) => `${resource}:${uri.toString()}`;

export class ExtHostTesting implements ExtHostTestingShape {
	private readonly providers = new Map<string, vscode.TestProvider>();
	private readonly proxy: MainThreadTestingShape;
	private readonly ownedTests = new OwnedTestCollection();
	private readonly testSubscriptions = new Map<string, { collection: SingleUseTestCollection, store: IDisposable }>();

	private workspaceObservers: WorkspaceFolderTestObserverFactory;
	private textDocumentObservers: TextDocumentTestObserverFactory;

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
	public async runTests(req: vscode.TestRunOptions<vscode.TestItem>) {
		await this.proxy.$runTests({
			tests: req.tests
				// Find workspace items first, then owned tests, then document tests.
				// If a test instance exists in both the workspace and document, prefer
				// the workspace because it's less ephemeral.
				.map(test => this.workspaceObservers.getMirroredTestDataByReference(test)
					?? mapFind(this.testSubscriptions.values(), c => c.collection.getTestByReference(test))
					?? this.textDocumentObservers.getMirroredTestDataByReference(test))
				.filter(isDefined)
				.map(item => ({ providerId: item.providerId, testId: item.id })),
			debug: req.debug
		});
	}

	/**
	 * Handles a request to read tests for a file, or workspace.
	 * @override
	 */
	public $subscribeToTests(resource: ExtHostTestingResource, uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);
		const subscriptionKey = getTestSubscriptionKey(resource, uri);
		if (this.testSubscriptions.has(subscriptionKey)) {
			return;
		}

		let method: undefined | ((p: vscode.TestProvider) => vscode.TestHierarchy<vscode.TestItem> | undefined);
		if (resource === ExtHostTestingResource.TextDocument) {
			const document = this.documents.getDocument(uri);
			if (document) {
				method = p => p.createDocumentTestHierarchy?.(document.document);
			}
		} else {
			const folder = this.workspace.getWorkspaceFolder(uri, false);
			if (folder) {
				method = p => p.createWorkspaceTestHierarchy?.(folder);
			}
		}

		if (!method) {
			return;
		}

		const disposable = new DisposableStore();
		const collection = disposable.add(this.ownedTests.createForHierarchy(diff => this.proxy.$publishDiff(resource, uriComponents, diff)));
		for (const [id, provider] of this.providers) {
			try {
				const hierarchy = method(provider);
				if (!hierarchy) {
					continue;
				}

				disposable.add(hierarchy);
				collection.addRoot(hierarchy.root, id);
				hierarchy.onDidChangeTest(e => collection.onItemChange(e, id));
			} catch (e) {
				console.error(e);
			}
		}

		this.testSubscriptions.set(subscriptionKey, { store: disposable, collection });
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
	public async $runTestsForProvider(req: RunTestForProviderRequest): Promise<RunTestsResult> {
		const provider = this.providers.get(req.providerId);
		if (!provider || !provider.runTests) {
			return EMPTY_TEST_RESULT;
		}

		const tests = req.ids.map(id => this.ownedTests.getTestById(id)?.actual).filter(isDefined);
		if (!tests.length) {
			return EMPTY_TEST_RESULT;
		}

		await provider.runTests({ tests, debug: req.debug }, CancellationToken.None);
		return EMPTY_TEST_RESULT;
	}
}

const keyMap: { [K in keyof Omit<Required<vscode.TestItem>, 'children'>]: null } = {
	label: null,
	location: null,
	state: null,
	debuggable: null,
	description: null,
	runnable: null
};

const simpleProps = Object.keys(keyMap) as ReadonlyArray<keyof typeof keyMap>;

const itemEqualityComparator = (a: vscode.TestItem) => {
	const values: unknown[] = [];
	for (const prop of simpleProps) {
		values.push(a[prop]);
	}

	return (b: vscode.TestItem) => {
		for (let i = 0; i < simpleProps.length; i++) {
			if (values[i] !== b[simpleProps[i]]) {
				return false;
			}
		}

		return true;
	};
};

/**
 * @private
 */
export interface OwnedCollectionTestItem extends InternalTestItem {
	actual: vscode.TestItem;
	previousChildren: Set<string>;
	previousEquals: (v: vscode.TestItem) => boolean;
}

export class OwnedTestCollection {
	protected readonly testIdToInternal = new Map<string, OwnedCollectionTestItem>();

	/**
	 * Gets test information by ID, if it was defined and still exists in this
	 * extension host.
	 */
	public getTestById(id: string) {
		return this.testIdToInternal.get(id);
	}

	/**
	 * Creates a new test collection for a specific hierarchy for a workspace
	 * or document observation.
	 */
	public createForHierarchy(publishDiff: (diff: TestsDiff) => void = () => undefined) {
		return new SingleUseTestCollection(this.testIdToInternal, publishDiff);
	}
}

/**
 * Maintains tests created and registered for a single set of hierarchies
 * for a workspace or document.
 * @private
 */
export class SingleUseTestCollection implements IDisposable {
	protected readonly testItemToInternal = new Map<vscode.TestItem, OwnedCollectionTestItem>();
	protected diff: TestsDiff = [];
	private disposed = false;

	constructor(private readonly testIdToInternal: Map<string, OwnedCollectionTestItem>, private readonly publishDiff: (diff: TestsDiff) => void) { }

	/**
	 * Adds a new root node to the collection.
	 */
	public addRoot(item: vscode.TestItem, providerId: string) {
		this.addItem(item, providerId, null);
		this.throttleSendDiff();
	}

	/**
	 * Gets test information by its reference, if it was defined and still exists
	 * in this extension host.
	 */
	public getTestByReference(item: vscode.TestItem) {
		return this.testItemToInternal.get(item);
	}

	/**
	 * Should be called when an item change is fired on the test provider.
	 */
	public onItemChange(item: vscode.TestItem, providerId: string) {
		const existing = this.testItemToInternal.get(item);
		if (!existing) {
			if (!this.disposed) {
				console.warn(`Received a TestProvider.onDidChangeTest for a test that wasn't seen before as a child.`);
			}
			return;
		}

		this.addItem(item, providerId, existing.parent);
		this.throttleSendDiff();
	}

	/**
	 * Gets a diff of all changes that have been made, and clears the diff queue.
	 */
	public collectDiff() {
		const diff = this.diff;
		this.diff = [];
		return diff;
	}

	public dispose() {
		for (const item of this.testItemToInternal.values()) {
			this.testIdToInternal.delete(item.id);
		}

		this.testIdToInternal.clear();
		this.diff = [];
		this.disposed = true;
	}

	protected getId(): string {
		return generateUuid();
	}

	private addItem(actual: vscode.TestItem, providerId: string, parent: string | null) {
		let internal = this.testItemToInternal.get(actual);
		if (!internal) {
			internal = {
				actual,
				id: this.getId(),
				parent,
				item: TestItem.from(actual),
				providerId,
				previousChildren: new Set(),
				previousEquals: itemEqualityComparator(actual),
			};

			this.testItemToInternal.set(actual, internal);
			this.testIdToInternal.set(internal.id, internal);
			this.diff.push([TestDiffOpType.Add, { id: internal.id, parent, providerId, item: internal.item }]);
		} else if (!internal.previousEquals(actual)) {
			internal.item = TestItem.from(actual);
			internal.previousEquals = itemEqualityComparator(actual);
			this.diff.push([TestDiffOpType.Update, { id: internal.id, parent, providerId, item: internal.item }]);
		}

		// If there are children, track which ones are deleted
		// and recursively and/update them.
		if (actual.children) {
			const deletedChildren = internal.previousChildren;
			const currentChildren = new Set<string>();
			for (const child of actual.children) {
				const c = this.addItem(child, providerId, internal.id);
				deletedChildren.delete(c.id);
				currentChildren.add(c.id);
			}

			for (const child of deletedChildren) {
				this.removeItembyId(child);
			}

			internal.previousChildren = currentChildren;
		}


		return internal;
	}

	private removeItembyId(id: string) {
		this.diff.push([TestDiffOpType.Remove, id]);

		const queue = [this.testIdToInternal.get(id)];
		while (queue.length) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			this.testIdToInternal.delete(item.id);
			this.testItemToInternal.delete(item.actual);
			for (const child of item.previousChildren) {
				queue.push(this.testIdToInternal.get(child));
			}
		}
	}

	@throttle(200)
	protected throttleSendDiff() {
		const diff = this.collectDiff();
		if (diff.length) {
			this.publishDiff(diff);
		}
	}
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
	revived: vscode.TestItem;
	wrapped?: vscode.TestItem;
}

/**
 * Maintains tests in this extension host sent from the main thread.
 * @private
 */
export class MirroredTestCollection extends AbstractIncrementalTestCollection<MirroredCollectionTestItem> {
	private changeEmitter = new Emitter<vscode.TestItem | null>();

	/**
	 * Change emitter that fires with the same sematics as `TestObserver.onDidChangeTests`.
	 */
	public readonly onDidChangeTests = this.changeEmitter.event;

	/**
	 * Mapping of mirrored test items to their underlying ID. Given here to avoid
	 * exposing them to extensions.
	 */
	protected readonly mirroredTestIds = new WeakMap<vscode.TestItem, string>();

	/**
	 * Gets a list of root test items.
	 */
	public get rootTestItems() {
		return this.getAllAsTestItem([...this.roots]);
	}

	/**
	 * Translates the item IDs to TestItems for exposure to extensions.
	 */
	public getAllAsTestItem(itemIds: ReadonlyArray<string>): vscode.TestItem[] {
		return itemIds.map(itemId => {
			const item = this.items.get(itemId);
			return item && this.createCollectionItemWrapper(item);
		}).filter(isDefined);
	}

	/**
	 * If the test item is a mirrored test item, returns its underlying ID.
	 */
	public getMirroredTestDataByReference(item: vscode.TestItem) {
		const itemId = this.mirroredTestIds.get(item);
		return itemId ? this.items.get(itemId) : undefined;
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem): MirroredCollectionTestItem {
		return { ...item, revived: TestItem.to(item.item), children: new Set() };
	}

	/**
	 * @override
	 */
	protected onChange(item: MirroredCollectionTestItem | null) {
		if (item) {
			Object.assign(item.revived, TestItem.to(item.item));
		}

		this.changeEmitter.fire(item ? this.createCollectionItemWrapper(item) : null);
	}

	private createCollectionItemWrapper(item: MirroredCollectionTestItem): vscode.TestItem {
		if (!item.wrapped) {
			item.wrapped = createMirroredTestItem(item, this);
			this.mirroredTestIds.set(item.wrapped, item.id);
		}

		return item.wrapped;
	}
}

const createMirroredTestItem = (internal: MirroredCollectionTestItem, collection: MirroredTestCollection): vscode.TestItem => {
	const obj = {};

	Object.defineProperty(obj, 'children', {
		enumerable: true,
		configurable: false,
		get: () => collection.getAllAsTestItem([...internal.children])
	});

	simpleProps.forEach(prop => Object.defineProperty(obj, prop, {
		enumerable: true,
		configurable: false,
		get: () => internal.revived[prop],
	}));

	return obj as any;
};

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

		const disposeListener = this.documents.onDidRemoveDocuments(evt => {
			if (evt.some(delta => delta.document.uri.toString() === uriString)) {
				this.unlisten(resourceUri);
			}
		});

		this.proxy.$subscribeToDiffs(ExtHostTestingResource.TextDocument, resourceUri);
		return new Disposable(() => {
			this.proxy.$unsubscribeFromDiffs(ExtHostTestingResource.TextDocument, resourceUri);
			disposeListener.dispose();
			this.diffListeners.delete(uriString);
		});
	}
}
