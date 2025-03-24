/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { isExecutable } from '../helpers/executable';
import { osIsWindows } from '../helpers/os';
import type { ICompletionResource } from '../types';
import { getFriendlyResourcePath } from '../helpers/uri';
import { SettingsIds } from '../constants';
import * as filesystem from 'fs';
import * as path from 'path';

const isWindows = osIsWindows();

export class PathExecutableCache implements vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];

	private _cachedPathValue: string | undefined;
	private _cachedWindowsExeExtensions: { [key: string]: boolean | undefined } | undefined;
	private _cachedExes: { completionResources: Set<ICompletionResource> | undefined; labels: Set<string> | undefined } | undefined;

	constructor() {
		if (isWindows) {
			this._cachedWindowsExeExtensions = vscode.workspace.getConfiguration(SettingsIds.SuggestPrefix).get(SettingsIds.CachedWindowsExecutableExtensionsSuffixOnly);
			this._disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(SettingsIds.CachedWindowsExecutableExtensions)) {
					this._cachedWindowsExeExtensions = vscode.workspace.getConfiguration(SettingsIds.SuggestPrefix).get(SettingsIds.CachedWindowsExecutableExtensionsSuffixOnly);
					this._cachedExes = undefined;
				}
			}));
		}
	}

	dispose() {
		for (const d of this._disposables) {
			d.dispose();
		}
	}

	refresh(): void {
		this._cachedExes = undefined;
		this._cachedPathValue = undefined;
	}

	async getExecutablesInPath(env: ITerminalEnvironment = process.env): Promise<{ completionResources: Set<ICompletionResource> | undefined; labels: Set<string> | undefined } | undefined> {
		// Create cache key
		let pathValue: string | undefined;
		if (isWindows) {
			const caseSensitivePathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
			if (caseSensitivePathKey) {
				pathValue = env[caseSensitivePathKey];
			}
		} else {
			pathValue = env.PATH;
		}
		if (pathValue === undefined) {
			return;
		}

		// Check cache
		if (this._cachedExes && this._cachedPathValue === pathValue) {
			return this._cachedExes;
		}

		// Extract executables from PATH
		const paths = pathValue.split(isWindows ? ';' : ':');
		const pathSeparator = isWindows ? '\\' : '/';
		const promises: Promise<Set<ICompletionResource> | undefined>[] = [];
		const labels: Set<string> = new Set<string>();
		for (const path of paths) {
			promises.push(this._getFilesInPath(path, pathSeparator, labels));
		}

		// Merge all results
		const executables = new Set<ICompletionResource>();
		const resultSets = await Promise.all(promises);
		for (const resultSet of resultSets) {
			if (resultSet) {
				for (const executable of resultSet) {
					executables.add(executable);
				}
			}
		}

		// Return
		this._cachedPathValue = pathValue;
		this._cachedExes = { completionResources: executables, labels };
		return this._cachedExes;
	}

	private async _getFilesInPath(path: string, pathSeparator: string, labels: Set<string>): Promise<Set<ICompletionResource> | undefined> {
		try {
			const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
			if (!dirExists) {
				return undefined;
			}
			const result = new Set<ICompletionResource>();
			const fileResource = vscode.Uri.file(path);
			const files = await vscode.workspace.fs.readDirectory(fileResource);
			for (const [file, fileType] of files) {
				const formattedPath = getFriendlyResourcePath(vscode.Uri.joinPath(fileResource, file), pathSeparator);
				if (!labels.has(file) && fileType !== vscode.FileType.Unknown && fileType !== vscode.FileType.Directory && await isExecutable(formattedPath, this._cachedWindowsExeExtensions)) {
					result.add({ label: file, documentation: formattedPath, kind: vscode.TerminalCompletionItemKind.Method });
					labels.add(file);
				}
			}
			return result;
		} catch (e) {
			// Ignore errors for directories that can't be read
			return undefined;
		}
	}
}

export async function watchPathDirectories(context: vscode.ExtensionContext, env: ITerminalEnvironment, pathExecutableCache: PathExecutableCache | undefined): Promise<void> {
	const pathDirectories = new Set<string>();

	const envPath = env.PATH;
	if (envPath) {
		envPath.split(path.delimiter).forEach(p => pathDirectories.add(p));
	}

	const activeWatchers = new Set<string>();

	// Watch each directory
	for (const dir of pathDirectories) {
		try {
			if (activeWatchers.has(dir)) {
				// Skip if already watching or directory doesn't exist
				continue;
			}

			const stat = await fs.stat(dir);
			if (!stat.isDirectory()) {
				continue;
			}

			const watcher = filesystem.watch(dir, { persistent: false }, () => {
				if (pathExecutableCache) {
					// Refresh cache when directory contents change
					pathExecutableCache.refresh();
				}
			});

			activeWatchers.add(dir);

			context.subscriptions.push(new vscode.Disposable(() => {
				try {
					watcher.close();
					activeWatchers.delete(dir);
				} catch { } { }
			}));
		} catch { }
	}
}

export type ITerminalEnvironment = { [key: string]: string | undefined };
