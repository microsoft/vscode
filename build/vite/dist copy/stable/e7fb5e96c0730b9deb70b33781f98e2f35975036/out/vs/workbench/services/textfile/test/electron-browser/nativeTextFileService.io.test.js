/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestInMemoryFileSystemProvider } from '../../../../test/browser/workbenchTestServices.js';
import { TestNativeTextFileServiceWithEncodingOverrides, workbenchInstantiationService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('Files - NativeTextFileService i/o', function () {
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
            service = disposables.add(instantiationService.createChild(collection).createInstance(TestNativeTextFileServiceWithEncodingOverrides));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlVGV4dEZpbGVTZXJ2aWNlLmlvLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvdGVzdC9lbGVjdHJvbi1icm93c2VyL25hdGl2ZVRleHRGaWxlU2VydmljZS5pby50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsWUFBWSxFQUFTLE1BQU0sK0NBQStDLENBQUM7QUFDcEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQVcsNkJBQTZCLEVBQTBCLGVBQWUsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzNILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEtBQUssTUFBTSw2QkFBNkIsQ0FBQztBQUNoRCxPQUFPLFdBQVcsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrRUFBa0Us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