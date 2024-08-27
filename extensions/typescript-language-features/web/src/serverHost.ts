/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiClient, FileStat, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { basename } from 'path';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { FileWatcherManager } from './fileWatcherManager';
import { Logger } from './logging';
import { PathMapper, looksLikeNodeModules, mapUri } from './pathMapper';
import { findArgument, hasArgument } from './util/args';
import { URI } from 'vscode-uri';

type ServerHostWithImport = ts.server.ServerHost & { importPlugin(root: string, moduleName: string): Promise<ts.server.ModuleImportResult> };

function createServerHost(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	logger: Logger,
	apiClient: ApiClient | undefined,
	args: readonly string[],
	watchManager: FileWatcherManager,
	pathMapper: PathMapper,
	enabledExperimentalTypeAcquisition: boolean,
	exit: () => void,
): ServerHostWithImport {
	const currentDirectory = '/';
	const fs = apiClient?.vscode.workspace.fileSystem;

	// Internals
	const combinePaths: (path: string, ...paths: (string | undefined)[]) => string = (ts as any).combinePaths;
	const byteOrderMarkIndicator = '\uFEFF';
	const matchFiles: (
		path: string,
		extensions: readonly string[] | undefined,
		excludes: readonly string[] | undefined,
		includes: readonly string[] | undefined,
		useCaseSensitiveFileNames: boolean,
		currentDirectory: string,
		depth: number | undefined,
		getFileSystemEntries: (path: string) => { files: readonly string[]; directories: readonly string[] },
		realpath: (path: string) => string
	) => string[] = (ts as any).matchFiles;
	const generateDjb2Hash = (ts as any).generateDjb2Hash;

	// Legacy web
	const memoize: <T>(callback: () => T) => () => T = (ts as any).memoize;
	const ensureTrailingDirectorySeparator: (path: string) => string = (ts as any).ensureTrailingDirectorySeparator;
	const getDirectoryPath: (path: string) => string = (ts as any).getDirectoryPath;
	const directorySeparator: string = (ts as any).directorySeparator;
	const executingFilePath = findArgument(args, '--executingFilePath') || location + '';
	const getExecutingDirectoryPath = memoize(() => memoize(() => ensureTrailingDirectorySeparator(getDirectoryPath(executingFilePath))));
	const getWebPath = (path: string) => path.startsWith(directorySeparator) ? path.replace(directorySeparator, getExecutingDirectoryPath()) : undefined;

	const textDecoder = new TextDecoder();
	const textEncoder = new TextEncoder();

	return {
		watchFile: watchManager.watchFile.bind(watchManager),
		watchDirectory: watchManager.watchDirectory.bind(watchManager),
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
			return setTimeout(callback, ms, ...args);
		},
		clearTimeout(timeoutId: any): void {
			clearTimeout(timeoutId);
		},
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
			return this.setTimeout(callback, 0, ...args);
		},
		clearImmediate(timeoutId: any): void {
			this.clearTimeout(timeoutId);
		},
		importPlugin: async (root, moduleName) => {
			const packageRoot = combinePaths(root, moduleName);

			let packageJson: any | undefined;
			try {
				const packageJsonResponse = await fetch(combinePaths(packageRoot, 'package.json'));
				packageJson = await packageJsonResponse.json();
			} catch (e) {
				return { module: undefined, error: new Error(`Could not load plugin. Could not load 'package.json'.`) };
			}

			const browser = packageJson.browser;
			if (!browser) {
				return { module: undefined, error: new Error(`Could not load plugin. No 'browser' field found in package.json.`) };
			}

			const scriptPath = combinePaths(packageRoot, browser);
			try {
				const { default: module } = await import(/* webpackIgnore: true */ scriptPath);
				return { module, error: undefined };
			} catch (e) {
				return { module: undefined, error: e };
			}
		},
		args: Array.from(args),
		newLine: '\n',
		useCaseSensitiveFileNames: true,
		write: s => {
			apiClient?.vscode.terminal.write(s);
		},
		writeOutputIsTTY() {
			return true;
		},
		readFile(path) {
			logger.logVerbose('fs.readFile', { path });

			if (!fs) {
				const webPath = getWebPath(path);
				if (webPath) {
					const request = new XMLHttpRequest();
					request.open('GET', webPath, /* asynchronous */ false);
					request.send();
					return request.status === 200 ? request.responseText : undefined;
				} else {
					return undefined;
				}
			}

			let uri;
			try {
				uri = pathMapper.toResource(path);
			} catch (e) {
				return undefined;
			}

			let contents: Uint8Array | undefined;
			try {
				// We need to slice the bytes since we can't pass a shared array to text decoder
				contents = fs.readFile(uri);
			} catch (error) {
				if (!enabledExperimentalTypeAcquisition) {
					return undefined;
				}
				try {
					contents = fs.readFile(mapUri(uri, 'vscode-node-modules'));
				} catch (e) {
					return undefined;
				}
			}
			return textDecoder.decode(contents.slice());
		},
		getFileSize(path) {
			logger.logVerbose('fs.getFileSize', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			const uri = pathMapper.toResource(path);
			let ret = 0;
			try {
				ret = fs.stat(uri).size;
			} catch (_error) {
				if (enabledExperimentalTypeAcquisition) {
					try {
						ret = fs.stat(mapUri(uri, 'vscode-node-modules')).size;
					} catch (_error) {
					}
				}
			}
			return ret;
		},
		writeFile(path, data, writeByteOrderMark) {
			logger.logVerbose('fs.writeFile', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			if (writeByteOrderMark) {
				data = byteOrderMarkIndicator + data;
			}

			let uri;
			try {
				uri = pathMapper.toResource(path);
			} catch (e) {
				return;
			}
			const encoded = textEncoder.encode(data);
			try {
				fs.writeFile(uri, encoded);
				const name = basename(uri.path);
				if (uri.scheme !== 'vscode-global-typings' && (name === 'package.json' || name === 'package-lock.json' || name === 'package-lock.kdl')) {
					fs.writeFile(mapUri(uri, 'vscode-node-modules'), encoded);
				}
			} catch (error) {
				console.error('fs.writeFile', { path, error });
			}
		},
		resolvePath(path: string): string {
			return path;
		},
		fileExists(path: string): boolean {
			logger.logVerbose('fs.fileExists', { path });

			if (!fs) {
				const webPath = getWebPath(path);
				if (!webPath) {
					return false;
				}

				const request = new XMLHttpRequest();
				request.open('HEAD', webPath, /* asynchronous */ false);
				request.send();
				return request.status === 200;
			}

			let uri;
			try {
				uri = pathMapper.toResource(path);
			} catch (e) {
				return false;
			}
			let ret = false;
			try {
				ret = fs.stat(uri).type === FileType.File;
			} catch (_error) {
				if (enabledExperimentalTypeAcquisition) {
					try {
						ret = fs.stat(mapUri(uri, 'vscode-node-modules')).type === FileType.File;
					} catch (_error) {
					}
				}
			}
			return ret;
		},
		directoryExists(path: string): boolean {
			logger.logVerbose('fs.directoryExists', { path });

			if (!fs) {
				return false;
			}

			let uri;
			try {
				uri = pathMapper.toResource(path);
			} catch (_error) {
				return false;
			}

			let stat: FileStat | undefined = undefined;
			try {
				stat = fs.stat(uri);
			} catch (_error) {
				if (enabledExperimentalTypeAcquisition) {
					try {
						stat = fs.stat(mapUri(uri, 'vscode-node-modules'));
					} catch (_error) {
					}
				}
			}
			if (stat) {
				if (path.startsWith('/https') && !path.endsWith('.d.ts')) {
					// TODO: Hack, https 'file system' can't actually tell what is a file vs directory
					return stat.type === FileType.File || stat.type === FileType.Directory;
				}

				return stat.type === FileType.Directory;
			} else {
				return false;
			}
		},
		createDirectory(path: string): void {
			logger.logVerbose('fs.createDirectory', { path });
			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.createDirectory(pathMapper.toResource(path));
			} catch (error) {
				logger.logNormal('Error fs.createDirectory', { path, error: error + '' });
			}
		},
		getExecutingFilePath(): string {
			return currentDirectory;
		},
		getCurrentDirectory(): string {
			return currentDirectory;
		},
		getDirectories(path: string): string[] {
			logger.logVerbose('fs.getDirectories', { path });

			return getAccessibleFileSystemEntries(path).directories.slice();
		},
		readDirectory(path: string, extensions?: readonly string[], excludes?: readonly string[], includes?: readonly string[], depth?: number): string[] {
			logger.logVerbose('fs.readDirectory', { path });

			return matchFiles(path, extensions, excludes, includes, /*useCaseSensitiveFileNames*/ true, currentDirectory, depth, getAccessibleFileSystemEntries, realpath);
		},
		getModifiedTime(path: string): Date | undefined {
			logger.logVerbose('fs.getModifiedTime', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			const uri = pathMapper.toResource(path);
			let s: FileStat | undefined = undefined;
			try {
				s = fs.stat(uri);
			} catch (_e) {
				if (enabledExperimentalTypeAcquisition) {
					try {
						s = fs.stat(mapUri(uri, 'vscode-node-modules'));
					} catch (_e) {
					}
				}
			}
			return s && new Date(s.mtime);
		},
		deleteFile(path: string): void {
			logger.logVerbose('fs.deleteFile', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.delete(pathMapper.toResource(path));
			} catch (error) {
				logger.logNormal('Error fs.deleteFile', { path, error: error + '' });
			}
		},
		createHash: generateDjb2Hash,
		/** This must be cryptographically secure.
			The browser implementation, crypto.subtle.digest, is async so not possible to call from tsserver. */
		createSHA256Hash: undefined,
		exit: exit,
		realpath,
		base64decode: input => Buffer.from(input, 'base64').toString('utf8'),
		base64encode: input => Buffer.from(input).toString('base64'),
	};

	// For module resolution only. `node_modules` is also automatically mapped
	// as if all node_modules-like paths are symlinked.
	function realpath(path: string): string {
		if (path.startsWith('/^/')) {
			// In memory file. No mapping needed
			return path;
		}

		const isNm = looksLikeNodeModules(path) && !path.startsWith('/vscode-global-typings/');
		// skip paths without .. or ./ or /. And things that look like node_modules
		if (!isNm && !path.match(/\.\.|\/\.|\.\//)) {
			return path;
		}

		let uri: URI;
		try {
			uri = pathMapper.toResource(path);
		} catch {
			return path;
		}

		if (isNm) {
			uri = mapUri(uri, 'vscode-node-modules');
		}
		const out = [uri.scheme];
		if (uri.authority) { out.push(uri.authority); }
		for (const part of uri.path.split('/')) {
			switch (part) {
				case '':
				case '.':
					break;
				case '..':
					//delete if there is something there to delete
					out.pop();
					break;
				default:
					out.push(part);
			}
		}
		return '/' + out.join('/');
	}

	function getAccessibleFileSystemEntries(path: string): { files: readonly string[]; directories: readonly string[] } {
		if (!fs) {
			throw new Error('not supported');
		}

		const uri = pathMapper.toResource(path || '.');
		let entries: [string, FileType][] = [];
		const files: string[] = [];
		const directories: string[] = [];
		try {
			entries = fs.readDirectory(uri);
		} catch (_e) {
			try {
				entries = fs.readDirectory(mapUri(uri, 'vscode-node-modules'));
			} catch (_e) {
			}
		}
		for (const [entry, type] of entries) {
			// This is necessary because on some file system node fails to exclude
			// '.' and '..'. See https://github.com/nodejs/node/issues/4002
			if (entry === '.' || entry === '..') {
				continue;
			}

			if (type === FileType.File) {
				files.push(entry);
			}
			else if (type === FileType.Directory) {
				directories.push(entry);
			}
		}
		files.sort();
		directories.sort();
		return { files, directories };
	}
}

export async function createSys(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	args: readonly string[],
	fsPort: MessagePort,
	logger: Logger,
	watchManager: FileWatcherManager,
	pathMapper: PathMapper,
	onExit: () => void,
) {
	if (hasArgument(args, '--enableProjectWideIntelliSenseOnWeb')) {
		const enabledExperimentalTypeAcquisition = hasArgument(args, '--experimentalTypeAcquisition');
		const connection = new ClientConnection<Requests>(fsPort);
		await connection.serviceReady();

		const apiClient = new ApiClient(connection);
		const fs = apiClient.vscode.workspace.fileSystem;
		const sys = createServerHost(ts, logger, apiClient, args, watchManager, pathMapper, enabledExperimentalTypeAcquisition, onExit);
		return { sys, fs };
	} else {
		return { sys: createServerHost(ts, logger, undefined, args, watchManager, pathMapper, false, onExit) };
	}
}

