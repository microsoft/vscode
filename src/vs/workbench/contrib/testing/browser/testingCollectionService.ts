/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { debounce } from 'vs/base/common/decorators';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { AbstractIncrementalTestCollection, IncrementalChangeCollector, IncrementalTestCollectionItem, InternalTestItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export const isTestItem = (v: ITestSubscriptionItem | ITestSubscriptionFolder): v is ITestSubscriptionItem => v.depth > 0;

export interface ITestSubscriptionFolder {
	depth: 0;
	folder: IWorkspaceFolder;
	childCount: number;
	getChildren(): Iterable<ITestSubscriptionItem>;
}

export interface ITestSubscriptionItem extends IncrementalTestCollectionItem {
	depth: number;
	getChildren(): Iterable<ITestSubscriptionItem>;
	childCount: number;
	root: ITestSubscriptionFolder;
	parentItem: ITestSubscriptionItem | ITestSubscriptionFolder;
}

export interface ITestSubscription {
	add(node: ITestSubscriptionItem | ITestSubscriptionFolder): void;
	update(node: ITestSubscriptionItem | ITestSubscriptionFolder): void;
	remove(node: ITestSubscriptionItem | ITestSubscriptionFolder): void;
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
	 * Gets all workspace folders we're listening to.
	 */
	workspaceFolders(): ReadonlyArray<ITestSubscriptionFolder>;

	/**
	 * Adds a listener that receives updates about tests.
	 */
	subscribeToWorkspaceTests(collector: ITestSubscription): IDisposable;
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
	public subscribeToWorkspaceTests(listener: ITestSubscription): IDisposable {
		if (!this.subscription) {
			this.subscription = this.instantiationService.createInstance(TestSubscription);
		}

		this.subscription.addListener(listener);
		return toDisposable(() => {
			if (!this.subscription) {
				return;
			}

			this.subscription.removeListener(listener);
			if (this.subscription.listenerCount === 0) {
				this.debounceDispose();
			}
		});
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
	private listeners = new Set<ITestSubscription>();
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
					for (const listener of this.listeners) {
						listener.remove(existing.folder);
					}
				}
			}
		}));

		for (const folder of workspaceContext.getWorkspace().folders) {
			this.subscribeToWorkspace(folder);
		}
	}

	public addListener(listener: ITestSubscription) {
		this.listeners.add(listener);
		for (const { collection, folder } of this.collectionsForWorkspaces.values()) {
			listener.add(folder);

			const queue = [collection.rootNodes];
			while (queue.length) {
				for (const node of queue.pop()!) {
					listener.add(collection.getNodeById(node)!);
				}
			}
		}
	}

	public removeListener(listener: ITestSubscription) {
		this.listeners.delete(listener);
	}

	private subscribeToWorkspace(folder: IWorkspaceFolder) {
		const folderNode: ITestSubscriptionFolder = {
			folder,
			depth: 0,
			get childCount() {
				return collection.rootNodes.size;
			},
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
			add: node => {
				this.testCount++;
				for (const listener of this.listeners) {
					listener.add(node);
				}
			},
			remove: (node, isNested) => {
				this.testCount--;
				if (!isNested) {
					for (const listener of this.listeners) {
						listener.remove(node);
					}
				}
			},
			update: node => {
				for (const listener of this.listeners) {
					listener.update(node);
				}
			},
			complete: () => {
				// no-op
			},
		});

		for (const listener of this.listeners) {
			listener.add(folderNode);
		}

		const listener = this.testService.subscribeToDiffs(
			ExtHostTestingResource.Workspace,
			folder.uri,
			diff => collection.apply(diff),
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

	protected createItem(internal: InternalTestItem, parentItem?: ITestSubscriptionItem): ITestSubscriptionItem {
		const children = new Set<string>();
		const items = this.items;
		const actualParent = parentItem || this.workspace;
		return {
			...internal,
			depth: actualParent.depth + 1,
			parentItem: actualParent,
			root: this.workspace,
			get childCount() {
				return children.size;
			},
			getChildren: function* () {
				for (const childId of children) {
					const node = items.get(childId);
					if (node) {
						yield node;
					}
				}
			},
			children: children,
		};
	}
}
