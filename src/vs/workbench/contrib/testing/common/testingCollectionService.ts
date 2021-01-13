/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { debounce } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export interface ITestSubscriptionFolder {
	folder: IWorkspaceFolder;
	getChildren(): Iterable<ITestSubscriptionItem>;
}

export interface ITestSubscriptionItem extends IncrementalTestCollectionItem {
	root: ITestSubscriptionFolder;
}

export class TestSubscriptionListener extends Disposable {
	private onDiffEmitter = new Emitter<[workspaceFolder: IWorkspaceFolder, diff: TestsDiff]>();
	private onFolderChangeEmitter = new Emitter<IWorkspaceFoldersChangeEvent>();

	public readonly onDiff = this.onDiffEmitter.event;
	public readonly onFolderChange = this.onFolderChangeEmitter.event;

	public get testCount() {
		return this.subscription.testCount;
	}

	public get workspaceFolders() {
		return this.subscription.workspaceFolders;
	}

	public get workspaceFolderCollections() {
		return this.subscription.workspaceFolderCollections;
	}

	constructor(public readonly subscription: TestSubscription, public readonly onDispose: () => void) {
		super();
		this._register(toDisposable(onDispose));
	}

	public publishFolderChange(evt: IWorkspaceFoldersChangeEvent) {
		this.onFolderChangeEmitter.fire(evt);
	}

	public publishDiff(folder: IWorkspaceFolder, diff: TestsDiff) {
		this.onDiffEmitter.fire([folder, diff]);
	}
}

/**
 * Maintains an observable set of tests in the core.
 */
export interface ITestingCollectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the current tests. Will only be non-zero if there's at least one
	 * active subscriber/
	 */
	readonly count: number;

	/**
	 * Gets a test by ID if it exists in the collection. This is *not* guarenteed
	 * and will only include workspace tests.
	 */
	getTestById(id: string): ITestSubscriptionItem | undefined;

	/**
	 * Gets all workspace folders we're listening to.
	 */
	workspaceFolders(): ReadonlyArray<ITestSubscriptionFolder>;

	/**
	 * Adds a listener that receives updates about tests.
	 */
	subscribeToWorkspaceTests(): TestSubscriptionListener;
}

export const ITestingCollectionService = createDecorator<ITestingCollectionService>('ITestingViewService');

export class TestingCollectionService implements ITestingCollectionService {
	declare _serviceBrand: undefined;

	private subscription?: TestSubscription;

	public workspaceFolders() {
		return this.subscription?.workspaceFolders || [];
	}

	constructor(@IInstantiationService protected instantiationService: IInstantiationService) { }

	/**
	 * @inheritdoc
	 */
	public get count() {
		return this.subscription?.testCount || 0;
	}

	/**
	 * @inheritdoc
	 */
	public getTestById(id: string) {
		const collections = this.subscription?.workspaceFolderCollections;
		if (!collections) {
			return undefined;
		}

		for (const [, collection] of collections) {
			const test = collection.getNodeById(id);
			if (test) {
				return test;
			}
		}

		return undefined;
	}

	/**
	 * @inheritdoc
	 */
	public subscribeToWorkspaceTests(): TestSubscriptionListener {
		if (!this.subscription) {
			this.subscription = this.instantiationService.createInstance(TestSubscription);
		}

		const listener = new TestSubscriptionListener(this.subscription, () => {
			if (!this.subscription) {
				return;
			}

			this.subscription.removeListener(listener);
			if (this.subscription.listenerCount === 0) {
				this.debounceDispose();
			}
		});

		this.subscription.addListener(listener);
		return listener;
	}

	@debounce(10_0000)
	private debounceDispose() {
		if (this.subscription && this.subscription.listenerCount === 0) {
			this.subscription.dispose();
			this.subscription = undefined;
		}
	}
}


class TestSubscription extends Disposable {
	private listeners = new Set<TestSubscriptionListener>();
	private readonly collectionsForWorkspaces = new Map<string, {
		listener: IDisposable,
		folder: ITestSubscriptionFolder,
		collection: TestCollection,
	}>();

	public testCount = 0;

	public get listenerCount() {
		return this.listeners.size;
	}

	public get workspaceFolders() {
		return [...this.collectionsForWorkspaces.values()].map(v => v.folder);
	}

	public get workspaceFolderCollections() {
		return [...this.collectionsForWorkspaces.values()].map(v => [v.folder, v.collection] as const);
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

			for (const listener of this.listeners) {
				listener.publishFolderChange(evt);
			}
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
			getChildren: function* () {
				for (const rootId of collection.rootNodes) {
					const node = collection.getNodeById(rootId);
					if (node) {
						yield node;
					}
				}
			},
		};

		const collection = new TestCollection(folderNode, {
			add: () => {
				this.testCount++;
			},
			remove: () => {
				this.testCount--;
			},
			update: () => undefined,
			complete: () => undefined,
		});

		const listener = this.testService.subscribeToDiffs(
			ExtHostTestingResource.Workspace,
			folder.uri,
			diff => {
				collection.apply(diff);
				for (const listener of this.listeners) {
					listener.publishDiff(folder, diff);
				}
			},
		);

		this.collectionsForWorkspaces.set(folder.uri.toString(), { listener, collection, folder: folderNode });
	}
}

class TestCollection extends AbstractIncrementalTestCollection<ITestSubscriptionItem> {
	constructor(private readonly workspace: ITestSubscriptionFolder, private readonly collector: IncrementalChangeCollector<ITestSubscriptionItem>) {
		super();
	}

	public get rootNodes() {
		return this.roots;
	}

	public getNodeById(id: string) {
		return this.items.get(id);
	}

	protected createChangeCollector() {
		return this.collector;
	}

	protected createItem(internal: InternalTestItem): ITestSubscriptionItem {
		return { ...internal, root: this.workspace, children: new Set<string>() };
	}
}
