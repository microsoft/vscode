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
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { zip } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileOperation, FileOperationError, FileOperationResult, IFileService } from '../../../files/common/files.js';
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

	async function ownedDownload(pid: number, owner: { hostname?: string; platform?: string; readyToDelete?: boolean } = {}): Promise<URI> {
		const location = joinPath(cache, `.${generateUuid()}`);
		await fs.writeFile(`${location.fsPath}.vscdownload`, JSON.stringify({ pid, hostname: os.hostname(), platform: process.platform, ...owner }));
		await fs.writeFile(location.fsPath, 'partial download');
		return location;
	}

	function whenRecordDeleted(location: URI): Promise<void> {
		const metadata = `${location.toString()}.vscdownload`;
		return Event.toPromise(Event.filter(fileService.onDidRunOperation, event => event.isOperation(FileOperation.DELETE) && event.resource.toString() === metadata)).then(() => undefined);
	}

	async function exitedOwner(): Promise<number> {
		const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000);'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		children.push(child);
		await once(child.stdout, 'data');
		assert.ok(child.pid);
		const pid = child.pid;
		await stop(child);
		return pid;
	}

	async function pausedDownload(phase: 'download' | 'rename'): Promise<{ child: ChildProcess; location: URI }> {
		const fileRoot = globalThis._VSCODE_FILE_ROOT;
		assert.ok(fileRoot);
		const base = fileRoot.endsWith('/') ? fileRoot : `${fileRoot}/`;
		const worker = new URL('./fixtures/extensionDownloadWorker.js', import.meta.url).href;
		const bootstrap = `import fs from 'node:fs'; globalThis._VSCODE_FILE_ROOT = ${JSON.stringify(fileRoot)}; globalThis._VSCODE_PRODUCT_JSON = JSON.parse(fs.readFileSync(new URL('../product.json', ${JSON.stringify(base)}), 'utf8')); globalThis._VSCODE_PACKAGE_JSON = JSON.parse(fs.readFileSync(new URL('../package.json', ${JSON.stringify(base)}), 'utf8')); await import(${JSON.stringify(worker)});`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DOWNLOAD_TEST_ROOT: root.fsPath, VSCODE_DOWNLOAD_TEST_PHASE: phase }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
		children.push(child);
		const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('Download worker exited before reaching its pause'); })]);
		assert.strictEqual(message.type, 'paused', message.error);
		const location = URI.parse(message.location);
		assert.strictEqual(JSON.parse(await fs.readFile(`${location.fsPath}.vscdownload`, 'utf8')).pid, child.pid);
		return { child, location };
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
		deletion.withArgs(sinon.match((location: URI) => path.dirname(location.fsPath) === cache.fsPath && isUUID(path.basename(location.fsPath).slice(1)))).rejects(new FileOperationError('blocked', FileOperationResult.FILE_PERMISSION_DENIED));
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

	test('initialization recovers all owned abandoned files without downloading anything', async () => {
		const pid = await exitedOwner();
		const abandoned = await Promise.all([ownedDownload(pid), ownedDownload(pid), ownedDownload(pid)]);
		const active = await ownedDownload(process.pid);
		const removed = Promise.all(abandoned.map(location => whenRecordDeleted(location)));
		downloader();
		await removed;
		assert.deepStrictEqual({ files: (await fs.readdir(cache.fsPath)).sort(), downloads }, { files: [path.basename(active.fsPath), `${path.basename(active.fsPath)}.vscdownload`].sort(), downloads: 0 });
	});

	for (const phase of ['download', 'rename'] as const) {
		test(`allows another process to finish ${phase} after cleanup preserves it`, async () => {
			const { child } = await pausedDownload(phase);
			await downloader().cleanUpTemporaryDownloads();
			const completed = once(child, 'message');
			const exited = once(child, 'exit');
			child.send('resume');
			const [message] = await completed;
			assert.strictEqual(message.type, 'completed', message.error);
			await exited;
			assert.deepStrictEqual(await fs.readFile(joinPath(cache, 'test.recovery-1.0.0').fsPath), await fs.readFile(fixture.fsPath));
			assert.deepStrictEqual(await fs.readdir(cache.fsPath), ['test.recovery-1.0.0']);
		});

		test(`preserves another process during ${phase}, then reclaims it without any later download`, async () => {
			const { child, location } = await pausedDownload(phase);
			const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			await fs.utimes(location.fsPath, old, old);
			await fs.utimes(`${location.fsPath}.vscdownload`, old, old);
			const contents = await fs.readFile(location.fsPath);
			const service = downloader();
			await service.cleanUpTemporaryDownloads();
			assert.deepStrictEqual(await fs.readFile(location.fsPath), contents);
			assert.strictEqual(JSON.parse(await fs.readFile(`${location.fsPath}.vscdownload`, 'utf8')).readyToDelete, undefined);
			await stop(child);
			if (phase === 'download') {
				const removed = whenRecordDeleted(location);
				downloader();
				await removed;
			} else {
				await service.cleanUpTemporaryDownloads();
			}
			assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 0 });
		});
	}

	test('retries failed handoff in the same live process without another download', async () => {
		const active = await ownedDownload(process.pid);
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			await fs.writeFile(location.fsPath, 'partial download');
			throw new Error('download interrupted');
		} });
		const match = sinon.match((location: URI) => path.dirname(location.fsPath) === cache.fsPath && isUUID(path.basename(location.fsPath).slice(1)) && location.toString() !== active.toString());
		const deletion = sinon.stub(fileService, 'del').callThrough();
		const movement = sinon.stub(fileService, 'move').callThrough();
		deletion.withArgs(match).rejects(new FileOperationError('blocked deletion', FileOperationResult.FILE_PERMISSION_DENIED));
		movement.withArgs(match, sinon.match.any).rejects(new FileOperationError('blocked handoff', FileOperationResult.FILE_PERMISSION_DENIED));
		const service = downloader();
		await assert.rejects(service.download(extension, InstallOperation.Install, false), /download interrupted/);
		const records = (await fs.readdir(cache.fsPath)).filter(name => name.endsWith('.vscdownload') && name !== `${path.basename(active.fsPath)}.vscdownload`);
		assert.strictEqual(records.length, 3);
		for (const record of records) {
			assert.strictEqual(JSON.parse(await fs.readFile(joinPath(cache, record).fsPath, 'utf8')).readyToDelete, true);
		}
		deletion.restore();
		movement.restore();
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual({ files: (await fs.readdir(cache.fsPath)).sort(), downloads }, { files: [path.basename(active.fsPath), `${path.basename(active.fsPath)}.vscdownload`].sort(), downloads: 3 });
	});

	test('preserves legacy files and ownership that cannot prove abandonment', async () => {
		const pid = await exitedOwner();
		await ownedDownload(pid, { hostname: `${os.hostname()}-other`, readyToDelete: true });
		await ownedDownload(pid, { platform: process.platform === 'win32' ? 'linux' : 'win32', readyToDelete: true });
		await ownedDownload(0);
		const active = await ownedDownload(process.pid);
		await fs.writeFile(`${active.fsPath}.vscdownload`, JSON.stringify({ pid: process.pid, hostname: os.hostname(), platform: process.platform, readyToDelete: 'true' }));
		for (const contents of ['{', 'null']) {
			const corrupt = await ownedDownload(pid);
			await fs.writeFile(`${corrupt.fsPath}.vscdownload`, contents);
		}
		await fs.writeFile(joinPath(cache, `.${generateUuid()}`).fsPath, 'legacy download');
		await fs.writeFile(joinPath(cache, 'not-a-uuid.vscdownload').fsPath, JSON.stringify({ pid, hostname: os.hostname(), platform: process.platform }));
		const before = (await fs.readdir(cache.fsPath)).sort();
		await downloader().cleanUpTemporaryDownloads();
		assert.deepStrictEqual((await fs.readdir(cache.fsPath)).sort(), before);
	});

	test('removes an exited owner record after the file was renamed and preserves the completed package', async () => {
		const location = await ownedDownload(await exitedOwner());
		await fs.rename(location.fsPath, joinPath(cache, 'test.recovery-1.0.0').fsPath);
		await downloader().cleanUpTemporaryDownloads();
		assert.deepStrictEqual(await fs.readdir(cache.fsPath), ['test.recovery-1.0.0']);
	});

	test('retains abandoned ownership after deletion and trash handoff fail, then retries cleanup', async () => {
		const location = await ownedDownload(await exitedOwner());
		const match = sinon.match((resource: URI) => resource.toString() === location.toString());
		const deletion = sinon.stub(fileService, 'del').callThrough();
		const movement = sinon.stub(fileService, 'move').callThrough();
		deletion.withArgs(match).rejects(new FileOperationError('blocked', FileOperationResult.FILE_PERMISSION_DENIED));
		movement.withArgs(match, sinon.match.any).rejects(new FileOperationError('blocked', FileOperationResult.FILE_PERMISSION_DENIED));
		const service = downloader();
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual((await fs.readdir(cache.fsPath)).sort(), [path.basename(location.fsPath), `${path.basename(location.fsPath)}.vscdownload`].sort());
		deletion.restore();
		movement.restore();
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 0 });
	});

	test('keeps the existing real archive validation and retry behavior', async () => {
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			if (downloads < 3) {
				await fs.writeFile(location.fsPath, 'invalid archive');
			} else {
				await fs.copyFile(fixture.fsPath, location.fsPath);
			}
		} });
		await downloader().download(extension, InstallOperation.Install, false);
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: ['test.recovery-1.0.0'], downloads: 3 });
	});


	test('preserves the original ownership record when an atomic completion update fails', async () => {
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			await fs.writeFile(location.fsPath, 'partial download');
			throw new Error('download interrupted');
		} });
		const match = sinon.match((location: URI) => isUUID(path.basename(location.fsPath).slice(1)));
		const deletion = sinon.stub(fileService, 'del').callThrough();
		const movement = sinon.stub(fileService, 'move').callThrough();
		const writing = sinon.stub(fileService, 'writeFile').callThrough();
		deletion.withArgs(match).rejects(new FileOperationError('blocked deletion', FileOperationResult.FILE_PERMISSION_DENIED));
		movement.withArgs(match, sinon.match.any).rejects(new FileOperationError('blocked handoff', FileOperationResult.FILE_PERMISSION_DENIED));
		writing.withArgs(sinon.match.any, sinon.match.any, { atomic: { postfix: '.tmp' } }).rejects(new FileOperationError('blocked metadata update', FileOperationResult.FILE_PERMISSION_DENIED));
		const service = downloader();
		await assert.rejects(service.download(extension, InstallOperation.Install, false), /download interrupted/);
		const records = (await fs.readdir(cache.fsPath)).filter(name => name.endsWith('.vscdownload'));
		assert.strictEqual(records.length, 3);
		for (const record of records) {
			assert.deepStrictEqual(JSON.parse(await fs.readFile(joinPath(cache, record).fsPath, 'utf8')), { pid: process.pid, hostname: os.hostname(), platform: process.platform });
		}
		deletion.restore();
		movement.restore();
		writing.restore();
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 3 });
	});

	(isWindows ? test.skip : test)('recovers after real directory permissions block deletion, handoff, and completion recording', async () => {
		let failed: URI | undefined;
		instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
			downloads++;
			failed = location;
			await fs.writeFile(location.fsPath, 'partial download');
			await fs.chmod(cache.fsPath, 0o500);
			throw new Error('download interrupted');
		} });
		const service = downloader();
		try {
			await assert.rejects(service.download(extension, InstallOperation.Install, false));
			assert.ok(failed);
			assert.deepStrictEqual(JSON.parse(await fs.readFile(`${failed.fsPath}.vscdownload`, 'utf8')), { pid: process.pid, hostname: os.hostname(), platform: process.platform });
		} finally {
			await fs.chmod(cache.fsPath, 0o700);
		}
		await service.cleanUpTemporaryDownloads();
		assert.deepStrictEqual({ files: await fs.readdir(cache.fsPath), downloads }, { files: [], downloads: 1 });
	});

});
