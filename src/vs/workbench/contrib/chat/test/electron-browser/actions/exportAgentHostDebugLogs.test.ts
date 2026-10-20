/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, IAgentHostService, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INativeHostService, INativeZipFile, INativeZipProgress } from '../../../../../../platform/native/common/native.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { collectAgentHostDebugLogs, IAgentHostDebugLogsExportService, IAgentHostDebugLogsHostArtifact } from '../../../browser/actions/exportAgentHostDebugLogsAction.js';
import { NativeAgentHostDebugLogsExportService } from '../../../electron-browser/actions/exportAgentHostDebugLogsService.js';

suite('NativeAgentHostDebugLogsExportService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setupService(nativeHost: INativeHostService, provider = new InMemoryFileSystemProvider()) {
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		};
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(provider)));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(INativeHostService, nativeHost);
		instantiation.stub(INativeEnvironmentService, upcastPartial<INativeEnvironmentService>({ tmpDir: URI.file('/tmp') }));
		instantiation.stub(ILogService, logService);
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		return { service: instantiation.createInstance(NativeAgentHostDebugLogsExportService), fileService, warnings, instantiation };
	}

	function remoteArtifact(): IAgentHostDebugLogsHostArtifact {
		const contents = VSBuffer.fromString('host ZIP bytes');
		return {
			artifact: {
				kind: 'archive', resource: URI.parse('vscode-agent-host://remote/tmp/host.zip'),
				providerLogsIncluded: true, size: contents.byteLength, uncompressedSize: 1000,
				entries: [{ path: 'events.jsonl', size: 1000 }],
			},
			readChunk: async (_resource, position) => ({ data: contents.slice(position), eof: true }),
		};
	}

	test('downloads the host ZIP and stores it without merging or recompressing', async () => {
		const zipProgress = disposables.add(new Emitter<INativeZipProgress>());
		let entries: INativeZipFile[] = [];
		let downloaded = '';
		const progress: string[] = [];
		const nativeHost = upcastPartial<INativeHostService>({
			onDidProgressZipFile: zipProgress.event,
			cancelZipFile: async () => { },
			createZipFile: async (target, files, options) => {
				entries = files;
				const host = files.find(file => hasKey(file, { source: true }) && file.path === 'host-logs.zip');
				assert.ok(host && hasKey(host, { source: true }));
				downloaded = (await fileService.readFile(host.source)).value.toString();
				zipProgress.fire({ operationId: options!.operationId!, bytes: 14, total: 14, path: 'host-logs.zip' });
				await fileService.writeFile(target, VSBuffer.fromString('final ZIP'));
				return { skippedFiles: [] };
			},
		});
		const { service, fileService } = setupService(nativeHost);
		const destination = URI.file('/exports/logs.zip');
		const cancellation = disposables.add(new CancellationTokenSource());
		await service.save(destination, [], remoteArtifact(), {
			token: cancellation.token, progress: { report: step => progress.push(typeof step.message === 'string' ? step.message : '') },
		});
		assert.deepStrictEqual({
			entries: entries.map(file => hasKey(file, { source: true }) ? { path: file.path, compress: file.compress, size: file.size } : file),
			downloaded,
			saved: (await fileService.readFile(destination)).value.toString(),
			downloadReported: progress.some(message => message.startsWith('Downloading')),
			zipReported: progress.some(message => message.startsWith('Creating ZIP')),
			temporaryFiles: (await fileService.resolve(URI.file('/tmp'))).children?.map(child => child.name),
		}, {
			entries: [{ path: 'host-logs.zip', compress: false, size: 14 }],
			downloaded: 'host ZIP bytes',
			saved: 'final ZIP',
			downloadReported: true, zipReported: true, temporaryFiles: [],
		});
	});

	test('skips unsupported log resources and marks local sources as best-effort', async () => {
		let entries: INativeZipFile[] = [];
		const { service, fileService, warnings } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async (target, files) => {
				entries = files;
				await fileService.writeFile(target, VSBuffer.fromString('final ZIP'));
				return { skippedFiles: [] };
			},
		}));
		const destination = URI.file('/exports/logs.zip');
		const local = URI.file('/logs/client.log');
		const remote = URI.parse('vscode-agent-host://remote/logs/ahp.jsonl');
		const userData = URI.file('/logs/usage.jsonl');
		await service.save(destination, [
			{ path: 'before.log', contents: 'before', size: 6 },
			{ path: 'remote.jsonl', resource: remote, size: 10 },
			{ path: 'client.log', resource: local, size: 20 },
			{ path: 'usage.jsonl', resource: userData.with({ scheme: Schemas.vscodeUserData }), size: 30 },
			{ path: 'after.log', contents: 'after', size: 5 },
		], undefined);
		assert.deepStrictEqual({
			entries,
			saved: (await fileService.readFile(destination)).value.toString(),
			warnings,
		}, {
			entries: [
				{ path: 'before.log', contents: 'before', size: 6 },
				{ path: 'client.log', source: local, size: 20, skipSourceErrors: true },
				{ path: 'usage.jsonl', source: userData, size: 30, skipSourceErrors: true },
				{ path: 'after.log', contents: 'after', size: 5 },
			],
			saved: 'final ZIP',
			warnings: [`[ExportAgentHostDebugLogs] Cannot add non-local resource '${remote.toString()}' to a ZIP; skipping 'remote.jsonl'`],
		});
	});

	test('saves client logs and reports partial export when the host archive download fails', async () => {
		let entries: INativeZipFile[] = [];
		const { service, fileService, warnings } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async (target, files) => {
				entries = files;
				await fileService.writeFile(target, VSBuffer.fromString('client ZIP'));
				return { skippedFiles: [] };
			},
		}));
		await fileService.createFolder(URI.file('/tmp'));
		const destination = URI.file('/exports/logs.zip');
		const client = { path: 'client.log', contents: 'client', size: 6 };
		const result = await service.save(destination, [client], {
			...remoteArtifact(),
			readChunk: async () => { throw new Error('Remote log read failed'); },
		});
		assert.deepStrictEqual({
			entries,
			saved: (await fileService.readFile(destination)).value.toString(),
			hostFailureReported: result.hostSaveError?.includes('Remote log read failed'),
			warnings,
			temporaryFiles: (await fileService.resolve(URI.file('/tmp'))).children?.map(child => child.name),
		}, {
			entries: [client],
			saved: 'client ZIP',
			hostFailureReported: true,
			warnings: ['[ExportAgentHostDebugLogs] Failed to save Agent Host logs; saving client-owned logs only'],
			temporaryFiles: [],
		});
	});

	test('retains collected client logs when a full host archive download fails', async () => {
		let paths: string[] = [];
		const { service, fileService, instantiation } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async (target, files) => {
				paths = files.map(file => hasKey(file, { path: true }) ? file.path : '');
				await fileService.writeFile(target, VSBuffer.fromString('client ZIP'));
				return { skippedFiles: [] };
			},
		}));
		const artifact = {
			...remoteArtifact().artifact,
			entries: Array.from({ length: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES }, (_, index) => ({ path: `host-${index}.log`, size: 1 })),
		};
		instantiation.stub(IAgentHostConnectionsService, {
			ambientConnection: upcastPartial<IAgentConnection>({
				clientConnectionKind: AgentHostClientConnectionKind.Local,
				collectDebugLogs: async () => artifact,
				readDebugLogsChunk: async () => { throw new Error('Remote log read failed'); },
			}),
		});
		instantiation.stub(IAgentHostService, { clientId: 'local-client' });
		instantiation.stub(IRemoteAgentHostService, { connections: [] });
		instantiation.stub(IAgentHostDebugLogsExportService, service);
		const logsHome = URI.file('/logs');
		const windowLogs = URI.joinPath(logsHome, 'window1');
		const rendererLog = URI.joinPath(windowLogs, 'renderer.log');
		await fileService.writeFile(rendererLog, VSBuffer.fromString('renderer'));
		await fileService.writeFile(URI.joinPath(logsHome, 'sharedprocess.log'), VSBuffer.fromString('shared'));
		await fileService.createFolder(URI.joinPath(logsHome, 'ahp'));
		instantiation.stub(IWorkbenchEnvironmentService, {
			logsHome, windowLogsPath: windowLogs, logFile: rendererLog, userRoamingDataHome: URI.file('/data'),
		});
		const collected = await instantiation.invokeFunction(accessor => collectAgentHostDebugLogs(accessor, undefined, () => { }));
		const destination = URI.file('/exports/logs.zip');
		const result = await service.save(destination, collected.files, collected.hostArtifact);

		assert.deepStrictEqual({
			paths,
			saved: (await fileService.readFile(destination)).value.toString(),
			hostFailureReported: result.hostSaveError?.includes('Remote log read failed'),
		}, {
			paths: ['vscode-logs/Window/renderer.log', 'vscode-logs/Shared/sharedprocess.log'],
			saved: 'client ZIP',
			hostFailureReported: true,
		});
	});

	for (const hostEntryCount of [0, 990, 1000]) {
		test(`applies the combined entry budget after a ${hostEntryCount}-entry host archive is available`, async () => {
			let paths: string[] = [];
			const { service, fileService, warnings } = setupService(upcastPartial<INativeHostService>({
				onDidProgressZipFile: Event.None,
				createZipFile: async (target, files) => {
					paths = files.map(file => hasKey(file, { path: true }) ? file.path : '');
					await fileService.writeFile(target, VSBuffer.fromString('final ZIP'));
					return { skippedFiles: [] };
				},
			}));
			const host = remoteArtifact();
			const clientFiles = Array.from({ length: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES }, (_, index) => ({ path: `client-${index}.log`, contents: 'x', size: 1 }));
			const clientCount = AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES - Math.max(1, hostEntryCount);
			await service.save(URI.file('/exports/logs.zip'), clientFiles, {
				...host,
				artifact: { ...host.artifact, entries: Array.from({ length: hostEntryCount }, (_, index) => ({ path: `host-${index}.log`, size: 1 })) },
			});
			assert.deepStrictEqual({
				paths,
				warnings,
			}, {
				paths: [...clientFiles.slice(0, clientCount).map(file => file.path), 'host-logs.zip'],
				warnings: [`[ExportAgentHostDebugLogs] Omitted ${AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES - clientCount} client log files to keep the combined export within 1000 entries`],
			});
		});
	}

	for (const fails of [true, false]) {
		test(`deduplicates Mission Control logs only after host download succeeds (fails=${fails})`, async () => {
			let paths: string[] = [];
			const { service, fileService } = setupService(upcastPartial<INativeHostService>({
				onDidProgressZipFile: Event.None,
				createZipFile: async (target, files) => {
					paths = files.map(file => hasKey(file, { path: true }) ? file.path : '');
					await fileService.writeFile(target, VSBuffer.fromString('final ZIP'));
					return { skippedFiles: [] };
				},
			}));
			const host = remoteArtifact();
			await service.save(URI.file('/exports/logs.zip'), [
				{ path: 'ahp/relay.jsonl', contents: 'relay', size: 5 },
				{ path: 'client.log', contents: 'client', size: 6 },
			], {
				artifact: { ...host.artifact, entries: [{ path: 'ahp/mission-control/relay.jsonl', size: 5 }] },
				readChunk: fails ? async () => { throw new Error('Remote log read failed'); } : host.readChunk,
			});
			assert.deepStrictEqual(paths, fails
				? ['ahp/relay.jsonl', 'client.log']
				: ['client.log', 'host-logs.zip']);
		});
	}

	for (const stage of ['inspection', 'open']) {
		test(`reports a host archive skipped during native ${stage} and restores the client budget`, async () => {
			const attempts: string[][] = [];
			const sourceError = `Host archive ${stage} failed`;
			const { service, fileService, warnings } = setupService(upcastPartial<INativeHostService>({
				onDidProgressZipFile: Event.None,
				createZipFile: async (target, files) => {
					attempts.push(files.map(file => hasKey(file, { path: true }) ? file.path : ''));
					if (attempts.length === 1) {
						await fileService.writeFile(target, VSBuffer.fromString('incomplete ZIP'));
						return { skippedFiles: [{ path: 'host-logs.zip', error: sourceError }] };
					}
					await fileService.writeFile(target, VSBuffer.fromString('client ZIP'));
					return { skippedFiles: [] };
				},
			}));
			const host = remoteArtifact();
			const destination = URI.file('/exports/logs.zip');
			await fileService.writeFile(destination, VSBuffer.fromString('previous ZIP'));
			const result = await service.save(destination, [
				{ path: 'client.log', contents: 'client', size: 6 },
				{ path: 'ahp/relay.jsonl', contents: 'relay', size: 5 },
			], {
				...host,
				artifact: { ...host.artifact, entries: Array.from({ length: AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES }, (_, index) => ({ path: `host-${index}.log`, size: 1 })) },
			});
			assert.deepStrictEqual({
				attempts,
				result,
				saved: (await fileService.readFile(destination)).value.toString(),
				hostFailureLogged: warnings.some(message => message.includes(sourceError)),
			}, {
				attempts: [['host-logs.zip'], ['client.log', 'ahp/relay.jsonl']],
				result: { hostSaveError: sourceError },
				saved: 'client ZIP',
				hostFailureLogged: true,
			});
		});
	}

	test('preserves the previous export when the client-only ZIP retry fails', async () => {
		let attempts = 0;
		const { service, fileService } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async (target, _files) => {
				if (++attempts === 1) {
					await fileService.writeFile(target, VSBuffer.fromString('incomplete ZIP'));
					return { skippedFiles: [{ path: 'host-logs.zip', error: 'Host archive disappeared' }] };
				}
				throw new Error('Disk full');
			},
		}));
		const destination = URI.file('/exports/logs.zip');
		await fileService.writeFile(destination, VSBuffer.fromString('previous ZIP'));
		await assert.rejects(service.save(destination, [{ path: 'client.log', contents: 'client', size: 6 }], remoteArtifact()), /Disk full/);
		assert.deepStrictEqual({
			attempts,
			saved: (await fileService.readFile(destination)).value.toString(),
		}, { attempts: 2, saved: 'previous ZIP' });
	});

	test('does not turn host archive download cancellation into a partial export', async () => {
		let zipCreated = false;
		const { service, fileService } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async () => { zipCreated = true; return { skippedFiles: [] }; },
		}));
		const destination = URI.file('/exports/logs.zip');
		await fileService.writeFile(destination, VSBuffer.fromString('existing'));
		const cancellation = disposables.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const chunk = new DeferredPromise<{ data: VSBuffer; eof: boolean }>();
		const saved = service.save(destination, [], {
			...remoteArtifact(),
			readChunk: () => {
				started.complete();
				return chunk.p;
			},
		}, { token: cancellation.token, progress: { report: () => { } } });
		await started.p;
		cancellation.cancel();
		await assert.rejects(saved, isCancellationError);
		chunk.complete({ data: VSBuffer.fromString('host ZIP bytes'), eof: true });
		assert.deepStrictEqual({
			zipCreated,
			existing: (await fileService.readFile(destination)).value.toString(),
		}, { zipCreated: false, existing: 'existing' });
	});

	test('reports ZIP output failures instead of treating them as missing sources', async () => {
		const { service, fileService } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async () => { throw new Error('Disk full'); },
		}));
		const destination = URI.file('/exports/logs.zip');
		await fileService.writeFile(destination, VSBuffer.fromString('existing'));
		await assert.rejects(service.save(destination, [], undefined), /Disk full/);
		assert.strictEqual((await fileService.readFile(destination)).value.toString(), 'existing');
	});

	test('cancels native ZIP creation, removes temporary files, and preserves an existing destination', async () => {
		const zipProgress = disposables.add(new Emitter<INativeZipProgress>());
		const started = new DeferredPromise<void>();
		const completion = new DeferredPromise<void>();
		let activeOperation: string | undefined;
		let cancelledOperation: string | undefined;
		const nativeHost = upcastPartial<INativeHostService>({
			onDidProgressZipFile: zipProgress.event,
			createZipFile: async (target, _files, options) => {
				activeOperation = options?.operationId;
				await fileService.writeFile(target, VSBuffer.fromString('partial'));
				started.complete();
				await completion.p;
				return { skippedFiles: [] };
			},
			cancelZipFile: async operationId => {
				cancelledOperation = operationId;
				completion.error(new CancellationError());
			},
		});
		const { service, fileService } = setupService(nativeHost);
		const destination = URI.file('/exports/logs.zip');
		await fileService.writeFile(destination, VSBuffer.fromString('existing'));
		const cancellation = disposables.add(new CancellationTokenSource());
		const saved = service.save(destination, [], remoteArtifact(), {
			token: cancellation.token, progress: { report: () => { } },
		});
		await started.p;
		cancellation.cancel();
		await assert.rejects(saved, isCancellationError);
		assert.deepStrictEqual({
			cancelled: cancelledOperation === activeOperation,
			existing: (await fileService.readFile(destination)).value.toString(),
			exportFiles: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
			temporaryFiles: (await fileService.resolve(URI.file('/tmp'))).children?.map(child => child.name),
		}, { cancelled: true, existing: 'existing', exportFiles: ['logs.zip'], temporaryFiles: [] });
	});

	test('restores the previous ZIP when the final rename fails and removes staging', async () => {
		const zipProgress = disposables.add(new Emitter<INativeZipProgress>());
		const provider = new class extends InMemoryFileSystemProvider {
			override async rename(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
				if (from.path.includes('.agent-host-debug-logs-') && from.path.endsWith('.zip')) {
					throw new Error('Install failed');
				}
				await super.rename(from, to, options);
			}
		}();
		const { service, fileService } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: zipProgress.event,
			cancelZipFile: async () => { },
			createZipFile: async target => {
				await fileService.writeFile(target, VSBuffer.fromString('new ZIP'));
				return { skippedFiles: [] };
			},
		}), provider);
		const destination = URI.file('/exports/logs.zip');
		await fileService.writeFile(destination, VSBuffer.fromString('previous ZIP'));
		await assert.rejects(service.save(destination, [], undefined), /Install failed/);
		assert.deepStrictEqual({
			files: (await fileService.resolve(URI.file('/exports'))).children?.map(child => child.name),
			previous: (await fileService.readFile(destination)).value.toString(),
		}, { files: ['logs.zip'], previous: 'previous ZIP' });
	});
});
