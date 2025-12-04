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

	test('TreeView - element already registered', async function () {
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
});
