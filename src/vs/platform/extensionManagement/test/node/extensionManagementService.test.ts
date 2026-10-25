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

	async function stop(child: ChildProcess): Promise<void> {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		}
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
});
