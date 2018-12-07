/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ServerResponse } from '../typescriptService';

export class CachedResponse<T extends Proto.Response> {
	private response?: Promise<ServerResponse<T>>;
	private version: number = -1;
	private document: string = '';

	public execute(document: vscode.TextDocument, f: () => Promise<ServerResponse<T>>) {
		if (this.matches(document)) {
			return this.response;
		}
		return this.update(document, f());
	}

	private matches(document: vscode.TextDocument): boolean {
		return this.version === document.version && this.document === document.uri.toString();
	}

	private update(document: vscode.TextDocument, response: Promise<ServerResponse<T>>): Promise<ServerResponse<T>> {
		this.response = response;
		this.version = document.version;
		this.document = document.uri.toString();
		return response;
	}
}
