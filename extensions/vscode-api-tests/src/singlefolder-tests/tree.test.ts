/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { asPromise, assertNoRpc, disposeAll, delay, DeferredPromise } from '../utils';

suite('vscode API - tree', () => {

	const disposables: vscode.Disposable[] = [];

	teardown(() => {
		disposeAll(disposables);
		disposables.length = 0;
		assertNoRpc();
	});

	test.skip('TreeView - element already registered', async function () {
		this.timeout(60_000);

		type TreeElement = { readonly kind: 'leaf' };

		class QuickRefreshTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
			private readonly changeEmitter = new vscode.EventEmitter<TreeElement | undefined>();
			private readonly requestEmitter = new vscode.EventEmitter<number>();
			private readonly pendingRequests: DeferredPromise<TreeElement[]>[] = [];
			private readonly element: TreeElement = { kind: 'leaf' };

			readonly onDidChangeTreeData = this.changeEmitter.event;

			getChildren(element?: TreeElement): Thenable<TreeElement[]> {
				if (!element) {
					const deferred = new DeferredPromise<TreeElement[]>();
					this.pendingRequests.push(deferred);
					this.requestEmitter.fire(this.pendingRequests.length);
					return deferred.p;
				}
				return Promise.resolve([]);
			}

			getTreeItem(): vscode.TreeItem {
				const item = new vscode.TreeItem('duplicate', vscode.TreeItemCollapsibleState.None);
				item.id = 'dup';
				return item;
			}

			getParent(): TreeElement | undefined {
				return undefined;
			}

			async waitForRequestCount(count: number): Promise<void> {
				while (this.pendingRequests.length < count) {
					await asPromise(this.requestEmitter.event);
				}
			}

			async resolveNextRequest(): Promise<void> {
				const next = this.pendingRequests.shift();
				if (!next) {
					return;
				}
				await next.complete([this.element]);
			}

			dispose(): void {
				this.changeEmitter.dispose();
				this.requestEmitter.dispose();
				while (this.pendingRequests.length) {
					this.pendingRequests.shift()!.complete([]);
				}
			}

			getElement(): TreeElement {
				return this.element;
			}
		}

		const provider = new QuickRefreshTreeDataProvider();
		disposables.push(provider);

		const treeView = vscode.window.createTreeView('test.treeId', { treeDataProvider: provider });
		disposables.push(treeView);

		const revealFirst = (treeView.reveal(provider.getElement(), { expand: true })
			.then(() => ({ error: undefined as Error | undefined })) as Promise<{ error: Error | undefined }>)
			.catch(error => ({ error }));
		const revealSecond = (treeView.reveal(provider.getElement(), { expand: true })
			.then(() => ({ error: undefined as Error | undefined })) as Promise<{ error: Error | undefined }>)
			.catch(error => ({ error }));

		await provider.waitForRequestCount(2);

		await provider.resolveNextRequest();
		await delay(0);
		await provider.resolveNextRequest();

		const [firstResult, secondResult] = await Promise.all([revealFirst, revealSecond]);
		const error = firstResult.error ?? secondResult.error;
		if (error && /Element with id .+ is already registered/.test(error.message)) {
			assert.fail(error.message);
		}
	});

	test('TreeView - element already registered after refresh', async function () {
		this.timeout(60_000);

		type ParentElement = { readonly kind: 'parent' };
		type ChildElement = { readonly kind: 'leaf'; readonly version: number };
		type TreeElement = ParentElement | ChildElement;

		class ParentRefreshTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
			private readonly changeEmitter = new vscode.EventEmitter<TreeElement | undefined>();
			private readonly rootRequestEmitter = new vscode.EventEmitter<number>();
			private readonly childRequestEmitter = new vscode.EventEmitter<number>();
			private readonly rootRequests: DeferredPromise<TreeElement[]>[] = [];
			private readonly childRequests: DeferredPromise<TreeElement[]>[] = [];
			private readonly parentElement: ParentElement = { kind: 'parent' };
			private childVersion = 0;
			private currentChild: ChildElement = { kind: 'leaf', version: 0 };

			readonly onDidChangeTreeData = this.changeEmitter.event;

			getChildren(element?: TreeElement): Thenable<TreeElement[]> {
				if (!element) {
					const deferred = new DeferredPromise<TreeElement[]>();
					this.rootRequests.push(deferred);
					this.rootRequestEmitter.fire(this.rootRequests.length);
					return deferred.p;
				}
				if (element.kind === 'parent') {
					const deferred = new DeferredPromise<TreeElement[]>();
					this.childRequests.push(deferred);
					this.childRequestEmitter.fire(this.childRequests.length);
					return deferred.p;
				}
				return Promise.resolve([]);
			}

			getTreeItem(element: TreeElement): vscode.TreeItem {
				if (element.kind === 'parent') {
					const item = new vscode.TreeItem('parent', vscode.TreeItemCollapsibleState.Collapsed);
					item.id = 'parent';
					return item;
				}
				const item = new vscode.TreeItem('duplicate', vscode.TreeItemCollapsibleState.None);
				item.id = 'dup';
				return item;
			}

			getParent(element: TreeElement): TreeElement | undefined {
				if (element.kind === 'leaf') {
					return this.parentElement;
				}
				return undefined;
			}

			getCurrentChild(): ChildElement {
				return this.currentChild;
			}

			replaceChild(): ChildElement {
				this.childVersion++;
				this.currentChild = { kind: 'leaf', version: this.childVersion };
				return this.currentChild;
			}

			async waitForRootRequestCount(count: number): Promise<void> {
				while (this.rootRequests.length < count) {
					await asPromise(this.rootRequestEmitter.event);
				}
			}

			async waitForChildRequestCount(count: number): Promise<void> {
				while (this.childRequests.length < count) {
					await asPromise(this.childRequestEmitter.event);
				}
			}

			async resolveNextRootRequest(elements?: TreeElement[]): Promise<void> {
				const next = this.rootRequests.shift();
				if (!next) {
					return;
				}
				await next.complete(elements ?? [this.parentElement]);
			}

			async resolveChildRequestAt(index: number, elements?: TreeElement[]): Promise<void> {
				const request = this.childRequests[index];
				if (!request) {
					return;
				}
				this.childRequests.splice(index, 1);
				await request.complete(elements ?? [this.currentChild]);
			}

			dispose(): void {
				this.changeEmitter.dispose();
				this.rootRequestEmitter.dispose();
				this.childRequestEmitter.dispose();
				while (this.rootRequests.length) {
					this.rootRequests.shift()!.complete([]);
				}
				while (this.childRequests.length) {
					this.childRequests.shift()!.complete([]);
				}
			}
		}

		const provider = new ParentRefreshTreeDataProvider();
		disposables.push(provider);

		const treeView = vscode.window.createTreeView('test.treeRefresh', { treeDataProvider: provider });
		disposables.push(treeView);

		const initialChild = provider.getCurrentChild();
		const firstReveal = (treeView.reveal(initialChild, { expand: true })
			.then(() => ({ error: undefined as Error | undefined })) as Promise<{ error: Error | undefined }>)
			.catch(error => ({ error }));

		await provider.waitForRootRequestCount(1);
		await provider.resolveNextRootRequest();

		await provider.waitForChildRequestCount(1);
		const staleChild = provider.getCurrentChild();
		const refreshedChild = provider.replaceChild();
		const secondReveal = (treeView.reveal(refreshedChild, { expand: true })
			.then(() => ({ error: undefined as Error | undefined })) as Promise<{ error: Error | undefined }>)
			.catch(error => ({ error }));

		await provider.waitForChildRequestCount(2);

		await provider.resolveChildRequestAt(1, [refreshedChild]);
		await delay(0);
		await provider.resolveChildRequestAt(0, [staleChild]);

		const [firstResult, secondResult] = await Promise.all([firstReveal, secondReveal]);
		const error = firstResult.error ?? secondResult.error;
		if (error && /Element with id .+ is already registered/.test(error.message)) {
			assert.fail(error.message);
		}
	});
});
