/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ILogDirectoryProvider } from './logDirectoryProvider';
import { Lazy } from '../utils/lazy';

export class NodeLogDirectoryProvider implements ILogDirectoryProvider {
	public constructor(
		private readonly context: vscode.ExtensionContext
	) { }

	public getNewLogDirectory(): vscode.Uri | undefined {
		const root = this.logDirectory.value;
		if (root) {
			try {
				// eslint-disable-next-line local/code-no-sync-fs -- TODO: await directory allocation before tsserver spawn; the current provider must return an existing path for the immediately consumed log arguments.
				return vscode.Uri.file(fs.mkdtempSync(path.join(root, `tsserver-log-`)));
			} catch (e) {
				return undefined;
			}
		}
		return undefined;
	}

	private readonly logDirectory = new Lazy<string | undefined>(() => {
		try {
			const path = this.context.logPath;
			// eslint-disable-next-line local/code-no-sync-fs -- TODO: preload the log root before the synchronous provider is used; otherwise tsserver can receive a path whose directory is not ready.
			if (!fs.existsSync(path)) {
				// eslint-disable-next-line local/code-no-sync-fs -- TODO: await root creation before tsserver spawn; the Lazy provider currently returns a directory that callers use immediately.
				fs.mkdirSync(path);
			}
			return this.context.logPath;
		} catch {
			return undefined;
		}
	});
}
