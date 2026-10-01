/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer, streamToBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { isDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AhpJsonlLogger, isAhpLogFileFor } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostConnectionsService } from '../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { agentHostAuthority, identityAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, IAgentHostService, type IAgentConnection, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildChatUri, buildDefaultChatUri, getSessionChatResource } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileService, IFileStat, IFileStatWithPartialMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IPathService } from '../../../../../platform/path/common/pathService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { BrowserAgentHostDebugLogsExportService, collectAgentHostDebugLogs, collectRotatedLogFiles, createHostArtifactStream, findOutputChannelLogFiles, getAgentHostDebugLogsExportName, IAgentHostDebugLogsExportService, notifyAgentHostDebugLogsExported, prepareAgentHostDebugLogsExport, resolveAgentHostDebugLogsChat, toActiveAgentHostSession } from '../../browser/actions/exportAgentHostDebugLogsAction.js';
import { ChatConfiguration } from '../../common/constants.js';

function artifactOfSize(size: number): IAgentHostDebugLogsArtifact {
	return {
		kind: 'archive',
		resource: URI.parse('vscode-agent-host://remote/tmp/logs.zip'),
		providerLogsIncluded: true,
		size,
		uncompressedSize: size,
		entries: [{ path: 'agenthost.log', size }],
	};
}

/** Serves `contents` in fixed-size slices, like a remote host would. */
function chunkedReader(contents: VSBuffer, chunkSize: number): (position: number) => Promise<IAgentHostDebugLogsChunk> {
	return async position => {
		const data = contents.slice(position, Math.min(position + chunkSize, contents.byteLength));
		return { data, eof: position + data.byteLength >= contents.byteLength };
	};
}

suite('notifyAgentHostDebugLogsExported', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('copies the exact desktop archive and web export folder paths', async () => {
		const notifications: INotification[] = [];
		const notificationService = new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push(notification);
				return super.notify(notification);
			}
		};
		const clipboardService = new TestClipboardService();
		const desktopArchive = URI.file('/exports/ah-logs.zip');
		const webExportFolder = URI.file('/exports/ah-logs');

		notifyAgentHostDebugLogsExported(notificationService, clipboardService, false, desktopArchive);
		const desktopAction = notifications[0].actions?.primary?.[0];
		assert.ok(desktopAction);
		if (isDisposable(desktopAction)) {
			disposables.add(desktopAction);
		}
		await desktopAction.run();
		const desktopClipboardText = await clipboardService.readText();

		notifyAgentHostDebugLogsExported(notificationService, clipboardService, false, webExportFolder);
		const webAction = notifications[1].actions?.primary?.[0];
		assert.ok(webAction);
		if (isDisposable(webAction)) {
			disposables.add(webAction);
		}
		await webAction.run();
		const webClipboardText = await clipboardService.readText();

		assert.deepStrictEqual({
			desktopClipboardText,
			webClipboardText,
		}, {
			desktopClipboardText: desktopArchive.fsPath,
			webClipboardText: webExportFolder.fsPath,
		});
	});
});

suite('prepareAgentHostDebugLogsExport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects the destination while logs are collected', async () => {
		const calls: string[] = [];
		const destination = new DeferredPromise<URI | undefined>();
		const collection = new DeferredPromise<{ files: []; hostArtifact: undefined }>();

		const resultPromise = prepareAgentHostDebugLogsExport(
			() => {
				calls.push('selectDestination');
				return destination.p;
			},
			() => {
				calls.push('collectLogs');
				return collection.p;
			},
		);

		assert.deepStrictEqual(calls, ['selectDestination', 'collectLogs']);
		destination.complete(URI.file('/exports/ah-logs.zip'));
		collection.complete({ files: [], hostArtifact: undefined });

		const [collectionResult, destinationResult] = await resultPromise;
		assert.deepStrictEqual({
			collectionStatus: collectionResult.status,
			destinationStatus: destinationResult.status,
			destination: destinationResult.status === 'fulfilled' ? destinationResult.value?.fsPath : undefined,
		}, {
			collectionStatus: 'fulfilled',
			destinationStatus: 'fulfilled',
			destination: URI.file('/exports/ah-logs.zip').fsPath,
		});
	});
});

suite('BrowserAgentHostDebugLogsExportService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the configured local folder and falls back when it is unavailable', async () => {
		const configuredDirectory = URI.file('/configured');
		const missingDirectory = URI.file('/missing');
		const fallbackDirectory = URI.file('/fallback');
		const statUris: string[] = [];
		const fileService = upcastPartial<IFileService>({
			stat: async resource => {
				statUris.push(resource.toString());
				if (resource.toString() === configuredDirectory.toString()) {
					return upcastPartial<IFileStatWithPartialMetadata>({ isDirectory: true });
				}
				throw new Error('Folder not found');
			},
		});

		const defaultUris: Array<string | undefined> = [];
		let preferredHomeCalls = 0;
		const fileDialogService = upcastPartial<IFileDialogService>({
			preferredHome: async () => {
				preferredHomeCalls++;
				return fallbackDirectory;
			},
			showOpenDialog: async (options: IOpenDialogOptions) => {
				defaultUris.push(options.defaultUri?.toString());
				return options.defaultUri ? [options.defaultUri] : undefined;
			},
		});
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.AgentHostDebugLogsDefaultExportLocation]: configuredDirectory.fsPath,
		});
		const service = new BrowserAgentHostDebugLogsExportService(fileDialogService, fileService, configurationService, new NullLogService());

		const configuredDestination = await service.selectDestination('configured-export');
		await configurationService.setUserConfiguration(ChatConfiguration.AgentHostDebugLogsDefaultExportLocation, missingDirectory.fsPath);
		const fallbackDestination = await service.selectDestination('fallback-export');

		assert.deepStrictEqual({
			defaultUris,
			configuredDestination: configuredDestination?.toString(),
			fallbackDestination: fallbackDestination?.toString(),
			preferredHomeCalls,
			statUris,
		}, {
			defaultUris: [configuredDirectory.toString(), fallbackDirectory.toString()],
			configuredDestination: URI.joinPath(configuredDirectory, 'configured-export').toString(),
			fallbackDestination: URI.joinPath(fallbackDirectory, 'fallback-export').toString(),
			preferredHomeCalls: 1,
			statUris: [configuredDirectory.toString(), missingDirectory.toString()],
		});
	});
});

suite('createHostArtifactStream', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reassembles an artifact delivered over several chunks', async () => {
		const contents = VSBuffer.fromString('abcdefghij');
		const stream = createHostArtifactStream(artifactOfSize(contents.byteLength), chunkedReader(contents, 3));

		assert.strictEqual((await streamToBuffer(stream)).toString(), 'abcdefghij');
	});

	test('fails when the host delivers fewer bytes than it declared', async () => {
		const contents = VSBuffer.fromString('abc');
		const stream = createHostArtifactStream(artifactOfSize(10), chunkedReader(contents, 3));

		await assert.rejects(streamToBuffer(stream), /ended after 3 bytes, expected 10/);
	});

	test('fails when the host delivers more bytes than it declared', async () => {
		const contents = VSBuffer.fromString('abcdefghij');
		const stream = createHostArtifactStream(artifactOfSize(4), chunkedReader(contents, 3));

		await assert.rejects(streamToBuffer(stream), /exceeded its declared size of 4 bytes/);
	});

	test('fails when the host never reaches the end of the artifact', async () => {
		const stream = createHostArtifactStream(artifactOfSize(10), async () => ({ data: VSBuffer.alloc(0), eof: false }));

		await assert.rejects(streamToBuffer(stream), /empty debug log chunk/);
	});
});

suite('toActiveAgentHostSession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes agent-host providers without accepting extension-owned sessions', () => {
		const schemes = ['agent-host-claude', 'remote-cloudsandbox__env-1-copilot', 'remote-host-my-agent', 'copilotcli', 'copilot', 'untitled'];
		assert.deepStrictEqual(schemes.map(scheme => {
			const context = toActiveAgentHostSession(URI.from({ scheme, path: '/session-1', fragment: 'side-chat' }), 'Chat', 'Session');
			return context ? { scheme: context.resource.scheme, isLocal: context.isLocal, chatId: context.chatId, fragment: context.resource.fragment } : undefined;
		}), [
			{ scheme: 'agent-host-claude', isLocal: true, chatId: 'side-chat', fragment: '' },
			{ scheme: 'remote-cloudsandbox__env-1-copilot', isLocal: false, chatId: 'side-chat', fragment: '' },
			{ scheme: 'remote-host-my-agent', isLocal: false, chatId: 'side-chat', fragment: '' },
			undefined, undefined, undefined,
		]);
	});

	test('separates the selected chat from its owning session', () => {
		const local = toActiveAgentHostSession(URI.parse('agent-host-copilotcli:/session-1#side-chat'), 'Side chat', 'Session one');
		const remote = toActiveAgentHostSession(URI.parse('remote-test-copilotcli:/session-2'), 'Main chat', 'Session two');

		assert.deepStrictEqual({
			local: local && { resource: local.resource.toString(), sessionTitle: local.sessionTitle, chatTitle: local.chatTitle, chatId: local.chatId, backendChatResource: local.backendChatResource, isLocal: local.isLocal },
			remote: remote && { resource: remote.resource.toString(), sessionTitle: remote.sessionTitle, chatTitle: remote.chatTitle, chatId: remote.chatId, backendChatResource: remote.backendChatResource, isLocal: remote.isLocal },
		}, {
			local: { resource: 'agent-host-copilotcli:/session-1', sessionTitle: 'Session one', chatTitle: 'Side chat', chatId: 'side-chat', backendChatResource: undefined, isLocal: true },
			remote: { resource: 'remote-test-copilotcli:/session-2', sessionTitle: 'Session two', chatTitle: 'Main chat', chatId: 'default', backendChatResource: undefined, isLocal: false },
		});
	});

	test('namespaces non-primary chat exports under the session title', () => {
		assert.deepStrictEqual({
			primary: getAgentHostDebugLogsExportName('Investigate session', 'Main chat', true),
			sideChat: getAgentHostDebugLogsExportName('Investigate session', 'Review / side chat', false),
			truncated: getAgentHostDebugLogsExportName('A'.repeat(50), 'B'.repeat(50), false),
			unnamed: getAgentHostDebugLogsExportName(undefined, undefined, false),
		}, {
			primary: 'ah-logs-Investigate-session',
			sideChat: 'ah-logs-Investigate-session--Review-side-chat',
			truncated: `ah-logs-${'A'.repeat(40)}--${'B'.repeat(40)}`,
			unnamed: 'ah-logs',
		});
	});

	test('selects exact host-published backend chat URIs', () => {
		const session = URI.parse('copilotcli:/session-1');
		const defaultChat = URI.parse(buildDefaultChatUri(session)).with({ query: 'host=default' }).toString();
		const sideChat = URI.parse(buildChatUri(session, 'side-chat')).with({ query: 'host=side' }).toString();
		const state = {
			defaultChat,
			chats: [
				{ resource: defaultChat },
				{ resource: sideChat },
			],
		};

		assert.deepStrictEqual({
			defaultChat: getSessionChatResource(state, 'default'),
			sideChat: getSessionChatResource(state, 'side-chat'),
			missing: getSessionChatResource(state, 'missing'),
		}, {
			defaultChat,
			sideChat,
			missing: undefined,
		});
	});

	test('continues without an active chat when session state is unavailable', () => {
		const activeSession = toActiveAgentHostSession(URI.parse('remote-test-copilotcli:/session-1#side-chat'), 'Side chat', 'Session one');
		assert.ok(activeSession);

		assert.deepStrictEqual({
			unavailable: resolveAgentHostDebugLogsChat(activeSession, undefined),
			failed: resolveAgentHostDebugLogsChat(activeSession, new Error('disconnected')),
		}, {
			unavailable: { backendChat: undefined, sessionTitle: 'Session one' },
			failed: { backendChat: undefined, sessionTitle: 'Session one' },
		});
	});
});

suite('collectAgentHostDebugLogs', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function collectWithFiles(ahpFiles: readonly { name: string; mtime: number }[], hostEntryCount = 0, sharedLogCount = 1, sessionScoped = false) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		};
		const logsHome = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
		const windowLogs = URI.joinPath(logsHome, 'window1');
		const hostArtifact: IAgentHostDebugLogsArtifact = {
			...artifactOfSize(hostEntryCount),
			entries: Array.from({ length: hostEntryCount }, (_, index) => ({ path: `host-${index}.log`, size: 1 })),
		};
		const fileStat = (folder: URI, name: string, mtime = 0) => upcastPartial<IFileStat>({
			name,
			resource: URI.joinPath(folder, name),
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			size: 1,
			mtime,
		});
		const connection = upcastPartial<IAgentConnection>({
			collectDebugLogs: async () => hostArtifact,
			getSubscriptionUnmanaged: () => undefined,
		});
		instantiationService.stub(IAgentHostConnectionsService, {
			ambientConnection: connection,
			resolveSessionResource: () => ({
				connection,
				connectionAuthority: 'local',
				backendSession: URI.parse('copilotcli:/session-1'),
			}),
		});
		instantiationService.stub(IAgentHostService, { clientId: 'local-client' });
		instantiationService.stub(IRemoteAgentHostService, { connections: [] });
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			resolve: async resource => {
				let children: IFileStat[];
				if (resource.path === '/logs/ahp') {
					children = ahpFiles.map(file => fileStat(resource, file.name, file.mtime));
				} else if (resource.path === windowLogs.path) {
					children = [fileStat(resource, 'renderer.log')];
				} else if (resource.path === logsHome.path) {
					children = Array.from({ length: sharedLogCount }, (_, index) => fileStat(resource, index === 0 ? 'sharedprocess.log' : `sharedprocess.${index}.log`));
				} else if (resource.path.startsWith('/data/')) {
					return upcastPartial<IFileStat>({ size: 1 });
				} else {
					throw new Error(`Unexpected resource: ${resource.toString()}`);
				}
				return upcastPartial<IFileStat>({ children });
			},
		}));
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IWorkbenchEnvironmentService, {
			logsHome,
			windowLogsPath: windowLogs,
			logFile: URI.joinPath(windowLogs, 'renderer.log'),
			userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: '/data' }),
		});
		instantiationService.stub(IAgentHostDebugLogsExportService, { hostArtifactKind: 'archive' });

		const activeSession = sessionScoped ? toActiveAgentHostSession(URI.parse('agent-host-copilotcli:/session-1'), 'Chat', 'Session') : undefined;
		const result = await instantiationService.invokeFunction(accessor => collectAgentHostDebugLogs(accessor, activeSession ? {
			...activeSession,
			backendChatResource: URI.parse('copilotcli:/session-1/chat/default'),
		} : undefined, () => { }));
		return { result, warnings };
	}

	const ahpFile = (host: string, connection: number, mtime = connection) => {
		const hash = new StringSHA1();
		hash.update(host);
		return {
			name: `ahp-${hash.digest()}-2026-01-01T00-00-00-000Z-connection-${connection}.jsonl`,
			mtime,
		};
	};

	test('keeps the newest ten transport files per host, including an older connection that is still active', async () => {
		const reconnectFiles = Array.from({ length: 1160 }, (_, index) => ahpFile('a', index));
		const activeFile = ahpFile('a', 0, 2000);
		reconnectFiles[0] = activeFile;
		const otherHostFiles = [ahpFile('b', 1), ahpFile('b', 2)];
		const rotation = { name: activeFile.name.replace('.jsonl', '.1.jsonl'), mtime: 2001 };
		const { result, warnings } = await collectWithFiles([...otherHostFiles, ...reconnectFiles, rotation]);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				`ahp/${rotation.name}`,
				`ahp/${activeFile.name}`,
				...reconnectFiles.slice(-8).reverse().map(file => `ahp/${file.name}`),
				...otherHostFiles.slice().reverse().map(file => `ahp/${file.name}`),
			],
			warnings: ['[ExportAgentHostDebugLogs] Omitted 1151 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	for (const hostEntryCount of [0, 990, 1000]) {
		test(`caps the combined export at 1000 entries with ${hostEntryCount} host artifact entries`, async () => {
			const { result, warnings } = await collectWithFiles([], hostEntryCount, 1160);

			assert.deepStrictEqual({
				entryCount: result.files.length + (result.hostArtifact?.artifact.entries.length ?? 0),
				firstClientFile: result.files[0]?.path,
				warnings,
			}, {
				entryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
				firstClientFile: hostEntryCount < 1000 ? 'vscode-logs/Window/renderer.log' : undefined,
				warnings: [`[ExportAgentHostDebugLogs] Omitted ${161 + hostEntryCount} log files to keep the export within 1000 entries and 10 AHP files per host`],
			});
		});
	}

	test('keeps process logs ahead of the newest transport history when the combined export reaches the limit', async () => {
		const ahpFiles = Array.from({ length: 20 }, (_, index) => ahpFile('a', index));
		const { result, warnings } = await collectWithFiles(ahpFiles, 995);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			entryCount: result.files.length + (result.hostArtifact?.artifact.entries.length ?? 0),
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				...ahpFiles.slice(-3).reverse().map(file => `ahp/${file.name}`),
			],
			entryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 17 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	test('keeps all files and does not warn when no limits are reached', async () => {
		const ahpFiles = Array.from({ length: 10 }, (_, index) => ahpFile('a', index));
		const { result, warnings } = await collectWithFiles(ahpFiles, 988);

		assert.deepStrictEqual({
			clientFileCount: result.files.length,
			entryCount: result.files.length + (result.hostArtifact?.artifact.entries.length ?? 0),
			warnings,
		}, {
			clientFileCount: 12,
			entryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			warnings: [],
		});
	});

	test('caps transport files across many hosts at the remaining archive budget', async () => {
		const ahpFiles = Array.from({ length: 1100 }, (_, index) => ahpFile(`host-${Math.floor(index / 10)}`, index));
		const { result, warnings } = await collectWithFiles(ahpFiles, 5);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			entryCount: result.files.length + (result.hostArtifact?.artifact.entries.length ?? 0),
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				...ahpFiles.slice(-993).reverse().map(file => `ahp/${file.name}`),
			],
			entryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 107 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	test('preserves session sidecars before scoped transport history', async () => {
		const ahpFiles = Array.from({ length: 20 }, (_, index) => ahpFile('local-client', index));
		const unrelatedFiles = Array.from({ length: 20 }, (_, index) => ahpFile('unrelated', index + 100));
		const { result, warnings } = await collectWithFiles([...ahpFiles, ...unrelatedFiles], 995, 1, true);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			entryCount: result.files.length + (result.hostArtifact?.artifact.entries.length ?? 0),
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				'usage.jsonl',
				'customizations.json',
				`ahp/${ahpFiles[19].name}`,
			],
			entryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 19 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	for (const provider of ['copilot', 'copilotcli']) {
		for (const status of ['connected', 'disconnected', 'removed']) {
			test(`exports only ${provider} host traffic when the connection is ${status}`, async () => {
				const connected = status === 'connected';
				const instantiationService = disposables.add(new TestInstantiationService());
				const logService = new NullLogService();
				const fileService = disposables.add(new FileService(logService));
				disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
				const logsHome = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
				const windowLogs = URI.joinPath(logsHome, 'window1');
				const outputLogs = URI.joinPath(windowLogs, 'output_1');
				await fileService.createFolder(outputLogs);
				const address = provider === 'copilot' ? 'cloudsandbox:env-1' : 'ws://remote:8080';
				const unrelatedAddress = 'cloudsandbox:env-2';
				const loggers = ['initial', 'reconnected', 'unrelated'].map((connectionId, index) => disposables.add(new AhpJsonlLogger(
					{ logsHome, logId: index < 2 ? address : unrelatedAddress, connectionId, transport: 'webpubsub', maxFileSizeBytes: 1, maxFiles: 3 },
					fileService,
					logService,
				)));
				for (const logger of loggers) {
					logger.log({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'c2s');
					logger.log({ jsonrpc: '2.0', id: 1, result: {} }, 's2c');
					await logger.flush();
				}
				const outputLogName = provider === 'copilot' ? 'agentHost.otlp.cloudsandboxenv-1.log' : 'agentHost.otlp.wsremote8080.log';
				await fileService.writeFile(URI.joinPath(outputLogs, outputLogName), VSBuffer.fromString('host log'));
				await fileService.writeFile(URI.joinPath(outputLogs, 'agentHost.otlp.cloudsandboxenv-2.log'), VSBuffer.fromString('unrelated'));
				const resource = URI.from({ scheme: remoteAgentHostSessionTypeId(agentHostAuthority(address), provider), path: '/session-1' });
				const activeSession = toActiveAgentHostSession(resource, 'Chat', 'Session');
				assert.ok(activeSession);
				const backendSession = URI.parse(`${provider === 'copilot' ? 'ahp-session' : 'copilotcli'}:/session-1`);
				const requests: (string | undefined)[] = [];
				const connection = upcastPartial<IAgentConnection>({
					getSubscriptionUnmanaged: () => undefined,
					collectDebugLogs: async session => {
						requests.push(session?.toString());
						throw new Error('Method not found');
					},
				});
				instantiationService.stub(IAgentHostService, {
					clientId: 'local-client',
					onAgentHostStart: Event.None,
					onAgentHostExit: Event.None,
					resourceUris: identityAgentHostResourceUriMapper,
				});
				instantiationService.stub(IRemoteAgentHostService, {
					onDidChangeConnections: Event.None,
					connections: (status === 'removed' ? [unrelatedAddress] : [address, unrelatedAddress]).map(address => ({ address, name: address, status: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected })),
					getConnection: candidate => connected && candidate === address ? connection : undefined,
					getConnectionByAuthority: candidate => connected && candidate === agentHostAuthority(address) ? connection : undefined,
				});
				instantiationService.stub(IPathService, new TestPathService(URI.from({ scheme: Schemas.inMemory, path: '/home' })));
				const connectionsService = disposables.add(instantiationService.createInstance(AgentHostConnectionsService));
				instantiationService.set(IAgentHostConnectionsService, connectionsService);
				disposables.add(connectionsService.registerSessionResolutionPolicy(agentHostAuthority(address), {
					...(status === 'removed' ? { connectionAddress: address } : {}),
					sessionSchemeAlias: { ui: provider, backend: backendSession.scheme },
				}));
				instantiationService.stub(IFileService, fileService);
				instantiationService.stub(ILogService, logService);
				instantiationService.stub(IWorkbenchEnvironmentService, {
					logsHome,
					windowLogsPath: windowLogs,
					logFile: URI.joinPath(windowLogs, 'renderer.log'),
					userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: '/data' }),
				});
				instantiationService.stub(IAgentHostDebugLogsExportService, { hostArtifactKind: 'archive' });

				const result = await instantiationService.invokeFunction(accessor => collectAgentHostDebugLogs(accessor, activeSession, () => assert.fail('Unexpected host artifact')));
				const wireFiles = result.files.filter(file => file.path.startsWith('ahp/'));
				assert.deepStrictEqual({
					requests,
					hostArtifact: result.hostArtifact,
					wireFileCount: wireFiles.length,
					allWireFilesMatchHost: wireFiles.every(file => isAhpLogFileFor(address, file.path.substring('ahp/'.length))),
					forwardedLogs: result.files.filter(file => file.path.startsWith('vscode-logs/Agent Host/')).map(file => file.path),
				}, {
					requests: connected ? [backendSession.toString()] : [],
					hostArtifact: undefined,
					wireFileCount: 4,
					allWireFilesMatchHost: true,
					forwardedLogs: [`vscode-logs/Agent Host/${outputLogName}`],
				});
			});
		}
	}
});

suite('collectRotatedLogFiles', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('collects local rotated logs as resources', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.file('/logs');
		await fileService.createFolder(logs);
		await Promise.all([
			fileService.writeFile(URI.joinPath(logs, 'renderer.log'), VSBuffer.fromString('current')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.1.log'), VSBuffer.fromString('previous')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.5.log'), VSBuffer.fromString('oldest')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.old.log'), VSBuffer.fromString('not rotated')),
			fileService.writeFile(URI.joinPath(logs, 'network.log'), VSBuffer.fromString('different log')),
		]);

		const files = await collectRotatedLogFiles('vscode-logs/Window', URI.joinPath(logs, 'renderer.log'), fileService);

		assert.deepStrictEqual(files.map(file => ({
			path: file.path,
			resource: hasKey(file, { resource: true }) ? file.resource.toString() : undefined,
			size: file.size,
		})).sort((a, b) => a.path.localeCompare(b.path)), [
			{ path: 'vscode-logs/Window/renderer.1.log', resource: 'file:///logs/renderer.1.log', size: 8 },
			{ path: 'vscode-logs/Window/renderer.5.log', resource: 'file:///logs/renderer.5.log', size: 6 },
			{ path: 'vscode-logs/Window/renderer.log', resource: 'file:///logs/renderer.log', size: 7 },
		]);
	});

	test('keeps every non-local rotated log as a streamable resource', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
		await fileService.createFolder(logs);
		await Promise.all([
			fileService.writeFile(URI.joinPath(logs, 'renderer.log'), VSBuffer.fromString('abcd')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.1.log'), VSBuffer.fromString('efgh')),
		]);

		const files = await collectRotatedLogFiles('vscode-logs/Window', URI.joinPath(logs, 'renderer.log'), fileService);

		assert.deepStrictEqual({
			count: files.length,
			allResources: files.every(file => hasKey(file, { resource: true })),
			totalSize: files.reduce((total, file) => total + file.size, 0),
		}, {
			count: 2,
			allResources: true,
			totalSize: 8,
		});
	});

	test('finds all matching output channel backing files', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const windowLogs = URI.file('/logs/window1');
		const oldOutput = URI.joinPath(windowLogs, 'output_20260825T080000');
		const newOutput = URI.joinPath(windowLogs, 'output_20260825T090000');
		await Promise.all([fileService.createFolder(oldOutput), fileService.createFolder(newOutput)]);
		await Promise.all([
			fileService.writeFile(URI.joinPath(oldOutput, 'agentHost.otlp.remote.log'), VSBuffer.fromString('old')),
			fileService.writeFile(URI.joinPath(newOutput, 'agentHost.otlp.remote.log'), VSBuffer.fromString('new')),
			fileService.writeFile(URI.joinPath(newOutput, 'unrelated.log'), VSBuffer.fromString('unrelated')),
		]);

		const files = await findOutputChannelLogFiles(windowLogs, new Set(['agentHost.otlp.remote.log']), fileService);

		assert.deepStrictEqual(files.map(file => file.toString()), [
			'file:///logs/window1/output_20260825T090000/agentHost.otlp.remote.log',
			'file:///logs/window1/output_20260825T080000/agentHost.otlp.remote.log',
		]);
	});

	test('selects tunnel reconnect and rotation logs by logical host without address filename matching', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const logsHome = URI.file('/logs');
		const tunnelAddress = 'tunnel:dev/name';
		const initial = disposables.add(new AhpJsonlLogger(
			{ logsHome, logId: tunnelAddress, connectionId: 'relay-uuid-1', transport: 'tunnel', maxFileSizeBytes: 1, maxFiles: 3 },
			fileService,
			new NullLogService(),
		));
		initial.log({ jsonrpc: '2.0', id: 1, result: 'initial' }, 's2c');
		initial.log({ jsonrpc: '2.0', id: 2, result: 'rotated' }, 's2c');
		await initial.flush();

		const reconnected = disposables.add(new AhpJsonlLogger(
			{ logsHome, logId: tunnelAddress, connectionId: 'relay-uuid-2', transport: 'tunnel' },
			fileService,
			new NullLogService(),
		));
		reconnected.log({ jsonrpc: '2.0', id: 3, result: 'reconnected' }, 's2c');
		await reconnected.flush();

		const collidingOldToken = disposables.add(new AhpJsonlLogger(
			{ logsHome, logId: 'tunnel:dev:name', connectionId: 'relay-uuid-other', transport: 'tunnel' },
			fileService,
			new NullLogService(),
		));
		collidingOldToken.log({ jsonrpc: '2.0', id: 4, result: 'other' }, 's2c');
		await collidingOldToken.flush();

		const directory = await fileService.resolve(URI.joinPath(logsHome, 'ahp'));
		const matching = (directory.children ?? []).filter(child => isAhpLogFileFor(tunnelAddress, child.name));
		const entries: Array<{ readonly id: number; readonly _ahpLog: { readonly connectionId: string } }> = [];
		for (const file of matching) {
			const content = (await fileService.readFile(file.resource)).value.toString();
			entries.push(...content.split('\n').filter(Boolean).map(line => JSON.parse(line)));
		}

		assert.deepStrictEqual({
			fileCount: matching.length,
			fileNamesContainLogicalAddress: matching.some(file => file.name.includes('tunnel-dev-name')),
			connectionIds: entries.map(entry => entry._ahpLog.connectionId).sort(),
			messageIds: entries.map(entry => entry.id).sort(),
		}, {
			fileCount: 3,
			fileNamesContainLogicalAddress: false,
			connectionIds: ['relay-uuid-1', 'relay-uuid-1', 'relay-uuid-2'],
			messageIds: [1, 2, 3],
		});
	});

	test('collects local user data logs as resources', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.from({ scheme: Schemas.vscodeUserData, path: '/logs' });
		await fileService.createFolder(logs);
		await fileService.writeFile(URI.joinPath(logs, 'usage.jsonl'), VSBuffer.fromString('usage'));

		const files = await collectRotatedLogFiles('sidecars', URI.joinPath(logs, 'usage.jsonl'), fileService);

		assert.deepStrictEqual(files.map(file => ({
			path: file.path,
			resource: hasKey(file, { resource: true }) ? file.resource.toString() : undefined,
			size: file.size,
		})), [
			{ path: 'sidecars/usage.jsonl', resource: 'vscode-userdata:/logs/usage.jsonl', size: 5 },
		]);
	});
});
