/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getAzureCppSdkPackageNamesFromVcpkgManifest, usesAzureCppSdkBetaRegistry, usesAzureCppSdkBetaRegistryInVcpkgManifest } from '../../common/cppWorkspaceTags.js';

suite('Telemetry - C++ Workspace Tags', () => {

	test('Gets Azure SDK packages from vcpkg manifest dependencies', () => {
		const manifest = JSON.stringify({
			dependencies: [
				'azure-identity-cpp',
				{ name: 'azure-storage-blobs-cpp', features: ['default'] },
				{ name: 'azure-data-appconfiguration-cpp' },
				'azure-identity-cpp',
				'azure-identity-cpp-preview',
				'not-an-azure-sdk-package'
			]
		});

		assert.deepStrictEqual(getAzureCppSdkPackageNamesFromVcpkgManifest(manifest), [
			'azure-identity',
			'azure-storage-blobs'
		]);
	});

	test('Gets dependencies from default features only', () => {
		const manifest = JSON.stringify({
			'default-features': ['azure', { name: 'storage', platform: 'windows' }, 'missing', null],
			features: {
				azure: { dependencies: ['azure-identity-cpp', 'azure-identity-cpp'] },
				storage: { dependencies: [{ name: 'azure-storage-blobs-cpp' }] },
				optional: { dependencies: ['azure-data-tables-cpp'] }
			}
		});

		assert.deepStrictEqual(getAzureCppSdkPackageNamesFromVcpkgManifest(manifest), ['azure-identity', 'azure-storage-blobs']);
	});

	test('Ignores invalid vcpkg manifests', () => {
		assert.deepStrictEqual([
			getAzureCppSdkPackageNamesFromVcpkgManifest('{}'),
			getAzureCppSdkPackageNamesFromVcpkgManifest('{ invalid'),
			getAzureCppSdkPackageNamesFromVcpkgManifest('{"dependencies": {}}')
		], [[], [], []]);
	});

	test('Detects Azure SDK beta vcpkg registry', () => {
		assert.deepStrictEqual([
			usesAzureCppSdkBetaRegistry(JSON.stringify({
				registries: [
					{ repository: 'https://github.com/microsoft/vcpkg' },
					{ repository: ' HTTPS://github.com/Azure/azure-sdk-vcpkg-betas.git/ ' }
				]
			})),
			usesAzureCppSdkBetaRegistry(JSON.stringify({
				registries: [{ repository: 'https://github.com/Azure/azure-sdk-vcpkg-betas-fork' }]
			})),
			usesAzureCppSdkBetaRegistry('{ invalid')
		], [true, false, false]);
	});

	test('Detects default and embedded Azure SDK beta registries', () => {
		const registry = { repository: 'https://github.com/Azure/azure-sdk-vcpkg-betas' };
		assert.deepStrictEqual([
			usesAzureCppSdkBetaRegistry(JSON.stringify({ 'default-registry': registry })),
			usesAzureCppSdkBetaRegistryInVcpkgManifest(JSON.stringify({ 'vcpkg-configuration': { registries: [registry] } })),
			usesAzureCppSdkBetaRegistryInVcpkgManifest(JSON.stringify({ 'vcpkg-configuration': { 'default-registry': registry } })),
			usesAzureCppSdkBetaRegistryInVcpkgManifest(JSON.stringify({ registries: [registry] })),
			usesAzureCppSdkBetaRegistryInVcpkgManifest('{ invalid')
		], [true, true, true, false, false]);
	});

	test('Matches equivalent registry URLs without matching unrelated repositories', () => {
		const urls = [
			'git@github.com:Azure/azure-sdk-vcpkg-betas',
			'ssh://git@github.com/Azure/azure-sdk-vcpkg-betas.git',
			'ssh://git@github.com:22/Azure/azure-sdk-vcpkg-betas.git',
			'http://github.com/Azure/azure-sdk-vcpkg-betas',
			'https://www.github.com/Azure/azure-sdk-vcpkg-betas/',
			'ssh://git@github.com:2222/Azure/azure-sdk-vcpkg-betas.git',
			'https://github.com.evil.example/Azure/azure-sdk-vcpkg-betas',
			'https://github.com/Azure/azure-sdk-vcpkg-betas-fork',
			'not a URL'
		];
		assert.deepStrictEqual(urls.map(repository => usesAzureCppSdkBetaRegistry(JSON.stringify({
			'default-registry': { repository }
		}))), [true, true, true, true, true, false, false, false, false]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
