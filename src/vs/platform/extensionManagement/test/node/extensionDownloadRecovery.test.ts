/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import * as fs from 'fs/promises';
import * as os from 'os';
import sinon from 'sinon';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { zip } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IExtensionGalleryService, IGalleryExtension, InstallOperation } from '../../common/extensionManagement.js';
import { ExtensionsDownloader } from '../../node/extensionDownloader.js';
import { IExtensionSignatureVerificationService } from '../../node/extensionSignatureVerificationService.js';

suite('Extension download recovery', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const children: ChildProcess[] = [];
	let root: URI;
	let cache: URI;
	let fixture: URI;
	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	let downloads: number;
	const extension = { identifier: { id: 'test.recovery' }, publisher: 'test', name: 'recovery', version: '1.0.0', properties: {}, isSigned: false } as IGalleryExtension;

	setup(async () => {
		root = URI.file(await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-download-recovery-')));
		cache = joinPath(root, 'CachedExtensionVSIXs');
		fixture = joinPath(root, 'fixture.vsix');
		await fs.mkdir(cache.fsPath);
		await zip(fixture.fsPath, [{ path: 'extension/package.json', contents: JSON.stringify({ publisher: 'test', name: 'recovery', version: '1.0.0' }) }]);
		const logService = disposables.add(new NullLogService());
		fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(INativeEnvironmentService, { extensionsDownloadLocation: cache });
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(IExtensionSignatureVerificationService, {});
		downloads = 0;
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			await fs.copyFile(fixture.fsPath, location.fsPath);
		} });
	});

	teardown(async () => {
		for (const child of children.splice(0)) {
			await stop(child);
		}
		sinon.restore();
		await fs.rm(root.fsPath, { recursive: true, force: true });
	});

	function downloader(): ExtensionsDownloader {
		return disposables.add(instantiationService.createInstance(ExtensionsDownloader));
	}

	async function stop(child: ChildProcess): Promise<void> {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		}
	}

	async function blockDeletion(location: URI): Promise<() => Promise<void>> {
		if (!isWindows) {
			await fs.chmod(path.dirname(location.fsPath), 0o500);
			return () => fs.chmod(path.dirname(location.fsPath), 0o700);
		}
		const payload = location.fsPath.replace(/'/g, '\'\'');
		const script = `$stream = [System.IO.File]::Open('${payload}', 'Open', 'Read', 'ReadWrite'); [Console]::Out.WriteLine('ready'); [Console]::Out.Flush(); [Console]::ReadLine() > $null; $stream.Dispose()`;
		const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
		const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
		children.push(child);
		await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('File-lock helper exited before acquiring the lock'); })]);
		return () => stop(child);
	}

	test('downloads and validates a real VSIX, then reuses its completed cache entry', async () => {
		const service = downloader();
		await service.download(extension, InstallOperation.Install, false);
		await service.download(extension, InstallOperation.Install, false);
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: ['test.recovery-1.0.0'], downloads: 1 });
	});

	test('cleans partial files between the existing download retries', async () => {
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			await fs.writeFile(location.fsPath, 'partial download');
			throw new Error('download interrupted');
		} });
		await assert.rejects(downloader().download(extension, InstallOperation.Install, false), /download interrupted/);
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 3 });
	});

	test('hands failed temporary deletions to trash and removes them before another download', async () => {
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			await fs.writeFile(location.fsPath, 'partial download');
			throw new Error('download interrupted');
		} });
		const deletion = sinon.stub(fileService, 'del').callThrough();
		deletion.withArgs(sinon.match((location: URI) => path.dirname(location.fsPath) === cache.fsPath && path.basename(location.fsPath).startsWith('.'))).rejects(new FileOperationError('blocked', FileOperationResult.FILE_PERMISSION_DENIED));
		const service = downloader();
		await assert.rejects(service.download(extension, InstallOperation.Install, false), /download interrupted/);
		assert.deepStrictEqual(await fs.readdir(cache.fsPath), ['.trash']);
		assert.strictEqual((await fs.readdir(joinPath(cache, '.trash').fsPath)).length, 1);
		deletion.restore();
		instantiationService.stub(IExtensionGalleryService, 'download', async (_extension: IGalleryExtension, location: URI) => fs.copyFile(fixture.fsPath, location.fsPath));
		await service.download(extension, InstallOperation.Install, false);
		assert.deepStrictEqual(await fs.readdir(cache.fsPath), ['test.recovery-1.0.0']);
	});

	test('keeps blocked trash at its original path and retries without another download', async () => {
		const service = downloader();
		await service.cleanUpTemporaryDownloads();
		const trash = joinPath(cache, '.trash');
		await fs.mkdir(trash.fsPath);
		const payload = joinPath(trash, 'failed-download');
		await fs.writeFile(payload.fsPath, 'partial download');
		const unblock = await blockDeletion(payload);
		try {
			await service.cleanUpTemporaryDownloads();
			assert.strictEqual(await fs.readFile(payload.fsPath, 'utf8'), 'partial download');
		} finally {
			await unblock();
		}
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 0 });
	});

	test('preserves the normal twenty-entry cache policy and unmarked legacy files', async () => {
		for (let index = 0; index < 25; index++) {
			const location = joinPath(cache, `pub.extension${index.toString().padStart(2, '0')}-1.0.0`);
			await fs.writeFile(location.fsPath, 'cached');
			const date = new Date(1000 * (index + 1));
			await fs.utimes(location.fsPath, date, date);
		}
		await fs.writeFile(joinPath(cache, 'pub.extension24-0.0.1').fsPath, 'old version');
		await fs.writeFile(joinPath(cache, 'pub.extension24-1.0.0.sigzip').fsPath, 'signature');
		const legacy = `.${generateUuid()}`;
		await fs.writeFile(joinPath(cache, legacy).fsPath, 'unknown owner');
		await downloader().cleanUpTemporaryDownloads();
		assert.deepStrictEqual((await fs.readdir(cache.fsPath)).sort(), [legacy, ...Array.from({ length: 20 }, (_, index) => `pub.extension${(index + 5).toString().padStart(2, '0')}-1.0.0`)].sort());
	});
});
