/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ResolvedPlugins } from '@gitpod/gitpod-protocol';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';
import * as util from 'util';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { RunOnceScheduler } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { OS } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { ReadableStreamEventPayload } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IRawURITransformer, transformIncomingURIs, transformOutgoingURIs, URITransformer } from 'vs/base/common/uriIpc';
import { generateUuid } from 'vs/base/common/uuid';
import { mkdirp } from 'vs/base/node/pfs';
import { ClientConnectionEvent, IPCServer, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol, ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ConsoleLogMainService, getLogLevel, ILogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { ConnectionType, ErrorMessage, HandshakeMessage, IRemoteExtensionHostStartParams, OKMessage, SignRequest } from 'vs/platform/remote/common/remoteAgentConnection';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRequestService, asText } from 'vs/platform/request/common/request';
import { RequestChannel } from 'vs/platform/request/common/requestIpc';
import { RequestService } from 'vs/platform/request/node/requestService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IFileChangeDto } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostReadyMessage, IExtHostSocketMessage } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { Logger } from 'vs/workbench/services/extensions/common/extensionPoints';
import { ExtensionScanner, ExtensionScannerInput, IExtensionReference } from 'vs/workbench/services/extensions/node/extensionPoints';
import { IGetEnvironmentDataArguments, IRemoteAgentEnvironmentDTO, IScanExtensionsArguments } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';

const uriTransformerPath = path.join(__dirname, '../../../gitpodUriTransformer');
const rawURITransformerFactory: (remoteAuthority: string) => IRawURITransformer = <any>require.__$__nodeRequire(uriTransformerPath);

const APP_ROOT = path.join(__dirname, '..', '..', '..', '..');
const WEB_MAIN = path.join(APP_ROOT, 'out', 'vs', 'code', 'browser', 'workbench', 'workbench.html');
const WEB_MAIN_DEV = path.join(APP_ROOT, 'out', 'vs', 'code', 'browser', 'workbench', 'workbench-dev.html');

setUnexpectedErrorHandler(console.error);
// Print a console message when rejection isn't handled within N seconds. For details:
// see https://nodejs.org/api/process.html#process_event_unhandledrejection
// and https://nodejs.org/api/process.html#process_event_rejectionhandled
const unhandledPromises: Promise<any>[] = [];
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
	unhandledPromises.push(promise);
	setTimeout(() => {
		const idx = unhandledPromises.indexOf(promise);
		if (idx >= 0) {
			promise.catch(e => {
				unhandledPromises.splice(idx, 1);
				console.warn(`rejected promise not handled within 1 second: ${e}`);
				if (e && e.stack) {
					console.warn(`stack trace: ${e.stack}`);
				}
				onUnexpectedError(reason);
			});
		}
	}, 1000);
});

process.on('rejectionHandled', (promise: Promise<any>) => {
	const idx = unhandledPromises.indexOf(promise);
	if (idx >= 0) {
		unhandledPromises.splice(idx, 1);
	}
});

// Print a console message when an exception isn't handled.
process.on('uncaughtException', function (err: Error) {
	onUnexpectedError(err);
});

interface ManagementProtocol {
	protocol: PersistentProtocol
	graceTimeReconnection: RunOnceScheduler
	shortGraceTimeReconnection: RunOnceScheduler
}

interface Client {
	management?: ManagementProtocol
	extensionHost?: cp.ChildProcess
}

function safeDisposeProtocolAndSocket(protocol: PersistentProtocol): void {
	try {
		protocol.acceptDisconnect();
		const socket = protocol.getSocket();
		protocol.dispose();
		socket.dispose();
	} catch (err) {
		onUnexpectedError(err);
	}
}

// TODO is it enough?
const textMimeType = new Map([
	['.html', 'text/html'],
	['.js', 'text/javascript'],
	['.json', 'application/json'],
	['.css', 'text/css'],
	['.svg', 'image/svg+xml']
]);

// TODO is it enough?
const mapExtToMediaMimes = new Map([
	['.bmp', 'image/bmp'],
	['.gif', 'image/gif'],
	['.ico', 'image/x-icon'],
	['.jpe', 'image/jpg'],
	['.jpeg', 'image/jpg'],
	['.jpg', 'image/jpg'],
	['.png', 'image/png'],
	['.tga', 'image/x-tga'],
	['.tif', 'image/tiff'],
	['.tiff', 'image/tiff'],
	['.woff', 'application/font-woff']
]);

function getMediaMime(forPath: string): string | undefined {
	const ext = path.extname(forPath);
	return mapExtToMediaMimes.get(ext.toLowerCase());
}

async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, responseHeaders: http.OutgoingHttpHeaders = {}) {
	try {

		// Sanity checks
		filePath = path.normalize(filePath); // ensure no "." and ".."

		const stat = await util.promisify(fs.stat)(filePath);

		// Check if file modified since
		const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join('-')}"`; // weak validator (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304);
			return res.end();
		}

		// Headers
		responseHeaders['Content-Type'] = textMimeType.get(path.extname(filePath)) || getMediaMime(filePath) || 'text/plain';
		responseHeaders['Etag'] = etag;

		res.writeHead(200, responseHeaders);

		// Data
		fs.createReadStream(filePath).pipe(res);
	} catch (error) {
		console.error(error.toString());
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('Not found');
	}
}

function serveError(req: http.IncomingMessage, res: http.ServerResponse, errorCode: number, errorMessage: string): void {
	res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
	res.end(errorMessage);
}

async function installExtensionsFromServer(
	extensionManagementService: IExtensionManagementService,
	requestService: IRequestService,
	fileService: IFileService
): Promise<void> {
	if (!process.env.GITPOD_RESOLVED_EXTENSIONS) {
		return;
	}
	let resolvedPlugins: ResolvedPlugins = {};
	try {
		resolvedPlugins = JSON.parse(process.env.GITPOD_RESOLVED_EXTENSIONS);
	} catch (e) {
		console.error('Faild to parse process.env.GITPOD_RESOLVED_EXTENSIONS:', e);
	}
	const pending: Promise<void>[] = [];
	for (const pluginId in resolvedPlugins) {
		const resolvedPlugin = resolvedPlugins[pluginId];
		if (!resolvedPlugin) {
			continue;
		}
		const { fullPluginName, url, kind } = resolvedPlugin;
		if (kind === 'builtin') {
			// ignore built-in extension configured for Theia, we default to VS Code built-in extensions
			continue;
		}
		pending.push((async () => {
			try {
				const context = await requestService.request({ type: 'GET', url }, CancellationToken.None);
				if (context.res.statusCode !== 200) {
					const message = await asText(context);
					console.error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
					return;
				}
				const downloadedLocation = path.join(os.tmpdir(), generateUuid());
				const target = URI.file(downloadedLocation);
				await fileService.writeFile(target, context.stream);
				await extensionManagementService.install(target);
			} catch (e) {
				console.error(`Failed to install '${fullPluginName}' extension from '${url}':`, e);
			}
		})());
	}
	await Promise.all(pending);
}

async function main(): Promise<void> {
	const connectionToken = generateUuid();

	const parsedArgs = parseArgs(process.argv.splice(0, 2), OPTIONS);
	parsedArgs['user-data-dir'] = URI.file(path.join(os.homedir(), product.dataFolderName)).fsPath;
	const environmentService = new NativeEnvironmentService(parsedArgs);

	await Promise.all<void | undefined>([environmentService.appSettingsHome.fsPath, environmentService.extensionsPath]
		.map((path): undefined | Promise<void> => path ? mkdirp(path) : undefined));

	const onDidClientConnectEmitter = new Emitter<ClientConnectionEvent>();
	const channelServer = new IPCServer<RemoteAgentConnectionContext>(onDidClientConnectEmitter.event);
	channelServer.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());

	const logService = new MultiplexLogService([new ConsoleLogMainService(getLogLevel(environmentService))]);
	channelServer.registerChannel('logger', new LoggerChannel(logService));

	const devMode = !!process.env['VSCODE_DEV'];
	const systemExtensionRoot = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', 'extensions'));
	const extraDevSystemExtensionsRoot = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', '.build', 'builtInExtensions'));
	const logger = new Logger((severity, source, message) => {
		const msg = devMode && source ? `[${source}]: ${message}` : message;
		if (severity === Severity.Error) {
			console.error(msg);
		} else if (severity === Severity.Warning) {
			console.warn(msg);
		} else {
			console.log(msg);
		}
	});
	// see used APIs in vs/workbench/services/remote/common/remoteAgentEnvironmentChannel.ts
	class RemoteExtensionsEnvironment implements IServerChannel<RemoteAgentConnectionContext> {
		protected extensionHostLogFileSeq = 1;
		async call(ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken | undefined): Promise<any> {
			if (command === 'getEnvironmentData') {
				const args: IGetEnvironmentDataArguments = arg;
				const uriTranformer = new URITransformer(rawURITransformerFactory(args.remoteAuthority));
				return transformOutgoingURIs({
					pid: process.pid,
					connectionToken,
					appRoot: URI.file(environmentService.appRoot),
					settingsPath: environmentService.machineSettingsResource,
					logsPath: URI.file(environmentService.logsPath),
					extensionsPath: URI.file(environmentService.extensionsPath),
					extensionHostLogsPath: URI.file(path.join(environmentService.logsPath, `extension_host_${this.extensionHostLogFileSeq++}`)),
					globalStorageHome: environmentService.globalStorageHome,
					workspaceStorageHome: environmentService.workspaceStorageHome,
					userHome: environmentService.userHome,
					os: OS
				} as IRemoteAgentEnvironmentDTO, uriTranformer);
			}
			if (command === 'scanExtensions') {
				let args: IScanExtensionsArguments = arg;
				const uriTranformer = new URITransformer(rawURITransformerFactory(args.remoteAuthority));
				args = transformIncomingURIs(args, uriTranformer);
				// see _scanInstalledExtensions in src/vs/workbench/services/extensions/electron-browser/cachedExtensionScanner.ts
				// TODO: read built nls file
				const translations = {};
				let pendingSystem = ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, devMode, systemExtensionRoot, true, false, translations), logger);
				const builtInExtensions = product.builtInExtensions;
				if (devMode && builtInExtensions && builtInExtensions.length) {
					pendingSystem = ExtensionScanner.mergeBuiltinExtensions(pendingSystem, ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, devMode, extraDevSystemExtensionsRoot, true, false, translations), logger, {
						resolveExtensions: () => {
							const result: IExtensionReference[] = [];
							for (const extension of builtInExtensions) {
								result.push({ name: extension.name, path: path.join(extraDevSystemExtensionsRoot, extension.name) });
							}
							return Promise.resolve(result);
						}
					}));
				}
				const pendingUser = extensionsInstalled.then(() => ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, devMode, environmentService.extensionsPath, false, false, translations), logger));
				let pendingDev: Promise<IExtensionDescription[]>[] = [];
				if (args.extensionDevelopmentPath) {
					pendingDev = args.extensionDevelopmentPath.map(devPath => ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, devMode, URI.revive(devPath).fsPath, false, true, translations), logger));
				}
				const result: IExtensionDescription[] = [];
				const skipExtensions = new Set<string>(args.skipExtensions.map(ExtensionIdentifier.toKey));
				for (const extensions of await Promise.all([...pendingDev, pendingUser, pendingSystem])) {
					for (let i = extensions.length - 1; i >= 0; i--) {
						const extension = extensions[i];
						const key = ExtensionIdentifier.toKey(extension.identifier);
						if (skipExtensions.has(key)) {
							continue;
						}
						skipExtensions.add(key);
						result.unshift(transformOutgoingURIs(extension, uriTranformer));
					}
				}
				return result;
			}
			console.error('Unknown command: RemoteExtensionsEnvironment.' + command);
			throw new Error('Unknown command: RemoteExtensionsEnvironment.' + command);
		}
		listen(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
			console.error('Unknown event: RemoteExtensionsEnvironment.' + event);
			throw new Error('Unknown event: RemoteExtensionsEnvironment.' + event);
		}
	}
	channelServer.registerChannel('remoteextensionsenvironment', new RemoteExtensionsEnvironment());


	const fileService = new FileService(logService);
	const diskFileSystemProvider = new DiskFileSystemProvider(logService);
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);

	// see used APIs in src/vs/workbench/services/remote/common/remoteAgentFileSystemChannel.ts
	class RemoteFileSystem implements IServerChannel<RemoteAgentConnectionContext> {
		protected readonly watchers = new Map<string, {
			watcher: DiskFileSystemProvider,
			emitter: Emitter<IFileChangeDto[] | string>
		}>();
		protected readonly watchHandles = new Map<string, IDisposable>();
		async call(ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken | undefined): Promise<any> {
			if (command === 'stat') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				return diskFileSystemProvider.stat(URI.revive(uriTranformer.transformIncoming(arg[0])));
			}
			if (command === 'open') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				return diskFileSystemProvider.open(URI.revive(uriTranformer.transformIncoming(arg[0])), arg[1]);
			}
			if (command === 'close') {
				return diskFileSystemProvider.close(arg[0]);
			}
			if (command === 'read') {
				const length = arg[2];
				const data = VSBuffer.alloc(length);
				const read = await diskFileSystemProvider.read(arg[0], arg[1], data.buffer, 0, length);
				return [read, data.slice(0, read)];
			}
			if (command === 'readFile') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				const data = await diskFileSystemProvider.readFile(URI.revive(uriTranformer.transformIncoming(arg[0])));
				return VSBuffer.wrap(data);
			}
			if (command === 'write') {
				const data = arg[2] as VSBuffer;
				await diskFileSystemProvider.write(arg[0], arg[1], data.buffer, arg[3], arg[4]);
				return;
			}
			if (command === 'writeFile') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				const data = arg[1] as VSBuffer;
				await diskFileSystemProvider.writeFile(URI.revive(uriTranformer.transformIncoming(arg[0])), data.buffer, arg[2]);
				return;
			}
			if (command === 'delete') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				await diskFileSystemProvider.delete(URI.revive(uriTranformer.transformIncoming(arg[0])), arg[1]);
				return;
			}
			if (command === 'mkdir') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				await diskFileSystemProvider.mkdir(URI.revive(uriTranformer.transformIncoming(arg[0])));
				return;
			}
			if (command === 'readdir') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				return diskFileSystemProvider.readdir(URI.revive(uriTranformer.transformIncoming(arg[0])));
			}
			if (command === 'rename') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				return diskFileSystemProvider.rename(
					URI.revive(uriTranformer.transformIncoming(arg[0])),
					URI.revive(uriTranformer.transformIncoming(arg[1])),
					arg[2]
				);
			}
			if (command === 'copy') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				return diskFileSystemProvider.copy(
					URI.revive(uriTranformer.transformIncoming(arg[0])),
					URI.revive(uriTranformer.transformIncoming(arg[1])),
					arg[2]
				);
			}
			if (command === 'watch') {
				const watcher = this.watchers.get(arg[0])?.watcher;
				if (watcher) {
					const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
					const unwatch = watcher.watch(URI.revive(uriTranformer.transformIncoming(arg[2])), arg[3]);
					this.watchHandles.set(
						arg[0] + ':' + arg[1],
						unwatch
					);
				} else {
					console.error(`'filechange' event should be called before 'watch' first request`);
				}
				return;
			}
			if (command === 'unwatch') {
				this.watchHandles.get(arg[0] + ':' + arg[1])?.dispose();
				this.watchHandles.delete(arg[0] + ':' + arg[1]);
				return;
			}
			console.error('Unknown command: RemoteFileSystem.' + command);
			throw new Error('Unknown command: RemoteFileSystem.' + command);
		}
		protected obtainFileChangeEmitter(ctx: RemoteAgentConnectionContext, session: string): Emitter<IFileChangeDto[] | string> {
			let existing = this.watchers.get(session);
			if (existing) {
				return existing.emitter;
			}
			const watcher = new DiskFileSystemProvider(logService);
			const emitter = new Emitter<IFileChangeDto[] | string>({
				onLastListenerRemove: () => {
					this.watchers.delete(session);
					emitter.dispose();
					watcher.dispose();
					console.log(`[session:${session}] closed watching fs`);
				}
			});
			console.log(`[session:${session}] started watching fs`);
			this.watchers.set(session, { watcher, emitter });

			const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
			watcher.onDidChangeFile(changes => emitter.fire(
				changes.map(change => ({
					resource: uriTranformer.transformOutgoingURI(change.resource),
					type: change.type
				} as IFileChangeDto))
			));
			watcher.onDidErrorOccur(error => emitter.fire(error));
			return emitter;
		}
		listen(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
			if (event === 'filechange') {
				return this.obtainFileChangeEmitter(ctx, arg[0]).event;
			}
			if (event === 'readFileStream') {
				const uriTranformer = new URITransformer(rawURITransformerFactory(ctx.remoteAuthority));
				const resource = URI.revive(transformIncomingURIs(arg[0], uriTranformer));
				const emitter = new Emitter<ReadableStreamEventPayload<VSBuffer>>({
					onLastListenerRemove: () => {
						cancellationTokenSource.cancel();
					}
				});
				const cancellationTokenSource = new CancellationTokenSource();
				const stream = diskFileSystemProvider.readFileStream(resource, arg[1], cancellationTokenSource.token);
				stream.on('data', data => emitter.fire(VSBuffer.wrap(data)));
				stream.on('error', error => emitter.fire(error));
				stream.on('end', () => {
					emitter.fire('end');
					emitter.dispose();
					cancellationTokenSource.dispose();
				});
				return emitter.event;
			}
			console.error('Unknown event: RemoteFileSystem.' + event);
			throw new Error('Unknown event: RemoteFileSystem.' + event);
		}
	}
	channelServer.registerChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME, new RemoteFileSystem());

	const services = new ServiceCollection();
	services.set(IEnvironmentService, environmentService);
	services.set(INativeEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(ITelemetryService, NullTelemetryService);

	services.set(IFileService, fileService);

	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService, [environmentService.settingsResource, fileService]));
	services.set(IProductService, { _serviceBrand: undefined, ...product });
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IDownloadService, new SyncDescriptor(DownloadService));

	services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
	services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));

	services.set(IRequestService, new SyncDescriptor(RequestService));

	let resolveExtensionsInstalled: (value?: unknown) => void;
	const extensionsInstalled = new Promise(resolve => resolveExtensionsInstalled = resolve);

	const instantiationService = new InstantiationService(services);
	instantiationService.invokeFunction(accessor => {
		const extensionManagementService = accessor.get(IExtensionManagementService);
		channelServer.registerChannel('extensions', new ExtensionManagementChannel(extensionManagementService, requestContext => new URITransformer(rawURITransformerFactory(requestContext))));
		installExtensionsFromServer(
			extensionManagementService,
			accessor.get(IRequestService),
			accessor.get(IFileService)
		).then(resolveExtensionsInstalled);
		(extensionManagementService as ExtensionManagementService).removeDeprecatedExtensions();

		const requestService = accessor.get(IRequestService);
		channelServer.registerChannel('request', new RequestChannel(requestService));
	});

	const clients = new Map<string, Client>();

	const server = http.createServer(async (req, res) => {
		if (!req.url) {
			return serveError(req, res, 400, 'Bad Request.');
		}
		try {
			const parsedUrl = url.parse(req.url, true);
			const pathname = parsedUrl.pathname;

			//#region headless
			if (pathname === '/vscode-remote-resource') {
				if (parsedUrl.query['tkn'] !== connectionToken) {
					return serveError(req, res, 403, 'Forbidden.');
				}
				const filePath = parsedUrl.query['path'];
				const fsPath = typeof filePath === 'string' && URI.from({ scheme: 'file', path: filePath }).fsPath;
				if (!fsPath) {
					return serveError(req, res, 400, 'Bad Request.');
				}
				return serveFile(req, res, fsPath);
			}

			if (devMode) {
				if (pathname === '/_supervisor/v1/environment/workspace') {
					const stat = await util.promisify(fs.stat)(process.env.THEIA_WORKSPACE_ROOT!);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						workspace_location: {
							file: stat.isFile() ? process.env.THEIA_WORKSPACE_ROOT : undefined,
							folder: stat.isDirectory() ? process.env.THEIA_WORKSPACE_ROOT : undefined
						},
						user_home: os.homedir()
					}));
				}
			}
			//#region headless end

			//#region static
			if (pathname === '/') {
				return serveFile(req, res, devMode ? WEB_MAIN_DEV : WEB_MAIN);
			}
			if (pathname === '/favicon.ico') {
				return serveFile(req, res, path.join(APP_ROOT, 'resources/gitpod/favicon.ico'));
			}
			if (pathname === '/manifest.json') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({
					'name': product.nameLong,
					'short_name': product.nameShort,
					'start_url': '/',
					'lang': 'en-US',
					'display': 'standalone'
				}));
			}
			if (pathname) {
				let relativeFilePath;
				if (/^\/static\//.test(pathname)) {
					relativeFilePath = path.normalize(decodeURIComponent(pathname.substr('/static/'.length)));
				} else {
					relativeFilePath = path.normalize(decodeURIComponent(pathname));
				}
				return serveFile(req, res, path.join(APP_ROOT, relativeFilePath));
			}
			//#region static end

			// TODO uri callbacks ?
			console.error(`${req.method} ${req.url} not found`);
			return serveError(req, res, 404, 'Not found.');
		} catch (error) {
			console.error(error);

			return serveError(req, res, 500, 'Internal Server Error.');
		}
	});
	server.on('error', console.error);
	server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket) => {
		if (req.headers['upgrade'] !== 'websocket' || !req.url) {
			console.error(`failed to upgrade for header "${req.headers['upgrade']}" and url: "${req.url}".`);
			socket.end('HTTP/1.1 400 Bad Request');
			return;
		}
		const { query } = url.parse(req.url, true);
		// /?reconnectionToken=c0e3a8af-6838-44fb-851b-675401030831&reconnection=false&skipWebSocketFrames=false
		const reconnection = 'reconnection' in query && query['reconnection'] === 'true';
		let token: string | undefined;
		if ('reconnectionToken' in query && typeof query['reconnectionToken'] === 'string') {
			token = query['reconnectionToken'];
		}
		// TODO skipWebSocketFrames (support of VS Code desktop?)
		if (!token) {
			console.error(`missing token for "${req.url}".`);
			socket.end('HTTP/1.1 400 Bad Request');
			return;
		}
		console.log(`[${token}] Socket upgraded for "${req.url}".`);
		socket.on('error', e => {
			console.error(`[${token}] Socket failed for "${req.url}".`, e);
		});

		const acceptKey = req.headers['sec-websocket-key'];
		const hash = crypto.createHash('sha1').update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
		const responseHeaders = ['HTTP/1.1 101 Web Socket Protocol Handshake', 'Upgrade: WebSocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${hash}`];
		socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

		const client = clients.get(token) || {};
		clients.set(token, client);

		const protocol = new PersistentProtocol(new WebSocketNodeSocket(new NodeSocket(socket)));
		const controlListener = protocol.onControlMessage(raw => {
			const msg = <HandshakeMessage>JSON.parse(raw.toString());
			if (msg.type === 'error') {
				console.error(`[${token}] error control message:`, msg.reason);
				safeDisposeProtocolAndSocket(protocol);
			} else if (msg.type === 'auth') {
				protocol.sendControl(VSBuffer.fromString(JSON.stringify({
					type: 'sign',
					data: 'Gitpod Code Server'
				} as SignRequest)));
			} else if (msg.type === 'connectionType') {
				controlListener.dispose();
				// TODO version matching msg.commit
				// TODO auth check msg.signedData
				for (const [token, client] of clients) {
					if (client.management) {
						if (client.management.graceTimeReconnection.isScheduled() && !client.management.shortGraceTimeReconnection.isScheduled()) {
							console.log(`[${token}] Another connection is established, closing this connection after ${ProtocolConstants.ReconnectionShortGraceTime}ms reconnection timeout.`);
							client.management.shortGraceTimeReconnection.schedule();
						}
					}
					if (client.extensionHost) {
						client.extensionHost.send({
							type: 'VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME'
						});
					}
				}
				if (msg.desiredConnectionType === ConnectionType.Management) {
					if (!reconnection) {
						if (client.management) {
							console.error(`[${token}] Falied to connect: management connection is already running.`);
							protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Management connection is already running.' } as ErrorMessage)));
							safeDisposeProtocolAndSocket(protocol);
							return;
						}

						const onDidClientDisconnectEmitter = new Emitter<void>();
						let disposed = false;
						function dispose(): void {
							if (disposed) {
								return;
							}
							disposed = true;
							graceTimeReconnection.dispose();
							shortGraceTimeReconnection.dispose();
							client.management = undefined;
							protocol.sendDisconnect();
							const socket = protocol.getSocket();
							protocol.dispose();
							socket.end();
							onDidClientDisconnectEmitter.fire(undefined);
							onDidClientDisconnectEmitter.dispose();
							console.log(`[${token}] Management connection is disposed.`);
						}

						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' } as OKMessage)));
						const graceTimeReconnection = new RunOnceScheduler(() => {
							console.log(`[${token}] Management connection expired after ${ProtocolConstants.ReconnectionGraceTime}ms (grace).`);
							dispose();
						}, ProtocolConstants.ReconnectionGraceTime);
						const shortGraceTimeReconnection = new RunOnceScheduler(() => {
							console.log(`[${token}] Management connection expired after ${ProtocolConstants.ReconnectionGraceTime}ms (short grace).`);
							dispose();
						}, ProtocolConstants.ReconnectionShortGraceTime);
						client.management = { protocol, graceTimeReconnection, shortGraceTimeReconnection };
						protocol.onClose(() => dispose());
						protocol.onSocketClose(() => {
							console.log(`[${token}] Management connection socket is closed, waiting to reconnect within ${ProtocolConstants.ReconnectionGraceTime}ms.`);
							graceTimeReconnection.schedule();
						});
						onDidClientConnectEmitter.fire({ protocol, onDidClientDisconnect: onDidClientDisconnectEmitter.event });
						console.log(`[${token}] Management connection is connected.`);
					} else {
						if (!client.management) {
							console.error(`[${token}] Failed to reconnect: management connection is not running.`);
							protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Management connection is not running.' } as ErrorMessage)));
							safeDisposeProtocolAndSocket(protocol);
							return;
						}

						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' } as OKMessage)));
						client.management.graceTimeReconnection.cancel();
						client.management.shortGraceTimeReconnection.cancel();
						client.management.protocol.beginAcceptReconnection(protocol.getSocket(), protocol.readEntireBuffer());
						client.management.protocol.endAcceptReconnection();
						protocol.dispose();
						console.log(`[${token}] Management connection is reconnected.`);
					}
				} else if (msg.desiredConnectionType === ConnectionType.ExtensionHost) {
					const params: IRemoteExtensionHostStartParams = {
						language: 'en',
						...msg.args
						// TODO what if params.port is 0?
					};

					if (!reconnection) {
						if (client.extensionHost) {
							console.error(`[${token}] Falied to connect: extension host is already running.`);
							protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Extension host is already running.' } as ErrorMessage)));
							safeDisposeProtocolAndSocket(protocol);
							return;
						}

						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ debugPort: params.port } /* Omit<IExtensionHostConnectionResult, 'protocol'> */)));
						const initialDataChunk = Buffer.from(protocol.readEntireBuffer().buffer).toString('base64');
						protocol.dispose();
						socket.pause();

						try {
							// see src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts
							const opts: cp.ForkOptions = {
								env: {
									...process.env,
									AMD_ENTRYPOINT: 'vs/workbench/services/extensions/node/extensionHostProcess',
									PIPE_LOGGING: 'true',
									VERBOSE_LOGGING: 'true',
									VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
									VSCODE_EXTHOST_WILL_SEND_SOCKET: 'true',
									VSCODE_LOG_STACK: 'true'
								},
								// see https://github.com/akosyakov/gitpod-code/blob/33b49a273f1f6d44f303426b52eaf89f0f5cc596/src/vs/base/parts/ipc/node/ipc.cp.ts#L72-L78
								execArgv: [],
								silent: true
							};
							if (typeof params.port === 'number') {
								if (params.port !== 0) {
									opts.execArgv = [
										'--nolazy',
										(params.break ? '--inspect-brk=' : '--inspect=') + params.port
									];
								} else {
									// TODO we should return a dynamically allocated port to the client,
									// it is better to avoid it?
									opts.execArgv = ['--inspect-port=0'];
								}
							}
							const extensionHost = cp.fork(getPathFromAmdModule(require, 'bootstrap-fork'), ['--type=extensionHost', '--uriTransformerPath=' + uriTransformerPath], opts);
							extensionHost.stdout!.setEncoding('utf8');
							extensionHost.stderr!.setEncoding('utf8');
							Event.fromNodeEventEmitter<string>(extensionHost.stdout!, 'data')(msg => console.log(`[${token}][extension host][${extensionHost.pid}][stdout] ${msg}`));
							Event.fromNodeEventEmitter<string>(extensionHost.stderr!, 'data')(msg => console.log(`[${token}][extension host][${extensionHost.pid}][stderr] ${msg}`));
							extensionHost.on('message', msg => {
								if (msg && (<IRemoteConsoleLog>msg).type === '__$console') {
									console.log(`[${token}][extension host][${extensionHost.pid}][__$console] ${(<IRemoteConsoleLog>msg).arguments}`);
								}
							});

							let disposed = false;
							function dispose(): void {
								if (disposed) {
									return;
								}
								disposed = true;
								socket.end();
								extensionHost.kill();
								client.extensionHost = undefined;
							}

							extensionHost.on('error', err => {
								dispose();
								console.error(`[${token}] Extension host failed with: `, err);
							});
							extensionHost.on('exit', (code: number, signal: string) => {
								dispose();
								if (code !== 0 && signal !== 'SIGTERM') {
									console.error(`[${token}] Extension host exited with code: ${code} and signal: ${signal}.`);
								}
							});

							const readyListener = (msg: any) => {
								if (msg && (<IExtHostReadyMessage>msg).type === 'VSCODE_EXTHOST_IPC_READY') {
									extensionHost.removeListener('message', readyListener);
									extensionHost.send({
										type: 'VSCODE_EXTHOST_IPC_SOCKET',
										initialDataChunk,
										skipWebSocketFrames: false // TODO skipWebSocketFrames - i.e. when we connect from Node (VS Code?)
									} as IExtHostSocketMessage, socket);
									console.log(`[${token}] Extension host is connected.`);
								}
							};
							extensionHost.on('message', readyListener);
							client.extensionHost = extensionHost;
							console.log(`[${token}] Extension host is started.`);
						} catch (e) {
							console.error(`[${token}] Failed to start the extension host process: `, e);
						}
					} else {
						if (!client.extensionHost) {
							console.error(`[${token}] Failed to reconnect: extension host is not running.`);
							protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Extension host is not running.' } as ErrorMessage)));
							safeDisposeProtocolAndSocket(protocol);
							return;
						}

						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ debugPort: params.port } /* Omit<IExtensionHostConnectionResult, 'protocol'> */)));
						const initialDataChunk = Buffer.from(protocol.readEntireBuffer().buffer).toString('base64');
						protocol.dispose();
						socket.pause();

						client.extensionHost.send({
							type: 'VSCODE_EXTHOST_IPC_SOCKET',
							initialDataChunk,
							skipWebSocketFrames: false // TODO skipWebSocketFrames - i.e. when we connect from Node (VS Code?)
						} as IExtHostSocketMessage, socket);
						console.log(`[${token}] Extension host is reconnected.`);
					}
				} else {
					console.error(`[${token}] Unexpected connection type:`, msg.desiredConnectionType);
					safeDisposeProtocolAndSocket(protocol);
				}
			} else {
				console.error(`[${token}] Unexpected control message:`, msg.type);
				safeDisposeProtocolAndSocket(protocol);
			}
		});
	});
	let port = 3000;
	if (process.env.GITPOD_CODE_PORT) {
		port = Number(process.env.GITPOD_CODE_PORT);
	}
	server.listen(port, '0.0.0.0', () => {
		const { address, port } = server.address() as net.AddressInfo;
		console.log(`Gitpod Code Server listening on ${address}:${port}.`);
	});
}
main();
