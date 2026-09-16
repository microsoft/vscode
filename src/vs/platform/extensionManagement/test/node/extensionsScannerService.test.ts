/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { dirname, ExtUri, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IExtensionManagementService } from '../../common/extensionManagement.js';
import { IExtensionsProfileScannerService, IProfileExtensionsScanOptions } from '../../common/extensionsProfileScannerService.js';
import { AbstractExtensionsScannerService, ExtensionScannerInput, IExtensionsScannerService, IScannedExtensionManifest, Translations } from '../../common/extensionsScannerService.js';
import { ExtensionsProfileScannerService } from '../../node/extensionsProfileScannerService.js';
import { ExtensionsManifestCache } from '../../node/extensionsManifestCache.js';
import { BUILTIN_MANIFEST_CACHE_FILE, ExtensionType, IExtensionManifest, TargetPlatform, USER_MANIFEST_CACHE_FILE } from '../../../extensions/common/extensions.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService, toUserDataProfile, UserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';

let translations: Translations = Object.create(null);
const ROOT = URI.file('/ROOT');

class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService nativeEnvironmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			URI.file(nativeEnvironmentService.builtinExtensionsPath),
			URI.file(nativeEnvironmentService.extensionsPath),
			joinPath(nativeEnvironmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json'),
			userDataProfilesService.defaultProfile,
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, nativeEnvironmentService, productService, uriIdentityService, instantiationService);
	}

	protected async getTranslations(language: string): Promise<Translations> {
		return translations;
	}

}

suite('NativeExtensionsScanerService Test', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(async () => {
		translations = {};
		instantiationService = disposables.add(new TestInstantiationService());
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IFileService, fileService);
		const systemExtensionsLocation = joinPath(ROOT, 'system');
		const userExtensionsLocation = joinPath(ROOT, 'extensions');
		const environmentService = instantiationService.stub(INativeEnvironmentService, {
			userHome: ROOT,
			userRoamingDataHome: ROOT,
			builtinExtensionsPath: systemExtensionsLocation.fsPath,
			extensionsPath: userExtensionsLocation.fsPath,
			cacheHome: joinPath(ROOT, 'cache'),
		});
		instantiationService.stub(IProductService, { version: '1.66.0', builtInExtensionsEnabledWithAutoUpdates: [] });
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		instantiationService.stub(IUriIdentityService, uriIdentityService);
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		instantiationService.stub(IUserDataProfilesService, userDataProfilesService);
		instantiationService.stub(IExtensionsProfileScannerService, disposables.add(new ExtensionsProfileScannerService(environmentService, fileService, userDataProfilesService, uriIdentityService, logService)));
		await fileService.createFolder(systemExtensionsLocation);
		await fileService.createFolder(userExtensionsLocation);
	});

	test('scan system extension', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aSystemExtension(manifest);
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanSystemExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual[0].isBuiltin, true);
		assert.deepStrictEqual(actual[0].type, ExtensionType.System);
		assert.deepStrictEqual(actual[0].isValid, true);
		assert.deepStrictEqual(actual[0].validations, []);
		assert.deepStrictEqual(actual[0].metadata, undefined);
		assert.deepStrictEqual(actual[0].targetPlatform, TargetPlatform.UNDEFINED);
		assert.deepStrictEqual(actual[0].manifest, manifest);
	});

	for (const type of [ExtensionType.System, ExtensionType.User]) {
		test(`cached ${type === ExtensionType.System ? 'system' : 'user'} scans preserve caches for different languages`, () => runWithFakedTimers({}, async () => {
			instantiationService.get(INativeEnvironmentService).isBuilt = true;
			const fileService = instantiationService.get(IFileService);
			const profile = instantiationService.get(IUserDataProfilesService).defaultProfile;
			const manifest = anExtensionManifest({ name: 'name', publisher: 'pub', displayName: '%displayName%' });
			const extensionLocation = await (type === ExtensionType.System ? aSystemExtension(manifest) : aUserExtension(manifest));
			for (const [file, displayName] of [['package.nls.json', 'Default'], ['package.nls.en.json', 'English'], ['package.nls.de.json', 'German'], ['package.nls.zh-cn.json', 'Chinese']]) {
				await fileService.writeFile(joinPath(extensionLocation, file), VSBuffer.fromString(JSON.stringify({ displayName })));
			}
			const scanners = [undefined, 'en', 'de', 'zh-cn', 'zh-CN'].map(language => {
				const scanner = disposables.add(instantiationService.createInstance(ExtensionsScannerService));
				return () => type === ExtensionType.System
					? scanner.scanSystemExtensions({ language })
					: scanner.scanUserExtensions({ language, profileLocation: profile.extensionsResource, useCache: true });
			});
			for (const scan of scanners) {
				await scan();
				await scan();
			}

			const operations: string[] = [];
			disposables.add(fileService.onDidRunOperation(e => operations.push(e.resource.toString())));
			const displayNames: (string | undefined)[] = [];
			for (let i = 0; i < 2; i++) {
				for (const scan of scanners) {
					displayNames.push((await scan())[0].manifest.displayName);
				}
				await timeout(3100);
			}
			const cacheFile = type === ExtensionType.System ? BUILTIN_MANIFEST_CACHE_FILE : USER_MANIFEST_CACHE_FILE;
			const cache = await fileService.resolve(profile.cacheHome);
			assert.deepStrictEqual({
				displayNames,
				operations,
				files: cache.children?.map(child => child.name).sort(),
			}, {
				displayNames: ['Default', 'English', 'German', 'Chinese', 'Chinese', 'Default', 'English', 'German', 'Chinese', 'Chinese'],
				operations: [],
				files: [cacheFile, `en.${cacheFile}`, `de.${cacheFile}`, `zh-cn.${cacheFile}`].sort(),
			});
		}));
	}

	test('invalidating a profile removes all user cache languages but preserves other caches', async () => {
		const fileService = instantiationService.get(IFileService);
		const profilesService = instantiationService.get(IUserDataProfilesService);
		const profile = profilesService.defaultProfile;
		const otherProfile = toUserDataProfile('other', 'other', joinPath(ROOT, 'profiles', 'other'), dirname(profile.cacheHome));
		const cacheFiles = [USER_MANIFEST_CACHE_FILE, ...['en', 'de', 'zh-cn', 'zh-CN'].map(language => `${language}.${USER_MANIFEST_CACHE_FILE}`)];
		for (const target of [profile, otherProfile]) {
			for (const name of [...cacheFiles, BUILTIN_MANIFEST_CACHE_FILE, `en.${BUILTIN_MANIFEST_CACHE_FILE}`, 'unrelated.cache']) {
				await fileService.writeFile(joinPath(target.cacheHome, name), VSBuffer.fromString('{}'));
			}
		}
		instantiationService.stub(IExtensionManagementService, {
			onDidInstallExtensions: Event.None,
			onDidUninstallExtension: Event.None,
		});
		const cache = disposables.add(new ExtensionsManifestCache(
			profilesService, fileService, instantiationService.get(IUriIdentityService),
			instantiationService.get(IExtensionManagementService), instantiationService.get(ILogService)));

		await cache.invalidate(profile.extensionsResource);
		await cache.invalidate(profile.extensionsResource);

		assert.deepStrictEqual({
			files: (await fileService.resolve(profile.cacheHome)).children?.map(child => child.name).sort(),
			otherFiles: (await fileService.resolve(otherProfile.cacheHome)).children?.map(child => child.name).sort(),
		}, {
			files: [BUILTIN_MANIFEST_CACHE_FILE, `en.${BUILTIN_MANIFEST_CACHE_FILE}`, 'unrelated.cache'].sort(),
			otherFiles: [...cacheFiles, BUILTIN_MANIFEST_CACHE_FILE, `en.${BUILTIN_MANIFEST_CACHE_FILE}`, 'unrelated.cache'].sort(),
		});
	});

	for (const ignorePathCasing of [false, true]) {
		test(`cache invalidation respects filesystem case sensitivity (ignorePathCasing: ${ignorePathCasing})`, async () => {
			const fileService = instantiationService.get(IFileService);
			const profilesService = instantiationService.get(IUserDataProfilesService);
			const profile = profilesService.defaultProfile;
			const upperCaseFiles = [USER_MANIFEST_CACHE_FILE.toUpperCase(), `zh-CN.${USER_MANIFEST_CACHE_FILE.toUpperCase()}`];
			const preservedFiles = [BUILTIN_MANIFEST_CACHE_FILE, 'unrelated.cache'];
			for (const name of [USER_MANIFEST_CACHE_FILE, `en.${USER_MANIFEST_CACHE_FILE}`, ...upperCaseFiles, ...preservedFiles]) {
				await fileService.writeFile(joinPath(profile.cacheHome, name), VSBuffer.fromString('{}'));
			}
			const uriIdentityService = instantiationService.stub(IUriIdentityService, { extUri: new ExtUri(() => ignorePathCasing) });
			const extensionManagementService = instantiationService.stub(IExtensionManagementService, {
				onDidInstallExtensions: Event.None,
				onDidUninstallExtension: Event.None,
			});
			const cache = disposables.add(new ExtensionsManifestCache(
				profilesService, fileService, uriIdentityService, extensionManagementService, instantiationService.get(ILogService)));

			await cache.invalidate(profile.extensionsResource);

			assert.deepStrictEqual(
				(await fileService.resolve(profile.cacheHome)).children?.map(child => child.name).sort(),
				[...preservedFiles, ...(ignorePathCasing ? [] : upperCaseFiles)].sort(),
			);
		});
	}

	test('cached scans still invalidate changed manifests', () => runWithFakedTimers({}, async () => {
		instantiationService.get(INativeEnvironmentService).isBuilt = true;
		const fileService = instantiationService.get(IFileService);
		const profile = instantiationService.get(IUserDataProfilesService).defaultProfile;
		const manifest = anExtensionManifest({ name: 'name', publisher: 'pub', displayName: 'Before' });
		const location = await aSystemExtension(manifest);
		const scanner = disposables.add(instantiationService.createInstance(ExtensionsScannerService));
		let invalidations = 0;
		disposables.add(scanner.onDidChangeCache(() => invalidations++));
		await scanner.scanSystemExtensions({ language: 'en' });
		await scanner.scanSystemExtensions({ language: 'en' });

		await fileService.writeFile(joinPath(location, 'package.json'), VSBuffer.fromString(JSON.stringify({ ...manifest, displayName: 'After' })));
		await timeout(3100);

		assert.deepStrictEqual({
			invalidations,
			exists: await fileService.exists(joinPath(profile.cacheHome, `en.${BUILTIN_MANIFEST_CACHE_FILE}`)),
			displayName: (await scanner.scanSystemExtensions({ language: 'en' }))[0].manifest.displayName,
		}, { invalidations: 1, exists: false, displayName: 'After' });
	}));

	test('scan user extensions', async () => {
		const manifest: Partial<IScannedExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions();

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual[0].isBuiltin, false);
		assert.deepStrictEqual(actual[0].type, ExtensionType.User);
		assert.deepStrictEqual(actual[0].isValid, true);
		assert.deepStrictEqual(actual[0].validations, []);
		assert.deepStrictEqual(actual[0].metadata, undefined);
		assert.deepStrictEqual(actual[0].targetPlatform, TargetPlatform.UNDEFINED);
		delete manifest.__metadata;
		assert.deepStrictEqual(actual[0].manifest, manifest);
	});

	test('scan existing extension', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanExistingExtension(extensionLocation, ExtensionType.User, {});

		assert.notEqual(actual, null);
		assert.deepStrictEqual(actual!.identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual!.location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual!.isBuiltin, false);
		assert.deepStrictEqual(actual!.type, ExtensionType.User);
		assert.deepStrictEqual(actual!.isValid, true);
		assert.deepStrictEqual(actual!.validations, []);
		assert.deepStrictEqual(actual!.metadata, undefined);
		assert.deepStrictEqual(actual!.targetPlatform, TargetPlatform.UNDEFINED);
		assert.deepStrictEqual(actual!.manifest, manifest);
	});

	test('scan single extension', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanOneOrMultipleExtensions(extensionLocation, ExtensionType.User, {});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual[0].isBuiltin, false);
		assert.deepStrictEqual(actual[0].type, ExtensionType.User);
		assert.deepStrictEqual(actual[0].isValid, true);
		assert.deepStrictEqual(actual[0].validations, []);
		assert.deepStrictEqual(actual[0].metadata, undefined);
		assert.deepStrictEqual(actual[0].targetPlatform, TargetPlatform.UNDEFINED);
		assert.deepStrictEqual(actual[0].manifest, manifest);
	});

	test('scan multiple extensions', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanOneOrMultipleExtensions(dirname(extensionLocation), ExtensionType.User, {});

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan all user extensions with different versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions({ includeAllVersions: false, includeInvalid: false });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.2');
	});

	test('scan all user extensions include all versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions();

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.1');
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].manifest.version, '1.0.2');
	});

	test('scan all user extensions with different versions and higher version is not compatible', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2', engines: { vscode: '^1.67.0' } }));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions({ includeAllVersions: false, includeInvalid: false });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.1');
	});

	test('scan all user extensions exclude invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions({ includeAllVersions: false, includeInvalid: false });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
	});

	test('scan all user extensions include invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions({ includeAllVersions: false, includeInvalid: true });

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan system extensions include additional builtin extensions', async () => {
		instantiationService.stub(IProductService, {
			version: '1.66.0',
			builtInExtensionsEnabledWithAutoUpdates: [],
			builtInExtensions: [
				{ name: 'pub.name2', version: '', repo: '', metadata: undefined },
				{ name: 'pub.name', version: '', repo: '', metadata: undefined }
			]
		});
		await anExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }), joinPath(ROOT, 'additional'));
		const extensionLocation = await anExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }), joinPath(ROOT, 'additional'));
		await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await instantiationService.get(IFileService).writeFile(joinPath(instantiationService.get(INativeEnvironmentService).userHome, '.vscode-oss-dev', 'extensions', 'control.json'), VSBuffer.fromString(JSON.stringify({ 'pub.name2': 'disabled', 'pub.name': extensionLocation.fsPath })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanSystemExtensions({ checkControlFile: true });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.0');
	});

	test('scan all user extensions with default nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const testObject = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanAllUserExtensions();

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.displayName, 'Hello World');
	});

	test('scan extension with en nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const nlsLocation = joinPath(extensionLocation, 'package.en.json');
		await instantiationService.get(IFileService).writeFile(nlsLocation, VSBuffer.fromString(JSON.stringify({ contents: { package: { displayName: 'Hello World EN' } } })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		translations = { 'pub.name': nlsLocation.fsPath };
		const actual = await testObject.scanExistingExtension(extensionLocation, ExtensionType.User, { language: 'en' });

		assert.ok(actual !== null);
		assert.deepStrictEqual(actual!.identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual!.manifest.displayName, 'Hello World EN');
	});

	test('scan extension falls back to default nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const nlsLocation = joinPath(extensionLocation, 'package.en.json');
		await instantiationService.get(IFileService).writeFile(nlsLocation, VSBuffer.fromString(JSON.stringify({ contents: { package: { displayName: 'Hello World EN' } } })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		translations = { 'pub.name2': nlsLocation.fsPath };
		const actual = await testObject.scanExistingExtension(extensionLocation, ExtensionType.User, { language: 'en' });

		assert.ok(actual !== null);
		assert.deepStrictEqual(actual!.identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual!.manifest.displayName, 'Hello World');
	});

	test('scan single extension with manifest metadata retains manifest metadata', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const expectedMetadata = { size: 12345, installedTimestamp: 1234567890, targetPlatform: TargetPlatform.DARWIN_ARM64 };
		const extensionLocation = await aUserExtension({
			...manifest,
			__metadata: expectedMetadata
		});
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanExistingExtension(extensionLocation, ExtensionType.User, {});

		assert.notStrictEqual(actual, null);
		assert.deepStrictEqual(actual!.identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual!.location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual!.isBuiltin, false);
		assert.deepStrictEqual(actual!.type, ExtensionType.User);
		assert.deepStrictEqual(actual!.isValid, true);
		assert.deepStrictEqual(actual!.validations, []);
		assert.deepStrictEqual(actual!.metadata, expectedMetadata);
		assert.deepStrictEqual(actual!.manifest, manifest);
	});

	async function aUserExtension(manifest: Partial<IScannedExtensionManifest>): Promise<URI> {
		const environmentService = instantiationService.get(INativeEnvironmentService);
		return anExtension(manifest, URI.file(environmentService.extensionsPath));
	}

	async function aSystemExtension(manifest: Partial<IScannedExtensionManifest>): Promise<URI> {
		const environmentService = instantiationService.get(INativeEnvironmentService);
		return anExtension(manifest, URI.file(environmentService.builtinExtensionsPath));
	}

	async function anExtension(manifest: Partial<IScannedExtensionManifest>, root: URI): Promise<URI> {
		const fileService = instantiationService.get(IFileService);
		const extensionLocation = joinPath(root, `${manifest.publisher}.${manifest.name}-${manifest.version}`);
		await fileService.writeFile(joinPath(extensionLocation, 'package.json'), VSBuffer.fromString(JSON.stringify(manifest)));
		return extensionLocation;
	}

	function anExtensionManifest(manifest: Partial<IScannedExtensionManifest>): Partial<IExtensionManifest> {
		return { engines: { vscode: '^1.66.0' }, version: '1.0.0', main: 'main.js', activationEvents: ['*'], ...manifest };
	}

	suite('auto update builtin extensions', () => {

		test('scan user extension with matching product version is included', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.1' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanUserExtensions({ profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource });

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].manifest.version, '1.66.1');
		});

		test('scan user extension with different version is included when forceAutoUpdate is enabled', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.67.0' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanUserExtensions({ profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource });

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].manifest.version, '1.67.0');
		});

		test('scan user extension not in autoUpdateBuiltinExtensions is not filtered', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.other'] });
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.67.0' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanUserExtensions({ profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource });

			assert.deepStrictEqual(actual.length, 1);
		});

		test('scan picks latest version when multiple versions exist', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.1' }));
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.67.0' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanUserExtensions({ profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource });

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].manifest.version, '1.67.0');
		});

		test('scan all extensions prefers matching user extension over system extension', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.0' }));
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.1' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanAllExtensions({}, { profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource, includeInvalid: false });

			const extension = actual.find(e => e.identifier.id === 'pub.name');
			assert.ok(extension);
			assert.deepStrictEqual(extension.manifest.version, '1.66.1');
			assert.deepStrictEqual(extension.isBuiltin, false);
		});

		test('scan all extensions picks user extension with newer version over system extension', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.0' }));
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.67.0' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanAllExtensions({}, { profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource, includeInvalid: false });

			const extension = actual.find(e => e.identifier.id === 'pub.name');
			assert.ok(extension);
			assert.deepStrictEqual(extension.manifest.version, '1.67.0');
			assert.deepStrictEqual(extension.type, ExtensionType.User);
		});

		test('system extension has autoUpdate set to true when in autoUpdateBuiltinExtensions and quality is stable', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanSystemExtensions({});

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].forceAutoUpdate, true);
		});

		test('system extension has autoUpdate set to false when not in autoUpdateBuiltinExtensions', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: ['pub.other'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanSystemExtensions({});

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].forceAutoUpdate, false);
		});

		test('system extension has autoUpdate set to false when quality is not stable', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'insider', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanSystemExtensions({});

			assert.deepStrictEqual(actual.length, 1);
			assert.deepStrictEqual(actual[0].forceAutoUpdate, false);
		});

		test('scan user extension is excluded when autoUpdate is disabled (non-stable quality)', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'insider', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.1' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanUserExtensions({ profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource });

			assert.deepStrictEqual(actual.length, 0);
		});

		test('scan all extensions uses system version when autoUpdate is disabled (non-stable quality)', async () => {
			instantiationService.stub(IProductService, { version: '1.66.0', quality: 'insider', builtInExtensionsEnabledWithAutoUpdates: ['pub.name'] });
			await aSystemExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.0' }));
			await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.66.1' }));
			const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

			const actual = await testObject.scanAllExtensions({}, { profileLocation: instantiationService.get(IUserDataProfilesService).defaultProfile.extensionsResource, includeInvalid: false });

			const extension = actual.find(e => e.identifier.id === 'pub.name');
			assert.ok(extension);
			assert.deepStrictEqual(extension.manifest.version, '1.66.0');
			assert.deepStrictEqual(extension.type, ExtensionType.System);
		});

	});
});

suite('ExtensionScannerInput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('compare inputs - location', () => {
		const anInput = (location: URI, mtime: number | undefined) => new ExtensionScannerInput(location, mtime, undefined, undefined, false, undefined, ExtensionType.User, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, undefined)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 100)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(joinPath(ROOT, 'foo'), undefined), anInput(ROOT, undefined)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 200)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, 200)), false);
	});

	test('compare inputs - application location', () => {
		const anInput = (location: URI, mtime: number | undefined) => new ExtensionScannerInput(ROOT, undefined, location, mtime, false, undefined, ExtensionType.User, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, undefined)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 100)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(joinPath(ROOT, 'foo'), undefined), anInput(ROOT, undefined)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 200)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, 200)), false);
	});

	test('compare inputs - profile', () => {
		const anInput = (profile: boolean, profileScanOptions: IProfileExtensionsScanOptions | undefined) => new ExtensionScannerInput(ROOT, undefined, undefined, undefined, profile, profileScanOptions, ExtensionType.User, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, { bailOutWhenFileNotFound: true }), anInput(true, { bailOutWhenFileNotFound: true })), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(false, { bailOutWhenFileNotFound: true }), anInput(false, { bailOutWhenFileNotFound: true })), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, { bailOutWhenFileNotFound: false }), anInput(true, { bailOutWhenFileNotFound: false })), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, {}), anInput(true, {})), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, { bailOutWhenFileNotFound: true }), anInput(true, { bailOutWhenFileNotFound: false })), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, {}), anInput(true, { bailOutWhenFileNotFound: true })), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(true, undefined), anInput(true, {})), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(false, { bailOutWhenFileNotFound: true }), anInput(true, { bailOutWhenFileNotFound: true })), false);
	});

	test('compare inputs - extension type', () => {
		const anInput = (type: ExtensionType) => new ExtensionScannerInput(ROOT, undefined, undefined, undefined, false, undefined, type, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.System), anInput(ExtensionType.System)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.User), anInput(ExtensionType.User)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.User), anInput(ExtensionType.System)), false);
	});

});
