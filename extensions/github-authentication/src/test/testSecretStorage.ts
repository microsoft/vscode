/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class TestSecretStorage implements vscode.SecretStorage, vscode.Disposable {
	private readonly values = new Map<string, string>();
	private readonly changes = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
	readonly onDidChange = this.changes.event;

	async keys(): Promise<string[]> { return [...this.values.keys()]; }
	async get(key: string): Promise<string | undefined> { return this.values.get(key); }

	async store(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		this.changes.fire({ key });
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
		this.changes.fire({ key });
	}

	dispose(): void { this.changes.dispose(); }
}
