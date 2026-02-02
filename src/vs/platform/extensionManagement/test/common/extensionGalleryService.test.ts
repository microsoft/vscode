/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { isUUID } from 'vs/base/common/uuid';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRawGalleryExtensionVersion, sortExtensionVersions } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { resolveMarketplaceHeaders } from 'vs/platform/externalServices/common/marketplace';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { TelemetryConfiguration, TELEMETRY_SETTING_ID } from 'vs/platform/telemetry/common/telemetry';
import { TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

class EnvironmentServiceMock extends mock<IEnvironmentService>() {
	override readonly serviceMachineIdResource: URI;
	constructor(serviceMachineIdResource: URI) {
		super();
		this.serviceMachineIdResource = serviceMachineIdResource;
		this.isBuilt = true;
	}
}

suite('Extension Gallery Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fileService: IFileService, environmentService: IEnvironmentService, storageService: IStorageService, productService: IProductService, configurationService: IConfigurationService;

	setup(() => {
		const serviceMachineIdResource = joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'machineid');
		environmentService = new EnvironmentServiceMock(serviceMachineIdResource);
		fileService = disposables.add(new FileService(new NullLogService()));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(serviceMachineIdResource.scheme, fileSystemProvider));
		storageService = disposables.add(new InMemoryStorageService());
		configurationService = new TestConfigurationService({ [TELEMETRY_SETTING_ID]: TelemetryConfiguration.ON });
		configurationService.updateValue(TELEMETRY_SETTING_ID, TelemetryConfiguration.ON);
		productService = { _serviceBrand: undefined, ...product, enableTelemetry: true };
	});

	test('marketplace machine id', async () => {
		const headers = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService, NullTelemetryService);
		assert.ok(isUUID(headers['X-Market-User-Id']));
		const headers2 = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService, NullTelemetryService);
		assert.strictEqual(headers['X-Market-User-Id'], headers2['X-Market-User-Id']);
	});

	test('sorting single extension version without target platform', async () => {
		const actual = [aExtensionVersion('1.1.2')];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.DARWIN_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with preferred target platform', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.DARWIN_X64)];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.DARWIN_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with fallback target platform', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32)];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with not compatible target platform', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.DARWIN_ARM64)];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with multiple target platforms and preferred at first', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.WIN32_X64), aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32), aExtensionVersion('1.1.2')];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with multiple target platforms and preferred at first with no fallbacks', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.DARWIN_X64), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32)];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.DARWIN_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with multiple target platforms and preferred at first and fallback at last', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.WIN32_X64), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32)];
		const expected = [actual[0], actual[2], actual[1]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with multiple target platforms and preferred is not first', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32), aExtensionVersion('1.1.2', TargetPlatform.WIN32_X64), aExtensionVersion('1.1.2')];
		const expected = [actual[1], actual[0], actual[2]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting single extension version with multiple target platforms and preferred is at the end', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.WIN32_IA32), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.2', TargetPlatform.WIN32_X64)];
		const expected = [actual[2], actual[0], actual[1]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting multiple extension versions without target platforms', async () => {
		const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.1.3'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
		const expected = [...actual];
		sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting multiple extension versions with target platforms - 1', async () => {
		const actual = [aExtensionVersion('1.2.4', TargetPlatform.DARWIN_ARM64), aExtensionVersion('1.2.4', TargetPlatform.WIN32_ARM64), aExtensionVersion('1.2.4', TargetPlatform.LINUX_ARM64), aExtensionVersion('1.1.3'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
		const expected = [actual[1], actual[0], actual[2], actual[3], actual[4], actual[5]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting multiple extension versions with target platforms - 2', async () => {
		const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.2.3', TargetPlatform.DARWIN_ARM64), aExtensionVersion('1.2.3', TargetPlatform.WIN32_ARM64), aExtensionVersion('1.2.3', TargetPlatform.LINUX_ARM64), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
		const expected = [actual[0], actual[3], actual[1], actual[2], actual[4], actual[5]];
		sortExtensionVersions(actual, TargetPlatform.LINUX_ARM64);
		assert.deepStrictEqual(actual, expected);
	});

	test('sorting multiple extension versions with target platforms - 3', async () => {
		const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1'), aExtensionVersion('1.0.0', TargetPlatform.DARWIN_ARM64), aExtensionVersion('1.0.0', TargetPlatform.WIN32_IA32), aExtensionVersion('1.0.0', TargetPlatform.WIN32_ARM64)];
		const expected = [actual[0], actual[1], actual[2], actual[5], actual[4], actual[3]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
		assert.deepStrictEqual(actual, expected);
	});

	function aExtensionVersion(version: string, targetPlatform?: TargetPlatform): IRawGalleryExtensionVersion {
		return { version, targetPlatform } as IRawGalleryExtensionVersion;
	}
});
