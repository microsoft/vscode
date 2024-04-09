/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function disposeAll(disposables: vscode.Disposable[]) {
	for (const disposable of disposables) {
		disposable.dispose();
	}
	disposables.length = 0;
}

export interface IDisposable {
	dispose(): void;
}

export abstract class Disposable {
	private _isDisposed = false;

	protected _disposables: vscode.Disposable[] = [];

	public dispose(): any {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		disposeAll(this._disposables);
	}

	protected _register<T extends vscode.Disposable>(value: T): T {
		if (this._isDisposed) {
			value.dispose();
		} else {
			this._disposables.push(value);
		}
		return value;
	}

	protected get isDisposed() {
		return this._isDisposed;
	}
}

export class DisposableStore extends Disposable {

	public add<T extends IDisposable>(disposable: T): T {
		this._register(disposable);

		return disposable;
	}
}
