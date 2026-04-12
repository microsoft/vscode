/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workbenchInstantiationService, TestInMemoryFileSystemProvider, TestBrowserTextFileServiceWithEncodingOverrides } from '../../../../test/browser/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { join } from '../../../../../base/common/path.js';
import { detectEncodingByBOMFromBuffer, toCanonicalName } from '../../common/encoding.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import files from '../common/fixtures/files.js';
import createSuite from '../common/textFileService.io.test.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
// optimization: we don't need to run this suite in native environment,
// because we have nativeTextFileService.io.test.ts for it,
// so our tests run faster
if (isWeb) {
    suite('Files - BrowserTextFileService i/o', function () {
        const disposables = new DisposableStore();
        let service;
        let fileProvider;
        const testDir = 'test';
        createSuite({
            setup: async () => {
                const instantiationService = workbenchInstantiationService(undefined, disposables);
                const logService = new NullLogService();
                const fileService = disposables.add(new FileService(logService));
                fileProvider = disposables.add(new TestInMemoryFileSystemProvider());
                disposables.add(fileService.registerProvider(Schemas.file, fileProvider));
                const collection = new ServiceCollection();
                collection.set(IFileService, fileService);
                collection.set(IWorkingCopyFileService, disposables.add(new WorkingCopyFileService(fileService, disposables.add(new WorkingCopyService()), instantiationService, disposables.add(new UriIdentityService(fileService)))));
                service = disposables.add(instantiationService.createChild(collection).createInstance(TestBrowserTextFileServiceWithEncodingOverrides));
                disposables.add(service.files);
                await fileProvider.mkdir(URI.file(testDir));
                for (const fileName in files) {
                    await fileProvider.writeFile(URI.file(join(testDir, fileName)), files[fileName], { create: true, overwrite: false, unlock: false, atomic: false });
                }
                return { service, testDir };
            },
            teardown: async () => {
                disposables.clear();
            },
            exists,
            stat,
            readFile,
            detectEncodingByBOM
        });
        async function exists(fsPath) {
            try {
                await fileProvider.readFile(URI.file(fsPath));
                return true;
            }
            catch (e) {
                return false;
            }
        }
        async function readFile(fsPath, encoding) {
            const file = await fileProvider.readFile(URI.file(fsPath));
            if (!encoding) {
                return VSBuffer.wrap(file);
            }
            return new TextDecoder(toCanonicalName(encoding)).decode(file);
        }
        async function stat(fsPath) {
            return fileProvider.stat(URI.file(fsPath));
        }
        async function detectEncodingByBOM(fsPath) {
            try {
                const buffer = await readFile(fsPath);
                return detectEncodingByBOMFromBuffer(buffer.slice(0, 3), 3);
            }
            catch (error) {
                return null; // ignore errors (like file not found)
            }
        }
        ensureNoDisposablesAreLeakedInTestSuite();
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclRleHRGaWxlU2VydmljZS5pby50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3QvYnJvd3Nlci9icm93c2VyVGV4dEZpbGVTZXJ2aWNlLmlvLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDhCQUE4QixFQUFFLCtDQUErQyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkwsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxZQUFZLEVBQVMsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBVyw2QkFBNkIsRUFBMEIsZUFBZSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDM0gsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sS0FBSyxNQUFNLDZCQUE2QixDQUFDO0FBQ2hELE9BQU8sV0FBVyxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVB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