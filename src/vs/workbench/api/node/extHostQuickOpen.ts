/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { wireCancellationToken, asWinJsPromise } from 'vs/base/common/async';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { QuickPickOptions, QuickPickItem, InputBoxOptions, WorkspaceFolderPickOptions, WorkspaceFolder, QuickInput } from 'vscode';
import { MainContext, MainThreadQuickOpenShape, ExtHostQuickOpenShape, MyQuickPickItems, IMainContext } from './extHost.protocol';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { isPromiseCanceledError } from 'vs/base/common/errors';

export type Item = string | QuickPickItem;

export class ExtHostQuickOpen implements ExtHostQuickOpenShape {

	private _proxy: MainThreadQuickOpenShape;
	private _workspace: ExtHostWorkspace;
	private _commands: ExtHostCommands;

	private _onDidSelectItem: (handle: number) => void;
	private _validateInput: (input: string) => string | Thenable<string>;

	private _nextMultiStepHandle = 1;

	constructor(mainContext: IMainContext, workspace: ExtHostWorkspace, commands: ExtHostCommands) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadQuickOpen);
		this._workspace = workspace;
		this._commands = commands;
	}

	showQuickPick(multiStepHandle: number | undefined, itemsOrItemsPromise: QuickPickItem[] | Thenable<QuickPickItem[]>, options: QuickPickOptions & { canPickMany: true; }, token?: CancellationToken): Thenable<QuickPickItem[] | undefined>;
	showQuickPick(multiStepHandle: number | undefined, itemsOrItemsPromise: string[] | Thenable<string[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<string | undefined>;
	showQuickPick(multiStepHandle: number | undefined, itemsOrItemsPromise: QuickPickItem[] | Thenable<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<QuickPickItem | undefined>;
	showQuickPick(multiStepHandle: number | undefined, itemsOrItemsPromise: Item[] | Thenable<Item[]>, options?: QuickPickOptions, token: CancellationToken = CancellationToken.None): Thenable<Item | Item[] | undefined> {

		// clear state from last invocation
		this._onDidSelectItem = undefined;

		const itemsPromise = <TPromise<Item[]>>TPromise.wrap(itemsOrItemsPromise);

		const quickPickWidget = this._proxy.$show(multiStepHandle, {
			placeHolder: options && options.placeHolder,
			matchOnDescription: options && options.matchOnDescription,
			matchOnDetail: options && options.matchOnDetail,
			ignoreFocusLost: options && options.ignoreFocusOut,
			canPickMany: options && options.canPickMany
		});

		const promise = TPromise.any(<TPromise<number | Item[]>[]>[quickPickWidget, itemsPromise]).then(values => {
			if (values.key === '0') {
				return undefined;
			}

			return itemsPromise.then(items => {

				let pickItems: MyQuickPickItems[] = [];
				for (let handle = 0; handle < items.length; handle++) {

					let item = items[handle];
					let label: string;
					let description: string;
					let detail: string;
					let picked: boolean;

					if (typeof item === 'string') {
						label = item;
					} else {
						label = item.label;
						description = item.description;
						detail = item.detail;
						picked = item.picked;
					}
					pickItems.push({
						label,
						description,
						handle,
						detail,
						picked
					});
				}

				// handle selection changes
				if (options && typeof options.onDidSelectItem === 'function') {
					this._onDidSelectItem = (handle) => {
						options.onDidSelectItem(items[handle]);
					};
				}

				// show items
				this._proxy.$setItems(pickItems);

				return quickPickWidget.then(handle => {
					if (typeof handle === 'number') {
						return items[handle];
					} else if (Array.isArray(handle)) {
						return handle.map(h => items[h]);
					}
					return undefined;
				});
			}, (err) => {
				this._proxy.$setError(err);

				return TPromise.wrapError(err);
			});
		});
		return wireCancellationToken<Item | Item[]>(token, promise, true);
	}

	$onItemSelected(handle: number): void {
		if (this._onDidSelectItem) {
			this._onDidSelectItem(handle);
		}
	}

	// ---- input

	showInput(multiStepHandle: number | undefined, options?: InputBoxOptions, token: CancellationToken = CancellationToken.None): Thenable<string> {

		// global validate fn used in callback below
		this._validateInput = options && options.validateInput;

		const promise = this._proxy.$input(multiStepHandle, options, typeof this._validateInput === 'function');
		return wireCancellationToken(token, promise, true);
	}

	$validateInput(input: string): TPromise<string> {
		if (this._validateInput) {
			return asWinJsPromise(_ => this._validateInput(input));
		}
		return undefined;
	}

	// ---- workspace folder picker

	showWorkspaceFolderPick(options?: WorkspaceFolderPickOptions, token = CancellationToken.None): Thenable<WorkspaceFolder> {
		return this._commands.executeCommand('_workbench.pickWorkspaceFolder', [options]).then((selectedFolder: WorkspaceFolder) => {
			if (!selectedFolder) {
				return undefined;
			}

			return this._workspace.getWorkspaceFolders().filter(folder => folder.uri.toString() === selectedFolder.uri.toString())[0];
		});
	}

	// ---- Multi-step input

	multiStepInput<T>(handler: (input: QuickInput, token: CancellationToken) => Thenable<T>, clientToken: CancellationToken = CancellationToken.None): Thenable<T> {
		const handle = this._nextMultiStepHandle++;
		const remotePromise = this._proxy.$multiStep(handle);

		const cancellationSource = new CancellationTokenSource();
		const handlerPromise = TPromise.wrap(handler({
			showQuickPick: this.showQuickPick.bind(this, handle),
			showInputBox: this.showInput.bind(this, handle)
		}, cancellationSource.token));

		clientToken.onCancellationRequested(() => {
			remotePromise.cancel();
			cancellationSource.cancel();
		});

		return TPromise.join<void, T>([
			remotePromise.then(() => {
				throw new Error('Unexpectedly fulfilled promise.');
			}, err => {
				if (!isPromiseCanceledError(err)) {
					throw err;
				}
				cancellationSource.cancel();
			}),
			handlerPromise.then(result => {
				remotePromise.cancel();
				return result;
			}, err => {
				remotePromise.cancel();
				throw err;
			})
		]).then(([_, result]) => result, ([remoteErr, handlerErr]) => {
			throw handlerErr || remoteErr;
		});
	}
}
