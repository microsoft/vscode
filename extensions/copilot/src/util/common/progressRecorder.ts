/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

export class RecordedProgress<T> implements vscode.Progress<T> {
	private readonly _items: T[] = [];

	public get items(): readonly T[] {
		return this._items;
	}

	constructor(
		private readonly _progress: vscode.Progress<T>,
	) { }

	report(value: T): void {
		this._items.push(value);
		this._progress.report(value);
	}
}