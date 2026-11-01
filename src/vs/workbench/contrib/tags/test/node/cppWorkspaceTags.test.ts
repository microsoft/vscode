/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getAzureCppSdkPackageNamesFromVcpkgManifest, usesAzureCppSdkBetaRegistry } from '../../common/cppWorkspaceTags.js';

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
			'azure-storage-blobs',
			'azure-data-appconfiguration'
		]);
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

	ensureNoDisposablesAreLeakedInTestSuite();
});
