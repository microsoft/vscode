/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='dom' />
import * as ts from 'typescript/lib/tsserverlibrary';
import { ApiClient/*, Cancellation*/, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { URI } from 'vscode-uri';
// GLOBALS
let watchFiles: Map<string, { path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions }> = new Map();
let watchDirectories: Map<string, { path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions }> = new Map();
// let isCancelled = () => false
let session: WorkerSession | undefined;
// END GLOBALS
// BEGIN misc internals
const indent: (str: string) => string = (ts as any).server.indent;
const setSys: (s: ts.System) => void = (ts as any).setSys;

// End misc internals
// BEGIN webServer/webServer.ts
/**
 * Convert an in-memory path to a simply rooted path.
 * TODO: Eventually we should insert an artificial prefix (perhaps either `scheme` or `authority`) so that we can hang other things
 * off the root like ATA or other things.
 *
 * Find the first ^ anywhere in the path and delete ^/scheme/authority from that position
 */
function fromInMemory(path: string) {
	const i = path.indexOf("^")
	if (i > -1) {
		return path.replace(/\^\/[0-9A-Za-z-]+\/[0-9A-Za-z-]+/, '').replace(/\/\//, '/')
	}
	return path
}
function toInMemory(path: string, scheme: string, authority: string) {
	return `^/${scheme}/${authority}${path}`
}
function translateRequest(message: {}) {
	if ("command" in message) {
		let msg
		switch (message.command) {
			case "updateOpen":
				msg = message as ts.server.protocol.UpdateOpenRequest;
				msg.arguments.changedFiles?.forEach(f => f.fileName = fromInMemory(f.fileName));
				msg.arguments.openFiles?.forEach(f => f.file = fromInMemory(f.file));
				if (msg.arguments.closedFiles) {
					msg.arguments.closedFiles = msg.arguments.closedFiles.map(fromInMemory);
				}
				break;
			case "navtree":
				msg = message as ts.server.protocol.NavTreeRequest;
				msg.arguments.file = fromInMemory(msg.arguments.file);
				break;
			case "geterr":
				msg = message as ts.server.protocol.GeterrRequest;
				msg.arguments.files = msg.arguments.files.map(fromInMemory);
				break;
			case "getOutliningSpans":
			case "configure":
			case "quickinfo":
			case "completionInfo":
			case "projectInfo":
			case "getApplicableRefactors":
			case "encodedSemanticClassifications-full":
			case "getCodeFixes":
				msg = message as ts.server.protocol.FileRequest;
				if (msg.arguments.file)
					msg.arguments.file = fromInMemory(msg.arguments.file);
				break;
		}
	}
	return message
}
function translateResponse(message: ts.server.protocol.Message) {
	let msg
	if (message.type === 'event') {
		msg = message as ts.server.protocol.Event;
		switch (msg.event) {
			case "projectLoadingStart":
			case "projectLoadingFinish":
				msg.body.projectName = toInMemory(msg.body.projectName, 'vscode-test-web', 'mount')
				break;
			case "configFileDiag":
				msg.body.triggerFile = toInMemory(msg.body.triggerFile, 'vscode-test-web', 'mount')
				msg.body.configFile = toInMemory(msg.body.configFile, 'vscode-test-web', 'mount')
				break;
			case "syntaxDiag":
			case "semanticDiag":
			case "suggestionDiag":
				msg.body.file = toInMemory(msg.body.file, 'vscode-test-web', 'mount')
				break;

		}
		if (msg.event === 'projectLoadingStart' || msg.event === 'projectLoadingFinish') {
		}
	}

}
function createServerHost(logger: ts.server.Logger & ((x: any) => void), apiClient: ApiClient, args: string[]): ts.server.ServerHost {
	const scheme = apiClient.vscode.workspace.workspaceFolders[0].uri.scheme
	// TODO: Now see which uses of vfsroot need to become serverroot
	const root = apiClient.vscode.workspace.workspaceFolders[0].uri.path
	const fs = apiClient.vscode.workspace.fileSystem
	logger.info(`starting serverhost with scheme ${scheme} and root ${root}`)
	return {
		/**
		 * @param pollingInterval ignored in native filewatchers; only used in polling watchers
		 */
		watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
			const p = fromInMemory(path)
			logger.info(`calling watchFile on ${path} (${p}) (${watchFiles.has(p) ? 'OLD' : 'new'})`)
			watchFiles.set(p, { path: p, callback, pollingInterval, options })
			return {
				close() {
					watchFiles.delete(path)
				}
			}
		},
		watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
			const p = fromInMemory(path)
			logger.info(`calling watchDirectory on ${path} (${p}) (${watchDirectories.has(p) ? 'OLD' : 'new'})`)
			watchDirectories.set(path, { path: p, callback, recursive, options })
			return {
				close() {
					watchDirectories.delete(path)
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
				const bytes = fs.readFile(URI.from({ scheme, path: fromInMemory(path) }))
				return new TextDecoder().decode(new Uint8Array(bytes).slice()) // TODO: Not sure why `bytes.slice()` isn't as good as `new Uint8Array(bytes).slice()`
				// (common/connection.ts says that Uint8Array is only a view on the bytes which could change, which is why the slice exists)
			}
			catch (e) {
				logger.info(`Error fs.readFile`)
				logger(e)
				return undefined
			}
		},
		getFileSize(path) {
			try {
				logger.info('calling getFileSize on ' + path)
				return fs.stat(URI.from({ scheme, path })).size
			}
			catch (e) {
				logger.info(`Error fs.getFileSize`)
				logger(e)
				return -1 // TODO: Find out what the failure return value is in the normal host.
			}
		},
		writeFile(path, data) {
			try {
				logger.info('calling writeFile on ' + path)
				fs.writeFile(URI.from({ scheme, path }), new TextEncoder().encode(data))
			}
			catch (e) {
				logger.info(`Error fs.writeFile`)
				logger(e)
			}
		},
		/** If TS' webServer/webServer.ts is good enough to copy here, this is just identity */
		resolvePath(path: string): string {
			logger.info('calling resolvePath on ' + path)
			return path
		},
		fileExists(path: string): boolean {
			try {
				logger.info(`calling fileExists on ${path} (as ${URI.from({ scheme, path: fromInMemory(path) })})`)
				// TODO: FileType.File might be correct! (need to learn about vscode's FileSystem.stat)
				return fs.stat(URI.from({ scheme, path: fromInMemory(path) })).type === FileType.File
			}
			catch (e) {
				logger.info(`Error fs.fileExists for ${path}`)
				logger(e)
				return false
			}
		},
		directoryExists(path: string): boolean {
			try {
				logger.info(`calling directoryExists on ${path} (as ${URI.from({ scheme, path: fromInMemory(path) })})`)
				// TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
				return fs.stat(URI.from({ scheme, path: fromInMemory(path) })).type === FileType.Directory
			}
			catch (e) {
				logger.info(`Error fs.directoryExists for ${path}`)
				logger(e)
				return false
			}
		},
		createDirectory(path: string): void {
			try {
				logger.info(`calling createDirectory on ${path} (as ${URI.from({ scheme, path: fromInMemory(path) })})`)
				// TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
				fs.createDirectory(URI.from({ scheme, path: fromInMemory(path) }))
			}
			catch (e) {
				logger.info(`Error fs.createDirectory`)
				logger(e)
			}
		},
		getExecutingFilePath(): string {
			logger.info('calling getExecutingFilePath')
			return root // TODO: Might be correct!
		},
		getCurrentDirectory(): string {
			logger.info('calling getCurrentDirectory')
			return root // TODO: Might be correct!
		},
		getDirectories(path: string): string[] {
			try {
				logger.info('calling getDirectories on ' + path)
				const entries = fs.readDirectory(URI.from({ scheme, path }))
				return entries.filter(([_, type]) => type === FileType.Directory).map(([f, _]) => f)
			}
			catch (e) {
				logger.info(`Error fs.getDirectory`)
				logger(e)
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
				const entries = fs.readDirectory(URI.from({ scheme, path }))
				return entries
					.filter(([f, type]) => type === FileType.File && (!extensions || extensions.some(ext => f.endsWith(ext))) && (!exclude || !exclude.includes(f)))
					.map(([e, _]) => e)
			}
			catch (e) {
				logger.info(`Error fs.readDirectory`)
				logger(e)
				return []
			}
		},
		getModifiedTime(path: string): Date | undefined {
			try {
				logger.info('calling getModifiedTime on ' + path)
				return new Date(fs.stat(URI.from({ scheme, path })).mtime)
			}
			catch (e) {
				logger.info(`Error fs.getModifiedTime`)
				logger(e)
				return undefined
			}
		},
		setModifiedTime(path: string): void {
			logger.info('calling setModifiedTime on ' + path)
			// But I don't have any idea of how to set the modified time to an arbitrary date!
		},
		deleteFile(path: string): void {
			const uri = URI.from({ scheme, path })
			try {
				logger.info(`calling deleteFile on ${uri}`)
				fs.delete(uri)
			}
			catch (e) {
				logger.info(`Error fs.deleteFile`)
				logger(e)
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
		/** webServer comments this out and says "module resolution, symlinks"
		 * I don't think we support symlinks yet but module resolution should work */
		realpath(path: string): string {
			const parts = [...root.split('/'), ...fromInMemory(path).split('/')]
			const out = []
			for (const part of parts) {
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
			logger.info(`realpath: resolved ${path} (${fromInMemory(path)}) to ${'/' + out.join('/')}`)
			return '/' + out.join('/')
		},
		// clearScreen?(): void { },
		// base64decode?(input: string): string {},
		// base64encode?(input: string): string {},
	}
}

function createWebSystem(connection: ClientConnection<Requests>, logger: ts.server.Logger & ((x: any) => void)) {
	logger.info("in createWebSystem")
	const sys = createServerHost(logger, new ApiClient(connection), [])
	setSys(sys)
	logger.info("finished creating web system")
	return sys
}

// TODO: Cancellation next
// const woo: ts.server.ServerCancellationToken = {
//	 // TODO: Figure out what these are for
//	 setRequest(requestId: number) {
//	 },
//	 resetRequest(requestId: number)  {
//	 },
//	 isCancellationRequested(): boolean {
//		 return isCancelled()
//	 }
// }

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
	constructor(
		host: ts.server.ServerHost,
		options: StartSessionOptions,
		logger: ts.server.Logger,
		cancellationToken: ts.server.ServerCancellationToken,
		hrtime: ts.server.SessionOptions["hrtime"]
	) {
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
		this.logger.info('done constructing WorkerSession')
	}
	public override send(msg: ts.server.protocol.Message) {
		// TODO: Translate paths *back* to ^/scheme/authority/ format.. actually this should be easy.
		translateResponse(msg)
		if (msg.type === "event" && !this.canUseEvents) {
			if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
				this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
			}
			return;
		}
		if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
			this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
		}
		postMessage(msg);
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
	// TODO: Unused right now, but maybe someday
	listen(port: MessagePort) {
		this.logger.info('SHOULD BE UNUSED: starting to listen for messages on "message"...')
		port.addEventListener("message", (message: any) => {
			this.logger.info(`host msg: ${JSON.stringify(message.data)}`)
			this.onMessage(message.data);
		});
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

function startSession(options: StartSessionOptions, connection: ClientConnection<Requests>, logger: ts.server.Logger & ((x: any) => void), cancellationToken: ts.server.ServerCancellationToken) {
	session = new WorkerSession(createWebSystem(connection, logger), options, logger, cancellationToken, hrtime)
}
// END tsserver/webServer.ts
// BEGIN tsserver/server.ts
const serverLogger: ts.server.Logger & ((x: any) => void) = (x: any) => postMessage({ type: "log", body: JSON.stringify(x) + '\n' }) as any
serverLogger.close = () => { }
serverLogger.hasLevel = level => level <= ts.server.LogLevel.verbose
serverLogger.loggingEnabled = () => true
serverLogger.perftrc = () => { }
serverLogger.info = s => postMessage({ type: "log", body: s + '\n' })
serverLogger.msg = s => postMessage({ type: "log", body: s + '\n' })
serverLogger.startGroup = () => { }
serverLogger.endGroup = () => { }
serverLogger.getLogFileName = () => "tsserver.log"
function initializeSession(args: string[], platform: string, connection: ClientConnection<Requests>): void {
	// webServer.ts
	// getWebPath
	// ScriptInfo.ts:isDynamicFilename <-- better predicate than trimHat
	const cancellationToken = ts.server.nullCancellationToken // TODO: Switch to real cancellation when it's ready
	const serverMode = ts.LanguageServiceMode.Semantic
	const unknownServerMode = undefined
	serverLogger.info(`Starting TS Server`);
	serverLogger.info(`Version: 0.0.0`);
	serverLogger.info(`Arguments: ${args.join(" ")}`);
	serverLogger.info(`Platform: ${platform} CaseSensitive: true`);
	serverLogger.info(`ServerMode: ${serverMode} syntaxOnly: false hasUnknownServerMode: ${unknownServerMode}`);
	startSession({
		globalPlugins: findArgumentStringArray(args, "--globalPlugins"),
		pluginProbeLocations: findArgumentStringArray(args, "--pluginProbeLocations"),
		allowLocalPluginLoads: hasArgument(args, "--allowLocalPluginLoads"),
		useSingleInferredProject: hasArgument(args, "--useSingleInferredProject"),
		useInferredProjectPerProjectRoot: hasArgument(args, "--useInferredProjectPerProjectRoot"),
		suppressDiagnosticEvents: hasArgument(args, "--suppressDiagnosticEvents"),
		noGetErrOnBackgroundUpdate: hasArgument(args, "--noGetErrOnBackgroundUpdate"),
		syntaxOnly: false,
		serverMode
	},
		connection,
		serverLogger,
		cancellationToken);
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
function callWatcher(event: "create" | "change" | "delete", path: string, logger: ts.server.Logger) {
	logger.info(`checking for watch on ${path}: event=${event}`)
	const kind = event === 'create' ? ts.FileWatcherEventKind.Created
		: event === 'change' ? ts.FileWatcherEventKind.Changed
			: event === 'delete' ? ts.FileWatcherEventKind.Deleted
				: ts.FileWatcherEventKind.Changed;
	if (watchFiles.has(path)) {
		logger.info("file watcher found for " + path)
		watchFiles.get(path)!.callback(path, kind) // TODO: Might need to have first arg be watchFiles.get(path).path
	}
	for (const watch of Array.from(watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
		logger.info(`directory watcher on ${watch} found for ${path}`)
		watchDirectories.get(watch)!.callback(path)
	}
}
// Get args from first message
let init: Promise<any> | undefined;
const listener = async (e: any) => {
	if (!init) {
		if ('args' in e.data && 'port' in e.data) {
			const connection = new ClientConnection<Requests>(e.data.port);
			init = connection.serviceReady().then(() => initializeSession(e.data.args, "web-sync-api", connection))
		}
		else {
			console.error('init message not yet received, got ' + JSON.stringify(e.data))
		}
		return
	}
	await init // TODO: Not strictly necessary since I can check session instead
	// TODO: Instead of reusing this listener and passing its messages on to session.onMessage, I could receive another port in the setup message
	// and close removeEventListener on this listener
	if (!!session) {
		if (e.data.type === 'watch') {
			// call watcher
			callWatcher(e.data.event, e.data.path, serverLogger)
		}
		else {
			// isCancelled = Cancellation.retrieveCheck(e);
			session.onMessage(translateRequest(e.data))
		}
	}
	else {
		console.error('Init is done, but session is not available yet')
	}

};
addEventListener('message', listener);
// END tsserver/server.ts
