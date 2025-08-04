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
import { TerminalShellType } from '../terminalSuggestMain';

const isWindows = osIsWindows();

export interface IExecutablesInPath {
	completionResources: Set<ICompletionResource> | undefined;
	labels: Set<string> | undefined;
}

export class PathExecutableCache implements vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];

	private _cachedWindowsExeExtensions: { [key: string]: boolean | undefined } | undefined;
	private _cachedExes: Map<string, Set<ICompletionResource> | undefined> = new Map();

	private _inProgressRequest: {
		env: ITerminalEnvironment;
		shellType: TerminalShellType | undefined;
		promise: Promise<IExecutablesInPath | undefined>;
	} | undefined;

	constructor() {
		if (isWindows) {
			this._cachedWindowsExeExtensions = vscode.workspace.getConfiguration(SettingsIds.SuggestPrefix).get(SettingsIds.CachedWindowsExecutableExtensionsSuffixOnly);
			this._disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(SettingsIds.CachedWindowsExecutableExtensions)) {
					this._cachedWindowsExeExtensions = vscode.workspace.getConfiguration(SettingsIds.SuggestPrefix).get(SettingsIds.CachedWindowsExecutableExtensionsSuffixOnly);
					this._cachedExes.clear();
				}
			}));
		}
	}

	dispose() {
		for (const d of this._disposables) {
			d.dispose();
		}
	}

	refresh(directory?: string): void {
		if (directory) {
			this._cachedExes.delete(directory);
		} else {
			this._cachedExes.clear();
		}
	}

	async getExecutablesInPath(env: ITerminalEnvironment = process.env, shellType?: TerminalShellType): Promise<IExecutablesInPath | undefined> {
		if (this._inProgressRequest &&
			this._inProgressRequest.env === env &&
			this._inProgressRequest.shellType === shellType
		) {
			return this._inProgressRequest.promise;
		}

		const promise = this._doGetExecutablesInPath(env, shellType);

		this._inProgressRequest = {
			env,
			shellType,
			promise,
		};

		await promise;
		this._inProgressRequest = undefined;

		return promise;
	}

	private async _doGetExecutablesInPath(env: ITerminalEnvironment, shellType?: TerminalShellType): Promise<IExecutablesInPath | undefined> {
		// Create cache key
		let pathValue: string | undefined;
		if (shellType === TerminalShellType.GitBash) {
			// TODO: figure out why shellIntegration.env.PATH
			// regressed from using \ to / (correct)
			pathValue = process.env.PATH;
		} else if (isWindows) {
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

		// Extract executables from PATH
		const paths = pathValue.split(isWindows ? ';' : ':');
		const pathSeparator = isWindows ? '\\' : '/';
		const promisePaths: string[] = [];
		const promises: Promise<Set<ICompletionResource> | undefined>[] = [];
		const labels: Set<string> = new Set<string>();

		for (const pathDir of paths) {
			// Check if this directory is already cached
			const cachedExecutables = this._cachedExes.get(pathDir);
			if (cachedExecutables) {
				for (const executable of cachedExecutables) {
					const labelText = typeof executable.label === 'string' ? executable.label : executable.label.label;
					labels.add(labelText);
				}
			} else {
				// Not cached, need to scan this directory
				promisePaths.push(pathDir);
				promises.push(this._getExecutablesInSinglePath(pathDir, pathSeparator, labels));
			}
		}

		// Process uncached directories
		if (promises.length > 0) {
			const resultSets = await Promise.all(promises);
			for (const [i, resultSet] of resultSets.entries()) {
				const pathDir = promisePaths[i];
				if (!this._cachedExes.has(pathDir)) {
					this._cachedExes.set(pathDir, resultSet || new Set());
				}
			}
		}

		// Merge all results from all directories
		const executables = new Set<ICompletionResource>();
		const processedPaths: Set<string> = new Set();
		for (const pathDir of paths) {
			if (processedPaths.has(pathDir)) {
				continue;
			}
			processedPaths.add(pathDir);
			const dirExecutables = this._cachedExes.get(pathDir);
			if (dirExecutables) {
				for (const executable of dirExecutables) {
					executables.add(executable);
				}
			}
		}

		return { completionResources: executables, labels };
	}

	private async _getExecutablesInSinglePath(path: string, pathSeparator: string, labels: Set<string>): Promise<Set<ICompletionResource> | undefined> {
		try {
			const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
			if (!dirExists) {
				return undefined;
			}
			const result = new Set<ICompletionResource>();
			const fileResource = vscode.Uri.file(path);
			const files = await vscode.workspace.fs.readDirectory(fileResource);
			await Promise.all(
				files.map(([file, fileType]) => (async () => {
					let kind: vscode.TerminalCompletionItemKind | undefined;
					let formattedPath: string | undefined;
					const resource = vscode.Uri.joinPath(fileResource, file);

					// Skip unknown or directory file types early
					if (fileType === vscode.FileType.Unknown || fileType === vscode.FileType.Directory) {
						return;
					}

					try {
						const lstat = await fs.lstat(resource.fsPath);
						if (lstat.isSymbolicLink()) {
							try {
								const symlinkRealPath = await fs.realpath(resource.fsPath);
								const isExec = await isExecutable(symlinkRealPath, this._cachedWindowsExeExtensions);
								if (!isExec) {
									return;
								}
								kind = vscode.TerminalCompletionItemKind.Method;
								formattedPath = `${resource.fsPath} -> ${symlinkRealPath}`;
							} catch {
								return;
							}
						}
					} catch {
						// Ignore errors for unreadable files
						return;
					}

					formattedPath = formattedPath ?? getFriendlyResourcePath(resource, pathSeparator);

					// Check if already added or not executable
					if (labels.has(file)) {
						return;
					}

					const isExec = kind === vscode.TerminalCompletionItemKind.Method || await isExecutable(formattedPath, this._cachedWindowsExeExtensions);
					if (!isExec) {
						return;
					}

					result.add({
						label: file,
						documentation: formattedPath,
						kind: kind ?? vscode.TerminalCompletionItemKind.Method
					});
					labels.add(file);
				})())
			);
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
					pathExecutableCache.refresh(dir);
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
