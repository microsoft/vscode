/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isUUID } from '../../../../base/common/uuid.js';
import { mock } from '../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { sortExtensionVersions, filterLatestExtensionVersionsForTargetPlatform } from '../../common/extensionGalleryService.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { resolveMarketplaceHeaders } from '../../../externalServices/common/marketplace.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import { TELEMETRY_SETTING_ID } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
class EnvironmentServiceMock extends mock() {
    constructor(serviceMachineIdResource) {
        super();
        this.serviceMachineIdResource = serviceMachineIdResource;
        this.isBuilt = true;
    }
}
suite('Extension Gallery Service', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let fileService, environmentService, storageService, productService, configurationService;
    setup(() => {
        const serviceMachineIdResource = joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'machineid');
        environmentService = new EnvironmentServiceMock(serviceMachineIdResource);
        fileService = disposables.add(new FileService(new NullLogService()));
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(serviceMachineIdResource.scheme, fileSystemProvider));
        storageService = disposables.add(new InMemoryStorageService());
        configurationService = new TestConfigurationService({ [TELEMETRY_SETTING_ID]: "all" /* TelemetryConfiguration.ON */ });
        configurationService.updateValue(TELEMETRY_SETTING_ID, "all" /* TelemetryConfiguration.ON */);
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
        sortExtensionVersions(actual, "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting single extension version with preferred target platform', async () => {
        const actual = [aExtensionVersion('1.1.2', "darwin-x64" /* TargetPlatform.DARWIN_X64 */)];
        const expected = [...actual];
        sortExtensionVersions(actual, "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting single extension version with not compatible target platform', async () => {
        const actual = [aExtensionVersion('1.1.2', "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */)];
        const expected = [...actual];
        sortExtensionVersions(actual, "win32-x64" /* TargetPlatform.WIN32_X64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting multiple extension versions without target platforms', async () => {
        const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.1.3'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
        const expected = [...actual];
        sortExtensionVersions(actual, "win32-arm64" /* TargetPlatform.WIN32_ARM64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting multiple extension versions with target platforms - 1', async () => {
        const actual = [aExtensionVersion('1.2.4', "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */), aExtensionVersion('1.2.4', "win32-arm64" /* TargetPlatform.WIN32_ARM64 */), aExtensionVersion('1.2.4', "linux-arm64" /* TargetPlatform.LINUX_ARM64 */), aExtensionVersion('1.1.3'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
        const expected = [actual[1], actual[0], actual[2], actual[3], actual[4], actual[5]];
        sortExtensionVersions(actual, "win32-arm64" /* TargetPlatform.WIN32_ARM64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting multiple extension versions with target platforms - 2', async () => {
        const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.2.3', "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */), aExtensionVersion('1.2.3', "win32-arm64" /* TargetPlatform.WIN32_ARM64 */), aExtensionVersion('1.2.3', "linux-arm64" /* TargetPlatform.LINUX_ARM64 */), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1')];
        const expected = [actual[0], actual[3], actual[1], actual[2], actual[4], actual[5]];
        sortExtensionVersions(actual, "linux-arm64" /* TargetPlatform.LINUX_ARM64 */);
        assert.deepStrictEqual(actual, expected);
    });
    test('sorting multiple extension versions with target platforms - 3', async () => {
        const actual = [aExtensionVersion('1.2.4'), aExtensionVersion('1.1.2'), aExtensionVersion('1.1.1'), aExtensionVersion('1.0.0', "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */), aExtensionVersion('1.0.0', "win32-arm64" /* TargetPlatform.WIN32_ARM64 */)];
        const expected = [actual[0], actual[1], actual[2], actual[4], actual[3]];
        sortExtensionVersions(actual, "win32-arm64" /* TargetPlatform.WIN32_ARM64 */);
        assert.deepStrictEqual(actual, expected);
    });
    function aExtensionVersion(version, targetPlatform) {
        return { version, targetPlatform };
    }
    function aPreReleaseExtensionVersion(version, targetPlatform) {
        return {
            version,
            targetPlatform,
            properties: [{ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' }]
        };
    }
    suite('filterLatestExtensionVersionsForTargetPlatform', () => {
        test('should return empty array for empty input', () => {
            const result = filterLatestExtensionVersionsForTargetPlatform([], "win32-x64" /* TargetPlatform.WIN32_X64 */, ["win32-x64" /* TargetPlatform.WIN32_X64 */]);
            assert.deepStrictEqual(result, []);
        });
        test('should return single version when only one version provided', () => {
            const versions = [aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */)];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            assert.deepStrictEqual(result, versions);
        });
        test('should include latest release and latest pre-release versions for same platform', () => {
            const release = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const prerelease = aPreReleaseExtensionVersion('0.9.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const versions = [release, prerelease];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should include both since they have different version numbers
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0], release);
            assert.strictEqual(result[1], prerelease);
        });
        test('should include latest prerelease and latest release versions for same platform', () => {
            const prerelease = aPreReleaseExtensionVersion('1.1.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const release = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const versions = [prerelease, release];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should include both since they have different version numbers
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0], prerelease);
            assert.strictEqual(result[1], release);
        });
        test('should include one version per target platform for release versions', () => {
            const version1 = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const version2 = aExtensionVersion('1.0.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
            const version3 = aExtensionVersion('1.0.0', "linux-x64" /* TargetPlatform.LINUX_X64 */);
            const versions = [version1, version2, version3];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */, "linux-x64" /* TargetPlatform.LINUX_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should include all three versions: WIN32_X64 (compatible, first of type) + DARWIN_X64 & LINUX_X64 (non-compatible)
            assert.strictEqual(result.length, 3);
            assert.ok(result.includes(version1)); // Compatible with target platform
            assert.ok(result.includes(version2)); // Non-compatible, included
            assert.ok(result.includes(version3)); // Non-compatible, included
        });
        test('should handle versions without target platform (UNDEFINED)', () => {
            const version1 = aExtensionVersion('1.0.0'); // No target platform specified
            const version2 = aExtensionVersion('0.9.0'); // No target platform specified
            const versions = [version1, version2];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should only include the first version since they both have UNDEFINED platform
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], version1);
        });
        test('should handle mixed release and pre-release versions across multiple platforms', () => {
            const releaseWin = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const releaseMac = aExtensionVersion('1.0.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
            const preReleaseWin = aPreReleaseExtensionVersion('1.1.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const preReleaseMac = aPreReleaseExtensionVersion('1.1.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
            const versions = [releaseWin, releaseMac, preReleaseWin, preReleaseMac];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should include: WIN32_X64 compatible (release + prerelease) + DARWIN_X64 non-compatible (all versions)
            assert.strictEqual(result.length, 4);
            assert.ok(result.includes(releaseWin)); // Compatible release
            assert.ok(result.includes(releaseMac)); // Non-compatible, included
            assert.ok(result.includes(preReleaseWin)); // Compatible pre-release
            assert.ok(result.includes(preReleaseMac)); // Non-compatible, included
        });
        test('should handle complex scenario with multiple versions and platforms', () => {
            const versions = [
                aExtensionVersion('2.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */),
                aExtensionVersion('2.0.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */),
                aPreReleaseExtensionVersion('2.1.0', "win32-x64" /* TargetPlatform.WIN32_X64 */),
                aPreReleaseExtensionVersion('2.1.0', "linux-x64" /* TargetPlatform.LINUX_X64 */),
                aExtensionVersion('2.0.0'), // No platform specified
                aPreReleaseExtensionVersion('2.1.0'), // Pre-release, no platform specified
            ];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */, "linux-x64" /* TargetPlatform.LINUX_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Expected for WIN32_X64 target platform:
            // - Compatible (WIN32_X64 + UNDEFINED): release (2.0.0 WIN32_X64) and pre-release (2.1.0 WIN32_X64)
            // - Non-compatible: DARWIN_X64 release, LINUX_X64 pre-release
            // Total: 4 versions (1 compatible release + 1 compatible pre-release + 2 non-compatible)
            assert.strictEqual(result.length, 4);
            // Check specific versions are included
            assert.ok(result.includes(versions[0])); // 2.0.0 WIN32_X64 (compatible release)
            assert.ok(result.includes(versions[1])); // 2.0.0 DARWIN_X64 (non-compatible)
            assert.ok(result.includes(versions[2])); // 2.1.0 WIN32_X64 (compatible pre-release)
            assert.ok(result.includes(versions[3])); // 2.1.0 LINUX_X64 (non-compatible)
        });
        test('should keep only first compatible version when specific platform comes before undefined', () => {
            // Test how UNDEFINED platform interacts with specific platforms
            const versions = [
                aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */),
                aExtensionVersion('1.0.0'), // UNDEFINED platform - compatible with all
            ];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Both are compatible with WIN32_X64, first one should be included (specific platform preferred)
            assert.strictEqual(result.length, 1);
            assert.ok(result.includes(versions[0])); // WIN32_X64 should be included (specific platform)
        });
        test('should handle higher version with specific platform vs lower version with universal platform', () => {
            // Scenario: newer version for specific platform vs older version with universal compatibility
            const higherVersionSpecificPlatform = aExtensionVersion('2.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const lowerVersionUniversal = aExtensionVersion('1.5.0'); // UNDEFINED/universal platform
            const versions = [higherVersionSpecificPlatform, lowerVersionUniversal];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Both are compatible with WIN32_X64, but only the first release version should be included
            assert.strictEqual(result.length, 1);
            assert.ok(result.includes(higherVersionSpecificPlatform)); // First compatible release
            assert.ok(!result.includes(lowerVersionUniversal)); // Filtered (second compatible release)
        });
        test('should handle higher version with universal platform vs lower version with specific platform', () => {
            // Scenario: higher universal version comes first, then lower platform-specific version
            const higherVersionUniversal = aExtensionVersion('2.0.0'); // UNDEFINED/universal platform
            const lowerVersionSpecificPlatform = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const versions = [higherVersionUniversal, lowerVersionSpecificPlatform];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Both are compatible with WIN32_X64, the first (higher) version should be kept
            // Platform-specific version should NOT replace since it has a different (lower) version number
            assert.strictEqual(result.length, 1);
            assert.ok(result.includes(higherVersionUniversal)); // First compatible release (higher version)
            assert.ok(!result.includes(lowerVersionSpecificPlatform)); // Filtered (lower version)
        });
        test('should handle multiple specific platforms vs universal platform with version differences', () => {
            // Complex scenario with multiple platforms and universal compatibility
            const versions = [
                aExtensionVersion('2.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */), // Highest version, specific platform
                aExtensionVersion('1.9.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */), // Lower version, different specific platform
                aExtensionVersion('1.8.0'), // Lowest version, universal platform
            ];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */, "linux-x64" /* TargetPlatform.LINUX_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should include:
            // - 2.0.0 WIN32_X64 (specific target platform match - replaces UNDEFINED if it came first)
            // - 1.9.0 DARWIN_X64 (non-compatible, included)
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(versions[0])); // 2.0.0 WIN32_X64
            assert.ok(result.includes(versions[1])); // 1.9.0 DARWIN_X64
        });
        test('should include universal platform when no specific platforms conflict', () => {
            // Test where universal platform is included because no specific platforms conflict
            const universalVersion = aExtensionVersion('1.0.0'); // UNDEFINED/universal platform
            const specificVersion = aExtensionVersion('1.0.0', "linux-arm64" /* TargetPlatform.LINUX_ARM64 */);
            const versions = [universalVersion, specificVersion];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */]; // Note: LINUX_ARM64 not in target platforms
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Universal is compatible with WIN32_X64, specific version is not compatible
            // So we should get: universal (first compatible release) + specific (non-compatible)
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(universalVersion)); // Compatible with WIN32_X64
            assert.ok(result.includes(specificVersion)); // Non-compatible, included
        });
        test('should include all non-compatible platform versions', () => {
            const version1 = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const version2 = aExtensionVersion('1.0.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */);
            const version3 = aPreReleaseExtensionVersion('1.1.0', "linux-x64" /* TargetPlatform.LINUX_X64 */);
            const versions = [version1, version2, version3];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */, "linux-x64" /* TargetPlatform.LINUX_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            assert.ok(result.includes(version2)); // Non-compatible, included
            assert.ok(result.includes(version3)); // Non-compatible, included
        });
        test('should prefer specific target platform over undefined when same version exists for both', () => {
            const undefinedVersion = aExtensionVersion('1.0.0'); // UNDEFINED platform, appears first
            const specificVersion = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */); // Specific platform, appears second
            const versions = [undefinedVersion, specificVersion];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return the specific platform version (WIN32_X64), not the undefined one
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], specificVersion);
            assert.ok(!result.includes(undefinedVersion));
        });
        test('should replace undefined pre-release with specific platform pre-release', () => {
            const undefinedPreRelease = aPreReleaseExtensionVersion('1.0.0'); // UNDEFINED platform pre-release, appears first
            const specificPreRelease = aPreReleaseExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */); // Specific platform pre-release, appears second
            const versions = [undefinedPreRelease, specificPreRelease];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return the specific platform pre-release, not the undefined one
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], specificPreRelease);
            assert.ok(!result.includes(undefinedPreRelease));
        });
        test('should handle explicit UNIVERSAL platform', () => {
            const universalVersion = aExtensionVersion('1.0.0', "universal" /* TargetPlatform.UNIVERSAL */);
            const specificVersion = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */);
            const versions = [universalVersion, specificVersion];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return the specific platform version, not the universal one
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], specificVersion);
            assert.ok(!result.includes(universalVersion));
        });
        test('should handle both release and pre-release with same version replacement', () => {
            // Both release and pre-release with undefined platform, then specific platform with same versions
            // Versions sorted by version descending (pre-release 1.1.0, release 1.0.0, then same versions with specific platform)
            const undefinedPreRelease = aPreReleaseExtensionVersion('1.1.0'); // UNDEFINED pre-release
            const specificPreRelease = aPreReleaseExtensionVersion('1.1.0', "win32-x64" /* TargetPlatform.WIN32_X64 */); // Specific pre-release (same version)
            const undefinedRelease = aExtensionVersion('1.0.0'); // UNDEFINED release
            const specificRelease = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */); // Specific release (same version)
            const versions = [undefinedPreRelease, specificPreRelease, undefinedRelease, specificRelease];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return both specific platform versions (they replaced the undefined ones)
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(specificRelease));
            assert.ok(result.includes(specificPreRelease));
            assert.ok(!result.includes(undefinedRelease));
            assert.ok(!result.includes(undefinedPreRelease));
        });
        test('should not replace when specific platform is for different platform', () => {
            const undefinedVersion = aExtensionVersion('1.0.0'); // UNDEFINED, compatible with WIN32_X64
            const specificVersionDarwin = aExtensionVersion('1.0.0', "darwin-x64" /* TargetPlatform.DARWIN_X64 */); // Specific for DARWIN, not compatible with WIN32_X64
            const versions = [undefinedVersion, specificVersionDarwin];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return undefined version (compatible with WIN32_X64) and specific DARWIN version (non-compatible, always included)
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(undefinedVersion));
            assert.ok(result.includes(specificVersionDarwin));
        });
        test('should handle replacement with non-compatible versions in between', () => {
            // Versions sorted by version descending
            const undefinedVersion = aExtensionVersion('1.0.0'); // UNDEFINED, compatible with WIN32_X64
            const specificVersion = aExtensionVersion('1.0.0', "win32-x64" /* TargetPlatform.WIN32_X64 */); // Specific for WIN32_X64 (same version)
            const nonCompatibleVersion = aExtensionVersion('0.9.0', "linux-arm64" /* TargetPlatform.LINUX_ARM64 */); // Non-compatible platform (lower version)
            const versions = [undefinedVersion, specificVersion, nonCompatibleVersion];
            const allTargetPlatforms = ["win32-x64" /* TargetPlatform.WIN32_X64 */, "darwin-x64" /* TargetPlatform.DARWIN_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "win32-x64" /* TargetPlatform.WIN32_X64 */, allTargetPlatforms);
            // Should return specific WIN32_X64 version (replacing undefined since same version) and non-compatible LINUX_ARM64 version
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(specificVersion));
            assert.ok(result.includes(nonCompatibleVersion));
            assert.ok(!result.includes(undefinedVersion));
        });
        test('should filter versions for linux-x64 target platform with mixed universal and platform-specific versions', () => {
            // Data from real extension versions (sorted by version descending, as returned by gallery API):
            // 0.15.0 - pre-release, universal
            // 0.14.0 - release, universal
            // 0.6.0 - release, linux-x64
            // 0.5.1 - pre-release, linux-x64
            const versions = [
                aPreReleaseExtensionVersion('0.15.0'), // pre-release, universal (highest version)
                aExtensionVersion('0.14.0'), // release, universal
                aExtensionVersion('0.6.0', "linux-x64" /* TargetPlatform.LINUX_X64 */), // release, linux-x64
                aPreReleaseExtensionVersion('0.5.1', "linux-x64" /* TargetPlatform.LINUX_X64 */), // pre-release, linux-x64 (lowest version)
            ];
            const allTargetPlatforms = ["linux-x64" /* TargetPlatform.LINUX_X64 */];
            const result = filterLatestExtensionVersionsForTargetPlatform(versions, "linux-x64" /* TargetPlatform.LINUX_X64 */, allTargetPlatforms);
            // Expected:
            // - 0.15.0 universal (first compatible pre-release, higher version than 0.5.1 linux-x64)
            // - 0.14.0 universal (first compatible release, higher version than 0.6.0 linux-x64)
            // Platform-specific versions are NOT preferred when they have lower version numbers
            assert.strictEqual(result.length, 2);
            assert.ok(result.includes(versions[0])); // 0.15.0 universal (pre-release)
            assert.ok(result.includes(versions[1])); // 0.14.0 universal (release)
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvdGVzdC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTVELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRTFHLE9BQU8sRUFBK0IscUJBQXFCLEVBQUUsOENBQThDLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU3SixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBRXpELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxzQkFBc0IsRUFBbUIsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQTBCLG9CQUFvQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFdEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsTUFBTSxzQkFBdUIsU0FBUSxJQUFJLEVBQXVCO0lBRS9ELFlBQVksd0JBQTZCO1FBQ3hDLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLHdCQUF3QixHQUFHLHdCQUF3QixDQUFDO1FBQ3pELElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUM5RCxJQUFJLFdBQXlCLEVBQUUsa0JBQXVDLEVBQUUsY0FBK0IsRUFBRSxjQUErQixFQUFFLG9CQUEyQyxDQUFDO0lBRXRMLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixNQUFNLHdCQUF3QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzNHLGtCQUFrQixHQUFHLElBQUksc0JBQXNCLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMxRSxXQUFXLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7UUFDN0UsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNuRyxjQUFjLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUMvRCxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyx1Q0FBMkIsRUFBRSxDQUFDLENBQUM7UUFDM0csb0JBQW9CLENBQUMsV0FBVyxDQUFDLG9CQUFvQix3Q0FBNEIsQ0FBQztRQUNsRixjQUFjLEdBQUcsRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLEdBQUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNsRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6QyxNQUFNLE9BQU8sR0FBRyxNQUFNLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM5SyxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sUUFBUSxHQUFHLE1BQU0seUJBQXlCLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQy9LLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztJQUMvRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwREFBMEQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzRSxNQUFNLE1BQU0sR0FBRyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDNUMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQzdCLHFCQUFxQixDQUFDLE1BQU0sK0NBQTRCLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLCtDQUE0QixDQUFDLENBQUM7UUFDdkUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQzdCLHFCQUFxQixDQUFDLE1BQU0sK0NBQTRCLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0VBQXNFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLG1EQUE4QixDQUFDLENBQUM7UUFDekUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQzdCLHFCQUFxQixDQUFDLE1BQU0sNkNBQTJCLENBQUM7UUFDeEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0UsTUFBTSxNQUFNLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2hJLE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztRQUM3QixxQkFBcUIsQ0FBQyxNQUFNLGlEQUE2QixDQUFDO1FBQzFELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtEQUErRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hGLE1BQU0sTUFBTSxHQUFHLENBQUMsaUJBQWlCLENBQUMsT0FBTyxtREFBOEIsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLGlEQUE2QixFQUFFLGlCQUFpQixDQUFDLE9BQU8saURBQTZCLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM3USxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEYscUJBQXFCLENBQUMsTUFBTSxpREFBNkIsQ0FBQztRQUMxRCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrREFBK0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRixNQUFNLE1BQU0sR0FBRyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sbURBQThCLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxpREFBNkIsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLGlEQUE2QixFQUFFLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDN1EsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLHFCQUFxQixDQUFDLE1BQU0saURBQTZCLENBQUM7UUFDMUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0RBQStELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLG1EQUE4QixFQUFFLGlCQUFpQixDQUFDLE9BQU8saURBQTZCLENBQUMsQ0FBQztRQUNyTixNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6RSxxQkFBcUIsQ0FBQyxNQUFNLGlEQUE2QixDQUFDO1FBQzFELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyxpQkFBaUIsQ0FBQyxPQUFlLEVBQUUsY0FBK0I7UUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQWlDLENBQUM7SUFDbkUsQ0FBQztJQUVELFNBQVMsMkJBQTJCLENBQUMsT0FBZSxFQUFFLGNBQStCO1FBQ3BGLE9BQU87WUFDTixPQUFPO1lBQ1AsY0FBYztZQUNkLFVBQVUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLHdDQUF3QyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztTQUMvQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxLQUFLLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1FBRTVELElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsTUFBTSxNQUFNLEdBQUcsOENBQThDLENBQUMsRUFBRSw4Q0FBNEIsNENBQTBCLENBQUMsQ0FBQztZQUN4SCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw2REFBNkQsRUFBRSxHQUFHLEVBQUU7WUFDeEUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDLENBQUM7WUFDeEUsTUFBTSxrQkFBa0IsR0FBRyw0Q0FBMEIsQ0FBQztZQUN0RCxNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBQ3RILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlGQUFpRixFQUFFLEdBQUcsRUFBRTtZQUM1RixNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDO1lBQ3JFLE1BQU0sVUFBVSxHQUFHLDJCQUEyQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFDbEYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDdkMsTUFBTSxrQkFBa0IsR0FBRyw0Q0FBMEIsQ0FBQztZQUV0RCxNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILGdFQUFnRTtZQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0ZBQWdGLEVBQUUsR0FBRyxFQUFFO1lBQzNGLE1BQU0sVUFBVSxHQUFHLDJCQUEyQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFDbEYsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkIsQ0FBQztZQUNyRSxNQUFNLFFBQVEsR0FBRyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN2QyxNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgsZ0VBQWdFO1lBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxRUFBcUUsRUFBRSxHQUFHLEVBQUU7WUFDaEYsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkIsQ0FBQztZQUN0RSxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLCtDQUE0QixDQUFDO1lBQ3ZFLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFDdEUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sa0JBQWtCLEdBQUcsc0lBQStFLENBQUM7WUFFM0csTUFBTSxNQUFNLEdBQUcsOENBQThDLENBQUMsUUFBUSw4Q0FBNEIsa0JBQWtCLENBQUMsQ0FBQztZQUV0SCxxSEFBcUg7WUFDckgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsa0NBQWtDO1lBQ3hFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1lBQ2pFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ2xFLENBQUMsQ0FBQyxDQUFDO1FBR0gsSUFBSSxDQUFDLDREQUE0RCxFQUFFLEdBQUcsRUFBRTtZQUN2RSxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLCtCQUErQjtZQUM1RSxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLCtCQUErQjtZQUM1RSxNQUFNLFFBQVEsR0FBRyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUN0QyxNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgsZ0ZBQWdGO1lBQ2hGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnRkFBZ0YsRUFBRSxHQUFHLEVBQUU7WUFDM0YsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkIsQ0FBQztZQUN4RSxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLCtDQUE0QixDQUFDO1lBQ3pFLE1BQU0sYUFBYSxHQUFHLDJCQUEyQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFDckYsTUFBTSxhQUFhLEdBQUcsMkJBQTJCLENBQUMsT0FBTywrQ0FBNEIsQ0FBQztZQUV0RixNQUFNLFFBQVEsR0FBRyxDQUFDLFVBQVUsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsMEZBQXFELENBQUM7WUFFakYsTUFBTSxNQUFNLEdBQUcsOENBQThDLENBQUMsUUFBUSw4Q0FBNEIsa0JBQWtCLENBQUMsQ0FBQztZQUV0SCx5R0FBeUc7WUFDekcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCO1lBQzdELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1lBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMseUJBQXlCO1lBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ3ZFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRTtZQUNoRixNQUFNLFFBQVEsR0FBRztnQkFDaEIsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkI7Z0JBQ3BELGlCQUFpQixDQUFDLE9BQU8sK0NBQTRCO2dCQUNyRCwyQkFBMkIsQ0FBQyxPQUFPLDZDQUEyQjtnQkFDOUQsMkJBQTJCLENBQUMsT0FBTyw2Q0FBMkI7Z0JBQzlELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLHdCQUF3QjtnQkFDcEQsMkJBQTJCLENBQUMsT0FBTyxDQUFDLEVBQUUscUNBQXFDO2FBQzNFLENBQUM7WUFDRixNQUFNLGtCQUFrQixHQUFHLHNJQUErRSxDQUFDO1lBRTNHLE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgsMENBQTBDO1lBQzFDLG9HQUFvRztZQUNwRyw4REFBOEQ7WUFDOUQseUZBQXlGO1lBQ3pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyQyx1Q0FBdUM7WUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7WUFDaEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQ0FBb0M7WUFDN0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQywyQ0FBMkM7WUFDcEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtQ0FBbUM7UUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUZBQXlGLEVBQUUsR0FBRyxFQUFFO1lBQ3BHLGdFQUFnRTtZQUNoRSxNQUFNLFFBQVEsR0FBRztnQkFDaEIsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkI7Z0JBQ3BELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLDJDQUEyQzthQUN2RSxDQUFDO1lBQ0YsTUFBTSxrQkFBa0IsR0FBRywwRkFBcUQsQ0FBQztZQUVqRixNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILGlHQUFpRztZQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtREFBbUQ7UUFDN0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOEZBQThGLEVBQUUsR0FBRyxFQUFFO1lBQ3pHLDhGQUE4RjtZQUM5RixNQUFNLDZCQUE2QixHQUFHLGlCQUFpQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFDM0YsTUFBTSxxQkFBcUIsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLCtCQUErQjtZQUV6RixNQUFNLFFBQVEsR0FBRyxDQUFDLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDeEUsTUFBTSxrQkFBa0IsR0FBRywwRkFBcUQsQ0FBQztZQUVqRixNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILDRGQUE0RjtZQUM1RixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQyxDQUFDLDJCQUEyQjtZQUN0RixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7UUFDNUYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOEZBQThGLEVBQUUsR0FBRyxFQUFFO1lBQ3pHLHVGQUF1RjtZQUN2RixNQUFNLHNCQUFzQixHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsK0JBQStCO1lBQzFGLE1BQU0sNEJBQTRCLEdBQUcsaUJBQWlCLENBQUMsT0FBTyw2Q0FBMkIsQ0FBQztZQUUxRixNQUFNLFFBQVEsR0FBRyxDQUFDLHNCQUFzQixFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDeEUsTUFBTSxrQkFBa0IsR0FBRywwRkFBcUQsQ0FBQztZQUVqRixNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILGdGQUFnRjtZQUNoRiwrRkFBK0Y7WUFDL0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyw0Q0FBNEM7WUFDaEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ3ZGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBGQUEwRixFQUFFLEdBQUcsRUFBRTtZQUNyRyx1RUFBdUU7WUFDdkUsTUFBTSxRQUFRLEdBQUc7Z0JBQ2hCLGlCQUFpQixDQUFDLE9BQU8sNkNBQTJCLEVBQUsscUNBQXFDO2dCQUM5RixpQkFBaUIsQ0FBQyxPQUFPLCtDQUE0QixFQUFHLDZDQUE2QztnQkFDckcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEVBQThCLHFDQUFxQzthQUM3RixDQUFDO1lBQ0YsTUFBTSxrQkFBa0IsR0FBRyxzSUFBK0UsQ0FBQztZQUUzRyxNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILGtCQUFrQjtZQUNsQiwyRkFBMkY7WUFDM0YsZ0RBQWdEO1lBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQjtZQUMzRCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQjtRQUM3RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLEVBQUU7WUFDbEYsbUZBQW1GO1lBQ25GLE1BQU0sZ0JBQWdCLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQywrQkFBK0I7WUFDcEYsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxpREFBNkIsQ0FBQztZQUUvRSxNQUFNLFFBQVEsR0FBRyxDQUFDLGdCQUFnQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sa0JBQWtCLEdBQUcsMEZBQXFELENBQUMsQ0FBQyw0Q0FBNEM7WUFFOUgsTUFBTSxNQUFNLEdBQUcsOENBQThDLENBQUMsUUFBUSw4Q0FBNEIsa0JBQWtCLENBQUMsQ0FBQztZQUV0SCw2RUFBNkU7WUFDN0UscUZBQXFGO1lBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsNEJBQTRCO1lBQzFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDO1lBQ3RFLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sK0NBQTRCLENBQUM7WUFDdkUsTUFBTSxRQUFRLEdBQUcsMkJBQTJCLENBQUMsT0FBTyw2Q0FBMkIsQ0FBQztZQUNoRixNQUFNLFFBQVEsR0FBRyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDaEQsTUFBTSxrQkFBa0IsR0FBRyxzSUFBK0UsQ0FBQztZQUUzRyxNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1lBQ2pFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBQ2xFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlGQUF5RixFQUFFLEdBQUcsRUFBRTtZQUNwRyxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsb0NBQW9DO1lBQ3pGLE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sNkNBQTJCLENBQUMsQ0FBQyxvQ0FBb0M7WUFFbEgsTUFBTSxRQUFRLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNyRCxNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgsaUZBQWlGO1lBQ2pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUVBQXlFLEVBQUUsR0FBRyxFQUFFO1lBQ3BGLE1BQU0sbUJBQW1CLEdBQUcsMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxnREFBZ0Q7WUFDbEgsTUFBTSxrQkFBa0IsR0FBRywyQkFBMkIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDLENBQUMsZ0RBQWdEO1lBRTNJLE1BQU0sUUFBUSxHQUFHLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztZQUMzRCxNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgseUVBQXlFO1lBQ3pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDO1lBQzlFLE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sNkNBQTJCLENBQUM7WUFFN0UsTUFBTSxRQUFRLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNyRCxNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgscUVBQXFFO1lBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMEVBQTBFLEVBQUUsR0FBRyxFQUFFO1lBQ3JGLGtHQUFrRztZQUNsRyxzSEFBc0g7WUFDdEgsTUFBTSxtQkFBbUIsR0FBRywyQkFBMkIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjtZQUMxRixNQUFNLGtCQUFrQixHQUFHLDJCQUEyQixDQUFDLE9BQU8sNkNBQTJCLENBQUMsQ0FBQyxzQ0FBc0M7WUFDakksTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLG9CQUFvQjtZQUN6RSxNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDLENBQUMsa0NBQWtDO1lBRWhILE1BQU0sUUFBUSxHQUFHLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDOUYsTUFBTSxrQkFBa0IsR0FBRyw0Q0FBMEIsQ0FBQztZQUV0RCxNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILG1GQUFtRjtZQUNuRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDNUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDOUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1FBQ2xELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRTtZQUNoRixNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsdUNBQXVDO1lBQzVGLE1BQU0scUJBQXFCLEdBQUcsaUJBQWlCLENBQUMsT0FBTywrQ0FBNEIsQ0FBQyxDQUFDLHFEQUFxRDtZQUUxSSxNQUFNLFFBQVEsR0FBRyxDQUFDLGdCQUFnQixFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDM0QsTUFBTSxrQkFBa0IsR0FBRywwRkFBcUQsQ0FBQztZQUVqRixNQUFNLE1BQU0sR0FBRyw4Q0FBOEMsQ0FBQyxRQUFRLDhDQUE0QixrQkFBa0IsQ0FBQyxDQUFDO1lBRXRILDRIQUE0SDtZQUM1SCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1FQUFtRSxFQUFFLEdBQUcsRUFBRTtZQUM5RSx3Q0FBd0M7WUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHVDQUF1QztZQUM1RixNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixDQUFDLENBQUMsd0NBQXdDO1lBQ3RILE1BQU0sb0JBQW9CLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxpREFBNkIsQ0FBQyxDQUFDLDBDQUEwQztZQUUvSCxNQUFNLFFBQVEsR0FBRyxDQUFDLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBQzNFLE1BQU0sa0JBQWtCLEdBQUcsMEZBQXFELENBQUM7WUFFakYsTUFBTSxNQUFNLEdBQUcsOENBQThDLENBQUMsUUFBUSw4Q0FBNEIsa0JBQWtCLENBQUMsQ0FBQztZQUV0SCwySEFBMkg7WUFDM0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBHQUEwRyxFQUFFLEdBQUcsRUFBRTtZQUNySCxnR0FBZ0c7WUFDaEcsa0NBQWtDO1lBQ2xDLDhCQUE4QjtZQUM5Qiw2QkFBNkI7WUFDN0IsaUNBQWlDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHO2dCQUNoQiwyQkFBMkIsQ0FBQyxRQUFRLENBQUMsRUFBK0IsMkNBQTJDO2dCQUMvRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBeUMscUJBQXFCO2dCQUN6RixpQkFBaUIsQ0FBQyxPQUFPLDZDQUEyQixFQUFnQixxQkFBcUI7Z0JBQ3pGLDJCQUEyQixDQUFDLE9BQU8sNkNBQTJCLEVBQU0sMENBQTBDO2FBQzlHLENBQUM7WUFDRixNQUFNLGtCQUFrQixHQUFHLDRDQUEwQixDQUFDO1lBRXRELE1BQU0sTUFBTSxHQUFHLDhDQUE4QyxDQUFDLFFBQVEsOENBQTRCLGtCQUFrQixDQUFDLENBQUM7WUFFdEgsWUFBWTtZQUNaLHlGQUF5RjtZQUN6RixxRkFBcUY7WUFDckYsb0ZBQW9GO1lBQ3BGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztZQUMxRSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QjtRQUN2RSxDQUFDLENBQUMsQ0FBQztJQUVKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==