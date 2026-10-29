/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { zip } from '../../../../base/node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IDownloadService } from '../../../download/common/download.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { InstallableExtension } from '../../common/abstractExtensionManagementService.js';
import { IAllowedExtensionsService, IExtensionGalleryService, IGalleryExtension, ILocalExtension, InstallOperation, ExtensionSignatureVerificationCode } from '../../common/extensionManagement.js';
import { IExtensionGalleryManifestService } from '../../common/extensionGalleryManifest.js';
import { IExtensionsProfileScannerService } from '../../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../common/extensionsScannerService.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../../extensions/common/extensions.js';
import { ExtensionManagementService, ExtensionsScanner } from '../../node/extensionManagementService.js';
import { ExtensionManagementStoreCoordinator } from '../../node/extensionManagementStoreCoordinator.js';

const coordinatorModule = new URL('../../node/extensionManagementStoreCoordinator.js', import.meta.url).href;

suite('Native install coordination', () => {
	const suiteDisposables = ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	class ObservedStore extends ExtensionManagementStoreCoordinator {
		mutationRequested: (() => void) | undefined;
		override withMutation<T>(task: () => Promise<T>): Promise<T> {
			this.mutationRequested?.();
			return super.withMutation(task);
		}
	}
	let store: ObservedStore;
	let other: ExtensionManagementStoreCoordinator;
	let disposables: DisposableStore;
	const children: ChildProcessWithoutNullStreams[] = [];

	class Service extends ExtensionManagementService {
		protected override get extensionStoreCoordinator(): ExtensionManagementStoreCoordinator { return store; }
		afterTaskDrain: (() => Promise<void>) | undefined;
		protected override async waitForExtensionTasks(): Promise<void> {
			await super.waitForExtensionTasks();
			await this.afterTaskDrain?.();
		}
		installPrepared(extensions: InstallableExtension[]) { return this.installExtensions(extensions); }
		nativeTask(request: InstallableExtension) {
			return this.createInstallExtensionTask(request.manifest, request.extension, {
				...request.options, profileLocation: request.options.profileLocation!, productVersion: { version: '1.145.0' }
			});
		}
	}

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'native-install-coordination-'));
		store = new ObservedStore(join(directory, 'coordination.sqlite'), 50);
		other = new ExtensionManagementStoreCoordinator(join(directory, 'coordination.sqlite'), 50);
		disposables = suiteDisposables.add(new DisposableStore());
	});

	teardown(async () => {
		for (const child of children.splice(0)) {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
				child.kill('SIGKILL');
				await exited;
			}
		}
		disposables.dispose();
		await Promise.all([store.close(), other.close()]);
		await rm(directory, { recursive: true, force: true });
	});

	async function deadline<T>(task: Promise<T>): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([task, new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error('Independent operation blocked during download')), 3000);
			})]);
		} finally { clearTimeout(timer); }
	}

	async function fixture() {
		const instantiation = disposables.add(new TestInstantiationService());
		const log = new NullLogService();
		const files = disposables.add(new FileService(log));
		disposables.add(files.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const root = URI.file('/native-install-controls');
		await files.createFolder(root);
		const profile = toUserDataProfile('default', 'Default', URI.file('/profiles/default'), URI.file('/cache/default'));
		const installed: ILocalExtension[] = [];
		const downloads = new Map<string, { entered: DeferredPromise<void>; finish: DeferredPromise<void>; archive: URI; calls: number }>();
		let deletionGate: DeferredPromise<void> | undefined;
		const deletionEntered = new DeferredPromise<void>();
		const deletedArchives: string[] = [];
		const timeline: string[] = [];
		let galleryLookup: () => Promise<IGalleryExtension[]> = async () => [];
		const metadataErrors: unknown[] = [];
		const metadataFinished = new DeferredPromise<void>();
		const local = (manifest: IExtensionManifest): ILocalExtension => ({
			identifier: { id: `${manifest.publisher}.${manifest.name}` }, manifest,
			location: URI.file(`${root.path}/${manifest.publisher}.${manifest.name}-${manifest.version}`),
			type: ExtensionType.User, isBuiltin: false, isValid: true, validations: [], targetPlatform: TargetPlatform.UNDEFINED,
			preRelease: false, isWorkspaceScoped: false, isMachineScoped: false, isApplicationScoped: false,
			isPreReleaseVersion: false, hasPreReleaseVersion: false, private: false, updated: false,
			pinned: false, forceAutoUpdate: false, source: 'gallery', size: 0, publisherId: null
		});
		const manifests = new Map<string, IExtensionManifest>();
		const scanner = {
			dispose() { }, onExtract: Event.None,
			async scanExtensions(type: ExtensionType | null) { return type === ExtensionType.System ? [] : [...installed]; },
			async extractUserExtension(key: { identifier: { id: string } }) { timeline.push(`extract:${key.identifier.id}`); return local(manifests.get(key.identifier.id)!); },
			async updateMetadata(extension: ILocalExtension) {
				// Model the real ExtensionsScanner's independently fenced metadata write.
				try {
					return await store.withMutation(async () => { timeline.push(`metadata:${extension.identifier.id}`); return extension; });
				} catch (error) {
					metadataErrors.push(error);
					throw error;
				} finally { metadataFinished.complete(); }
			},
			async unsetExtensionsForRemoval() { return [false]; },
			async scanAllUserExtensions() { return [...installed]; },
			async scanLocalExtension(location: URI) { return installed.find(extension => extUri.isEqual(extension.location, location)) ?? null; },
			async deleteExtension(extension: ILocalExtension) { timeline.push(`delete:${extension.identifier.id}`); }
		};
		const profileScanner = {
			onAddExtensions: Event.None, onDidAddExtensions: Event.None, onRemoveExtensions: Event.None, onDidRemoveExtensions: Event.None,
			async scanProfileExtensions() { return []; },
			async addExtensionsToProfile(extensions: [ILocalExtension, object][]) {
				for (const [extension] of extensions) {
					timeline.push(`publish:${extension.identifier.id}`);
					const index = installed.findIndex(value => value.identifier.id === extension.identifier.id);
					if (index !== -1) { installed.splice(index, 1); }
					installed.push(extension);
				}
				return [];
			},
			async removeExtensionsFromProfile(identifiers: { id: string }[]) {
				for (const identifier of identifiers) {
					timeline.push(`remove:${identifier.id}`);
					const index = installed.findIndex(value => value.identifier.id === identifier.id);
					if (index !== -1) { installed.splice(index, 1); }
				}
			}
		};
		instantiation.stub(ILogService, log);
		instantiation.stub(IFileService, files);
		instantiation.stub(INativeEnvironmentService, { extensionsPath: root.fsPath, isBuilt: false });
		instantiation.stub(IUserDataProfilesService, { defaultProfile: profile, profiles: [profile], onDidChangeProfiles: Event.None });
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(IProductService, { version: '1.145.0', quality: 'stable' });
		instantiation.stub(ITelemetryService, { publicLog() { }, publicLog2() { } });
		instantiation.stub(IAllowedExtensionsService, { isAllowed: () => true });
		instantiation.stub(IExtensionGalleryService, { getExtensions: () => galleryLookup(), reportStatistic: async () => undefined });
		instantiation.stub(IExtensionGalleryManifestService, { getExtensionGalleryManifest: async () => null });
		instantiation.stub(IConfigurationService, { getValue: () => false });
		instantiation.stub(IDownloadService, { download: async () => undefined });
		instantiation.stub(IExtensionsScannerService, { userExtensionsLocation: root, initializeDefaultProfileExtensions: async () => undefined });
		instantiation.stub(IExtensionsProfileScannerService, profileScanner);
		const createInstance = instantiation.createInstance.bind(instantiation);
		instantiation.stub(IInstantiationService, {
			createInstance: (ctor: unknown, ...args: unknown[]) => {
				if (ctor === ExtensionsScanner) { return scanner as never; }
				if (typeof ctor === 'function' && ctor.name === 'ExtensionsLifecycle') { return { dispose() { }, postUninstall: async () => undefined } as never; }
				if (typeof ctor === 'function' && ctor.name === 'ExtensionsDownloader') {
					return {
						dispose() { },
						async download(extension: IGalleryExtension) {
							const pending = downloads.get(extension.identifier.id)!;
							pending.calls++;
							pending.entered.complete();
							await pending.finish.p;
							return { location: pending.archive, verificationStatus: ExtensionSignatureVerificationCode.Success };
						},
						async delete(location: URI) { deletedArchives.push(location.toString()); deletionEntered.complete(); await deletionGate?.p; }
					} as never;
				}
				return Reflect.apply(createInstance, undefined, [ctor, ...args]);
			}
		});
		const service = disposables.add(instantiation.createInstance(Service));
		async function extension(name: string) {
			const manifest: IExtensionManifest = { name, publisher: 'owned', version: '1.0.0', engines: { vscode: '*' } };
			const id = `owned.${name}`;
			manifests.set(id, manifest);
			const archive = URI.file(join(directory, `${name}.vsix`));
			await zip(archive.fsPath, [{ path: 'extension/package.json', contents: JSON.stringify(manifest) }]);
			const pending = { entered: new DeferredPromise<void>(), finish: new DeferredPromise<void>(), archive, calls: 0 };
			downloads.set(id, pending);
			const gallery = { identifier: { id, uuid: id }, version: '1.0.0', properties: { targetPlatform: TargetPlatform.UNDEFINED }, private: false } as IGalleryExtension;
			return { pending, local: local(manifest), request: { manifest, extension: gallery, options: { donotIncludePackAndDependencies: true, donotVerifySignature: true, profileLocation: profile.extensionsResource } } };
		}
		return { service, extension, installed, timeline, deletedArchives, profile, metadataErrors, metadataFinished: metadataFinished.p,
			setGalleryLookup: (lookup: () => Promise<IGalleryExtension[]>) => { galleryLookup = lookup; }, pauseDeletion: () => {
			deletionGate = new DeferredPromise<void>();
			return { entered: deletionEntered.p, finish: () => deletionGate!.complete() };
		} };
	}

	async function processRead(): Promise<string> {
		const child = spawn(process.execPath, ['--input-type=module', '-e', `
			import { ExtensionManagementStoreCoordinator } from ${JSON.stringify(coordinatorModule)};
			const store = new ExtensionManagementStoreCoordinator(${JSON.stringify(join(directory, 'coordination.sqlite'))}, 50);
			try { console.log(await store.withRead(async () => 'read')); } finally { await store.close(); }
		`], { env: process.env, stdio: 'pipe' });
		children.push(child);
		let output = '', errors = '';
		child.stdout.on('data', chunk => output += chunk);
		child.stderr.on('data', chunk => errors += chunk);
		return new Promise((resolve, reject) => child.once('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors))));
	}

	test('a stalled gallery download permits same-service, second-connection and second-process reads', async () => {
		const { service, extension } = await fixture();
		const value = await extension('slow');
		const installing = service.installPrepared([value.request]);
		await value.pending.entered.p;
		try {
			assert.deepStrictEqual(await deadline(service.getInstalled()), []);
			assert.strictEqual(await deadline(other.withRead(async () => 'read')), 'read');
			assert.strictEqual(await deadline(processRead()), 'read');
		} finally { value.pending.finish.complete(); await installing; }
	});

	test('an unrelated install publishes while another download is stalled', async () => {
		const { service, extension, installed } = await fixture();
		const slow = await extension('slow'), fast = await extension('fast');
		const installing = service.installPrepared([slow.request]);
		await slow.pending.entered.p;
		try {
			fast.pending.finish.complete();
			const results = await service.installPrepared([fast.request]);
			assert.ifError(results[0].error);
			assert.deepStrictEqual(results.map(result => result.local?.identifier.id), ['owned.fast']);
			assert.deepStrictEqual(installed.map(extension => extension.identifier.id), ['owned.fast']);
		} finally { slow.pending.finish.complete(); await installing; }
	});

	test('a reservation acquired during preparation rejects publication and cleans its artifact', async () => {
		const { service, extension, installed, deletedArchives } = await fixture();
		const value = await extension('reserved');
		const installing = service.installPrepared([value.request]);
		await value.pending.entered.p;
		await other.reserve('remote', async () => undefined);
		try {
			value.pending.finish.complete();
			const results = await installing;
			assert.ok(results[0].error);
			assert.deepStrictEqual({ installed, deletedArchives }, { installed: [], deletedArchives: [value.pending.archive.toString()] });
		} finally { await other.release('remote'); }
	});

	test('a new preparation waits for the previous shared artifact retirement', async () => {
		const { service, extension, pauseDeletion } = await fixture();
		const value = await extension('retiring');
		const deletion = pauseDeletion();
		const first = service.installPrepared([value.request]);
		await value.pending.entered.p;
		await other.reserve('remote', async () => undefined);
		value.pending.finish.complete();
		await deletion.entered;
		await other.release('remote');
		const next = service.installPrepared([{ ...value.request, options: { ...value.request.options, profileLocation: URI.file('/profiles/other/extensions.json') } }]);
		try {
			// Independent reads prove the second invocation can reach preparation while cleanup is paused.
			await service.getInstalled();
			await other.withRead(async () => undefined);
			assert.strictEqual(value.pending.calls, 1);
		} finally { deletion.finish(); }
		const results = await Promise.all([first, next]);
		assert.ok(results[0][0].error);
		assert.ifError(results[1][0].error);
		assert.strictEqual(results[1][0].local?.identifier.id, 'owned.retiring');
		assert.strictEqual(value.pending.calls, 2);
	});

	test('post-install participants run without the store lock', async () => {
		const { service, extension } = await fixture();
		const value = await extension('participant');
		service.registerParticipant({ postInstall: async () => { await other.withRead(async () => undefined); }, postUninstall: async () => undefined });
		value.pending.finish.complete();
		const results = await service.installPrepared([value.request]);
		assert.ifError(results[0].error);
		assert.strictEqual(results[0].local?.identifier.id, 'owned.participant');
	});

	test('uninstall waits for an existing install before acquiring the store lock', async () => {
		const { service, extension, installed, timeline } = await fixture();
		const value = await extension('ordered');
		installed.push(value.local);
		const installing = service.installPrepared([value.request]);
		await value.pending.entered.p;
		const uninstalling = service.uninstallExtensions([{ extension: value.local, options: { donotIncludePack: true, donotCheckDependents: true } }]);
		try { await other.withRead(async () => undefined); } finally { value.pending.finish.complete(); }
		await Promise.all([installing, uninstalling]);
		assert.deepStrictEqual({ ids: installed.map(extension => extension.identifier.id), removed: timeline.includes('remove:owned.ordered') }, { ids: [], removed: true });
	});

	test('an install registered after the uninstall predrain publishes after removal without a lock cycle', async () => {
		const { service, extension, installed } = await fixture();
		const value = await extension('late');
		installed.push(value.local);
		const drained = new DeferredPromise<void>(), acquire = new DeferredPromise<void>();
		service.afterTaskDrain = async () => { drained.complete(); await acquire.p; };
		const uninstalling = service.uninstallExtensions([{ extension: value.local, options: { donotIncludePack: true, donotCheckDependents: true } }]);
		await drained.p;
		const installing = service.installPrepared([value.request]);
		await value.pending.entered.p;
		try {
			acquire.complete();
			await uninstalling;
			assert.deepStrictEqual(installed, []);
		} finally { acquire.complete(); value.pending.finish.complete(); }
		const results = await installing;
		assert.ifError(results[0].error);
		assert.deepStrictEqual({ id: results[0].local?.identifier.id, operation: results[0].operation }, { id: 'owned.late', operation: InstallOperation.Install });
	});

	test('concurrent uninstalls do not wait for a same-task join while owning the store lock', async () => {
		const { service, extension, installed } = await fixture();
		const value = await extension('joined');
		installed.push(value.local);
		const request = [{ extension: value.local, options: { donotIncludePack: true, donotCheckDependents: true } }];
		await Promise.all([service.uninstallExtensions(request), service.uninstallExtensions(request)]);
		assert.deepStrictEqual(installed, []);
	});

	test('cancellation while publication is queued prevents extraction and profile changes', async () => {
		const { service, extension, installed, timeline } = await fixture();
		const value = await extension('cancelled');
		installed.push(value.local);
		const task = service.nativeTask(value.request);
		const running = task.run();
		// Observe rejection immediately while the deterministic lock barrier is still held.
		const cancelled = assert.rejects(running, /cancel/i);
		await value.pending.entered.p;
		const entered = new DeferredPromise<void>(), release = new DeferredPromise<void>();
		const holding = store.withRead(async () => { entered.complete(); await release.p; });
		await entered.p;
		const publicationQueued = new DeferredPromise<void>();
		store.mutationRequested = () => publicationQueued.complete();
		try {
			value.pending.finish.complete();
			await publicationQueued.p;
			task.cancel();
		} finally { release.complete(); await holding; store.mutationRequested = undefined; }
		await cancelled;
		await store.withRead(async () => undefined);
		assert.deepStrictEqual({ ids: installed.map(extension => extension.identifier.id), timeline }, { ids: ['owned.cancelled'], timeline: [] });
	});

	test('VSIX completion does not await gallery metadata and its later write respects reservations', async () => {
		const { service, extension, timeline, setGalleryLookup, metadataErrors, metadataFinished } = await fixture();
		const value = await extension('vsix');
		const lookupEntered = new DeferredPromise<void>();
		const lookupResult = new DeferredPromise<IGalleryExtension[]>();
		setGalleryLookup(() => { lookupEntered.complete(); return lookupResult.p; });
		const task = service.nativeTask({ ...value.request, extension: value.pending.archive });
		const installing = task.run();
		await lookupEntered.p;
		let reserved = false;
		try {
			const installed = await deadline(installing);
			assert.strictEqual(installed.identifier.id, 'owned.vsix');
			await other.reserve('metadata', async () => undefined);
			reserved = true;
			lookupResult.complete([value.request.extension]);
			await metadataFinished;
			assert.deepStrictEqual(timeline, ['extract:owned.vsix', 'publish:owned.vsix']);
			assert.strictEqual(metadataErrors.length, 1);
			assert.match(String(metadataErrors[0]), /reserved/);
		} finally {
			lookupResult.complete([value.request.extension]);
			await installing;
			await metadataFinished;
			if (reserved) { await other.release('metadata'); }
		}
	});

	test('abort fences a commit waiting for preparation to finish', async () => {
		const { service, extension, installed } = await fixture();
		const value = await extension('abort');
		installed.push(value.local);
		await service.prepareLocalUninstall('abort-commit', [{ extension: value.local }], 'target');
		const installing = service.installPrepared([value.request]);
		await value.pending.entered.p;
		const committing = service.commitLocalUninstall('abort-commit');
		await service.abortLocalUninstall('abort-commit');
		value.pending.finish.complete();
		await installing;
		await assert.rejects(committing, /not prepared/);
		assert.deepStrictEqual(installed.map(extension => extension.identifier.id), ['owned.abort']);
	});
});
