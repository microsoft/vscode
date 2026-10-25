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
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWindows } from '../../../../base/common/platform.js';
import * as path from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { zip } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../../extensions/common/extensions.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { ExtensionKey } from '../../common/extensionManagementUtil.js';
import { IExtensionsProfileScannerService } from '../../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../common/extensionsScannerService.js';
import { AbstractExtensionTask } from '../../common/abstractExtensionManagementService.js';
import { ILocalExtension } from '../../common/extensionManagement.js';
import { ExtensionsScanner } from '../../node/extensionManagementService.js';

suite('Extension extraction recovery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const children: ChildProcess[] = [];
	let root: URI;
	let extensions: URI;
	let fileService: FileService;
	let instantiationService: TestInstantiationService;

	const manifest: IExtensionManifest = { publisher: 'test', name: 'recovery', version: '1.0.0', engines: { vscode: '*' } };

	setup(async () => {
		root = URI.file(await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-extraction-recovery-')));
		extensions = joinPath(root, 'extensions');
		const logService = disposables.add(new NullLogService());
		fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
		await fileService.createFolder(extensions);
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IEnvironmentService, { extensionTestsLocationURI: root });
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IProductService, { builtInExtensionsEnabledWithAutoUpdates: [] });
		instantiationService.stub(IUserDataProfilesService, {});
		instantiationService.stub(IExtensionsProfileScannerService, {});
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(IExtensionsScannerService, {
			userExtensionsLocation: extensions,
			scanAllUserExtensions: async () => [],
			scanSystemExtensions: async () => [],
			updateManifestMetadata: async () => undefined,
			scanExistingExtension: async location => ({
				identifier: { id: 'test.recovery' }, location, manifest, type: ExtensionType.User,
				isBuiltin: false, isValid: true, validations: [], targetPlatform: TargetPlatform.UNDEFINED,
				metadata: undefined, preRelease: false, forceAutoUpdate: false,
			}),
		});
	});

	teardown(async () => {
		for (const child of children.splice(0)) {
			await stop(child);
		}
		sinon.restore();
		await fs.rm(root.fsPath, { recursive: true, force: true });
	});

	function scanner(): ExtensionsScanner {
		return disposables.add(instantiationService.createInstance(ExtensionsScanner, async () => undefined));
	}

	async function runningOwner(): Promise<ChildProcess> {
		const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000);'], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe']
		});
		children.push(child);
		assert.ok(child.stdout);
		await once(child.stdout, 'data');
		assert.ok(child.pid);
		return child;
	}

	async function stop(child: ChildProcess): Promise<void> {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		}
	}

	async function abandonedOwner(): Promise<number> {
		const child = await runningOwner();
		const pid = child.pid!;
		await stop(child);
		return pid;
	}

	async function extraction(pid: number, owner: { hostname?: string; platform?: string; readyToDelete?: boolean } = {}): Promise<URI> {
		const location = joinPath(extensions, `.${generateUuid()}`);
		await fs.writeFile(`${location.fsPath}.vscinstall`, JSON.stringify({ pid, hostname: os.hostname(), platform: process.platform, ...owner }));
		await fs.mkdir(location.fsPath);
		await fs.writeFile(path.join(location.fsPath, 'package.json'), JSON.stringify(manifest));
		return location;
	}


	async function blockDeletion(location: URI): Promise<() => Promise<void>> {
		if (!isWindows) {
			await fs.chmod(location.fsPath, 0o500);
			return () => fs.chmod(location.fsPath, 0o700);
		}
		const payload = path.join(location.fsPath, 'package.json').replace(/'/g, '\'\'');
		const script = `$stream = [System.IO.File]::Open('${payload}', 'Open', 'Read', 'ReadWrite'); [Console]::Out.WriteLine('ready'); [Console]::Out.Flush(); [Console]::ReadLine() > $null; $stream.Dispose()`;
		const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
		const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
			windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
		});
		children.push(child);
		await Promise.race([
			once(child.stdout, 'data'),
			once(child, 'exit').then(() => { throw new Error('File-lock helper exited before acquiring the lock'); })
		]);
		return () => stop(child);
	}

	async function vsix(): Promise<URI> {
		const location = joinPath(root, 'extension.vsix');
		await zip(location.fsPath, [{ path: 'extension/package.json', contents: JSON.stringify(manifest) }]);
		return location;
	}

	test('installs a complete VSIX without changing the final extension directory', async () => {
		const location = await vsix();
		await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), location.fsPath, false, CancellationToken.None);
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['test.recovery-1.0.0']);
	});

	test('retries marked deletions before installing and preserves unmarked extraction directories', async () => {
		const active = joinPath(extensions, `.${generateUuid()}`);
		await fs.mkdir(active.fsPath);
		await fs.writeFile(path.join(active.fsPath, 'payload'), 'installation still running');
		const marked = joinPath(extensions, 'previous-failure.vsctmp');
		await fs.mkdir(marked.fsPath);
		await fs.writeFile(path.join(marked.fsPath, 'payload'), 'abandoned');
		const location = await vsix();

		await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), location.fsPath, false, CancellationToken.None);

		assert.deepStrictEqual((await fs.readdir(extensions.fsPath)).sort(), [path.basename(active.fsPath), 'test.recovery-1.0.0'].sort());
		assert.strictEqual(await fs.readFile(path.join(active.fsPath, 'payload'), 'utf8'), 'installation still running');
	});

	test('does not clean directories for an already canceled installation', async () => {
		const marked = joinPath(extensions, 'previous-failure.vsctmp');
		await fs.mkdir(marked.fsPath);
		const token = disposables.add(new CancellationTokenSource());
		token.cancel();

		await assert.rejects(scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), 'unused.vsix', false, token.token));

		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['previous-failure.vsctmp']);
	});

	test('keeps failed deletions under .vsctmp and retries them without exiting the process', async () => {
		let location: URI;
		let marked: URI | undefined;
		let unblock: (() => Promise<void>) | undefined;
		instantiationService.stub(IExtensionsScannerService, 'updateManifestMetadata', async (resource: URI) => {
			location = resource;
			throw new Error('injected metadata failure');
		});
		const deletion = sinon.stub(fileService, 'del').callThrough();
		deletion.withArgs(sinon.match((resource: URI) => resource.toString() === location?.toString()), { recursive: true, atomic: { postfix: '.vsctmp' } }).callsFake(async resource => {
			marked = resource.with({ path: `${resource.path}.vsctmp` });
			await fileService.move(resource, marked);
			unblock = await blockDeletion(marked);
			throw new FileOperationError('injected failure after rename', FileOperationResult.FILE_PERMISSION_DENIED);
		});
		const locationOfVsix = await vsix();
		try {
			await assert.rejects(scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None));
			assert.ok(marked);
			deletion.restore();
			const before = await fs.readdir(extensions.fsPath);
			assert.deepStrictEqual(before, [path.basename(marked.fsPath)]);
			await scanner().cleanUp();
			assert.deepStrictEqual(await fs.readdir(extensions.fsPath), before);
		} finally {
			await unblock?.();
		}
		await scanner().cleanUp();
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), []);
	});

	test('preserves a canceled installation still finishing metadata while a retry succeeds', async () => {
		const entered = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		let active: URI | undefined;
		instantiationService.stub(IExtensionsScannerService, 'updateManifestMetadata', async (resource: URI) => {
			if (!active) {
				active = resource;
				entered.complete();
				await resume.p;
				await fs.writeFile(path.join(resource.fsPath, 'metadata-finished'), 'finished');
			}
		});
		const installer = scanner();
		const location = await vsix();
		let underlying: Promise<ILocalExtension>;
		class InstallTask extends AbstractExtensionTask<ILocalExtension> {
			protected doRun(token: CancellationToken): Promise<ILocalExtension> {
				underlying = installer.extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), location.fsPath, false, token);
				return underlying;
			}
		}
		const task = new InstallTask();
		const canceled = assert.rejects(task.run(), isCancellationError);
		try {
			await entered.p;
			task.cancel();
			await canceled;
			assert.ok(active);
			await scanner().cleanUp();
			assert.strictEqual(await fileService.exists(active), true);
			await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), location.fsPath, false, CancellationToken.None);
			assert.strictEqual(await fileService.exists(active), true);
		} finally {
			resume.complete();
			await assert.rejects(underlying!, isCancellationError);
		}
		await scanner().cleanUp();
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['test.recovery-1.0.0']);
	});

	test('cleans up a failed extraction', async () => {
		const location = joinPath(root, 'invalid.vsix');
		await fs.writeFile(location.fsPath, 'invalid zip');

		await assert.rejects(scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), location.fsPath, false, CancellationToken.None));

		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), []);
	});
	test('recovers extraction directories after the owning process exits', async () => {
		await extraction(await abandonedOwner());
		await fs.mkdir(joinPath(extensions, 'removed.vsctmp').fsPath);

		await scanner().cleanUp();

		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), []);
	});

	test('preserves a live process extraction regardless of age, then recovers it after termination', async () => {
		const owner = await runningOwner();
		const location = await extraction(owner.pid!);
		const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		await fs.utimes(location.fsPath, old, old);
		await fs.utimes(`${location.fsPath}.vscinstall`, old, old);
		const cleanup = scanner();

		await cleanup.cleanUp();
		assert.strictEqual(await fileService.exists(location), true);

		await stop(owner);
		await cleanup.cleanUp();
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), []);
	});

	test('preserves unowned legacy directories, installed extensions, and unverifiable ownership', async () => {
		const pid = await abandonedOwner();
		await extraction(pid, { hostname: `${os.hostname()}-other`, readyToDelete: true });
		await extraction(pid, { platform: process.platform === 'win32' ? 'linux' : 'win32', readyToDelete: true });
		await extraction(0);
		const active = await extraction(process.pid);
		await fs.writeFile(`${active.fsPath}.vscinstall`, JSON.stringify({ pid: process.pid, hostname: os.hostname(), platform: process.platform, readyToDelete: 'true' }));
		const corrupt = await extraction(pid);
		await fs.writeFile(`${corrupt.fsPath}.vscinstall`, '{');
		const nullOwner = await extraction(pid);
		await fs.writeFile(`${nullOwner.fsPath}.vscinstall`, 'null');
		await fs.mkdir(joinPath(extensions, `.${generateUuid()}`).fsPath);
		await fs.mkdir(joinPath(extensions, 'test.recovery-1.0.0').fsPath);
		await fs.writeFile(joinPath(extensions, 'test.recovery-1.0.0.vscinstall').fsPath, JSON.stringify({ pid, hostname: os.hostname(), platform: process.platform }));
		const before = (await fs.readdir(extensions.fsPath)).sort();

		await scanner().cleanUp();

		assert.deepStrictEqual((await fs.readdir(extensions.fsPath)).sort(), before);
	});

	test('keeps ownership information when directory deletion fails so cleanup can retry', async () => {
		const location = await extraction(await abandonedOwner());
		const deletion = sinon.stub(fileService, 'del').callThrough();
		deletion.withArgs(sinon.match((resource: URI) => resource.toString() === location.toString()), { recursive: true, atomic: { postfix: '.vsctmp' } }).rejects(new FileOperationError('in use', FileOperationResult.FILE_PERMISSION_DENIED));
		const cleanup = scanner();

		await cleanup.cleanUp();
		assert.strictEqual(await fileService.exists(URI.file(`${location.fsPath}.vscinstall`)), true);

		deletion.restore();
		await cleanup.cleanUp();
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), []);
	});

	test('removes orphan ownership records when the extracted directory has already been renamed', async () => {
		const location = await extraction(await abandonedOwner());
		await fs.rename(location.fsPath, joinPath(extensions, 'test.recovery-1.0.0').fsPath);

		await scanner().cleanUp();

		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['test.recovery-1.0.0']);
	});

	test('retries completed cleanup in the same live process without deleting another active extraction', async () => {
		const active = await extraction(process.pid);
		let failed: URI | undefined;
		instantiationService.stub(IExtensionsScannerService, 'updateManifestMetadata', async (location: URI) => {
			if (!failed) {
				failed = location;
				throw new Error('injected metadata failure');
			}
		});
		const deletion = sinon.stub(fileService, 'del').callThrough();
		deletion.withArgs(sinon.match((resource: URI) => resource.toString() === failed?.toString()), { recursive: true, atomic: { postfix: '.vsctmp' } }).rejects(new FileOperationError('injected handoff failure', FileOperationResult.FILE_PERMISSION_DENIED));
		const locationOfVsix = await vsix();

		await assert.rejects(scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None));
		assert.ok(failed);
		const metadata = JSON.parse(await fs.readFile(`${failed.fsPath}.vscinstall`, 'utf8'));
		assert.strictEqual(metadata.readyToDelete, true);
		await scanner().cleanUp();
		assert.strictEqual(await fileService.exists(failed), true);
		assert.strictEqual(await fileService.exists(active), true);

		deletion.restore();
		await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None);
		assert.deepStrictEqual((await fs.readdir(extensions.fsPath)).sort(), [path.basename(active.fsPath), `${path.basename(active.fsPath)}.vscinstall`, 'test.recovery-1.0.0'].sort());
	});

	(isWindows ? test.skip : test)('retries after real rename and deletion permission failures are lifted', async () => {
		let failed: URI | undefined;
		instantiationService.stub(IExtensionsScannerService, 'updateManifestMetadata', async (location: URI) => {
			if (!failed) {
				failed = location;
				await fs.chmod(location.fsPath, 0o500);
				await fs.chmod(extensions.fsPath, 0o500);
				throw new Error('metadata failure with blocked cleanup');
			}
		});
		const locationOfVsix = await vsix();
		try {
			await assert.rejects(scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None));
			assert.ok(failed);
			assert.strictEqual((JSON.parse(await fs.readFile(`${failed.fsPath}.vscinstall`, 'utf8'))).readyToDelete, true);
			assert.strictEqual(await fileService.exists(failed), true);
		} finally {
			await fs.chmod(extensions.fsPath, 0o700);
			if (failed) { await fs.chmod(failed.fsPath, 0o700); }
		}
		await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None);
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['test.recovery-1.0.0']);
	});

	test('preserves another process extracting the same VSIX, then recovers it after termination', async () => {
		const locationOfVsix = await vsix();
		const fileRoot = globalThis._VSCODE_FILE_ROOT;
		assert.ok(fileRoot);
		const base = fileRoot.endsWith('/') ? fileRoot : `${fileRoot}/`;
		const worker = new URL('./fixtures/extensionExtractionWorker.js', import.meta.url).href;
		const bootstrap = `import fs from 'node:fs'; globalThis._VSCODE_FILE_ROOT = ${JSON.stringify(fileRoot)}; globalThis._VSCODE_PRODUCT_JSON = JSON.parse(fs.readFileSync(new URL('../product.json', ${JSON.stringify(base)}), 'utf8')); globalThis._VSCODE_PACKAGE_JSON = JSON.parse(fs.readFileSync(new URL('../package.json', ${JSON.stringify(base)}), 'utf8')); await import(${JSON.stringify(worker)});`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_EXTRACTION_TEST_ROOT: root.fsPath },
			windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
		});
		children.push(child);
		const [message] = await Promise.race([
			once(child, 'message'),
			once(child, 'exit').then(() => { throw new Error('Extraction worker exited before reaching the installation pause'); })
		]);
		assert.strictEqual(message.type, 'extracted', message.error);
		const active = URI.parse(message.location);
		assert.strictEqual((JSON.parse(await fs.readFile(`${active.fsPath}.vscinstall`, 'utf8'))).pid, child.pid);

		await scanner().cleanUp();
		assert.strictEqual(await fileService.exists(active), true);
		await scanner().extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), locationOfVsix.fsPath, false, CancellationToken.None);
		assert.strictEqual(await fileService.exists(active), true);

		await stop(child);
		await scanner().cleanUp();
		assert.deepStrictEqual(await fs.readdir(extensions.fsPath), ['test.recovery-1.0.0']);
	});

});
