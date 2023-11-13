/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITextDocument } from '../types/textDocument';

export class InMemoryDocument implements ITextDocument {

	constructor(
		public readonly uri: vscode.Uri,
		private readonly _contents: string,
		public readonly version = 0,
	) { }

	getText(): string {
		return this._contents;
	}
}
