/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='dom' />
import * as ts from 'typescript/lib/tsserverlibrary';
// BEGIN misc internals
const hasArgument: (argumentName: string) => boolean = (ts as any).server.hasArgument;
const findArgument: (argumentName: string) => string | undefined = (ts as any).server.findArgument;
const nowString: () => string = (ts as any).server.nowString;
const noop = () => { };
const perfLogger = {
	logEvent: noop,
	logErrEvent(_: any) { },
	logPerfEvent(_: any) { },
	logInfoEvent(_: any) { },
	logStartCommand: noop,
	logStopCommand: noop,
	logStartUpdateProgram: noop,
	logStopUpdateProgram: noop,
	logStartUpdateGraph: noop,
	logStopUpdateGraph: noop,
	logStartResolveModule: noop,
	logStopResolveModule: noop,
	logStartParseSourceFile: noop,
	logStopParseSourceFile: noop,
	logStartReadFile: noop,
	logStopReadFile: noop,
	logStartBindFile: noop,
	logStopBindFile: noop,
	logStartScheduledOperation: noop,
	logStopScheduledOperation: noop,
};
const assertNever: (member: never) => never = (ts as any).Debug.assertNever;
const memoize: <T>(callback: () => T) => () => T = (ts as any).memoize;
const ensureTrailingDirectorySeparator: (path: string) => string = (ts as any).ensureTrailingDirectorySeparator;
const getDirectoryPath: (path: string) => string = (ts as any).getDirectoryPath;
const directorySeparator: string = (ts as any).directorySeparator;
const combinePaths: (path: string, ...paths: (string | undefined)[]) => string = (ts as any).combinePaths;
const noopFileWatcher: ts.FileWatcher = { close: noop };
const returnNoopFileWatcher = () => noopFileWatcher;
function getLogLevel(level: string | undefined) {
	if (level) {
		const l = level.toLowerCase();
		for (const name in ts.server.LogLevel) {
			if (isNaN(+name) && l === name.toLowerCase()) {
				return ts.server.LogLevel[name] as any as ts.server.LogLevel;
			}
		}
	}
	return undefined;
}

const notImplemented: () => never = (ts as any).notImplemented;
const returnFalse: () => false = (ts as any).returnFalse;
const returnUndefined: () => undefined = (ts as any).returnUndefined;
const identity: <T>(x: T) => T = (ts as any).identity;
const indent: (str: string) => string = (ts as any).server.indent;
const setSys: (s: ts.System) => void = (ts as any).setSys;
const validateLocaleAndSetLanguage: (
	locale: string,
	sys: { getExecutingFilePath(): string; resolvePath(path: string): string; fileExists(fileName: string): boolean; readFile(fileName: string): string | undefined },
) => void = (ts as any).validateLocaleAndSetLanguage;
const setStackTraceLimit: () => void = (ts as any).setStackTraceLimit;

// End misc internals
// BEGIN webServer/webServer.ts
interface HostWithWriteMessage {
	writeMessage(s: any): void;
}
interface WebHost extends HostWithWriteMessage {
	readFile(path: string): string | undefined;
	fileExists(path: string): boolean;
}

class BaseLogger implements ts.server.Logger {
	private seq = 0;
	private inGroup = false;
	private firstInGroup = true;
	constructor(protected readonly level: ts.server.LogLevel) {
	}
	static padStringRight(str: string, padding: string) {
		return (str + padding).slice(0, padding.length);
	}
	close() {
	}
	getLogFileName(): string | undefined {
		return undefined;
	}
	perftrc(s: string) {
		this.msg(s, ts.server.Msg.Perf);
	}
	info(s: string) {
		this.msg(s, ts.server.Msg.Info);
	}
	err(s: string) {
		this.msg(s, ts.server.Msg.Err);
	}
	startGroup() {
		this.inGroup = true;
		this.firstInGroup = true;
	}
	endGroup() {
		this.inGroup = false;
	}
	loggingEnabled() {
		return true;
	}
	hasLevel(level: ts.server.LogLevel) {
		return this.loggingEnabled() && this.level >= level;
	}
	msg(s: string, type: ts.server.Msg = ts.server.Msg.Err) {
		switch (type) {
			case ts.server.Msg.Info:
				perfLogger.logInfoEvent(s);
				break;
			case ts.server.Msg.Perf:
				perfLogger.logPerfEvent(s);
				break;
			default: // Msg.Err
				perfLogger.logErrEvent(s);
				break;
		}

		if (!this.canWrite()) { return; }

		s = `[${nowString()}] ${s}\n`;
		if (!this.inGroup || this.firstInGroup) {
			const prefix = BaseLogger.padStringRight(type + ' ' + this.seq.toString(), '		  ');
			s = prefix + s;
		}
		this.write(s, type);
		if (!this.inGroup) {
			this.seq++;
		}
	}
	protected canWrite() {
		return true;
	}
	protected write(_s: string, _type: ts.server.Msg) {
	}
}

type MessageLogLevel = 'info' | 'perf' | 'error';
interface LoggingMessage {
	readonly type: 'log';
	readonly level: MessageLogLevel;
	readonly body: string;
}
class MainProcessLogger extends BaseLogger {
	constructor(level: ts.server.LogLevel, private host: HostWithWriteMessage) {
		super(level);
	}
	protected override write(body: string, type: ts.server.Msg) {
		let level: MessageLogLevel;
		switch (type) {
			case ts.server.Msg.Info:
				level = 'info';
				break;
			case ts.server.Msg.Perf:
				level = 'perf';
				break;
			case ts.server.Msg.Err:
				level = 'error';
				break;
			default:
				assertNever(type);
		}
		this.host.writeMessage({
			type: 'log',
			level,
			body,
		} as LoggingMessage);
	}
}

function serverCreateWebSystem(host: WebHost, args: string[], getExecutingFilePath: () => string):
	ts.server.ServerHost & {
		importPlugin?(root: string, moduleName: string): Promise<ts.server.ModuleImportResult>;
		getEnvironmentVariable(name: string): string;
	} {
	const returnEmptyString = () => '';
	const getExecutingDirectoryPath = memoize(() => memoize(() => ensureTrailingDirectorySeparator(getDirectoryPath(getExecutingFilePath()))));
	// Later we could map ^memfs:/ to do something special if we want to enable more functionality like module resolution or something like that
	const getWebPath = (path: string) => path.startsWith(directorySeparator) ? path.replace(directorySeparator, getExecutingDirectoryPath()) : undefined;

	return {
		args,
		newLine: '\r\n', // This can be configured by clients
		useCaseSensitiveFileNames: false, // Use false as the default on web since that is the safest option
		readFile: path => {
			const webPath = getWebPath(path);
			return webPath && host.readFile(webPath);
		},
		write: host.writeMessage.bind(host),
		watchFile: returnNoopFileWatcher,
		watchDirectory: returnNoopFileWatcher,

		getExecutingFilePath: () => directorySeparator,
		getCurrentDirectory: returnEmptyString, // For inferred project root if projectRoot path is not set, normalizing the paths

		/* eslint-disable no-restricted-globals */
		setTimeout: (cb, ms, ...args) => setTimeout(cb, ms, ...args),
		clearTimeout: handle => clearTimeout(handle),
		setImmediate: x => setTimeout(x, 0),
		clearImmediate: handle => clearTimeout(handle),
		/* eslint-enable no-restricted-globals */

		importPlugin: async (initialDir: string, moduleName: string): Promise<ts.server.ModuleImportResult> => {
			const packageRoot = combinePaths(initialDir, moduleName);

			let packageJson: any | undefined;
			try {
				const packageJsonResponse = await fetch(combinePaths(packageRoot, 'package.json'));
				packageJson = await packageJsonResponse.json();
			}
			catch (e) {
				return { module: undefined, error: new Error('Could not load plugin. Could not load "package.json".') };
			}

			const browser = packageJson.browser;
			if (!browser) {
				return { module: undefined, error: new Error('Could not load plugin. No "browser" field found in package.json.') };
			}

			const scriptPath = combinePaths(packageRoot, browser);
			try {
				const { default: module } = await import(/* webpackIgnore: true */scriptPath);
				return { module, error: undefined };
			}
			catch (e) {
				return { module: undefined, error: e };
			}
		},
		exit: notImplemented,

		// Debugging related
		getEnvironmentVariable: returnEmptyString, // TODO:: Used to enable debugging info
		// tryEnableSourceMapsForHost?(): void;
		// debugMode?: boolean;

		// For semantic server mode
		fileExists: path => {
			const webPath = getWebPath(path);
			return !!webPath && host.fileExists(webPath);
		},
		directoryExists: returnFalse, // Module resolution
		readDirectory: notImplemented, // Configured project, typing installer
		getDirectories: () => [], // For automatic type reference directives
		createDirectory: notImplemented, // compile On save
		writeFile: notImplemented, // compile on save
		resolvePath: identity, // Plugins
		// realpath? // Module resolution, symlinks
		// getModifiedTime // File watching
		// createSHA256Hash // telemetry of the project

		// Logging related
		// /*@internal*/ bufferFrom?(input: string, encoding?: string): Buffer;
		// gc?(): void;
		// getMemoryUsage?(): number;
	};
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
class ServerWorkerSession extends ts.server.Session<{}> {
	constructor(
		host: ts.server.ServerHost,
		private webHost: HostWithWriteMessage,
		options: StartSessionOptions,
		logger: ts.server.Logger,
		cancellationToken: ts.server.ServerCancellationToken,
		hrtime: ts.server.SessionOptions['hrtime']
	) {
		super({
			host,
			cancellationToken,
			...options,
			typingsInstaller: ts.server.nullTypingsInstaller,
			byteLength: notImplemented, // Formats the message text in send of Session which is overriden in this class so not needed
			hrtime,
			logger,
			canUseEvents: true,
		});
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
		this.webHost.writeMessage(msg);
	}

	protected override parseMessage(message: {}): ts.server.protocol.Request {
		return message as ts.server.protocol.Request;
	}

	protected override toStringMessage(message: {}) {
		return JSON.stringify(message, undefined, 2);
	}
}
// END webServer/webServer.ts
// BEGIN tsserver/webServer.ts
const nullLogger: ts.server.Logger = {
	close: noop,
	hasLevel: returnFalse,
	loggingEnabled: returnFalse,
	perftrc: noop,
	info: noop,
	msg: noop,
	startGroup: noop,
	endGroup: noop,
	getLogFileName: returnUndefined,
};

function parseServerMode(): ts.LanguageServiceMode | string | undefined {
	const mode = findArgument('--serverMode');
	if (!mode) { return undefined; }
	switch (mode.toLowerCase()) {
		case 'partialsemantic':
			return ts.LanguageServiceMode.PartialSemantic;
		case 'syntactic':
			return ts.LanguageServiceMode.Syntactic;
		default:
			return mode;
	}
}

function initializeWebSystem(args: string[]): StartInput {
	createWebSystem(args);
	const modeOrUnknown = parseServerMode();
	let serverMode: ts.LanguageServiceMode | undefined;
	let unknownServerMode: string | undefined;
	if (typeof modeOrUnknown === 'number') { serverMode = modeOrUnknown; }
	else { unknownServerMode = modeOrUnknown; }
	const logger = createLogger();

	// enable deprecation logging
	(ts as any).Debug.loggingHost = {
		log(level: unknown, s: string) {
			switch (level) {
				case (ts as any).LogLevel.Error:
				case (ts as any).LogLevel.Warning:
					return logger.msg(s, ts.server.Msg.Err);
				case (ts as any).LogLevel.Info:
				case (ts as any).LogLevel.Verbose:
					return logger.msg(s, ts.server.Msg.Info);
			}
		}
	};

	return {
		args,
		logger,
		cancellationToken: ts.server.nullCancellationToken,
		// Webserver defaults to partial semantic mode
		serverMode: serverMode ?? ts.LanguageServiceMode.PartialSemantic,
		unknownServerMode,
		startSession: startWebSession
	};
}

function createLogger() {
	const cmdLineVerbosity = getLogLevel(findArgument('--logVerbosity'));
	return cmdLineVerbosity !== undefined ? new MainProcessLogger(cmdLineVerbosity, { writeMessage }) : nullLogger;
}

function writeMessage(s: any) {
	postMessage(s);
}

function createWebSystem(args: string[]) {
	(ts as any).Debug.assert(ts.sys === undefined);
	const webHost: WebHost = {
		readFile: webPath => {
			const request = new XMLHttpRequest();
			request.open('GET', webPath, /* asynchronous */ false);
			request.send();
			return request.status === 200 ? request.responseText : undefined;
		},
		fileExists: webPath => {
			const request = new XMLHttpRequest();
			request.open('HEAD', webPath, /* asynchronous */ false);
			request.send();
			return request.status === 200;
		},
		writeMessage,
	};
	// Do this after sys has been set as findArguments is going to work only then
	const sys = serverCreateWebSystem(webHost, args, () => findArgument('--executingFilePath') || location + '');
	setSys(sys);
	const localeStr = findArgument('--locale');
	if (localeStr) {
		validateLocaleAndSetLanguage(localeStr, sys);
	}
}

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

function startWebSession(options: StartSessionOptions, logger: ts.server.Logger, cancellationToken: ts.server.ServerCancellationToken) {
	class WorkerSession extends ServerWorkerSession {
		constructor() {
			super(
				ts.sys as ts.server.ServerHost & { tryEnableSourceMapsForHost?(): void; getEnvironmentVariable(name: string): string },
				{ writeMessage },
				options,
				logger,
				cancellationToken,
				hrtime);
		}

		override exit() {
			this.logger.info('Exiting...');
			this.projectService.closeLog();
			close();
		}

		listen() {
			addEventListener('message', (message: any) => {
				this.onMessage(message.data);
			});
		}
	}

	const session = new WorkerSession();

	// Start listening
	session.listen();
}
// END tsserver/webServer.ts
// BEGIN tsserver/server.ts
function findArgumentStringArray(argName: string): readonly string[] {
	const arg = findArgument(argName);
	if (arg === undefined) {
		return [];
	}
	return arg.split(',').filter(name => name !== '');
}

interface StartInput {
	args: readonly string[];
	logger: ts.server.Logger;
	cancellationToken: ts.server.ServerCancellationToken;
	serverMode: ts.LanguageServiceMode | undefined;
	unknownServerMode?: string;
	startSession: (option: StartSessionOptions, logger: ts.server.Logger, cancellationToken: ts.server.ServerCancellationToken) => void;
}
function start({ args, logger, cancellationToken, serverMode, unknownServerMode, startSession: startServer }: StartInput, platform: string) {
	const syntaxOnly = hasArgument('--syntaxOnly');

	logger.info(`Starting TS Server`);
	logger.info(`Version: Moved from Typescript 5.0.0-dev`);
	logger.info(`Arguments: ${args.join(' ')}`);
	logger.info(`Platform: ${platform} NodeVersion: N/A CaseSensitive: ${ts.sys.useCaseSensitiveFileNames}`);
	logger.info(`ServerMode: ${serverMode} syntaxOnly: ${syntaxOnly} hasUnknownServerMode: ${unknownServerMode}`);

	setStackTraceLimit();

	if ((ts as any).Debug.isDebugging) {
		(ts as any).Debug.enableDebugInfo();
	}

	if ((ts as any).sys.tryEnableSourceMapsForHost && /^development$/i.test((ts as any).sys.getEnvironmentVariable('NODE_ENV'))) {
		(ts as any).sys.tryEnableSourceMapsForHost();
	}

	// Overwrites the current console messages to instead write to
	// the log. This is so that language service plugins which use
	// console.log don't break the message passing between tsserver
	// and the client
	console.log = (...args) => logger.msg(args.length === 1 ? args[0] : args.join(', '), ts.server.Msg.Info);
	console.warn = (...args) => logger.msg(args.length === 1 ? args[0] : args.join(', '), ts.server.Msg.Err);
	console.error = (...args) => logger.msg(args.length === 1 ? args[0] : args.join(', '), ts.server.Msg.Err);

	startServer(
		{
			globalPlugins: findArgumentStringArray('--globalPlugins'),
			pluginProbeLocations: findArgumentStringArray('--pluginProbeLocations'),
			allowLocalPluginLoads: hasArgument('--allowLocalPluginLoads'),
			useSingleInferredProject: hasArgument('--useSingleInferredProject'),
			useInferredProjectPerProjectRoot: hasArgument('--useInferredProjectPerProjectRoot'),
			suppressDiagnosticEvents: hasArgument('--suppressDiagnosticEvents'),
			noGetErrOnBackgroundUpdate: hasArgument('--noGetErrOnBackgroundUpdate'),
			syntaxOnly,
			serverMode
		},
		logger,
		cancellationToken
	);
}
// Get args from first message
const listener = (e: any) => {
	removeEventListener('message', listener);
	const args = e.data;
	start(initializeWebSystem(args), 'web');
};
addEventListener('message', listener);
// END tsserver/server.ts
