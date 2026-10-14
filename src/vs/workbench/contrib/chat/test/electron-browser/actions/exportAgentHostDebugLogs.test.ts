/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
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
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(provider)));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, fileService);
		instantiation.stub(INativeHostService, nativeHost);
		instantiation.stub(INativeEnvironmentService, upcastPartial<INativeEnvironmentService>({ tmpDir: URI.file('/tmp') }));
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
		return { service: instantiation.createInstance(NativeAgentHostDebugLogsExportService), fileService };
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
