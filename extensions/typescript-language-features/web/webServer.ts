/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='webworker' />

import { ApiClient, FileStat, FileSystem, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { basename } from 'path';
import * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import WebTypingsInstaller from './typingsInstaller';

// GLOBALS
const watchFiles: Map<string, { path: string; callback: ts.FileWatcherCallback; pollingInterval?: number; options?: ts.WatchOptions }> = new Map();
const watchDirectories: Map<string, { path: string; callback: ts.DirectoryWatcherCallback; recursive?: boolean; options?: ts.WatchOptions }> = new Map();
let session: WorkerSession | undefined;

const projectRootPaths = new Map</* original path*/ string, /* parsed URI */ URI>();

// END GLOBALS
// BEGIN misc internals
const indent: (str: string) => string = (ts as any).server.indent;
const setSys: (s: ts.System) => void = (ts as any).setSys;
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
// End misc internals

function fromResource(extensionUri: URI, uri: URI) {
	if (uri.scheme === extensionUri.scheme
		&& uri.authority === extensionUri.authority
		&& uri.path.startsWith(extensionUri.path + '/dist/browser/typescript/lib.')
		&& uri.path.endsWith('.d.ts')) {
		return uri.path;
	}
	return `/${uri.scheme}/${uri.authority}${uri.path}`;
}

function updateWatch(event: 'create' | 'change' | 'delete', uri: URI, extensionUri: URI) {
	const kind = toTsWatcherKind(event);
	const path = fromResource(extensionUri, uri);

	const fileWatcher = watchFiles.get(path);
	if (fileWatcher) {
		fileWatcher.callback(path, kind);
		return;
	}

	for (const watch of Array.from(watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
		watchDirectories.get(watch)!.callback(path);
		return;
	}

	console.error(`no watcher found for ${path}`);
}

function toTsWatcherKind(event: 'create' | 'change' | 'delete') {
	if (event === 'create') {
		return ts.FileWatcherEventKind.Created;
	} else if (event === 'change') {
		return ts.FileWatcherEventKind.Changed;
	} else if (event === 'delete') {
		return ts.FileWatcherEventKind.Deleted;
	}
	throw new Error(`Unknown event: ${event}`);
}

class AccessOutsideOfRootError extends Error {
	constructor(
		public readonly filepath: string,
		public readonly projectRootPaths: readonly string[]
	) {
		super(`Could not read file outside of project root ${filepath}`);
	}
}

type ServerHostWithImport = ts.server.ServerHost & { importPlugin(root: string, moduleName: string): Promise<ts.server.ModuleImportResult> };

function createServerHost(extensionUri: URI, logger: ts.server.Logger, apiClient: ApiClient | undefined, args: string[], fsWatcher: MessagePort, enabledExperimentalTypeAcquisition: boolean): ServerHostWithImport {
	const currentDirectory = '/';
	const fs = apiClient?.vscode.workspace.fileSystem;
	let watchId = 0;

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

	const log = (level: ts.server.LogLevel, message: string, data?: any) => {
		if (logger.hasLevel(level)) {
			logger.info(message + (data ? ' ' + JSON.stringify(data) : ''));
		}
	};

	const logNormal = log.bind(null, ts.server.LogLevel.normal);
	const logVerbose = log.bind(null, ts.server.LogLevel.verbose);

	const noopWatcher: ts.FileWatcher = { close() { } };
	return {
		watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
			if (looksLikeLibDtsPath(path)) { // We don't support watching lib files on web since they are readonly
				return noopWatcher;
			}

			console.log('watching file:', path);

			logVerbose('fs.watchFile', { path });

			let uri: URI;
			try {
				uri = toResource(path);
			} catch (e) {
				console.error(e);
				return noopWatcher;
			}

			watchFiles.set(path, { path, callback, pollingInterval, options });
			const watchIds = [++watchId];
			fsWatcher.postMessage({ type: 'watchFile', uri: uri, id: watchIds[0] });
			if (enabledExperimentalTypeAcquisition && looksLikeNodeModules(path)) {
				watchIds.push(++watchId);
				fsWatcher.postMessage({ type: 'watchFile', uri: mapUri(uri, 'vscode-node-modules'), id: watchIds[1] });
			}
			return {
				close() {
					logVerbose('fs.watchFile.close', { path });

					watchFiles.delete(path);
					for (const id of watchIds) {
						fsWatcher.postMessage({ type: 'dispose', id });
					}
				}
			};
		},
		watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
			logVerbose('fs.watchDirectory', { path });

			let uri: URI;
			try {
				uri = toResource(path);
			} catch (e) {
				console.error(e);
				return noopWatcher;
			}

			watchDirectories.set(path, { path, callback, recursive, options });
			const watchIds = [++watchId];
			fsWatcher.postMessage({ type: 'watchDirectory', recursive, uri, id: watchId });
			return {
				close() {
					logVerbose('fs.watchDirectory.close', { path });

					watchDirectories.delete(path);
					for (const id of watchIds) {
						fsWatcher.postMessage({ type: 'dispose', id });
					}
				}
			};
		},
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
				const { default: module } = await import(/* webpackIgnore: true */scriptPath);
				return { module, error: undefined };
			} catch (e) {
				return { module: undefined, error: e };
			}
		},
		args,
		newLine: '\n',
		useCaseSensitiveFileNames: true,
		write: s => {
			apiClient?.vscode.terminal.write(s);
		},
		writeOutputIsTTY() {
			return true;
		},
		readFile(path) {
			logVerbose('fs.readFile', { path });

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
				uri = toResource(path);
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
			logVerbose('fs.getFileSize', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			const uri = toResource(path);
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
			logVerbose('fs.writeFile', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			if (writeByteOrderMark) {
				data = byteOrderMarkIndicator + data;
			}

			let uri;
			try {
				uri = toResource(path);
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
			logVerbose('fs.fileExists', { path });

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
				uri = toResource(path);
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
			logVerbose('fs.directoryExists', { path });

			if (!fs) {
				return false;
			}

			let uri;
			try {
				uri = toResource(path);
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
					// TODO: Hack, https "file system" can't actually tell what is a file vs directory
					return stat.type === FileType.File || stat.type === FileType.Directory;
				}

				return stat.type === FileType.Directory;
			} else {
				return false;
			}
		},
		createDirectory(path: string): void {
			logVerbose('fs.createDirectory', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.createDirectory(toResource(path));
			} catch (error) {
				logNormal('Error fs.createDirectory', { path, error: error + '' });
			}
		},
		getExecutingFilePath(): string {
			return currentDirectory;
		},
		getCurrentDirectory(): string {
			return currentDirectory;
		},
		getDirectories(path: string): string[] {
			logVerbose('fs.getDirectories', { path });

			return getAccessibleFileSystemEntries(path).directories.slice();
		},
		readDirectory(path: string, extensions?: readonly string[], excludes?: readonly string[], includes?: readonly string[], depth?: number): string[] {
			logVerbose('fs.readDirectory', { path });

			return matchFiles(path, extensions, excludes, includes, /*useCaseSensitiveFileNames*/ true, currentDirectory, depth, getAccessibleFileSystemEntries, realpath);
		},
		getModifiedTime(path: string): Date | undefined {
			logVerbose('fs.getModifiedTime', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			const uri = toResource(path);
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
			logVerbose('fs.deleteFile', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.delete(toResource(path));
			} catch (error) {
				logNormal('Error fs.deleteFile', { path, error: error + '' });
			}
		},
		createHash: generateDjb2Hash,
		/** This must be cryptographically secure.
			The browser implementation, crypto.subtle.digest, is async so not possible to call from tsserver. */
		createSHA256Hash: undefined,
		exit(): void {
			removeEventListener('message', listener);
		},
		realpath,
		base64decode: input => Buffer.from(input, 'base64').toString('utf8'),
		base64encode: input => Buffer.from(input).toString('base64'),
	};

	// For module resolution only. `node_modules` is also automatically mapped
	// as if all node_modules-like paths are symlinked.
	function realpath(path: string): string {
		const isNm = looksLikeNodeModules(path) && !path.startsWith('/vscode-global-typings/');
		// skip paths without .. or ./ or /. And things that look like node_modules
		if (!isNm && !path.match(/\.\.|\/\.|\.\//)) {
			return path;
		}

		let uri = toResource(path);
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

		const uri = toResource(path || '.');
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

	/**
	 * Copied from toResource in typescriptServiceClient.ts
	 */
	function toResource(filepath: string): URI {
		if (looksLikeLibDtsPath(filepath)) {
			return URI.from({
				scheme: extensionUri.scheme,
				authority: extensionUri.authority,
				path: extensionUri.path + '/dist/browser/typescript/' + filepath.slice(1)
			});
		}

		const uri = filePathToResourceUri(filepath);
		if (!uri) {
			throw new Error(`Could not parse path ${filepath}`);
		}

		// Check if TS is trying to read a file outside of the project root.
		// We allow reading files on unknown scheme as these may be loose files opened by the user.
		// However we block reading files on schemes that are on a known file system with an unknown root
		let allowRead: 'implicit' | 'block' | 'allow' = 'implicit';
		for (const projectRoot of projectRootPaths.values()) {
			if (uri.scheme === projectRoot.scheme) {
				if (uri.toString().startsWith(projectRoot.toString())) {
					allowRead = 'allow';
					break;
				}

				// Tentatively block the read but a future loop may allow it
				allowRead = 'block';
			}
		}

		if (allowRead === 'block') {
			throw new AccessOutsideOfRootError(filepath, Array.from(projectRootPaths.keys()));
		}

		return uri;
	}
}

function looksLikeLibDtsPath(filepath: string) {
	return filepath.startsWith('/lib.') && filepath.endsWith('.d.ts');
}

function looksLikeNodeModules(filepath: string) {
	return filepath.includes('/node_modules');
}

function filePathToResourceUri(filepath: string): URI | undefined {
	const parts = filepath.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
	if (!parts) {
		return undefined;
	}

	const scheme = parts[1];
	const authority = parts[2] === 'ts-nul-authority' ? '' : parts[2];
	const path = parts[3];
	return URI.from({ scheme, authority, path: (path ? '/' + path : path) });
}

class WasmCancellationToken implements ts.server.ServerCancellationToken {
	shouldCancel: (() => boolean) | undefined;
	currentRequestId: number | undefined = undefined;

	setRequest(requestId: number) {
		this.currentRequestId = requestId;
	}

	resetRequest(requestId: number) {
		if (requestId === this.currentRequestId) {
			this.currentRequestId = undefined;
		} else {
			throw new Error(`Mismatched request id, expected ${this.currentRequestId} but got ${requestId}`);
		}
	}

	isCancellationRequested(): boolean {
		return this.currentRequestId !== undefined && !!this.shouldCancel && this.shouldCancel();
	}
}

interface StartSessionOptions {
	readonly globalPlugins: ts.server.SessionOptions['globalPlugins'];
	readonly pluginProbeLocations: ts.server.SessionOptions['pluginProbeLocations'];
	readonly allowLocalPluginLoads: ts.server.SessionOptions['allowLocalPluginLoads'];
	readonly useSingleInferredProject: ts.server.SessionOptions['useSingleInferredProject'];
	readonly useInferredProjectPerProjectRoot: ts.server.SessionOptions['useInferredProjectPerProjectRoot'];
	readonly suppressDiagnosticEvents: ts.server.SessionOptions['suppressDiagnosticEvents'];
	readonly noGetErrOnBackgroundUpdate: ts.server.SessionOptions['noGetErrOnBackgroundUpdate'];
	readonly serverMode: ts.server.SessionOptions['serverMode'];
	readonly disableAutomaticTypingAcquisition: boolean;
}

class WorkerSession extends ts.server.Session<{}> {

	readonly wasmCancellationToken: WasmCancellationToken;
	readonly listener: (message: any) => void;

	constructor(
		host: ts.server.ServerHost,
		fs: FileSystem | undefined,
		options: StartSessionOptions,
		private readonly port: MessagePort,
		logger: ts.server.Logger,
		hrtime: ts.server.SessionOptions['hrtime']
	) {
		const cancellationToken = new WasmCancellationToken();
		const typingsInstaller = options.disableAutomaticTypingAcquisition || !fs ? ts.server.nullTypingsInstaller : new WebTypingsInstaller(host, '/vscode-global-typings/ts-nul-authority/projects');

		super({
			host,
			cancellationToken,
			...options,
			typingsInstaller,
			byteLength: () => { throw new Error('Not implemented'); }, // Formats the message text in send of Session which is overridden in this class so not needed
			hrtime,
			logger,
			canUseEvents: true,
		});
		this.wasmCancellationToken = cancellationToken;

		this.listener = (message: any) => {
			// TEMP fix since Cancellation.retrieveCheck is not correct
			function retrieveCheck2(data: any) {
				if (!globalThis.crossOriginIsolated || !(data.$cancellationData instanceof SharedArrayBuffer)) {
					return () => false;
				}
				const typedArray = new Int32Array(data.$cancellationData, 0, 1);
				return () => {
					return Atomics.load(typedArray, 0) === 1;
				};
			}

			const shouldCancel = retrieveCheck2(message.data);
			if (shouldCancel) {
				this.wasmCancellationToken.shouldCancel = shouldCancel;
			}

			try {
				if (message.data.command === 'updateOpen') {
					const args = message.data.arguments as ts.server.protocol.UpdateOpenRequestArgs;
					for (const open of args.openFiles ?? []) {
						if (open.projectRootPath) {
							const uri = filePathToResourceUri(open.projectRootPath);
							if (uri) {
								projectRootPaths.set(open.projectRootPath, uri);
							}
						}
					}
				}
			} catch {
				// Noop
			}

			this.onMessage(message.data);
		};
	}

	public override send(msg: ts.server.protocol.Message) {
		if (msg.type === 'event' && !this.canUseEvents) {
			if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
				this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
			}
			return;
		}
		if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
			this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
		}
		this.port.postMessage(msg);
	}

	protected override parseMessage(message: {}): ts.server.protocol.Request {
		return message as ts.server.protocol.Request;
	}

	protected override toStringMessage(message: {}) {
		return JSON.stringify(message, undefined, 2);
	}

	override exit() {
		this.logger.info('Exiting...');
		this.port.removeEventListener('message', this.listener);
		this.projectService.closeLog();
		close();
	}

	listen() {
		this.logger.info(`webServer.ts: tsserver starting to listen for messages on 'message'...`);
		this.port.onmessage = this.listener;
	}
}

function parseServerMode(args: string[]): ts.LanguageServiceMode | string | undefined {
	const mode = findArgument(args, '--serverMode');
	if (!mode) { return undefined; }

	switch (mode.toLowerCase()) {
		case 'semantic':
			return ts.LanguageServiceMode.Semantic;
		case 'partialsemantic':
			return ts.LanguageServiceMode.PartialSemantic;
		case 'syntactic':
			return ts.LanguageServiceMode.Syntactic;
		default:
			return mode;
	}
}

function hrtime(previous?: [number, number]): [number, number] {
	const now = self.performance.now() * 1e-3;
	let seconds = Math.floor(now);
	let nanoseconds = Math.floor((now % 1) * 1e9);
	// NOTE: This check is added probably because it's missed without strictFunctionTypes on
	if (previous?.[0] !== undefined && previous?.[1] !== undefined) {
		seconds = seconds - previous[0];
		nanoseconds = nanoseconds - previous[1];
		if (nanoseconds < 0) {
			seconds--;
			nanoseconds += 1e9;
		}
	}
	return [seconds, nanoseconds];
}

function hasArgument(args: readonly string[], name: string): boolean {
	return args.indexOf(name) >= 0;
}

function findArgument(args: readonly string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return 0 <= index && index < args.length - 1
		? args[index + 1]
		: undefined;
}

function findArgumentStringArray(args: readonly string[], name: string): readonly string[] {
	const arg = findArgument(args, name);
	return arg === undefined ? [] : arg.split(',').filter(name => name !== '');
}

async function initializeSession(args: string[], extensionUri: URI, ports: { tsserver: MessagePort; sync: MessagePort; watcher: MessagePort }, logger: ts.server.Logger): Promise<void> {
	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
	logger.info(`Starting TS Server`);
	logger.info(`Version: 0.0.0`);
	logger.info(`Arguments: ${args.join(' ')}`);
	logger.info(`ServerMode: ${serverMode} unknownServerMode: ${unknownServerMode}`);
	const options: StartSessionOptions = {
		globalPlugins: findArgumentStringArray(args, '--globalPlugins'),
		pluginProbeLocations: findArgumentStringArray(args, '--pluginProbeLocations'),
		allowLocalPluginLoads: hasArgument(args, '--allowLocalPluginLoads'),
		useSingleInferredProject: hasArgument(args, '--useSingleInferredProject'),
		useInferredProjectPerProjectRoot: hasArgument(args, '--useInferredProjectPerProjectRoot'),
		suppressDiagnosticEvents: hasArgument(args, '--suppressDiagnosticEvents'),
		noGetErrOnBackgroundUpdate: hasArgument(args, '--noGetErrOnBackgroundUpdate'),
		serverMode,
		disableAutomaticTypingAcquisition: hasArgument(args, '--disableAutomaticTypingAcquisition'),
	};


	let sys: ServerHostWithImport;
	let fs: FileSystem | undefined;
	if (hasArgument(args, '--enableProjectWideIntelliSenseOnWeb')) {
		const enabledExperimentalTypeAcquisition = hasArgument(args, '--experimentalTypeAcquisition');
		const connection = new ClientConnection<Requests>(ports.sync);
		await connection.serviceReady();

		const apiClient = new ApiClient(connection);
		fs = apiClient.vscode.workspace.fileSystem;
		sys = createServerHost(extensionUri, logger, apiClient, args, ports.watcher, enabledExperimentalTypeAcquisition);
	} else {
		sys = createServerHost(extensionUri, logger, undefined, args, ports.watcher, false);
	}

	setSys(sys);
	session = new WorkerSession(sys, fs, options, ports.tsserver, logger, hrtime);
	session.listen();
}

function parseLogLevel(input: string | undefined): ts.server.LogLevel | undefined {
	switch (input) {
		case 'normal': return ts.server.LogLevel.normal;
		case 'terse': return ts.server.LogLevel.terse;
		case 'verbose': return ts.server.LogLevel.verbose;
		default: return undefined;
	}
}

let hasInitialized = false;
const listener = async (e: any) => {
	if (!hasInitialized) {
		hasInitialized = true;
		if ('args' in e.data) {
			const args = e.data.args;

			const logLevel = parseLogLevel(findArgument(args, '--logVerbosity'));
			const doLog = typeof logLevel === 'undefined'
				? (_message: string) => { }
				: (message: string) => { postMessage({ type: 'log', body: message }); };

			const logger: ts.server.Logger = {
				close: () => { },
				hasLevel: level => typeof logLevel === 'undefined' ? false : level <= logLevel,
				loggingEnabled: () => true,
				perftrc: () => { },
				info: doLog,
				msg: doLog,
				startGroup: () => { },
				endGroup: () => { },
				getLogFileName: () => undefined
			};

			const [sync, tsserver, watcher] = e.ports as MessagePort[];
			const extensionUri = URI.from(e.data.extensionUri);
			watcher.onmessage = (e: any) => updateWatch(e.data.event, URI.from(e.data.uri), extensionUri);
			await initializeSession(args, extensionUri, { sync, tsserver, watcher }, logger);
		} else {
			console.error('unexpected message in place of initial message: ' + JSON.stringify(e.data));
		}
		return;
	}
	console.error(`unexpected message on main channel: ${JSON.stringify(e)}`);
};
addEventListener('message', listener);

function mapUri(uri: URI, mappedScheme: string): URI {
	if (uri.scheme === 'vscode-global-typings') {
		throw new Error('can\'t map vscode-global-typings');
	}
	if (!uri.authority) {
		uri = uri.with({ authority: 'ts-nul-authority' });
	}
	uri = uri.with({ scheme: mappedScheme, path: `/${uri.scheme}/${uri.authority || 'ts-nul-authority'}${uri.path}` });

	return uri;
}
