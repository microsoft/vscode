/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='dom' />
import * as ts from 'typescript/lib/tsserverlibrary';
import { ApiClient, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { URI } from 'vscode-uri';
// GLOBALS
let watchFiles: Map<string, { path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions }> = new Map();
let watchDirectories: Map<string, { path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions }> = new Map();
let session: WorkerSession | undefined;
// END GLOBALS
// BEGIN misc internals
const indent: (str: string) => string = (ts as any).server.indent;
const setSys: (s: ts.System) => void = (ts as any).setSys;
// End misc internals
// BEGIN webServer/webServer.ts
function fromResource(extensionUri: URI, uri: URI) {
	if (uri.scheme === extensionUri.scheme && uri.authority === extensionUri.authority && uri.path.startsWith(extensionUri.path + '/dist/browser/typescript/lib.') && uri.path.endsWith('.d.ts')) {
		return uri.path
	}
	return `/${uri.scheme}/${uri.authority}${uri.path}`
}
function createServerHost(extensionUri: URI, logger: ts.server.Logger, apiClient: ApiClient, args: string[], fsWatcher: MessagePort): ts.server.ServerHost {
	/**
	 * Copied from toResource in typescriptServiceClient.ts
	 */
	function toResource(filepath: string) {
		if (filepath.startsWith('/lib.') && filepath.endsWith('.d.ts')) {
			return URI.from({
				scheme: extensionUri.scheme,
				authority: extensionUri.authority,
				path: extensionUri.path + '/dist/browser/typescript/' + filepath.slice(1)
			})
		}
		const parts = filepath.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
		if (!parts) {
			throw new Error("complex regex failed to match " + filepath)
		}
		return URI.parse(parts[1] + '://' + (parts[2] === 'ts-nul-authority' ? '' : parts[2]) + (parts[3] ? '/' + parts[3] : ''));
	}
	const fs = apiClient.vscode.workspace.fileSystem
	// TODO: Remove all this logging when I'm confident it's working
	logger.info(`starting serverhost`)
	return {
		/**
		 * @param pollingInterval ignored in native filewatchers; only used in polling watchers
		 */
		watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
			logger.info(`calling watchFile on ${path} (${watchFiles.has(path) ? 'OLD' : 'new'})`)
			watchFiles.set(path, { path, callback, pollingInterval, options })
			const uri = toResource(path)
			fsWatcher.postMessage({ type: 'watchFile', uri })
			return {
				close() {
					watchFiles.delete(path)
					fsWatcher.postMessage({ type: "dispose", uri })
				}
			}
		},
		watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
			logger.info(`calling watchDirectory on ${path} (${watchDirectories.has(path) ? 'OLD' : 'new'})`)
			watchDirectories.set(path, { path, callback, recursive, options })
			const uri = toResource(path)
			fsWatcher.postMessage({ type: 'watchDirectory', recursive, uri })
			return {
				close() {
					watchDirectories.delete(path)
					fsWatcher.postMessage({ type: "dispose", uri })
				}
			}
		},
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
			const timeoutId = setTimeout(callback, ms, ...args)
			logger.info(`calling setTimeout, got ${timeoutId}`)
			return timeoutId
		},
		clearTimeout(timeoutId: any): void {
			logger.info(`calling clearTimeout on ${timeoutId}`)
			clearTimeout(timeoutId)
		},
		/** MDN gives a few ways to emulate setImmediate: https://developer.mozilla.org/en-US/docs/Web/API/Window/setImmediate#notes */
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
			const timeoutId = this.setTimeout(callback, 0, ...args)
			logger.info(`calling setImmediate, got ${timeoutId}`)
			return timeoutId
		},
		clearImmediate(timeoutId: any): void {
			logger.info(`calling clearImmediate on ${timeoutId}`)
			// clearImmediate(timeoutId)
			this.clearTimeout(timeoutId)
		},
		// gc?(): void {}, // afaict this isn't available in the browser
		trace: logger.info,
		// require?(initialPath: string, moduleName: string): ModuleImportResult {},
		// TODO: This definitely needs to be imlemented
		// importServicePlugin?(root: string, moduleName: string): Promise<ModuleImportResult> {},
		// System
		args,
		newLine: '\n',
		useCaseSensitiveFileNames: true,
		write: apiClient.vscode.terminal.write, // TODO: MAYBE
		writeOutputIsTTY(): boolean { return true }, // TODO: Maybe
		// getWidthOfTerminal?(): number {},
		readFile(path) {
			try {
				logger.info('calling readFile on ' + path)
				const bytes = fs.readFile(toResource(path))
				return new TextDecoder().decode(new Uint8Array(bytes).slice())
				// (common/connection.ts says that Uint8Array is only a view on the bytes which could change, which is why the slice exists)
			}
			catch (e) {
				logger.info(`Error fs.readFile`)
				logger.info(JSON.stringify(e))
				return undefined
			}
		},
		getFileSize(path) {
			try {
				logger.info('calling getFileSize on ' + path)
				return fs.stat(toResource(path)).size
			}
			catch (e) {
				logger.info(`Error fs.getFileSize`)
				logger.info(JSON.stringify(e))
				return -1 // TODO: Find out what the failure return value is in the normal host.
			}
		},
		writeFile(path, data) {
			try {
				logger.info('calling writeFile on ' + path)
				fs.writeFile(toResource(path), new TextEncoder().encode(data))
			}
			catch (e) {
				logger.info(`Error fs.writeFile`)
				logger.info(JSON.stringify(e))
			}
		},
		/** If TS' webServer/webServer.ts is good enough to copy here, this is just identity */
		resolvePath(path: string): string {
			logger.info('calling resolvePath on ' + path)
			return path
		},
		fileExists(path: string): boolean {
			try {
				logger.info(`calling fileExists on ${path} (as ${toResource(path)})`)
				// TODO: FileType.File might be correct! (need to learn about vscode's FileSystem.stat)
				return fs.stat(toResource(path)).type === FileType.File
			}
			catch (e) {
				logger.info(`Error fs.fileExists for ${path}`)
				logger.info(JSON.stringify(e))
				return false
			}
		},
		directoryExists(path: string): boolean {
			try {
				logger.info(`calling directoryExists on ${path} (as ${toResource(path)})`)
				// TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
				return fs.stat(toResource(path)).type === FileType.Directory
			}
			catch (e) {
				logger.info(`Error fs.directoryExists for ${path}`)
				logger.info(JSON.stringify(e))
				return false
			}
		},
		createDirectory(path: string): void {
			try {
				logger.info(`calling createDirectory on ${path} (as ${toResource(path)})`)
				// TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
				fs.createDirectory(toResource(path))
			}
			catch (e) {
				logger.info(`Error fs.createDirectory`)
				logger.info(JSON.stringify(e))
			}
		},
		getExecutingFilePath(): string {
			logger.info('calling getExecutingFilePath')
			return '/' // TODO: Might be correct! Or it might be /scheme/authority. Or /typescript. Or /scheme/authority/typescript. Or dist/browser/typescript
		},
		getCurrentDirectory(): string {
			return '/' // TODO: Might still need to be /scheme/authority
		},
		getDirectories(path: string): string[] {
			try {
				logger.info('calling getDirectories on ' + path)
				const entries = fs.readDirectory(toResource(path))
				return entries.filter(([_, type]) => type === FileType.Directory).map(([f, _]) => f)
			}
			catch (e) {
				logger.info(`Error fs.getDirectory`)
				logger.info(JSON.stringify(e))
				return []
			}
		},
		/**
		 * TODO: A lot of this code is made-up and should be copied from a known-good implementation
		 * For example, I have NO idea how to easily support `depth`
		 * Note: webServer.ts comments say this is used for configured project and typing installer.
		 */
		readDirectory(path: string, extensions?: readonly string[], exclude?: readonly string[]): string[] {
			try {
				logger.info('calling readDirectory on ' + path)
				const entries = fs.readDirectory(toResource(path))
				return entries
					.filter(([f, type]) => type === FileType.File && (!extensions || extensions.some(ext => f.endsWith(ext))) && (!exclude || !exclude.includes(f)))
					.map(([e, _]) => e)
			}
			catch (e) {
				logger.info(`Error fs.readDirectory`)
				logger.info(JSON.stringify(e))
				return []
			}
		},
		getModifiedTime(path: string): Date | undefined {
			try {
				logger.info('calling getModifiedTime on ' + path)
				return new Date(fs.stat(toResource(path)).mtime)
			}
			catch (e) {
				logger.info(`Error fs.getModifiedTime`)
				logger.info(JSON.stringify(e))
				return undefined
			}
		},
		deleteFile(path: string): void {
			const uri = toResource(path)
			try {
				logger.info(`calling deleteFile on ${uri}`)
				fs.delete(uri)
			}
			catch (e) {
				logger.info(`Error fs.deleteFile`)
				logger.info(JSON.stringify(e))
			}
		},
		/**
		 * A good implementation is node.js' `crypto.createHash`. (https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm)
		 */
		// createHash?(data: string): string {},
		/** This must be cryptographically secure. Only implement this method using `crypto.createHash("sha256")`. */
		// createSHA256Hash?(data: string): string { },
		// getMemoryUsage?(): number {},
		exit(exitCode?: number): void {
			logger.info("EXCITING!" + exitCode)
			removeEventListener("message", listener) // TODO: Not sure this is right (and there might be other cleanup)
		},
		/** For module resolution only; symlinks aren't supported yet. */
		realpath(path: string): string {
			// skip paths without .. or ./ or /.
			if (!path.match(/\.\.|\/\.|\.\//)) {
				return path
			}
			const uri = toResource(path)
			const out = [uri.scheme]
			if (uri.authority)
				out.push(uri.authority)
			for (const part of uri.path.split('/')) {
				switch (part) {
					case '':
					case '.':
						break;
					case '..':
						//delete if there is something there to delete
						out.pop()
						break;
					default:
						out.push(part)
				}
			}
			logger.info(`realpath: resolved ${path} to ${'/' + out.join('/')}`)
			return '/' + out.join('/')
		},
		// clearScreen?(): void { },
		// base64decode?(input: string): string {},
		// base64encode?(input: string): string {},
	}
}

function createWebSystem(extensionUri: URI, connection: ClientConnection<Requests>, logger: ts.server.Logger, fsWatcher: MessagePort) {
	logger.info("in createWebSystem")
	// TODO: Why is args empty?
	const sys = createServerHost(extensionUri, logger, new ApiClient(connection), [], fsWatcher)
	setSys(sys)
	logger.info("finished creating web system")
	return sys
}

class WasmCancellationToken implements ts.server.ServerCancellationToken {
	shouldCancel: (() => boolean) | undefined
	currentRequestId: number | undefined = undefined
	setRequest(requestId: number) {
		this.currentRequestId = requestId
	}
	resetRequest(requestId: number) {
		if (requestId === this.currentRequestId) {
			this.currentRequestId = undefined
		}
		else {
			throw new Error(`Mismatched request id, expected ${this.currentRequestId} but got ${requestId}`)
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
	syntaxOnly: ts.server.SessionOptions['syntaxOnly'];
	serverMode: ts.server.SessionOptions['serverMode'];
}
class WorkerSession extends ts.server.Session<{}> {
	wasmCancellationToken: WasmCancellationToken
	constructor(
		host: ts.server.ServerHost,
		options: StartSessionOptions,
		public port: MessagePort,
		logger: ts.server.Logger,
		hrtime: ts.server.SessionOptions["hrtime"]
	) {
		const cancellationToken = new WasmCancellationToken()
		super({
			host,
			cancellationToken,
			...options,
			typingsInstaller: ts.server.nullTypingsInstaller, // TODO: Someday!
			byteLength: () => { throw new Error("Not implemented") }, // Formats the message text in send of Session which is overriden in this class so not needed
			hrtime,
			logger,
			canUseEvents: true,
		});
		this.wasmCancellationToken = cancellationToken
		this.logger.info('done constructing WorkerSession')
	}
	public override send(msg: ts.server.protocol.Message) {
		if (msg.type === "event" && !this.canUseEvents) {
			if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
				this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
			}
			return;
		}
		if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
			this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
		}
		this.port.postMessage(msg)
	}
	protected override parseMessage(message: {}): ts.server.protocol.Request {
		return message as ts.server.protocol.Request;
	}
	protected override toStringMessage(message: {}) {
		return JSON.stringify(message, undefined, 2);
	}
	override exit() {
		this.logger.info("Exiting...");
		this.projectService.closeLog();
		close();
	}
	listen(port: MessagePort) {
		this.logger.info('webServer.ts: tsserver starting to listen for messages on "message"...')
		port.onmessage = (message: any) => {

			// TODO: Is this still needed?
			// TEMP fix since Cancellation.retrieveCheck is not correct
			function retrieveCheck2(data: any) {
				if (!(data.$cancellationData instanceof SharedArrayBuffer)) {
					return () => false;
				}
				const typedArray = new Int32Array(data.$cancellationData, 0, 1);
				return () => {
					return Atomics.load(typedArray, 0) === 1;
				};
			}

			const shouldCancel = retrieveCheck2(message.data)
			if (shouldCancel) {
				this.wasmCancellationToken.shouldCancel = shouldCancel;
			}
			this.onMessage(message.data)
		};
	}
}
// END webServer/webServer.ts
// BEGIN tsserver/webServer.ts
function hrtime(previous?: number[]) {
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

function startSession(options: StartSessionOptions, extensionUri: URI, tsserver: MessagePort, connection: ClientConnection<Requests>, logger: ts.server.Logger, fsWatcher: MessagePort) {
	session = new WorkerSession(createWebSystem(extensionUri, connection, logger, fsWatcher), options, tsserver, logger, hrtime)
	session.listen(tsserver)
}
// END tsserver/webServer.ts
// BEGIN tsserver/nodeServer.ts
function parseServerMode(args: string[]): ts.LanguageServiceMode | string | undefined {
	const mode = findArgument(args, "--serverMode");
	if (!mode) return undefined;

	switch (mode.toLowerCase()) {
		case "semantic":
			return ts.LanguageServiceMode.Semantic;
		case "partialsemantic":
			return ts.LanguageServiceMode.PartialSemantic;
		case "syntactic":
			return ts.LanguageServiceMode.Syntactic;
		default:
			return mode;
	}
}
// END tsserver/nodeServer.ts
// BEGIN tsserver/server.ts
function initializeSession(args: string[], extensionUri: URI, platform: string, tsserver: MessagePort, connection: ClientConnection<Requests>, logger: ts.server.Logger, fsWatcher: MessagePort): void {
	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === "number" ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === "string" ? modeOrUnknown : undefined;
	const syntaxOnly = hasArgument(args, "--syntaxOnly");
	logger.info(`Starting TS Server`);
	logger.info(`Version: 0.0.0`);
	logger.info(`Arguments: ${args.join(" ")}`);
	logger.info(`Platform: ${platform} CaseSensitive: true`);
	logger.info(`ServerMode: ${serverMode} syntaxOnly: ${syntaxOnly} unknownServerMode: ${unknownServerMode}`);
	startSession({
		globalPlugins: findArgumentStringArray(args, "--globalPlugins"),
		pluginProbeLocations: findArgumentStringArray(args, "--pluginProbeLocations"),
		allowLocalPluginLoads: hasArgument(args, "--allowLocalPluginLoads"),
		useSingleInferredProject: hasArgument(args, "--useSingleInferredProject"),
		useInferredProjectPerProjectRoot: hasArgument(args, "--useInferredProjectPerProjectRoot"),
		suppressDiagnosticEvents: hasArgument(args, "--suppressDiagnosticEvents"),
		noGetErrOnBackgroundUpdate: hasArgument(args, "--noGetErrOnBackgroundUpdate"),
		syntaxOnly,
		serverMode
	},
		extensionUri,
		tsserver,
		connection,
		logger,
		fsWatcher);
}
function findArgumentStringArray(args: readonly string[], name: string): readonly string[] {
	const arg = findArgument(args, name)
	return arg === undefined ? [] : arg.split(",").filter(name => name !== "");
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
function updateWatch(event: "create" | "change" | "delete", uri: URI, extensionUri: URI, logger: ts.server.Logger) {
	// TODO: Commit this, then roll it back and test file watches using the old way
	// 1. creating watches seem to use the correct paths, BUT file watches never fire
	logger.info(`checking for watch on ${uri.toString()}: event=${event}`)
	const kind = event === 'create' ? ts.FileWatcherEventKind.Created
		: event === 'change' ? ts.FileWatcherEventKind.Changed
			: event === 'delete' ? ts.FileWatcherEventKind.Deleted
				: ts.FileWatcherEventKind.Changed;
	const path = fromResource(extensionUri, uri)
	if (watchFiles.has(path)) {
		logger.info("file watcher found for " + path)
		watchFiles.get(path)!.callback(path, kind) // TODO: Might need to have first arg be watchFiles.get(path).path
		return
	}
	let found = false
	for (const watch of Array.from(watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
		logger.info(`directory watcher on ${watch} found for ${path}`)
		watchDirectories.get(watch)!.callback(path)
		found = true
	}
	if (!found) {
		logger.info(`no watcher found for ${path}`)
		console.error(`no watcher found for ${path}`)
	}
}
let initial: Promise<any> | undefined;
const listener = async (e: any) => {
	if (!initial) {
		if ('args' in e.data) {
			const logger: ts.server.Logger = {
				close: () => { },
				hasLevel: level => level <= ts.server.LogLevel.verbose,
				loggingEnabled: () => true,
				perftrc: () => { },
				info: s => postMessage({ type: "log", body: s + '\n' }),
				msg: s => postMessage({ type: "log", body: s + '\n' }),
				startGroup: () => { },
				endGroup: () => { },
				getLogFileName: () => "tsserver.log",
			};
			const [sync, tsserver, watcher] = e.ports as MessagePort[];
			const extensionUri = URI.from(e.data.extensionUri);
			watcher.onmessage = (e: any) => updateWatch(e.data.event, URI.from(e.data.uri), extensionUri, logger);
			const connection = new ClientConnection<Requests>(sync);
			initial = connection.serviceReady().then(() => initializeSession(e.data.args, extensionUri, "vscode-web", tsserver, connection, logger, watcher));
		}
		else {
			console.error('unexpected message in place of initial message: ' + JSON.stringify(e.data));
		}
		return;
	}
	console.error(`unexpected message on main channel: ${JSON.stringify(e)}`)
}
addEventListener('message', listener);
// END tsserver/server.ts
