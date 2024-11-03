/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IExtensionsProfileScannerService, IProfileExtensionsScanOptions } from '../../common/extensionsProfileScannerService.js';
import { AbstractExtensionsScannerService, ExtensionScannerInput, IExtensionsScannerService, IScannedExtensionManifest, Translations } from '../../common/extensionsScannerService.js';
import { ExtensionsProfileScannerService } from '../../node/extensionsProfileScannerService.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../../extensions/common/extensions.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService, UserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';

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
		instantiationService.stub(IProductService, { version: '1.66.0' });
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		instantiationService.stub(IUriIdentityService, uriIdentityService);
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		instantiationService.stub(IUserDataProfilesService, userDataProfilesService);
		instantiationService.stub(IExtensionsProfileScannerService, disposables.add(new ExtensionsProfileScannerService(environmentService, fileService, userDataProfilesService, uriIdentityService, NullTelemetryService, logService)));
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

	test('scan user extension', async () => {
		const manifest: Partial<IScannedExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub', __metadata: { id: 'uuid' } });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name', uuid: 'uuid' });
		assert.deepStrictEqual(actual[0].location.toString(), extensionLocation.toString());
		assert.deepStrictEqual(actual[0].isBuiltin, false);
		assert.deepStrictEqual(actual[0].type, ExtensionType.User);
		assert.deepStrictEqual(actual[0].isValid, true);
		assert.deepStrictEqual(actual[0].validations, []);
		assert.deepStrictEqual(actual[0].metadata, { id: 'uuid' });
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

	test('scan user extension with different versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.2');
	});

	test('scan user extension include all versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({ includeAllVersions: true });

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.1');
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].manifest.version, '1.0.2');
	});

	test('scan user extension with different versions and higher version is not compatible', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2', engines: { vscode: '^1.67.0' } }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.1');
	});

	test('scan exclude invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
	});

	test('scan exclude uninstalled extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }));
		await instantiationService.get(IFileService).writeFile(joinPath(URI.file(instantiationService.get(INativeEnvironmentService).extensionsPath), '.obsolete'), VSBuffer.fromString(JSON.stringify({ 'pub.name2-1.0.0': true })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
	});

	test('scan include uninstalled extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }));
		await instantiationService.get(IFileService).writeFile(joinPath(URI.file(instantiationService.get(INativeEnvironmentService).extensionsPath), '.obsolete'), VSBuffer.fromString(JSON.stringify({ 'pub.name2-1.0.0': true })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({ includeUninstalled: true });

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan include invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({ includeInvalid: true });

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan system extensions include additional builtin extensions', async () => {
		instantiationService.stub(IProductService, {
			version: '1.66.0',
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

	test('scan extension with default nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		const actual = await testObject.scanUserExtensions({});

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
		const actual = await testObject.scanUserExtensions({ language: 'en' });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.displayName, 'Hello World EN');
	});

	test('scan extension falls back to default nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const nlsLocation = joinPath(extensionLocation, 'package.en.json');
		await instantiationService.get(IFileService).writeFile(nlsLocation, VSBuffer.fromString(JSON.stringify({ contents: { package: { displayName: 'Hello World EN' } } })));
		const testObject: IExtensionsScannerService = disposables.add(instantiationService.createInstance(ExtensionsScannerService));

		translations = { 'pub.name2': nlsLocation.fsPath };
		const actual = await testObject.scanUserExtensions({ language: 'en' });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.displayName, 'Hello World');
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
		const extensionLocation = joinPath(root, `${manifest.publisher}.${manifest.name}-${manifest.version}-${manifest.__metadata?.targetPlatform ?? TargetPlatform.UNDEFINED}`);
		await fileService.writeFile(joinPath(extensionLocation, 'package.json'), VSBuffer.fromString(JSON.stringify(manifest)));
		return extensionLocation;
	}

	function anExtensionManifest(manifest: Partial<IScannedExtensionManifest>): Partial<IExtensionManifest> {
		return { engines: { vscode: '^1.66.0' }, version: '1.0.0', main: 'main.js', activationEvents: ['*'], ...manifest };
	}
});

suite('ExtensionScannerInput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('compare inputs - location', () => {
		const anInput = (location: URI, mtime: number | undefined) => new ExtensionScannerInput(location, mtime, undefined, undefined, false, undefined, ExtensionType.User, true, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, undefined)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 100)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(joinPath(ROOT, 'foo'), undefined), anInput(ROOT, undefined)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 200)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, 200)), false);
	});

	test('compare inputs - application location', () => {
		const anInput = (location: URI, mtime: number | undefined) => new ExtensionScannerInput(ROOT, undefined, location, mtime, false, undefined, ExtensionType.User, true, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, undefined)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 100)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(joinPath(ROOT, 'foo'), undefined), anInput(ROOT, undefined)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, 100), anInput(ROOT, 200)), false);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ROOT, undefined), anInput(ROOT, 200)), false);
	});

	test('compare inputs - profile', () => {
		const anInput = (profile: boolean, profileScanOptions: IProfileExtensionsScanOptions | undefined) => new ExtensionScannerInput(ROOT, undefined, undefined, undefined, profile, profileScanOptions, ExtensionType.User, true, true, '1.1.1', undefined, undefined, true, undefined, {});

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
		const anInput = (type: ExtensionType) => new ExtensionScannerInput(ROOT, undefined, undefined, undefined, false, undefined, type, true, true, '1.1.1', undefined, undefined, true, undefined, {});

		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.System), anInput(ExtensionType.System)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.User), anInput(ExtensionType.User)), true);
		assert.strictEqual(ExtensionScannerInput.equals(anInput(ExtensionType.User), anInput(ExtensionType.System)), false);
	});

});
