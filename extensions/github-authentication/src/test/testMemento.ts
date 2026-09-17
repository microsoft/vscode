/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * A `Memento` backed by a plain map, so tests exercise the real storage-backed classes rather than
 * a stand-in for them.
 */
export class TestMemento implements vscode.Memento {

	private readonly _values = new Map<string, unknown>();

	/** Set to make every write fail, the way a full or locked global state does. */
	updateError: Error | undefined;

	keys(): readonly string[] {
		return [...this._values.keys()];
	}

	get<T>(key: string, defaultValue?: T): T {
		return (this._values.get(key) as T) ?? defaultValue as T;
	}

	async update(key: string, value: unknown): Promise<void> {
		if (this.updateError) {
			throw this.updateError;
		}
		this._values.set(key, value);
	}
}
