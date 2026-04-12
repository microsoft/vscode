/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mockFiles, MockFilesystem } from './mockFilesystem.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
/**
 * Validates that file at {@link filePath} has expected attributes.
 */
async function validateFile(filePath, expectedFile, fileService) {
    let readFile;
    try {
        readFile = await fileService.resolve(URI.file(filePath));
    }
    catch (error) {
        throw new Error(`Failed to read file '${filePath}': ${error}.`);
    }
    assert.strictEqual(readFile.name, expectedFile.name, `File '${filePath}' must have correct 'name'.`);
    assert.deepStrictEqual(readFile.resource, expectedFile.resource, `File '${filePath}' must have correct 'URI'.`);
    assert.strictEqual(readFile.isFile, expectedFile.isFile, `File '${filePath}' must have correct 'isFile' value.`);
    assert.strictEqual(readFile.isDirectory, expectedFile.isDirectory, `File '${filePath}' must have correct 'isDirectory' value.`);
    assert.strictEqual(readFile.isSymbolicLink, expectedFile.isSymbolicLink, `File '${filePath}' must have correct 'isSymbolicLink' value.`);
    assert.strictEqual(readFile.children, undefined, `File '${filePath}' must not have children.`);
    const fileContents = await fileService.readFile(readFile.resource);
    assert.strictEqual(fileContents.value.toString(), expectedFile.contents, `File '${expectedFile.resource.fsPath}' must have correct contents.`);
}
/**
 * Validates that folder at {@link folderPath} has expected attributes.
 */
async function validateFolder(folderPath, expectedFolder, fileService) {
    let readFolder;
    try {
        readFolder = await fileService.resolve(URI.file(folderPath));
    }
    catch (error) {
        throw new Error(`Failed to read folder '${folderPath}': ${error}.`);
    }
    assert.strictEqual(readFolder.name, expectedFolder.name, `Folder '${folderPath}' must have correct 'name'.`);
    assert.deepStrictEqual(readFolder.resource, expectedFolder.resource, `Folder '${folderPath}' must have correct 'URI'.`);
    assert.strictEqual(readFolder.isFile, expectedFolder.isFile, `Folder '${folderPath}' must have correct 'isFile' value.`);
    assert.strictEqual(readFolder.isDirectory, expectedFolder.isDirectory, `Folder '${folderPath}' must have correct 'isDirectory' value.`);
    assert.strictEqual(readFolder.isSymbolicLink, expectedFolder.isSymbolicLink, `Folder '${folderPath}' must have correct 'isSymbolicLink' value.`);
    assertDefined(readFolder.children, `Folder '${folderPath}' must have children.`);
    assert.strictEqual(readFolder.children.length, expectedFolder.children.length, `Folder '${folderPath}' must have correct number of children.`);
    for (const expectedChild of expectedFolder.children) {
        const childPath = URI.joinPath(expectedFolder.resource, expectedChild.name).fsPath;
        if ('children' in expectedChild) {
            await validateFolder(childPath, expectedChild, fileService);
            continue;
        }
        await validateFile(childPath, expectedChild, fileService);
    }
}
suite('MockFilesystem', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let fileService;
    setup(async () => {
        instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(ILogService, new NullLogService());
        fileService = disposables.add(instantiationService.createInstance(FileService));
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        instantiationService.stub(IFileService, fileService);
    });
    test('mocks file structure using new simplified format', async () => {
        const mockFilesystem = instantiationService.createInstance(MockFilesystem, [
            {
                path: '/root/folder/file.txt',
                contents: ['contents']
            },
            {
                path: '/root/folder/Subfolder/test.ts',
                contents: ['other contents']
            },
            {
                path: '/root/folder/Subfolder/file.test.ts',
                contents: ['hello test']
            },
            {
                path: '/root/folder/Subfolder/.file-2.TEST.ts',
                contents: ['test hello']
            }
        ]);
        await mockFilesystem.mock();
        /**
         * Validate files and folders next.
         */
        await validateFolder('/root/folder', {
            resource: URI.file('/root/folder'),
            name: 'folder',
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
            children: [
                {
                    resource: URI.file('/root/folder/file.txt'),
                    name: 'file.txt',
                    isFile: true,
                    isDirectory: false,
                    isSymbolicLink: false,
                    contents: 'contents',
                },
                {
                    resource: URI.file('/root/folder/Subfolder'),
                    name: 'Subfolder',
                    isFile: false,
                    isDirectory: true,
                    isSymbolicLink: false,
                    children: [
                        {
                            resource: URI.file('/root/folder/Subfolder/test.ts'),
                            name: 'test.ts',
                            isFile: true,
                            isDirectory: false,
                            isSymbolicLink: false,
                            contents: 'other contents',
                        },
                        {
                            resource: URI.file('/root/folder/Subfolder/file.test.ts'),
                            name: 'file.test.ts',
                            isFile: true,
                            isDirectory: false,
                            isSymbolicLink: false,
                            contents: 'hello test',
                        },
                        {
                            resource: URI.file('/root/folder/Subfolder/.file-2.TEST.ts'),
                            name: '.file-2.TEST.ts',
                            isFile: true,
                            isDirectory: false,
                            isSymbolicLink: false,
                            contents: 'test hello',
                        },
                    ],
                }
            ],
        }, fileService);
    });
    test('can be created using static factory method', async () => {
        await mockFiles(fileService, [
            {
                path: '/simple/test.txt',
                contents: ['line 1', 'line 2', 'line 3']
            }
        ]);
        await validateFile('/simple/test.txt', {
            resource: URI.file('/simple/test.txt'),
            name: 'test.txt',
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            contents: 'line 1\nline 2\nline 3',
        }, fileService);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0ZpbGVzeXN0ZW0udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3Rlc3RVdGlscy9tb2NrRmlsZXN5c3RlbS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxZQUFZLEVBQWEsTUFBTSxxREFBcUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQThCL0g7O0dBRUc7QUFDSCxLQUFLLFVBQVUsWUFBWSxDQUMxQixRQUFnQixFQUNoQixZQUEyQixFQUMzQixXQUF5QjtJQUV6QixJQUFJLFFBQStCLENBQUM7SUFDcEMsSUFBSSxDQUFDO1FBQ0osUUFBUSxHQUFHLE1BQU0sV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxD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