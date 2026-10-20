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
import { IAgentHostDebugLogsHostArtifact } from '../../../browser/actions/exportAgentHostDebugLogsAction.js';
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
		return { service: instantiation.createInstance(NativeAgentHostDebugLogsExportService), fileService, warnings };
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

	test('does not turn host archive download cancellation into a partial export', async () => {
		let zipCreated = false;
		const { service, fileService } = setupService(upcastPartial<INativeHostService>({
			onDidProgressZipFile: Event.None,
			createZipFile: async () => { zipCreated = true; },
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
			createZipFile: async target => { await fileService.writeFile(target, VSBuffer.fromString('new ZIP')); },
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
