/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer, newWriteableBufferStream, streamToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { isDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { AhpJsonlLogger, isAhpLogFileFor } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostConnectionsService } from '../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, identityAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, IAgentHostService, type IAgentConnection, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildChatUri, buildDefaultChatUri, getSessionChatResource } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileService, IFileStatWithMetadata, IFileStatWithPartialMetadata, IFileStreamContent, IFileWriteOptions } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IPathService } from '../../../../../platform/path/common/pathService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { BrowserAgentHostDebugLogsExportService, collectAgentHostDebugLogs, collectRotatedLogFiles, commitAgentHostDebugLogsExport, createHostArtifactStream, exportAgentHostDebugLogs, findOutputChannelLogFiles, getAgentHostDebugLogsExportName, IAgentHostDebugLogsExportService, notifyAgentHostDebugLogsExported, prepareAgentHostDebugLogsExport, resolveAgentHostDebugLogsChat, toActiveAgentHostSession } from '../../browser/actions/exportAgentHostDebugLogsAction.js';
import { ChatConfiguration } from '../../common/constants.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IProgressNotificationOptions, IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { getAgentHostAhpLogDirectoryMeta } from '../../../../../platform/agentHost/common/meta/agentHostDebugLogsMeta.js';
import { InitializeResult } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';

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

suite('exportAgentHostDebugLogs progress', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setupExport(collection: () => Promise<IAgentHostDebugLogsArtifact>) {
		const instantiation = disposables.add(new TestInstantiationService());
		const notifications: INotification[] = [];
		const notificationService = new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push(notification);
				for (const action of notification.actions?.primary ?? []) {
					if (isDisposable(action)) {
						disposables.add(action);
					}
				}
				return super.notify(notification);
			}
		};
		const removed = new DeferredPromise<void>();
		const cancelHost: string[] = [];
		let cancel: IProgressNotificationOptions['primaryActions'];
		let active = false;
		const messages: string[] = [];
		instantiation.stub(IAgentHostConnectionsService, {
			ambientConnection: upcastPartial<IAgentConnection>({
				collectDebugLogs: collection,
				cancelDebugLogs: async progressToken => { cancelHost.push(progressToken); },
			}),
		});
		instantiation.stub(IAgentHostService, { clientId: 'local' });
		instantiation.stub(IRemoteAgentHostService, { connections: [] });
		const logsHome = URI.file('/logs');
		instantiation.stub(IWorkbenchEnvironmentService, {
			logsHome, logFile: URI.file('/logs/window/renderer.log'), windowLogsPath: URI.file('/logs/window'),
		});
		instantiation.stub(IFileService, {
			resolve: async resource => upcastPartial<IFileStatWithMetadata>({ resource, children: [] }),
			del: async () => { removed.complete(); },
		});
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, notificationService);
		instantiation.stub(IClipboardService, new TestClipboardService());
		instantiation.stub(IChatEntitlementService, { isInternal: false });
		instantiation.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: async (options, task) => {
				const notificationOptions: IProgressNotificationOptions = { ...options, location: ProgressLocation.Notification };
				cancel = notificationOptions.primaryActions;
				active = true;
				try {
					return await task({
						report: step => {
							if (typeof step.message === 'string') {
								messages.push(step.message);
							}
						}
					});
				} finally {
					active = false;
				}
			},
		}));
		return { instantiation, removed, cancelHost, notifications, messages, cancel: () => cancel?.[0]?.run(), isActive: () => active, isCancellable: () => cancel?.[0]?.enabled };
	}

	test('cancels pending host collection immediately and cleans a late artifact', async () => {
		const collection = new DeferredPromise<IAgentHostDebugLogsArtifact>();
		const started = new DeferredPromise<void>();
		const context = setupExport(() => {
			started.complete();
			return collection.p;
		});
		let saved = false;
		context.instantiation.stub(IAgentHostDebugLogsExportService, {
			hostArtifactKind: 'archive',
			selectDestination: async () => URI.file('/exports/logs.zip'),
			save: async () => { saved = true; },
		});
		const exported = context.instantiation.invokeFunction(accessor => exportAgentHostDebugLogs(accessor, undefined));
		await started.p;
		const cancellable = context.isCancellable();
		context.cancel();
		await exported;
		collection.complete(artifactOfSize(10));
		await context.removed.p;
		assert.deepStrictEqual({
			cancellable, active: context.isActive(),
			cancelledHost: context.cancelHost.length, saved,
		}, { cancellable: true, active: false, cancelledHost: 1, saved: false });
	});

	test('dismisses progress immediately when saving has not responded to cancellation yet', async () => {
		const context = setupExport(async () => artifactOfSize(10));
		const saving = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		context.instantiation.stub(IAgentHostDebugLogsExportService, {
			hostArtifactKind: 'archive',
			selectDestination: async () => URI.file('/exports/logs.zip'),
			save: async () => {
				started.complete();
				await saving.p;
			},
		});
		const exported = context.instantiation.invokeFunction(accessor => exportAgentHostDebugLogs(accessor, undefined));
		await started.p;
		context.cancel();
		await exported;
		assert.strictEqual(context.isActive(), false);
		saving.complete();
	});

	test('keeps progress active through saving and cleanup', async () => {
		const context = setupExport(async () => artifactOfSize(10));
		let progressActiveDuringSave = false;
		context.instantiation.stub(IAgentHostDebugLogsExportService, {
			hostArtifactKind: 'archive',
			selectDestination: async () => URI.file('/exports/logs.zip'),
			save: async (_destination, _files, _artifact, options) => {
				progressActiveDuringSave = context.isActive();
				options?.progress.report({ message: 'Saving archive' });
			},
		});
		await context.instantiation.invokeFunction(accessor => exportAgentHostDebugLogs(accessor, undefined));
		assert.deepStrictEqual({
			progressActiveDuringSave,
			lastMessage: context.messages.at(-1),
			active: context.isActive(),
		}, { progressActiveDuringSave: true, lastMessage: 'Cleaning up temporary logs...', active: false });
	});

	test('awaits the non-cancellable destination commit instead of reporting late cancellation', async () => {
		const context = setupExport(async () => artifactOfSize(10));
		const committing = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		context.instantiation.stub(IAgentHostDebugLogsExportService, {
			hostArtifactKind: 'archive',
			selectDestination: async () => URI.file('/exports/logs.zip'),
			save: async (_destination, _files, _artifact, options) => {
				options?.onWillCommit?.();
				committing.complete();
				await finish.p;
			},
		});
		const exported = context.instantiation.invokeFunction(accessor => exportAgentHostDebugLogs(accessor, undefined));
		await committing.p;
		assert.strictEqual(context.isCancellable(), false);
		context.cancel();
		await Promise.resolve();
		assert.strictEqual(context.isActive(), true);
		finish.complete();
		await exported;
		assert.deepStrictEqual({
			active: context.isActive(),
			successNotifications: context.notifications.filter(notification => notification.actions?.primary?.length).length,
		}, { active: false, successNotifications: 1 });
	});

	test('warns when folder saving returns a partial host export', async () => {
		const context = setupExport(async () => artifactOfSize(10));
		context.instantiation.stub(IAgentHostDebugLogsExportService, {
			hostArtifactKind: 'directory',
			selectDestination: async () => URI.file('/exports/logs'),
			save: async () => ({ hostSaveError: 'Remote log read failed' }),
		});
		await context.instantiation.invokeFunction(accessor => exportAgentHostDebugLogs(accessor, undefined));
		assert.strictEqual(context.notifications[0].message, 'Agent Host logs were not fully exported: Remote log read failed');
	});
});

suite('commitAgentHostDebugLogsExport', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const directory of [false, true]) {
		for (const failure of ['none', 'install', 'rollback']) {
			test(`${directory ? 'folder' : 'ZIP'} commit preserves the previous export on ${failure} failure`, async () => {
				const logService = new NullLogService();
				const destination = URI.file('/exports/logs');
				const staging = URI.file('/exports/staging');
				const fileService = disposables.add(new FileService(logService));
				const cancellation = disposables.add(new CancellationTokenSource());
				let committing = false;
				const provider = disposables.add(new class extends InMemoryFileSystemProvider {
					override async rename(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
						if (from.path === staging.path) {
							assert.strictEqual(committing, true);
							cancellation.cancel();
							if (failure !== 'none') {
								throw new Error('Install failed');
							}
						} else if (from.path.includes('backup') && failure === 'rollback') {
							throw new Error('Restore failed');
						}
						await super.rename(from, to, options);
					}
				}());
				disposables.add(fileService.registerProvider(Schemas.file, provider));
				const previous = directory ? URI.joinPath(destination, 'previous.log') : destination;
				const next = directory ? URI.joinPath(staging, 'next.log') : staging;
				await fileService.writeFile(previous, VSBuffer.fromString('previous'));
				await fileService.writeFile(next, VSBuffer.fromString('next'));
				const committed = commitAgentHostDebugLogsExport(staging, destination, fileService, logService, {
					token: cancellation.token, progress: { report: () => { } },
					onWillCommit: () => { committing = true; },
				});
				if (failure === 'none') {
					await committed;
					const installed = directory ? URI.joinPath(destination, 'next.log') : destination;
					assert.deepStrictEqual({
						contents: (await fileService.readFile(installed)).value.toString(),
						files: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
					}, { contents: 'next', files: ['logs'] });
				} else if (failure === 'install') {
					await assert.rejects(committed, /Install failed/);
					assert.strictEqual((await fileService.readFile(previous)).value.toString(), 'previous');
					assert.ok(!(await fileService.resolve(URI.file('/exports'))).children?.some(child => child.name.includes('backup')));
				} else {
					await assert.rejects(committed, /previous export could not be restored and is preserved at/);
					const backup = (await fileService.resolve(URI.file('/exports'))).children?.find(child => child.name.includes('backup'));
					assert.ok(backup);
					assert.strictEqual((await fileService.readFile(directory ? URI.joinPath(backup.resource, 'previous.log') : backup.resource)).value.toString(), 'previous');
				}
			});
		}
	}
});

suite('BrowserAgentHostDebugLogsExportService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const failure of ['folder', 'write'] as const) {
		test(`preserves an existing export when a destination ${failure} fails`, async () => {
			const provider = disposables.add(new class extends InMemoryFileSystemProvider {
				override async mkdir(resource: URI): Promise<void> {
					if (failure === 'folder' && resource.path.endsWith('/blocked')) {
						throw new Error('Destination is unwritable');
					}
					await super.mkdir(resource);
				}

				override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
					if (failure === 'write' && resource.path.endsWith('/blocked/bad.log')) {
						throw new Error('Destination is unwritable');
					}
					await super.writeFile(resource, content, options);
				}
			}());
			const logService = new NullLogService();
			const fileService = disposables.add(new FileService(logService));
			disposables.add(fileService.registerProvider(Schemas.file, provider));
			const instantiation = disposables.add(new TestInstantiationService());
			instantiation.stub(IFileService, fileService);
			instantiation.stub(ILogService, logService);
			instantiation.stub(IConfigurationService, new TestConfigurationService());
			instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
			const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
			const destination = URI.file('/exports/logs');
			await fileService.writeFile(URI.joinPath(destination, 'existing.log'), VSBuffer.fromString('existing'));

			await assert.rejects(service.save(destination, [
				{ path: 'before.log', contents: 'before', size: 6 },
				{ path: 'blocked/bad.log', contents: 'bad', size: 3 },
			], undefined), /Destination is unwritable/);
			assert.deepStrictEqual({
				exports: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
				files: (await fileService.resolve(destination)).children?.map(child => child.name),
				existing: (await fileService.readFile(URI.joinPath(destination, 'existing.log'))).value.toString(),
			}, { exports: ['logs'], files: ['existing.log'], existing: 'existing' });
		});
	}

	for (const local of [true, false]) {
		test(`preserves an existing export when writing a ${local ? 'local' : 'remote'} host log fails`, async () => {
			const provider = disposables.add(new class extends InMemoryFileSystemProvider {
				override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
					if (resource.path.includes('.agent-host-debug-logs-') && resource.path.endsWith('/host.log')) {
						throw new Error('Destination is unwritable');
					}
					await super.writeFile(resource, content, options);
				}
			}());
			const logService = new NullLogService();
			const fileService = disposables.add(new FileService(logService));
			disposables.add(fileService.registerProvider(Schemas.file, provider));
			const instantiation = disposables.add(new TestInstantiationService());
			instantiation.stub(IFileService, fileService);
			instantiation.stub(ILogService, logService);
			instantiation.stub(IConfigurationService, new TestConfigurationService());
			instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
			const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
			const destination = URI.file('/exports/logs');
			await fileService.writeFile(URI.joinPath(destination, 'existing.log'), VSBuffer.fromString('existing'));
			await fileService.writeFile(URI.file('/host/host.log'), VSBuffer.fromString('host'));
			await assert.rejects(service.save(destination, [], {
				artifact: {
					...artifactOfSize(4),
					kind: 'directory',
					resource: local ? URI.file('/host') : URI.parse('vscode-agent-host://remote/host'),
					entries: [{ path: 'host.log', size: 4 }],
				},
				readChunk: async () => ({ data: VSBuffer.fromString('host'), eof: true }),
			}), /Destination is unwritable/);
			assert.deepStrictEqual({
				exports: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
				existing: (await fileService.readFile(URI.joinPath(destination, 'existing.log'))).value.toString(),
			}, { exports: ['logs'], existing: 'existing' });
		});
	}

	test('skips unavailable log sources while saving other logs', async () => {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		};
		const provider = disposables.add(new InMemoryFileSystemProvider());
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.file('/exports/logs');
		await service.save(destination, [
			{ path: 'before.log', contents: 'before', size: 6 },
			{ path: 'missing.log', resource: URI.file('/missing.log'), size: 10 },
			{ path: 'remote.log', resource: URI.parse('vscode-agent-host://remote/logs/ahp.jsonl'), size: 10 },
			{ path: 'after.log', contents: 'after', size: 5 },
		], undefined);
		assert.deepStrictEqual({
			files: (await fileService.resolve(destination)).children?.map(child => child.name).sort(),
			before: (await fileService.readFile(URI.joinPath(destination, 'before.log'))).value.toString(),
			after: (await fileService.readFile(URI.joinPath(destination, 'after.log'))).value.toString(),
			warnings,
		}, {
			files: ['after.log', 'before.log'],
			before: 'before',
			after: 'after',
			warnings: ['missing.log', 'remote.log'].map(path => `[ExportAgentHostDebugLogs] Failed to save '${path}'; skipping log file`),
		});
	});

	test('removes incomplete copies when a source stream fails after writing starts', async () => {
		const source = newWriteableBufferStream();
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		};
		const fileService = disposables.add(new class extends FileService {
			override async readFileStream(...args: Parameters<FileService['readFileStream']>): Promise<IFileStreamContent> {
				if (args[0].path === '/partial-source.log') {
					return upcastPartial<IFileStreamContent>({ value: source });
				}
				return super.readFileStream(...args);
			}

			override async writeFile(...args: Parameters<FileService['writeFile']>): ReturnType<FileService['writeFile']> {
				if (args[0].path.endsWith('/partial.log')) {
					await super.writeFile(args[0], VSBuffer.fromString('partial'));
					source.error(new Error('Source read failed'));
					source.end();
				}
				return super.writeFile(...args);
			}
		}(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.file('/exports/logs');
		await service.save(destination, [
			{ path: 'partial.log', resource: URI.file('/partial-source.log'), size: 7 },
			{ path: 'after.log', contents: 'after', size: 5 },
		], undefined);
		assert.deepStrictEqual({
			files: (await fileService.resolve(destination)).children?.map(child => child.name),
			after: (await fileService.readFile(URI.joinPath(destination, 'after.log'))).value.toString(),
			warnings,
		}, {
			files: ['after.log'],
			after: 'after',
			warnings: ['[ExportAgentHostDebugLogs] Failed to save \'partial.log\'; skipping log file'],
		});
	});

	test('does not skip cancellation during a client log copy', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
				if (resource.path.endsWith('/cancel.log')) {
					cancellation.cancel();
					throw new CancellationError();
				}
				await super.writeFile(resource, content, options);
			}
		}());
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.file('/exports/logs');
		await fileService.writeFile(URI.joinPath(destination, 'existing.log'), VSBuffer.fromString('existing'));
		await assert.rejects(service.save(destination, [
			{ path: 'cancel.log', contents: 'cancel', size: 6 },
		], undefined, { token: cancellation.token, progress: { report: () => { } } }), isCancellationError);
		assert.deepStrictEqual({
			exports: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
			existing: (await fileService.readFile(URI.joinPath(destination, 'existing.log'))).value.toString(),
		}, { exports: ['logs'], existing: 'existing' });
	});

	test('cancels a folder export without leaving partial files or replacing an existing destination', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.file('/exports/logs');
		await fileService.writeFile(URI.joinPath(destination, 'existing.log'), VSBuffer.fromString('existing'));
		const cancellation = disposables.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const chunk = new DeferredPromise<IAgentHostDebugLogsChunk>();
		const saved = service.save(destination, [], {
			artifact: { ...artifactOfSize(10), kind: 'directory' },
			readChunk: () => {
				started.complete();
				return chunk.p;
			},
		}, { token: cancellation.token, progress: { report: () => { } } });
		await started.p;
		cancellation.cancel();
		await assert.rejects(saved, isCancellationError);
		chunk.complete({ data: VSBuffer.alloc(10), eof: true });
		assert.deepStrictEqual({
			files: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
			existing: (await fileService.readFile(URI.joinPath(destination, 'existing.log'))).value.toString(),
		}, { files: ['logs'], existing: 'existing' });
	});

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

	test('returns partial-export status when a remote directory-artifact read fails', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		const service = instantiation.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.file('/exports/logs');
		const result = await service.save(destination, [{ path: 'client.log', contents: 'client', size: 6 }], {
			artifact: { ...artifactOfSize(10), kind: 'directory' },
			readChunk: async () => { throw new Error('Remote log read failed'); },
		});
		assert.deepStrictEqual({
			// The failing write targets a staging folder named with a random id, and the path separator is platform specific.
			result: { hostSaveError: result.hostSaveError?.replace(/\\/g, '/').replace(/\.agent-host-debug-logs-[0-9a-f-]+/, '.agent-host-debug-logs-<id>') },
			clientLog: (await fileService.readFile(URI.joinPath(destination, 'client.log'))).value.toString(),
		}, {
			result: { hostSaveError: `Unable to write file '/exports/.agent-host-debug-logs-<id>/agenthost.log' (Error: Remote log read failed)` },
			clientLog: 'client',
		});
	});
});

suite('createHostArtifactStream', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels an unresponsive chunk read', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		const requested = new DeferredPromise<void>();
		const chunk = new DeferredPromise<IAgentHostDebugLogsChunk>();
		const stream = createHostArtifactStream(artifactOfSize(10), () => {
			requested.complete();
			return chunk.p;
		}, cancellation.token);
		const result = streamToBuffer(stream);
		await requested.p;
		cancellation.cancel();
		await assert.rejects(result, isCancellationError);
		chunk.complete({ data: VSBuffer.fromString('0123456789'), eof: true });
	});

	test('prefetches four chunks and preserves their order', async () => {
		const size = AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES;
		const contents = VSBuffer.alloc(size * 6);
		const pending = new Map<number, DeferredPromise<IAgentHostDebugLogsChunk>>();
		const prefetched = new DeferredPromise<void>();
		const stream = createHostArtifactStream(artifactOfSize(contents.byteLength), async position => {
			if (position === 0) {
				return { data: contents.slice(0, size), eof: false };
			}
			if (position >= size * 5) {
				return { data: contents.slice(position), eof: true };
			}
			const chunk = new DeferredPromise<IAgentHostDebugLogsChunk>();
			pending.set(position, chunk);
			if (pending.size === 4) {
				prefetched.complete();
			}
			return chunk.p;
		});
		const result = streamToBuffer(stream);
		await prefetched.p;
		assert.deepStrictEqual([...pending.keys()], [size, size * 2, size * 3, size * 4]);
		for (const [position, chunk] of [...pending].reverse()) {
			contents.buffer.fill(position / size, position, position + size);
			chunk.complete({ data: contents.slice(position, position + size), eof: false });
		}
		assert.deepStrictEqual((await result).buffer, contents.buffer);
	});

	test('downloads eight chunks in at most half the sequential round-trip time', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const size = AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES;
			const contents = VSBuffer.alloc(size * 8);
			const watch = StopWatch.create(false);
			let activeReads = 0;
			let maximumActiveReads = 0;
			const stream = createHostArtifactStream(artifactOfSize(contents.byteLength), async position => {
				activeReads++;
				maximumActiveReads = Math.max(maximumActiveReads, activeReads);
				await timeout(50);
				activeReads--;
				return { data: contents.slice(position, position + size), eof: position + size >= contents.byteLength };
			});
			assert.strictEqual((await streamToBuffer(stream)).byteLength, contents.byteLength);
			assert.ok(watch.elapsed() <= 200, `Expected at most 200ms versus 400ms sequential, got ${watch.elapsed()}ms`);
			assert.ok(maximumActiveReads <= 4, `Expected at most four concurrent reads, got ${maximumActiveReads}`);
		});
	});

	test('applies backpressure when the consumer is paused', async () => {
		const contents = VSBuffer.fromString('abcdefghij');
		let reads = 0;
		const cancellation = disposables.add(new CancellationTokenSource());
		const buffered = new DeferredPromise<void>();
		const stream = createHostArtifactStream(artifactOfSize(contents.byteLength), async position => {
			reads++;
			if (reads === 2) {
				buffered.complete();
			}
			return { data: contents.slice(position, position + 1), eof: position + 1 === contents.byteLength };
		}, cancellation.token);
		await buffered.p;
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(reads, 2);
		assert.strictEqual((await streamToBuffer(stream)).toString(), contents.toString());
	});

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
			defaultChat: getSessionChatResource(state, 'default', state.defaultChat),
			sideChat: getSessionChatResource(state, 'side-chat', state.defaultChat),
			missing: getSessionChatResource(state, 'missing', state.defaultChat),
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

	async function collectWithFiles(ahpFiles: readonly { name: string; mtime: number }[], hostEntryCount = 0, sharedLogCount = 1, sessionScoped = false, hostArtifactKind: IAgentHostDebugLogsArtifact['kind'] = 'archive', missionControlLogsIncluded = false, missionControlConnection = false) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const warnings: string[] = [];
		const resolvedResources: URI[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		};
		const logsHome = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
		const windowLogs = URI.joinPath(logsHome, 'window1');
		const hostArtifact: IAgentHostDebugLogsArtifact = {
			...artifactOfSize(hostEntryCount),
			kind: hostArtifactKind,
			...(hostArtifactKind === 'directory' ? { resource: URI.file('/staging') } : {}),
			entries: Array.from({ length: hostEntryCount }, (_, index) => ({
				path: missionControlLogsIncluded && index === 0 ? `ahp/mission-control/${ahpFiles.find(file => isAhpLogFileFor(MISSION_CONTROL_AHP_LOG_ID, file.name))!.name}` : `host-${index}.log`, size: 1,
			})),
		};
		const fileStat = (folder: URI, name: string, mtime = 0) => upcastPartial<IFileStatWithMetadata>({
			name,
			resource: URI.joinPath(folder, name),
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			size: 1,
			mtime,
		});
		const connection = upcastPartial<IAgentConnection>({
			clientConnectionKind: missionControlConnection ? AgentHostClientConnectionKind.MissionControl : AgentHostClientConnectionKind.Local,
			initializeResult: observableValue('initialize', upcastPartial<InitializeResult>({
				_meta: getAgentHostAhpLogDirectoryMeta(URI.file('/host-log-directory')),
			})),
			resourceUris: {
				...identityAgentHostResourceUriMapper,
				fromAgentHost: resource => missionControlConnection ? toAgentHostUri(resource, 'cloudsandbox__test') : resource,
			},
			collectDebugLogs: async () => {
				assert.strictEqual(missionControlConnection, false, 'Mission Control must not use host-management RPCs');
				return hostArtifact;
			},
			getSubscriptionUnmanaged: () => undefined,
		});
		instantiationService.stub(IAgentHostConnectionsService, {
			ambientConnection: connection,
			resolveSessionResourceIdentity: () => missionControlConnection ? {
				connectionAddress: 'native-host', connectionAuthority: 'native', backendSession: URI.parse('copilotcli:/session-1'),
			} : undefined,
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
				resolvedResources.push(resource);
				let children: IFileStatWithMetadata[];
				if (resource.path === '/logs/ahp') {
					children = ahpFiles.map(file => fileStat(resource, file.name, file.mtime));
				} else if (resource.path === '/host-log-directory') {
					children = ahpFiles.filter(file => isAhpLogFileFor(MISSION_CONTROL_AHP_LOG_ID, file.name)).map(file => fileStat(resource, file.name, file.mtime));
				} else if (resource.path === windowLogs.path) {
					children = [fileStat(resource, 'renderer.log')];
				} else if (resource.path === logsHome.path) {
					children = Array.from({ length: sharedLogCount }, (_, index) => fileStat(resource, index === 0 ? 'sharedprocess.log' : `sharedprocess.${index}.log`));
				} else if (resource.path.startsWith('/data/')) {
					return upcastPartial<IFileStatWithMetadata>({ size: 1 });
				} else {
					throw new Error(`Unexpected resource: ${resource.toString()}`);
				}
				return upcastPartial<IFileStatWithMetadata>({ children });
			},
		}));
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IWorkbenchEnvironmentService, {
			logsHome,
			windowLogsPath: windowLogs,
			logFile: URI.joinPath(windowLogs, 'renderer.log'),
			userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: '/data' }),
		});
		instantiationService.stub(IAgentHostDebugLogsExportService, { hostArtifactKind });

		const activeSession = sessionScoped ? toActiveAgentHostSession(URI.parse(missionControlConnection ? 'remote-native-copilotcli:/session-1' : 'agent-host-copilotcli:/session-1'), 'Chat', 'Session') : undefined;
		const result = await instantiationService.invokeFunction(accessor => collectAgentHostDebugLogs(accessor, activeSession ? {
			...activeSession,
			backendChatResource: URI.parse('copilotcli:/session-1/chat/default'),
		} : undefined, () => { }));
		return { result, warnings, instantiationService, resolvedResources };
	}

	const ahpFile = (host: string, connection: number, mtime = connection) => {
		const hash = new StringSHA1();
		hash.update(host);
		return {
			name: `ahp-${hash.digest()}-2026-01-01T00-00-00-000Z-connection-${connection}.jsonl`,
			mtime,
		};
	};

	for (const sessionScoped of [true, false]) {
		for (const kind of ['archive', 'directory'] as const) {
			test(`exports client logs without fetching remote Mission Control logs (sessionScoped=${sessionScoped}, kind=${kind})`, async () => {
				const relay = ahpFile(MISSION_CONTROL_AHP_LOG_ID, 1);
				const client = ahpFile('native-host', 2);
				const { result, warnings, resolvedResources } = await collectWithFiles([relay, client], 0, 1, sessionScoped, kind, false, true);
				assert.deepStrictEqual({
					paths: result.files.map(file => file.path),
					remoteFiles: result.files.filter(file => hasKey(file, { resource: true }) && file.resource.scheme === AGENT_HOST_SCHEME),
					remoteResolutions: resolvedResources.filter(resource => resource.scheme === AGENT_HOST_SCHEME),
					hostArtifact: result.hostArtifact,
					warnings,
				}, {
					paths: [
						'vscode-logs/Window/renderer.log',
						'vscode-logs/Shared/sharedprocess.log',
						...sessionScoped ? ['usage.jsonl', 'customizations.json'] : [],
						`ahp/${client.name}`,
						...sessionScoped ? [] : [`ahp/${relay.name}`],
					],
					remoteFiles: [],
					remoteResolutions: [],
					hostArtifact: undefined,
					warnings: [],
				});
			});
		}
	}

	test('collects local Mission Control logs for a local session', async () => {
		const relay = ahpFile(MISSION_CONTROL_AHP_LOG_ID, 1);
		const local = ahpFile('local-client', 2);
		const unrelated = ahpFile('other-host', 3);
		const { result, warnings } = await collectWithFiles([relay, local, unrelated], 0, 1, true);
		assert.deepStrictEqual({
			wireFiles: result.files.filter(file => file.path.startsWith('ahp/')).map(file => file.path),
			warnings,
		}, {
			wireFiles: [`ahp/${local.name}`, `ahp/${relay.name}`],
			warnings: [],
		});
	});

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

	for (const missionControlLogsIncluded of [true, false]) {
		test(`retains Mission Control fallback candidates when host inclusion is ${missionControlLogsIncluded}`, async () => {
			const relay = ahpFile(MISSION_CONTROL_AHP_LOG_ID, 1);
			const local = ahpFile('local-client', 2);
			const { result, warnings } = await collectWithFiles([relay, local], 1, 1, false, 'archive', missionControlLogsIncluded);
			assert.deepStrictEqual({
				wireFiles: result.files.filter(file => file.path.startsWith('ahp/')).map(file => file.path),
				warnings,
			}, {
				wireFiles: [`ahp/${local.name}`, `ahp/${relay.name}`],
				warnings: [],
			});
		});
	}

	for (const hostEntryCount of [0, 990, 1000]) {
		test(`retains up to 1000 client candidates with ${hostEntryCount} host artifact entries`, async () => {
			const { result, warnings } = await collectWithFiles([], hostEntryCount, 1160);

			assert.deepStrictEqual({
				clientFileCount: result.files.length,
				hostEntryCount: result.hostArtifact?.artifact.entries.length,
				firstClientFile: result.files[0]?.path,
				warnings,
			}, {
				clientFileCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
				hostEntryCount,
				firstClientFile: 'vscode-logs/Window/renderer.log',
				warnings: ['[ExportAgentHostDebugLogs] Omitted 161 log files to keep the export within 1000 entries and 10 AHP files per host'],
			});
		});
	}

	test('caps folder exports at 1000 client files without reserving host-directory entries', async () => {
		const { result, warnings } = await collectWithFiles([], 1000, 1160, false, 'directory');

		assert.deepStrictEqual({
			clientFileCount: result.files.length,
			hostEntryCount: result.hostArtifact?.artifact.entries.length,
			firstClientFile: result.files[0]?.path,
			warnings,
		}, {
			clientFileCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			hostEntryCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			firstClientFile: 'vscode-logs/Window/renderer.log',
			warnings: ['[ExportAgentHostDebugLogs] Omitted 161 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	test('saves client logs and sidecars when a full host-directory artifact disappears', async () => {
		const ahpFiles = Array.from({ length: 10 }, (_, index) => ahpFile('local-client', index));
		const { result, warnings, instantiationService } = await collectWithFiles(ahpFiles, 1000, 1, true, 'directory');
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		for (const file of result.files) {
			assert.ok(hasKey(file, { resource: true }));
			await fileService.writeFile(file.resource, VSBuffer.fromString('x'));
		}
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const service = instantiationService.createInstance(BrowserAgentHostDebugLogsExportService);
		const destination = URI.from({ scheme: Schemas.inMemory, path: '/exports/ah-logs' });

		await service.save(destination, result.files, result.hostArtifact);

		const paths = [
			'vscode-logs/Window/renderer.log',
			'vscode-logs/Shared/sharedprocess.log',
			'usage.jsonl',
			'customizations.json',
			...ahpFiles.slice().reverse().map(file => `ahp/${file.name}`),
		];
		assert.deepStrictEqual({
			savedFiles: await Promise.all(paths.map(async path => ({ path, contents: (await fileService.readFile(URI.joinPath(destination, path))).value.toString() }))),
			hostCopyFailureReported: warnings.length === 1 && warnings[0].includes('Failed to save Agent Host logs:') && warnings[0].endsWith('; saving client-owned logs only'),
		}, {
			savedFiles: paths.map(path => ({ path, contents: 'x' })),
			hostCopyFailureReported: true,
		});
	});

	for (const sessionScoped of [true, false]) {
		for (const outcome of ['success', 'missing', 'corrupt'] as const) {
			test(`preserves Mission Control directory fallback for ${outcome} host copies (sessionScoped=${sessionScoped})`, async () => {
				const relay = ahpFile(MISSION_CONTROL_AHP_LOG_ID, 1);
				const { result, warnings, instantiationService } = await collectWithFiles([relay], 1, 1, sessionScoped, 'directory', true);
				const fileService = disposables.add(new FileService(new NullLogService()));
				disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
				disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
				for (const file of result.files) {
					assert.ok(hasKey(file, { resource: true }));
					await fileService.writeFile(file.resource, VSBuffer.fromString('x'));
				}
				const hostPath = `ahp/mission-control/${relay.name}`;
				if (outcome !== 'missing') {
					await fileService.writeFile(URI.file(`/staging/${hostPath}`), VSBuffer.fromString(outcome === 'success' ? 'h' : 'corrupt'));
				}
				instantiationService.stub(IFileService, fileService);
				instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
				instantiationService.stub(IConfigurationService, new TestConfigurationService());
				const service = instantiationService.createInstance(BrowserAgentHostDebugLogsExportService);
				const destination = URI.from({ scheme: Schemas.inMemory, path: '/exports/logs' });
				await service.save(destination, result.files, result.hostArtifact);
				assert.deepStrictEqual({
					hostSaved: await fileService.exists(URI.joinPath(destination, hostPath)),
					fallbackSaved: await fileService.exists(URI.joinPath(destination, 'ahp', relay.name)),
					failureReported: warnings.some(warning => warning.includes('Failed to save Agent Host logs:')),
				}, { hostSaved: outcome === 'success', fallbackSaved: outcome !== 'success', failureReported: outcome !== 'success' });
			});
		}
	}

	test('retains process logs and recent transport candidates independently of the host archive', async () => {
		const ahpFiles = Array.from({ length: 20 }, (_, index) => ahpFile('a', index));
		const { result, warnings } = await collectWithFiles(ahpFiles, 995);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			clientFileCount: result.files.length,
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				...ahpFiles.slice(-10).reverse().map(file => `ahp/${file.name}`),
			],
			clientFileCount: 12,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 10 log files to keep the export within 1000 entries and 10 AHP files per host'],
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

	test('caps transport candidates across many hosts at the client entry budget', async () => {
		const ahpFiles = Array.from({ length: 1100 }, (_, index) => ahpFile(`host-${Math.floor(index / 10)}`, index));
		const { result, warnings } = await collectWithFiles(ahpFiles, 5);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			clientFileCount: result.files.length,
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				...ahpFiles.slice(-998).reverse().map(file => `ahp/${file.name}`),
			],
			clientFileCount: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 102 log files to keep the export within 1000 entries and 10 AHP files per host'],
		});
	});

	test('preserves session sidecars before scoped transport history', async () => {
		const ahpFiles = Array.from({ length: 20 }, (_, index) => ahpFile('local-client', index));
		const unrelatedFiles = Array.from({ length: 20 }, (_, index) => ahpFile('unrelated', index + 100));
		const { result, warnings } = await collectWithFiles([...ahpFiles, ...unrelatedFiles], 995, 1, true);

		assert.deepStrictEqual({
			paths: result.files.map(file => file.path),
			clientFileCount: result.files.length,
			warnings,
		}, {
			paths: [
				'vscode-logs/Window/renderer.log',
				'vscode-logs/Shared/sharedprocess.log',
				'usage.jsonl',
				'customizations.json',
				...ahpFiles.slice(-10).reverse().map(file => `ahp/${file.name}`),
			],
			clientFileCount: 14,
			warnings: ['[ExportAgentHostDebugLogs] Omitted 10 log files to keep the export within 1000 entries and 10 AHP files per host'],
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
