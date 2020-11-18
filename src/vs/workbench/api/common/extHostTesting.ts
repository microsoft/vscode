/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { throttle } from 'vs/base/common/decorators';
import { isDefined } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { AbstractIncrementalTestCollection, EMPTY_TEST_RESULT, IncrementalTestCollectionItem, InternalTestItem, RunTestForProviderRequest, RunTestsResult, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ExtHostTestingShape, MainContext, MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import type * as vscode from 'vscode';


export class ExtHostTesting implements ExtHostTestingShape {
	private readonly providers = new Map<string, vscode.TestProvider>();
	private readonly mirroredTests = new MirroredTestCollection();
	private readonly proxy: MainThreadTestingShape;
	private readonly ownedTests = new OwnedTestCollection();

	constructor(@IExtHostRpcService rpc: IExtHostRpcService) {
		this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
	}

	/**
	 * Gets a list of tests items (mirrored to this ext host.)
	 */
	public get rootTestItems() {
		return this.mirroredTests.rootTestItems;
	}

	/**
	 * Implements vscode.test.registerTestProvider
	 */
	public registerTestProvider<T extends vscode.TestItem>(provider: vscode.TestProvider<T>): vscode.Disposable {
		const providerId = generateUuid();
		this.providers.set(providerId, provider);

		this.ownedTests.addRoot(provider.testRoot, providerId);
		this.proxy.$registerTestProvider(providerId);
		provider.onDidChangeTest(test => {
			this.ownedTests.onItemChange(test, providerId);
			this.throttleSendDiff();
		});

		return new Disposable(() => {
			this.providers.delete(providerId);
			this.proxy.$unregisterTestProvider(providerId);
			this.ownedTests.removeRoot(provider.testRoot);
			this.throttleSendDiff();
		});
	}

	/**
	 * Implements vscode.test.runTests
	 */
	public async runTests(req: vscode.TestRunOptions<vscode.TestItem>) {
		await this.proxy.$runTests({
			tests: req.tests
				.map(test => this.mirroredTests.getMirroredTestItemId(test) ?? this.ownedTests.getTestByReference(test))
				.filter(isDefined)
				.map(item => ({ providerId: item.providerId, testId: item.id })),
			debug: req.debug
		});
	}

	/**
	 * Receives a test update from the main thread. Called (eventually) whenever
	 * tests change.
	 * @override
	 */
	public $acceptDiff(diff: TestsDiff): void {
		this.mirroredTests.apply(diff);
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

	@throttle(200)
	private throttleSendDiff() {
		this.proxy.$publishDiff(this.ownedTests.collectDiff());
	}
}

const keyMap: { [K in keyof Omit<Required<vscode.TestItem>, 'children'>]: null } = {
	label: null,
	location: null,
	runState: null,
	debuggable: null,
	description: null,
	runnable: null
};

const simpleProps = Object.keys(keyMap) as ReadonlyArray<keyof typeof keyMap>;

const serializeTestItem = (item: vscode.TestItem): Omit<vscode.TestItem, 'children'> => {
	const obj: any = {};
	for (const key of simpleProps) {
		obj[key] = item[key];
	}

	return obj;
};

/**
 * @private
 */
export interface OwnedCollectionTestItem extends InternalTestItem {
	actual: vscode.TestItem;
	previousChildren: Set<string>;
}

/**
 * Maintains tests created and registered in this extension host.
 * @private
 */
export class OwnedTestCollection {
	protected readonly testItemToInternal = new Map<vscode.TestItem, OwnedCollectionTestItem>();
	protected readonly testIdToInternal = new Map<string, OwnedCollectionTestItem>();
	protected diff: TestsDiff = [];

	/**
	 * Adds a new root node to the collection.
	 */
	public addRoot(item: vscode.TestItem, providerId: string) {
		this.addItem(item, providerId, null);
	}

	/**
	 * Gets test information by ID, if it was defined and still exists in this
	 * extension host.
	 */
	public getTestById(id: string) {
		return this.testIdToInternal.get(id);
	}

	/**
	 * Gets test information by its reference, if it was defined and still exists
	 * in this extension host.
	 */
	public getTestByReference(item: vscode.TestItem) {
		return this.testItemToInternal.get(item);
	}

	/**
	 * Removes a test root from the collection.
	 */
	public removeRoot(item: vscode.TestItem) {
		const internal = this.testItemToInternal.get(item);
		if (!internal) {
			console.warn(`Unregistered a test root that did not exist. You should not change the TestProvider.testRoot after instantiation.`);
			return;
		}

		this.removeItembyId(internal.id);
	}

	/**
	 * Should be called when an item change is fired on the test provider.
	 */
	public onItemChange(item: vscode.TestItem, providerId: string) {
		const existing = this.testItemToInternal.get(item);
		if (!existing) {
			console.warn(`Received a TestProvider.onDidChangeTest for a test that wasn't seen before as a child.`);
			return;
		}

		this.addItem(item, providerId, existing.parent);
	}

	/**
	 * Gets a diff of all changes that have been made, and clears the diff queue.
	 */
	public collectDiff() {
		const diff = this.diff;
		this.diff = [];
		return diff;
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
				item: serializeTestItem(actual),
				providerId,
				previousChildren: new Set(),
			};

			this.testItemToInternal.set(actual, internal);
			this.testIdToInternal.set(internal.id, internal);
			this.diff.push([TestDiffOpType.Add, { id: internal.id, parent, providerId, item: internal.item }]);
		} else if (simpleProps.some(key => actual[key] !== internal!.item[key])) {
			internal.item = serializeTestItem(actual);
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
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
	wrapped?: vscode.TestItem;
}

/**
 * Maintains tests in this extension host sent from the main thread.
 * @private
 */
export class MirroredTestCollection extends AbstractIncrementalTestCollection<MirroredCollectionTestItem> {
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
	public getMirroredTestItemId(item: vscode.TestItem) {
		const itemId = this.mirroredTestIds.get(item);
		return itemId ? this.items.get(itemId) : undefined;
	}

	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem): MirroredCollectionTestItem {
		return { ...item, children: new Set() };
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
		get: () => internal.item[prop],
	}));

	return obj as any;
};
