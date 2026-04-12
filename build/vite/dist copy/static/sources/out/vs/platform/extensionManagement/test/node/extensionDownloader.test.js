/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { platform } from '../../../../base/common/platform.js';
import { arch } from '../../../../base/common/process.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ExtensionSignatureVerificationCode, getTargetPlatform, IExtensionGalleryService } from '../../common/extensionManagement.js';
import { getGalleryExtensionId } from '../../common/extensionManagementUtil.js';
import { ExtensionsDownloader } from '../../node/extensionDownloader.js';
import { IExtensionSignatureVerificationService } from '../../node/extensionSignatureVerificationService.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
class TestExtensionSignatureVerificationService extends mock() {
    constructor(verificationResult) {
        super();
        this.verificationResult = verificationResult;
    }
    async verify() {
        if (this.verificationResult === true) {
            return {
                code: ExtensionSignatureVerificationCode.Success
            };
        }
        if (this.verificationResult === false) {
            return undefined;
        }
        return {
            code: this.verificationResult,
        };
    }
}
class TestExtensionDownloader extends ExtensionsDownloader {
    async validate() { }
}
suite('ExtensionDownloader Tests', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    setup(() => {
        instantiationService = disposables.add(new TestInstantiationService());
        const logService = new NullLogService();
        const fileService = disposables.add(new FileService(logService));
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
        instantiationService.stub(ILogService, logService);
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(ILogService, logService);
        instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
        instantiationService.stub(INativeEnvironmentService, { extensionsDownloadLocation: joinPath(ROOT, 'CachedExtensionVSIXs') });
        instantiationService.stub(IExtensionGalleryService, {
            async download(extension, location, operation) {
                await fileService.writeFile(location, VSBuffer.fromString('extension vsix'));
            },
            async downloadSignatureArchive(extension, location) {
                await fileService.writeFile(location, VSBuffer.fromString('extension signature'));
            },
        });
    });
    test('download completes successfully if verification is disabled by options', async () => {
        const testObject = aTestObject({ verificationResult: 'error' });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), 2 /* InstallOperation.Install */, false);
        assert.strictEqual(actual.verificationStatus, undefined);
    });
    test('download completes successfully if verification is disabled because the module is not loaded', async () => {
        const testObject = aTestObject({ verificationResult: false });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, undefined);
    });
    test('download completes successfully if verification fails to execute', async () => {
        const errorCode = 'ENOENT';
        const testObject = aTestObject({ verificationResult: errorCode });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, errorCode);
    });
    test('download completes successfully if verification fails ', async () => {
        const errorCode = 'IntegrityCheckFailed';
        const testObject = aTestObject({ verificationResult: errorCode });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, errorCode);
    });
    test('download completes successfully if verification succeeds', async () => {
        const testObject = aTestObject({ verificationResult: true });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.Success);
    });
    test('download completes successfully for unsigned extension', async () => {
        const testObject = aTestObject({ verificationResult: true });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.NotSigned);
    });
    test('download completes successfully for an unsigned extension even when signature verification throws error', async () => {
        const testObject = aTestObject({ verificationResult: 'error' });
        const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), 2 /* InstallOperation.Install */, true);
        assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.NotSigned);
    });
    function aTestObject(options) {
        instantiationService.stub(IExtensionSignatureVerificationService, new TestExtensionSignatureVerificationService(options.verificationResult));
        return disposables.add(instantiationService.createInstance(TestExtensionDownloader));
    }
    function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}, assets = {}) {
        const targetPlatform = getTargetPlatform(platform, arch);
        const galleryExtension = Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
        galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
        galleryExtension.assets = { ...galleryExtension.assets, ...assets };
        galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
        return galleryExtension;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRG93bmxvYWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC90ZXN0L25vZGUvZXh0ZW5zaW9uRG93bmxvYWRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLGlCQUFpQixFQUFFLHdCQUF3QixFQUFnRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3BNLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pFLE9BQU8sRUFBeUMsc0NBQXNDLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNwSixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHdkYsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztBQUVoRSxNQUFNLHlDQUEwQyxTQUFRLElBQUksRUFBMEM7SUFFckcsWUFDa0Isa0JBQW9DO1FBQ3JELEtBQUssRUFBRSxDQUFDO1FBRFMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFrQjtJQUV0RCxDQUFDO0lBRVEsS0FBSyxDQUFDLE1BQU07UUFDcEIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDdEMsT0FBTztnQkFDTixJQUFJLEVBQUUsa0NBQWtDLENBQUMsT0FBTzthQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGtCQUFrQixLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPO1lBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxrQkFBd0Q7U0FDbkUsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELE1BQU0sdUJBQXdCLFNBQVEsb0JBQW9CO0lBQ3RDLEtBQUssQ0FBQyxRQUFRLEtBQW9CLENBQUM7Q0FDdEQ7QUFFRCxLQUFLLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO0lBRXZDLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDOUQsSUFBSSxvQkFBOEMsQ0FBQztJQUVuRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysb0JBQW9CLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUV2RSxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7UUFDN0UsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFL0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNuRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3JELG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbkQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEVBQUUsMEJBQTBCLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUU7WUFDbkQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVM7Z0JBQzVDLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDOUUsQ0FBQztZQUNELEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLEVBQUUsUUFBUTtnQkFDakQsTUFBTSxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztZQUNuRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0VBQXdFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekYsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUVoRSxNQUFNLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLG9DQUE0QixLQUFLLENBQUMsQ0FBQztRQUV0SCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4RkFBOEYsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBRTlELE1BQU0sTUFBTSxHQUFHLE1BQU0sVUFBVSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsb0NBQTRCLElBQUksQ0FBQyxDQUFDO1FBRXJILE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25GLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQztRQUMzQixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sTUFBTSxHQUFHLE1BQU0sVUFBVSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsb0NBQTRCLElBQUksQ0FBQyxDQUFDO1FBRXJILE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pFLE1BQU0sU0FBUyxHQUFHLHNCQUFzQixDQUFDO1FBQ3pDLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFbEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxVQUFVLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxvQ0FBNEIsSUFBSSxDQUFDLENBQUM7UUFFckgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0UsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUU3RCxNQUFNLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLG9DQUE0QixJQUFJLENBQUMsQ0FBQztRQUVySCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxrQ0FBa0MsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMzRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3REFBd0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RSxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRTdELE1BQU0sTUFBTSxHQUFHLE1BQU0sVUFBVSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsb0NBQTRCLElBQUksQ0FBQyxDQUFDO1FBRXRILE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLGtDQUFrQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzdGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlHQUF5RyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFILE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFaEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxVQUFVLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxvQ0FBNEIsSUFBSSxDQUFDLENBQUM7UUFFdEgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsa0NBQWtDLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDN0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxTQUFTLFdBQVcsQ0FBQyxPQUFpRDtRQUNyRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsc0NBQXNDLEVBQUUsSUFBSSx5Q0FBeUMsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzdJLE9BQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFRCxTQUFTLGlCQUFpQixDQUFDLElBQVksRUFBRSxhQUF5QyxFQUFFLEVBQUUsNkJBQXlELEVBQUUsRUFBRSxTQUEyQyxFQUFFO1FBQy9MLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RCxNQUFNLGdCQUFnQixHQUFzQixNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxDQUFDLGNBQWMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxHQUFHLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDekwsZ0JBQWdCLENBQUMsVUFBVSxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUUsR0FBRywwQkFBMEIsRUFBRSxDQUFDO1FBQ2xJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDcEUsZ0JBQWdCLENBQUMsVUFBVSxHQUFHLEVBQUUsRUFBRSxFQUFFLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEVBQUUsQ0FBQztRQUNySSxPQUEwQixnQkFBZ0IsQ0FBQztJQUM1QyxDQUFDO0FBQ0YsQ0FBQyxDQUFDLENBQUMifQ==