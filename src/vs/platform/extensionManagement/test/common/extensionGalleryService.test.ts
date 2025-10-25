/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isUUID } from '../../../../base/common/uuid.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IRawGalleryExtensionVersion, sortExtensionVersions, filterLatestExtensionVersionsForTargetPlatform } from '../../common/extensionGalleryService.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { resolveMarketplaceHeaders } from '../../../externalServices/common/marketplace.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { TelemetryConfiguration, TELEMETRY_SETTING_ID } from '../../../telemetry/common/telemetry.js';
import { TargetPlatform } from '../../../extensions/common/extensions.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

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
		assert.ok(headers['X-Market-User-Id']);
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

	test('sorting single extension version with not compatible target platform', async () => {
		const actual = [aExtensionVersion('1.1.2', TargetPlatform.DARWIN_ARM64)];
		const expected = [...actual];
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
		const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1'), aExtensionVersion('1.0.0', TargetPlatform.DARWIN_ARM64), aExtensionVersion('1.0.0', TargetPlatform.WIN32_ARM64)];
		const expected = [actual[0], actual[1], actual[2], actual[4], actual[3]];
		sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
		assert.deepStrictEqual(actual, expected);
	});

	function aExtensionVersion(version: string, targetPlatform?: TargetPlatform): IRawGalleryExtensionVersion {
		return { version, targetPlatform } as IRawGalleryExtensionVersion;
	}

	function aPreReleaseExtensionVersion(version: string, targetPlatform?: TargetPlatform): IRawGalleryExtensionVersion {
		return {
			version,
			targetPlatform,
			properties: [{ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' }]
		} as IRawGalleryExtensionVersion;
	}

	suite('filterLatestExtensionVersionsForTargetPlatform', () => {

		test('should return empty array for empty input', () => {
			const result = filterLatestExtensionVersionsForTargetPlatform([], TargetPlatform.WIN32_X64, [TargetPlatform.WIN32_X64]);
			assert.deepStrictEqual(result, []);
		});

		test('should return single version when only one version provided', () => {
			const versions = [aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64)];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64];
			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
			assert.deepStrictEqual(result, versions);
		});

		test('should filter out duplicate target platforms for release versions', () => {
			const version1 = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const version2 = aExtensionVersion('0.9.0', TargetPlatform.WIN32_X64); // Same platform, older version
			const versions = [version1, version2];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should only include the first version (latest) for this platform
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0], version1);
		});

		test('should include one version per target platform for release versions', () => {
			const version1 = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const version2 = aExtensionVersion('1.0.0', TargetPlatform.DARWIN_X64);
			const version3 = aExtensionVersion('1.0.0', TargetPlatform.LINUX_X64);
			const versions = [version1, version2, version3];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should include all three versions: WIN32_X64 (compatible, first of type) + DARWIN_X64 & LINUX_X64 (non-compatible)
			assert.strictEqual(result.length, 3);
			assert.ok(result.includes(version1)); // Compatible with target platform
			assert.ok(result.includes(version2)); // Non-compatible, included
			assert.ok(result.includes(version3)); // Non-compatible, included
		});

		test('should separate release and pre-release versions', () => {
			const releaseVersion = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const preReleaseVersion = aPreReleaseExtensionVersion('1.1.0', TargetPlatform.WIN32_X64);
			const versions = [releaseVersion, preReleaseVersion];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should include both since they are different types (release vs pre-release)
			assert.strictEqual(result.length, 2);
			assert.ok(result.includes(releaseVersion));
			assert.ok(result.includes(preReleaseVersion));
		});

		test('should filter duplicate pre-release versions by target platform', () => {
			const preRelease1 = aPreReleaseExtensionVersion('1.1.0', TargetPlatform.WIN32_X64);
			const preRelease2 = aPreReleaseExtensionVersion('1.0.0', TargetPlatform.WIN32_X64); // Same platform, older
			const versions = [preRelease1, preRelease2];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should only include the first pre-release version for this platform
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0], preRelease1);
		});

		test('should handle versions without target platform (UNDEFINED)', () => {
			const version1 = aExtensionVersion('1.0.0'); // No target platform specified
			const version2 = aExtensionVersion('0.9.0'); // No target platform specified
			const versions = [version1, version2];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should only include the first version since they both have UNDEFINED platform
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0], version1);
		});

		test('should handle mixed release and pre-release versions across multiple platforms', () => {
			const releaseWin = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const releaseMac = aExtensionVersion('1.0.0', TargetPlatform.DARWIN_X64);
			const preReleaseWin = aPreReleaseExtensionVersion('1.1.0', TargetPlatform.WIN32_X64);
			const preReleaseMac = aPreReleaseExtensionVersion('1.1.0', TargetPlatform.DARWIN_X64);
			const oldReleaseWin = aExtensionVersion('0.9.0', TargetPlatform.WIN32_X64); // Should be filtered out

			const versions = [releaseWin, releaseMac, preReleaseWin, preReleaseMac, oldReleaseWin];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should include: WIN32_X64 compatible (release + prerelease) + DARWIN_X64 non-compatible (all versions)
			assert.strictEqual(result.length, 4);
			assert.ok(result.includes(releaseWin)); // Compatible release
			assert.ok(result.includes(releaseMac)); // Non-compatible, included
			assert.ok(result.includes(preReleaseWin)); // Compatible pre-release
			assert.ok(result.includes(preReleaseMac)); // Non-compatible, included
			assert.ok(!result.includes(oldReleaseWin)); // Filtered (older compatible release)
		});

		test('should handle complex scenario with multiple versions and platforms', () => {
			const versions = [
				aExtensionVersion('2.0.0', TargetPlatform.WIN32_X64),
				aExtensionVersion('2.0.0', TargetPlatform.DARWIN_X64),
				aExtensionVersion('1.9.0', TargetPlatform.WIN32_X64), // Older release, same platform
				aPreReleaseExtensionVersion('2.1.0', TargetPlatform.WIN32_X64),
				aPreReleaseExtensionVersion('2.0.5', TargetPlatform.WIN32_X64), // Older pre-release, same platform
				aPreReleaseExtensionVersion('2.1.0', TargetPlatform.LINUX_X64),
				aExtensionVersion('2.0.0'), // No platform specified
				aPreReleaseExtensionVersion('2.1.0'), // Pre-release, no platform specified
			];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Expected for WIN32_X64 target platform:
			// - Compatible (WIN32_X64 + UNDEFINED): Only first release and first pre-release
			// - Non-compatible: DARWIN_X64 release, LINUX_X64 pre-release
			// Total: 4 versions (1 compatible release + 1 compatible pre-release + 2 non-compatible)
			assert.strictEqual(result.length, 4);

			// Check specific versions are included
			assert.ok(result.includes(versions[0])); // 2.0.0 WIN32_X64 (first compatible release)
			assert.ok(result.includes(versions[1])); // 2.0.0 DARWIN_X64 (non-compatible)
			assert.ok(result.includes(versions[3])); // 2.1.0 WIN32_X64 (first compatible pre-release)
			assert.ok(result.includes(versions[5])); // 2.1.0 LINUX_X64 (non-compatible)
		});

		test('should handle UNDEFINED platform interaction with specific platforms', () => {
			// Test how UNDEFINED platform interacts with specific platforms
			const versions = [
				aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64),
				aExtensionVersion('1.0.0'), // UNDEFINED platform - compatible with all
			];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Both are compatible with WIN32_X64, but only the first of each type should be included
			// Since both are release versions, only the first one should be included
			assert.strictEqual(result.length, 1);
			assert.ok(result.includes(versions[0])); // WIN32_X64 should be included (first release)
		});

		test('should handle higher version with specific platform vs lower version with universal platform', () => {
			// Scenario: newer version for specific platform vs older version with universal compatibility
			const higherVersionSpecificPlatform = aExtensionVersion('2.0.0', TargetPlatform.WIN32_X64);
			const lowerVersionUniversal = aExtensionVersion('1.5.0'); // UNDEFINED/universal platform

			const versions = [higherVersionSpecificPlatform, lowerVersionUniversal];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Both are compatible with WIN32_X64, but only the first release version should be included
			assert.strictEqual(result.length, 1);
			assert.ok(result.includes(higherVersionSpecificPlatform)); // First compatible release
			assert.ok(!result.includes(lowerVersionUniversal)); // Filtered (second compatible release)
		});

		test('should handle lower version with specific platform vs higher version with universal platform', () => {
			// Reverse scenario: older version for specific platform vs newer version with universal compatibility
			const lowerVersionSpecificPlatform = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const higherVersionUniversal = aExtensionVersion('2.0.0'); // UNDEFINED/universal platform

			const versions = [lowerVersionSpecificPlatform, higherVersionUniversal];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Both are compatible with WIN32_X64, but only the first release version should be included
			assert.strictEqual(result.length, 1);
			assert.ok(result.includes(lowerVersionSpecificPlatform)); // First compatible release
			assert.ok(!result.includes(higherVersionUniversal)); // Filtered (second compatible release)
		});

		test('should handle multiple specific platforms vs universal platform with version differences', () => {
			// Complex scenario with multiple platforms and universal compatibility
			const versions = [
				aExtensionVersion('2.0.0', TargetPlatform.WIN32_X64),    // Highest version, specific platform
				aExtensionVersion('1.9.0', TargetPlatform.DARWIN_X64),  // Lower version, different specific platform
				aExtensionVersion('1.8.0'),                             // Lowest version, universal platform
				aExtensionVersion('1.7.0', TargetPlatform.WIN32_X64),   // Even older, same platform as first - should be filtered
			];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Should include:
			// - 2.0.0 WIN32_X64 (first compatible release for WIN32_X64)
			// - 1.9.0 DARWIN_X64 (non-compatible, included)
			// - 1.8.0 UNDEFINED (second compatible release, filtered)
			// Should NOT include:
			// - 1.7.0 WIN32_X64 (third compatible release, filtered)
			assert.strictEqual(result.length, 2);
			assert.ok(result.includes(versions[0])); // 2.0.0 WIN32_X64
			assert.ok(result.includes(versions[1])); // 1.9.0 DARWIN_X64
			assert.ok(!result.includes(versions[2])); // 1.8.0 UNDEFINED should be filtered
			assert.ok(!result.includes(versions[3])); // 1.7.0 WIN32_X64 should be filtered
		});

		test('should include universal platform when no specific platforms conflict', () => {
			// Test where universal platform is included because no specific platforms conflict
			const universalVersion = aExtensionVersion('1.0.0'); // UNDEFINED/universal platform
			const specificVersion = aExtensionVersion('1.0.0', TargetPlatform.LINUX_ARM64);

			const versions = [universalVersion, specificVersion];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64]; // Note: LINUX_ARM64 not in target platforms

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// Universal is compatible with WIN32_X64, specific version is not compatible
			// So we should get: universal (first compatible release) + specific (non-compatible)
			assert.strictEqual(result.length, 2);
			assert.ok(result.includes(universalVersion)); // Compatible with WIN32_X64
			assert.ok(result.includes(specificVersion)); // Non-compatible, included
		});

		test('should preserve order of input when no filtering occurs', () => {
			const version1 = aExtensionVersion('1.0.0', TargetPlatform.WIN32_X64);
			const version2 = aExtensionVersion('1.0.0', TargetPlatform.DARWIN_X64);
			const version3 = aPreReleaseExtensionVersion('1.1.0', TargetPlatform.LINUX_X64);
			const versions = [version1, version2, version3];
			const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];

			const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);

			// For WIN32_X64 target: version1 (compatible release) + version2, version3 (non-compatible)
			assert.strictEqual(result.length, 3);
			assert.ok(result.includes(version1)); // Compatible release
			assert.ok(result.includes(version2)); // Non-compatible, included
			assert.ok(result.includes(version3)); // Non-compatible, included
		});

	});
});
