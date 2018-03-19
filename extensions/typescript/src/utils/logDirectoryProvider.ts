/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { memoize } from './memoize';

export default class LogDirectoryProvider {
	public constructor(
		private readonly context: vscode.ExtensionContext
	) { }

	public async getNewLogDirectory(): Promise<string | undefined> {
		const root = this.logDirectory();
		if (root) {
			try {
				return fs.mkdtempSync(path.join(root, `tsserver-log-`));
			} catch (e) {
				return undefined;
			}
		}
		return undefined;
	}

	@memoize
	private logDirectory(): string | undefined {
		try {
			const path = this.context.logDirectory;
			if (!fs.existsSync(path)) {
				fs.mkdirSync(path);
			}
			return this.context.logDirectory;
		} catch {
			return undefined;
		}
	}
}