/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { dirname, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractExtensionsScannerService, IExtensionsScannerService, IScannedExtensionManifest, Translations } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionType, IExtensionManifest, MANIFEST_CACHE_FOLDER, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';

let translations: Translations = Object.create(null);
const ROOT = URI.file('/ROOT');

class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	constructor(
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService nativeEnvironmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super(
			URI.file(nativeEnvironmentService.builtinExtensionsPath),
			URI.file(nativeEnvironmentService.extensionsPath),
			joinPath(nativeEnvironmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json'),
			joinPath(ROOT, MANIFEST_CACHE_FOLDER),
			fileService, logService, nativeEnvironmentService, productService);
	}

	protected async getTranslations(language: string): Promise<Translations> {
		return translations;
	}

}

suite('NativeExtensionsScanerService Test', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;

	setup(async () => {
		translations = {};
		instantiationService = new TestInstantiationService();
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		fileService.registerProvider(ROOT.scheme, fileSystemProvider);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IFileService, fileService);
		const systemExtensionsLocation = joinPath(ROOT, 'system');
		const userExtensionsLocation = joinPath(ROOT, 'extensions');
		instantiationService.stub(INativeEnvironmentService, {
			userHome: ROOT,
			builtinExtensionsPath: systemExtensionsLocation.fsPath,
			extensionsPath: userExtensionsLocation.fsPath,
		});
		instantiationService.stub(IProductService, { version: '1.66.0' });
		await fileService.createFolder(systemExtensionsLocation);
		await fileService.createFolder(userExtensionsLocation);
	});

	teardown(() => disposables.clear());

	test('scan system extension', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aSystemExtension(manifest);
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({});

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

	test('scan existing extension', async () => {
		const manifest: Partial<IExtensionManifest> = anExtensionManifest({ 'name': 'name', 'publisher': 'pub' });
		const extensionLocation = await aUserExtension(manifest);
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanOneOrMultipleExtensions(dirname(extensionLocation), ExtensionType.User, {});

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan user extension with different versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.2');
	});

	test('scan user extension include all versions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.1' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', version: '1.0.2' }));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.1');
	});

	test('scan exclude invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
	});

	test('scan exclude uninstalled extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }));
		await instantiationService.get(IFileService).writeFile(joinPath(URI.file(instantiationService.get(INativeEnvironmentService).extensionsPath), '.obsolete'), VSBuffer.fromString(JSON.stringify({ 'pub.name2-1.0.0': true })));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({});

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
	});

	test('scan include uninstalled extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub' }));
		await instantiationService.get(IFileService).writeFile(joinPath(URI.file(instantiationService.get(INativeEnvironmentService).extensionsPath), '.obsolete'), VSBuffer.fromString(JSON.stringify({ 'pub.name2-1.0.0': true })));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanUserExtensions({ includeUninstalled: true });

		assert.deepStrictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[1].identifier, { id: 'pub.name2' });
	});

	test('scan include invalid extensions', async () => {
		await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub' }));
		await aUserExtension(anExtensionManifest({ 'name': 'name2', 'publisher': 'pub', engines: { vscode: '^1.67.0' } }));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

		const actual = await testObject.scanSystemExtensions({ checkControlFile: true });

		assert.deepStrictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].identifier, { id: 'pub.name' });
		assert.deepStrictEqual(actual[0].manifest.version, '1.0.0');
	});

	test('scan extension with default nls replacements', async () => {
		const extensionLocation = await aUserExtension(anExtensionManifest({ 'name': 'name', 'publisher': 'pub', displayName: '%displayName%' }));
		await instantiationService.get(IFileService).writeFile(joinPath(extensionLocation, 'package.nls.json'), VSBuffer.fromString(JSON.stringify({ displayName: 'Hello World' })));
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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
		const testObject: IExtensionsScannerService = instantiationService.createInstance(ExtensionsScannerService);

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

	function anExtensionManifest(manifest: Partial<IExtensionManifest>): Partial<IExtensionManifest> {
		return { engines: { vscode: '^1.66.0' }, version: '1.0.0', main: 'main.js', activationEvents: ['*'], ...manifest };
	}
});
