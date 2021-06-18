/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { IncrementalTestCollectionItem, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { IMainThreadTestCollection, ITestService, waitForAllRoots } from 'vs/workbench/contrib/testing/common/testService';

export interface ITestSubscriptionFolder {
	folder: IWorkspaceFolder;
	collection: IMainThreadTestCollection;
	getChildren(): Iterable<IncrementalTestCollectionItem>;
}

export interface ITestSubscriptionItem extends IncrementalTestCollectionItem {
	root: ITestSubscriptionFolder;
}

export class TestSubscriptionListener extends Disposable {
	public static override readonly None = new TestSubscriptionListener({
		busyProviders: 0,
		onBusyProvidersChange: Event.None,
		pendingRootProviders: 0,
		workspaceFolderCollections: new Map(),
		onDiff: Event.None,
		onFolderChange: Event.None,
	}, () => undefined);

	public get busyProviders() {
		return this.subscription.busyProviders;
	}

	public get pendingRootProviders() {
		return this.subscription.pendingRootProviders;
	}

	/**
	 * Returns whether there are any subscriptions with non-empty providers.
	 */
	public get isEmpty() {
		for (const collection of this.workspaceFolderCollections.values()) {
			if (Iterable.some(collection.all, t => !!t.parent)) {
				return false;
			}
		}

		return true;
	}

	public get workspaceFolderCollections() {
		return this.subscription.workspaceFolderCollections;
	}

	public readonly onBusyProvidersChange = this.subscription.onBusyProvidersChange;
	public readonly onFolderChange = this.subscription.onFolderChange;
	public readonly onDiff = this.subscription.onDiff;

	constructor(
		private readonly subscription: TestSubscription,
		onDispose: () => void,
	) {
		super();
		this._register(toDisposable(onDispose));
	}

	public async waitForAllRoots(token?: CancellationToken) {
		await Promise.all([...this.subscription.workspaceFolderCollections.values()].map(
			(c) => waitForAllRoots(c, token),
		));
	}
}

/**
 * Maintains an observable set of tests in the core.
 */
export interface IWorkspaceTestCollectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets all workspace folders we're listening to.
	 */
	workspaceFolders(): ReadonlyArray<ITestSubscriptionFolder>;

	/**
	 * Adds a listener that receives updates about tests.
	 */
	subscribeToWorkspaceTests(): TestSubscriptionListener;

	/**
	 * A pass-through method that creates a subscription listener for a document.
	 * Useful if you need the same TestSubscriptionListener shape, but otherwise
	 * you can `ITestService.subscribeToDiffs` directly.
	 */
	subscribeToDocumentTests(documentUri: URI): TestSubscriptionListener;
}

export const IWorkspaceTestCollectionService = createDecorator<IWorkspaceTestCollectionService>('ITestingViewService');

export class WorkspaceTestCollectionService implements IWorkspaceTestCollectionService {
	declare _serviceBrand: undefined;

	private subscription?: WorkspaceTestSubscription;

	public workspaceFolders() {
		return this.subscription?.workspaceFolders || [];
	}

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IWorkspaceContextService protected workspaceContext: IWorkspaceContextService,
		@ITestService protected testService: ITestService,
	) { }

	/**
	 * @inheritdoc
	 */
	public subscribeToWorkspaceTests(): TestSubscriptionListener {
		if (!this.subscription) {
			this.subscription = this.instantiationService.createInstance(WorkspaceTestSubscription);
		}

		const listener = new TestSubscriptionListener(this.subscription, () => {
			if (!this.subscription) {
				return;
			}

			this.subscription.removeListener(listener);
			if (this.subscription.listenerCount === 0) {
				this.subscription.dispose();
				this.subscription = undefined;
			}
		});

		this.subscription.addListener(listener);
		return listener;
	}

	/**
	 * @inheritdoc
	 */
	public subscribeToDocumentTests(documentUri: URI): TestSubscriptionListener {
		const folder = this.workspaceContext.getWorkspaceFolder(documentUri)
			|| this.workspaceContext.getWorkspace().folders[0];
		if (!folder) {
			return TestSubscriptionListener.None;
		}

		const subFolder: ITestSubscriptionFolder = {
			folder,
			get collection() {
				return sub.object;
			},
			getChildren: () => sub.object.all,
		};

		const store = new DisposableStore();
		const diffEmitter = store.add(new Emitter<{ folder: ITestSubscriptionFolder, diff: TestsDiff }>());
		const onDiff = (diff: TestsDiff) => diffEmitter.fire({ diff, folder: subFolder });
		const sub = store.add(this.testService.subscribeToDiffs(ExtHostTestingResource.TextDocument, documentUri, onDiff));

		return new TestSubscriptionListener({
			get busyProviders() { return sub.object.busyProviders; },
			onBusyProvidersChange: sub.object.onBusyProvidersChange,
			get pendingRootProviders() { return sub.object.pendingRootProviders; },
			workspaceFolderCollections: new Map([[subFolder, sub.object]]),
			onDiff: diffEmitter.event,
			onFolderChange: Event.None,
		}, () => store.dispose());
	}
}


export interface TestSubscription {
	readonly onBusyProvidersChange: Event<number>;
	readonly busyProviders: number;
	readonly pendingRootProviders: number;
	readonly workspaceFolderCollections: Map<ITestSubscriptionFolder, IMainThreadTestCollection>;
	readonly onFolderChange: Event<IWorkspaceFoldersChangeEvent>;
	readonly onDiff: Event<{ folder: ITestSubscriptionFolder, diff: TestsDiff }>;
}

class WorkspaceTestSubscription extends Disposable implements TestSubscription {
	private onDiffEmitter = this._register(new Emitter<{ folder: ITestSubscriptionFolder, diff: TestsDiff }>());
	private onFolderChangeEmitter = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());

	private listeners = new Set<TestSubscriptionListener>();
	private pendingRootChangeEmitter = this._register(new Emitter<number>());
	private busyProvidersChangeEmitter = this._register(new Emitter<number>());
	private readonly collectionsForWorkspaces = new Map<string, {
		listener: IDisposable,
		folder: ITestSubscriptionFolder,
		collection: IMainThreadTestCollection,
	}>();

	public readonly onPendingRootProvidersChange = this.pendingRootChangeEmitter.event;
	public readonly onBusyProvidersChange = this.busyProvidersChangeEmitter.event;
	public readonly onDiff = this.onDiffEmitter.event;
	public readonly onFolderChange = this.onFolderChangeEmitter.event;

	public get busyProviders() {
		let total = 0;
		for (const { collection } of this.collectionsForWorkspaces.values()) {
			total += collection.busyProviders;
		}

		return total;
	}

	public get pendingRootProviders() {
		let total = 0;
		for (const { collection } of this.collectionsForWorkspaces.values()) {
			total += collection.pendingRootProviders;
		}

		return total;
	}

	public get listenerCount() {
		return this.listeners.size;
	}

	public get workspaceFolders() {
		return [...this.collectionsForWorkspaces.values()].map(v => v.folder);
	}

	public get workspaceFolderCollections() {
		return new Map([...this.collectionsForWorkspaces.values()].map(v => [v.folder, v.collection] as const));
	}

	constructor(
		@IWorkspaceContextService workspaceContext: IWorkspaceContextService,
		@ITestService private readonly testService: ITestService,
	) {
		super();

		this._register(toDisposable(() => {
			for (const { listener } of this.collectionsForWorkspaces.values()) {
				listener.dispose();
			}
		}));

		this._register(workspaceContext.onDidChangeWorkspaceFolders(evt => {
			for (const folder of evt.added) {
				this.subscribeToWorkspace(folder);
			}

			for (const folder of evt.removed) {
				const existing = this.collectionsForWorkspaces.get(folder.uri.toString());
				if (existing) {
					this.collectionsForWorkspaces.delete(folder.uri.toString());
					existing.listener.dispose();
				}
			}

			this.onFolderChangeEmitter.fire(evt);
		}));

		for (const folder of workspaceContext.getWorkspace().folders) {
			this.subscribeToWorkspace(folder);
		}
	}

	public addListener(listener: TestSubscriptionListener) {
		this.listeners.add(listener);
	}

	public removeListener(listener: TestSubscriptionListener) {
		this.listeners.delete(listener);
	}

	private subscribeToWorkspace(folder: IWorkspaceFolder) {
		const folderNode: ITestSubscriptionFolder = {
			folder,
			get collection() {
				return ref.object;
			},
			getChildren: function* () {
				for (const rootId of ref.object.rootIds) {
					const node = ref.object.getNodeById(rootId);
					if (node) {
						yield node;
					}
				}
			},
		};

		const ref = this.testService.subscribeToDiffs(
			ExtHostTestingResource.Workspace,
			folder.uri,
			diff => this.onDiffEmitter.fire({ folder: folderNode, diff }),
		);

		const disposable = new DisposableStore();
		disposable.add(ref);
		disposable.add(ref.object.onBusyProvidersChange(
			() => this.pendingRootChangeEmitter.fire(this.pendingRootProviders)));
		disposable.add(ref.object.onBusyProvidersChange(
			() => this.busyProvidersChangeEmitter.fire(this.busyProviders)));

		this.collectionsForWorkspaces.set(folder.uri.toString(), {
			listener: disposable,
			collection: ref.object,
			folder: folderNode,
		});
	}
}
