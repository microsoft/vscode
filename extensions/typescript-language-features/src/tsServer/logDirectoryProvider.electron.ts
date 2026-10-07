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
				// eslint-disable-next-line local/code-no-sync-fs -- TODO: log-directory allocation exposes a synchronous provider and Lazy contract.
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
			// eslint-disable-next-line local/code-no-sync-fs -- TODO: log-directory allocation exposes a synchronous provider and Lazy contract.
			if (!fs.existsSync(path)) {
				// eslint-disable-next-line local/code-no-sync-fs -- TODO: log-directory allocation exposes a synchronous provider and Lazy contract.
				fs.mkdirSync(path);
			}
			return this.context.logPath;
		} catch {
			return undefined;
		}
	});
}
