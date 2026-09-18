/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer, streamToBuffer } from '../../../../../base/common/buffer.js';
import { isDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AhpJsonlLogger, isAhpLogFileFor } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import type { IAgentHostDebugLogsArtifact, IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { buildChatUri, buildDefaultChatUri, getSessionChatResource } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileService, IFileStatWithPartialMetadata } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { BrowserAgentHostDebugLogsExportService, collectRotatedLogFiles, createHostArtifactStream, findOutputChannelLogFiles, getAgentHostDebugLogsExportName, notifyAgentHostDebugLogsExported, prepareAgentHostDebugLogsExport, resolveAgentHostDebugLogsChat, toActiveAgentHostSession } from '../../browser/actions/exportAgentHostDebugLogsAction.js';
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
