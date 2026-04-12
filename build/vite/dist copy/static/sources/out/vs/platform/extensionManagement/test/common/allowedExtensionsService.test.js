/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { AllowedExtensionsService } from '../../common/allowedExtensionsService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AllowedExtensionsConfigKey } from '../../common/extensionManagement.js';
import { Event } from '../../../../base/common/event.js';
import { getGalleryExtensionId } from '../../common/extensionManagementUtil.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
suite('AllowedExtensionsService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const configurationService = new TestConfigurationService();
    setup(() => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, '*');
    });
    test('should allow all extensions if no allowed extensions are configured', () => {
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
    });
    test('should not allow specific extension if not in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': false });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
    });
    test('should allow specific extension if in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
    });
    test('should not allow pre-release extension if only stable is allowed', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, false);
    });
    test('should allow pre-release extension if pre-release is allowed', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, true);
    });
    test('should allow specific version of an extension when configured to that version', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
    });
    test('should allow any version of an extension when a specific version is configured', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
    });
    test('should allow any version of an extension when stable is configured', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
    });
    test('should allow a version of an extension when stable is configured', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
    });
    test('should allow a pre-release version of an extension when stable is configured', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', prerelease: true }) === true, false);
    });
    test('should allow specific version of an extension when configured to multiple versions', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3', '2.0.1', '3.1.2'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
    });
    test('should allow platform specific version of an extension when configured to platform specific version', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: "darwin-x64" /* TargetPlatform.DARWIN_X64 */ }) === true, true);
    });
    test('should allow universal platform specific version of an extension when configured to platform specific version', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: "universal" /* TargetPlatform.UNIVERSAL */ }) === true, true);
    });
    test('should allow specific version of an extension when configured to platform specific version', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
    });
    test('should allow platform specific version of an extension when configured to multiple versions', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.0.0', '1.2.3@darwin-x64', '1.2.3@darwin-arm64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: "darwin-x64" /* TargetPlatform.DARWIN_X64 */ }) === true, true);
    });
    test('should not allow platform specific version of an extension when configured to different platform specific version', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */ }) === true, false);
    });
    test('should specific version of an extension when configured to different versions', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.0.0', '1.2.3@darwin-x64', '1.2.3@darwin-arm64'] });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.0.1' }) === true, false);
    });
    test('should allow extension if publisher is in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
    });
    test('should allow extension if publisher is not in allowed list and has publisher mapping', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'hello': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(['hello']), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: 'Hello' }), true);
    });
    test('should allow extension if publisher is not in allowed list and has different publisher mapping', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'hello': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(['bar']), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: 'Hello' }) === true, false);
    });
    test('should not allow extension if publisher is not in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': false });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
    });
    test('should not allow prerelease extension if publisher is allowed only to stable', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': 'stable' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, false);
    });
    test('should allow extension if publisher is set to random value', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': 'hello' });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, true);
    });
    test('should allow extension if only wildcard is in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
    });
    test('should allow extension if wildcard is in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true, 'hello': false });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
    });
    test('should not allow extension if wildcard is not in allowed list', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': false, 'hello': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
    });
    test('should allow a gallery extension', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'pub': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed(aGalleryExtension('name')) === true, true);
    });
    test('should allow a local extension', () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'pub': true });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        assert.strictEqual(testObject.isAllowed(aLocalExtension('pub.name')) === true, true);
    });
    test('should trigger change event when allowed list change', async () => {
        configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': false });
        const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
        const promise = Event.toPromise(testObject.onDidChangeAllowedExtensionsConfigValue);
        configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([AllowedExtensionsConfigKey]), change: { keys: [], overrides: [] }, source: 2 /* ConfigurationTarget.USER */ });
        await promise;
    });
    function aProductService(extensionPublisherOrgs) {
        return {
            _serviceBrand: undefined,
            extensionPublisherOrgs
        };
    }
    function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}) {
        const galleryExtension = Object.create({ type: 'gallery', name, publisher: 'pub', publisherDisplayName: 'Pub', version: '1.0.0', allTargetPlatforms: ["universal" /* TargetPlatform.UNIVERSAL */], properties: {}, assets: {}, isSigned: true, ...properties });
        galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], ...galleryExtensionProperties };
        galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
        return galleryExtension;
    }
    function aLocalExtension(id, manifest = {}, properties = {}) {
        const [publisher, name] = id.split('.');
        manifest = { name, publisher, ...manifest };
        properties = {
            identifier: { id },
            location: URI.file(`pub.${name}`),
            galleryIdentifier: { id, uuid: undefined },
            type: 1 /* ExtensionType.User */,
            ...properties,
            isValid: properties.isValid ?? true,
        };
        properties.isBuiltin = properties.type === 0 /* ExtensionType.System */;
        return Object.create({ manifest, ...properties });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L3Rlc3QvY29tbW9uL2FsbG93ZWRFeHRlbnNpb25zU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSwwQkFBMEIsRUFBc0MsTUFBTSxxQ0FBcUMsQ0FBQztBQUVySCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdyRCxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO0lBRXRDLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFOUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7SUFFNUQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLDBCQUEwQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzVFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRTtRQUNoRixNQUFN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