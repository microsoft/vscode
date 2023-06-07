/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='webworker' />

import * as ts from 'typescript/lib/tsserverlibrary';
import { ApiClient, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { URI } from 'vscode-uri';

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
	const kind = event === 'create' ? ts.FileWatcherEventKind.Created
		: event === 'change' ? ts.FileWatcherEventKind.Changed
			: event === 'delete' ? ts.FileWatcherEventKind.Deleted
				: ts.FileWatcherEventKind.Changed;
	const path = fromResource(extensionUri, uri);
	if (watchFiles.has(path)) {
		watchFiles.get(path)!.callback(path, kind);
		return;
	}
	let found = false;
	for (const watch of Array.from(watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
		watchDirectories.get(watch)!.callback(path);
		found = true;
	}
	if (!found) {
		console.error(`no watcher found for ${path}`);
	}
}

type ServerHostWithImport = ts.server.ServerHost & { importPlugin(root: string, moduleName: string): Promise<ts.server.ModuleImportResult> };

function createServerHost(extensionUri: URI, logger: ts.server.Logger, apiClient: ApiClient | undefined, args: string[], fsWatcher: MessagePort): ServerHostWithImport {
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
	// Later we could map ^memfs:/ to do something special if we want to enable more functionality like module resolution or something like that
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

			logVerbose('fs.watchFile', { path });

			let uri: URI;
			try {
				uri = toResource(path);
			} catch (e) {
				console.error(e);
				return noopWatcher;
			}

			watchFiles.set(path, { path, callback, pollingInterval, options });
			watchId++;
			fsWatcher.postMessage({ type: 'watchFile', uri, id: watchId });
			return {
				close() {
					logVerbose('fs.watchFile.close', { path });

					watchFiles.delete(path);
					fsWatcher.postMessage({ type: 'dispose', id: watchId });
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
			watchId++;
			fsWatcher.postMessage({ type: 'watchDirectory', recursive, uri, id: watchId });
			return {
				close() {
					logVerbose('fs.watchDirectory.close', { path });

					watchDirectories.delete(path);
					fsWatcher.postMessage({ type: 'dispose', id: watchId });
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

			try {
				// We need to slice the bytes since we can't pass a shared array to text decoder
				const contents = fs.readFile(toResource(path)).slice();
				return textDecoder.decode(contents);
			} catch (error) {
				logNormal('Error fs.readFile', { path, error: error + '' });
				return undefined;
			}
		},
		getFileSize(path) {
			logVerbose('fs.getFileSize', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			try {
				return fs.stat(toResource(path)).size;
			} catch (error) {
				logNormal('Error fs.getFileSize', { path, error: error + '' });
				return 0;
			}
		},
		writeFile(path, data, writeByteOrderMark) {
			logVerbose('fs.writeFile', { path });

			if (!fs) {
				throw new Error('not supported');
			}

			if (writeByteOrderMark) {
				data = byteOrderMarkIndicator + data;
			}

			try {
				fs.writeFile(toResource(path), textEncoder.encode(data));
			} catch (error) {
				logNormal('Error fs.writeFile', { path, error: error + '' });
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

			try {
				return fs.stat(toResource(path)).type === FileType.File;
			} catch (error) {
				logNormal('Error fs.fileExists', { path, error: error + '' });
				return false;
			}
		},
		directoryExists(path: string): boolean {
			logVerbose('fs.directoryExists', { path });

			if (!fs) {
				return false;
			}

			try {
				return fs.stat(toResource(path)).type === FileType.Directory;
			} catch (error) {
				logNormal('Error fs.directoryExists', { path, error: error + '' });
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

			try {
				return new Date(fs.stat(toResource(path)).mtime);
			} catch (error) {
				logNormal('Error fs.getModifiedTime', { path, error: error + '' });
				return undefined;
			}
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

	/** For module resolution only; symlinks aren't supported yet. */
	function realpath(path: string): string {
		// skip paths without .. or ./ or /.
		if (!path.match(/\.\.|\/\.|\.\//)) {
			return path;
		}
		const uri = toResource(path);
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

		try {
			const uri = toResource(path || '.');
			const entries = fs.readDirectory(uri);
			const files: string[] = [];
			const directories: string[] = [];
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
		} catch (e) {
			return { files: [], directories: [] };
		}
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
			throw new Error(`Could not read file outside of project root ${filepath}`);
		}

		return uri;
	}
}

function looksLikeLibDtsPath(filepath: string) {
	return filepath.startsWith('/lib.') && filepath.endsWith('.d.ts');
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
	globalPlugins: ts.server.SessionOptions['globalPlugins'];
	pluginProbeLocations: ts.server.SessionOptions['pluginProbeLocations'];
	allowLocalPluginLoads: ts.server.SessionOptions['allowLocalPluginLoads'];
	useSingleInferredProject: ts.server.SessionOptions['useSingleInferredProject'];
	useInferredProjectPerProjectRoot: ts.server.SessionOptions['useInferredProjectPerProjectRoot'];
	suppressDiagnosticEvents: ts.server.SessionOptions['suppressDiagnosticEvents'];
	noGetErrOnBackgroundUpdate: ts.server.SessionOptions['noGetErrOnBackgroundUpdate'];
	serverMode: ts.server.SessionOptions['serverMode'];
}

class WorkerSession extends ts.server.Session<{}> {

	readonly wasmCancellationToken: WasmCancellationToken;
	readonly listener: (message: any) => void;

	constructor(
		host: ts.server.ServerHost,
		options: StartSessionOptions,
		public readonly port: MessagePort,
		logger: ts.server.Logger,
		hrtime: ts.server.SessionOptions['hrtime']
	) {
		const cancellationToken = new WasmCancellationToken();
		super({
			host,
			cancellationToken,
			...options,
			typingsInstaller: ts.server.nullTypingsInstaller, // TODO: Someday!
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
	const options = {
		globalPlugins: findArgumentStringArray(args, '--globalPlugins'),
		pluginProbeLocations: findArgumentStringArray(args, '--pluginProbeLocations'),
		allowLocalPluginLoads: hasArgument(args, '--allowLocalPluginLoads'),
		useSingleInferredProject: hasArgument(args, '--useSingleInferredProject'),
		useInferredProjectPerProjectRoot: hasArgument(args, '--useInferredProjectPerProjectRoot'),
		suppressDiagnosticEvents: hasArgument(args, '--suppressDiagnosticEvents'),
		noGetErrOnBackgroundUpdate: hasArgument(args, '--noGetErrOnBackgroundUpdate'),
		serverMode
	};

	let sys: ServerHostWithImport;
	if (hasArgument(args, '--enableProjectWideIntelliSenseOnWeb')) {
		const connection = new ClientConnection<Requests>(ports.sync);
		await connection.serviceReady();

		sys = createServerHost(extensionUri, logger, new ApiClient(connection), args, ports.watcher);
	} else {
		sys = createServerHost(extensionUri, logger, undefined, args, ports.watcher);

	}

	setSys(sys);
	session = new WorkerSession(sys, options, ports.tsserver, logger, hrtime);
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
