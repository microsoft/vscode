/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function disposeAll(disposables: Iterable<IDisposable>) {
	const errors: any[] = [];

	for (const disposable of disposables) {
		try {
			disposable.dispose();
		} catch (e) {
			errors.push(e);
		}
	}

	if (errors.length === 1) {
		throw errors[0];
	} else if (errors.length > 1) {
		throw new AggregateError(errors, 'Encountered errors while disposing of store');
	}
}

export interface IDisposable {
	dispose(): void;
}

export abstract class Disposable {
	private _isDisposed = false;

	protected _disposables: IDisposable[] = [];

	public dispose(): any {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		disposeAll(this._disposables);
	}

	protected _register<T extends IDisposable>(value: T): T {
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

