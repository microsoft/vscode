/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as os from 'os';
import * as vscode from 'vscode';
import { DisposableStore } from '../util/dispose';

export const joinLines = (...args: string[]) =>
	args.join(os.platform() === 'win32' ? '\r\n' : '\n');


export function workspacePath(...segments: string[]): vscode.Uri {
	return vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, ...segments);
}

export function assertRangeEqual(expected: vscode.Range, actual: vscode.Range, message?: string) {
	assert.strictEqual(expected.start.line, actual.start.line, message);
	assert.strictEqual(expected.start.character, actual.start.character, message);
	assert.strictEqual(expected.end.line, actual.end.line, message);
	assert.strictEqual(expected.end.character, actual.end.character, message);
}

export function withStore<R>(fn: (this: Mocha.Context, store: DisposableStore) => Promise<R>) {
	return async function (this: Mocha.Context): Promise<R> {
		const store = new DisposableStore();
		try {
			return await fn.call(this, store);
		} finally {
			store.dispose();
		}
	};
}
