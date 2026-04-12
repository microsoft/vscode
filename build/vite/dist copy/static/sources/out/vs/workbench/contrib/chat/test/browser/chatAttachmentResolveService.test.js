/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ChatAttachmentResolveService } from '../../browser/attachments/chatAttachmentResolveService.js';
import { createFileStat } from '../../../../test/common/workbenchTestServices.js';
suite('ChatAttachmentResolveService', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let service;
    /**
     * Map from directory URI string to children, simulating a file tree.
     * Populated per-test to control the mock directory structure.
     */
    let directoryTree;
    /**
     * Set of file URI strings that should be treated as valid images
     * by the mocked resolveImageEditorAttachContext.
     */
    let imageFileUris;
    setup(() => {
        instantiationService = testDisposables.add(new TestInstantiationService());
        directoryTree = new Map();
        imageFileUris = new Set();
        // Stub IFileService with resolve() that uses the directoryTree map
        instantiationService.stub(IFileService, {
            resolve: async (resource) => {
                const children = directoryTree.get(resource.toString());
                if (children !== undefined) {
                    return createFileStat(resource, false, false, true, false, children);
                }
                // Treat as a file
                return createFileStat(resource, false, true, false);
            }
        });
        instantiationService.stub(IEditorService, {});
        instantiationService.stub(ITextModelService, {});
        instantiationService.stub(IExtensionService, {});
        instantiationService.stub(IDialogService, {});
        service = instantiationService.createInstance(ChatAttachmentResolveService);
        // Override resolveImageEditorAttachContext to avoid DOM dependencies (canvas, Image, etc.)
        // and return a predictable image entry for files in the imageFileUris set.
        service.resolveImageEditorAttachContext = async (resource) => {
            if (imageFileUris.has(resource.toString())) {
                return {
                    id: resource.toString(),
                    name: resource.path.split('/').pop(),
                    value: new Uint8Array([1, 2, 3]),
                    kind: 'image',
                };
            }
            return undefined;
        };
    });
    test('returns empty array for empty directory', async () => {
        const dirUri = URI.file('/test/empty-dir');
        directoryTree.set(dirUri.toString(), []);
        const result = await service.resolveDirectoryImages(dirUri);
        assert.deepStrictEqual(result, []);
    });
    test('returns image entries for image files in directory', async () => {
        const dirUri = URI.file('/test/images-dir');
        const pngUri = URI.file('/test/images-dir/photo.png');
        const jpgUri = URI.file('/test/images-dir/photo.jpg');
        const txtUri = URI.file('/test/images-dir/readme.txt');
        directoryTree.set(dirUri.toString(), [
            { resource: pngUri, isFile: true, isDirectory: false },
            { resource: jpgUri, isFile: true, isDirectory: false },
            { resource: txtUri, isFile: true, isDirectory: false },
        ]);
        imageFileUris.add(pngUri.toString());
        imageFileUris.add(jpgUri.toString());
        const result = await service.resolveDirectoryImages(dirUri);
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(e => e.kind === 'image'));
        const names = result.map(e => e.name).sort();
        assert.deepStrictEqual(names, ['photo.jpg', 'photo.png']);
    });
    test('ignores non-image files', async () => {
        const dirUri = URI.file('/test/text-dir');
        const txtUri = URI.file('/test/text-dir/file.txt');
        const tsUri = URI.file('/test/text-dir/index.ts');
        directoryTree.set(dirUri.toString(), [
            { resource: txtUri, isFile: true, isDirectory: false },
            { resource: tsUri, isFile: true, isDirectory: false },
        ]);
        const result = await service.resolveDirectoryImages(dirUri);
        assert.deepStrictEqual(result, []);
    });
    test('recursively discovers images in subdirectories', async () => {
        const rootUri = URI.file('/test/root');
        const subDirUri = URI.file('/test/root/subdir');
        const deepDirUri = URI.file('/test/root/subdir/deep');
        const rootPng = URI.file('/test/root/logo.png');
        const subPng = URI.file('/test/root/subdir/banner.webp');
        const deepJpg = URI.file('/test/root/subdir/deep/photo.jpeg');
        const deepTxt = URI.file('/test/root/subdir/deep/notes.txt');
        directoryTree.set(rootUri.toString(), [
            { resource: rootPng, isFile: true, isDirectory: false },
            { resource: subDirUri, isFile: false, isDirectory: true },
        ]);
        directoryTree.set(subDirUri.toString(), [
            { resource: subPng, isFile: true, isDirectory: false },
            { resource: deepDirUri, isFile: false, isDirectory: true },
        ]);
        directoryTree.set(deepDirUri.toString(), [
            { resource: deepJpg, isFile: true, isDirectory: false },
            { resource: deepTxt, isFile: true, isDirectory: false },
        ]);
        imageFileUris.add(rootPng.toString());
        imageFileUris.add(subPng.toString());
        imageFileUris.add(deepJpg.toString());
        const result = await service.resolveDirectoryImages(rootUri);
        assert.strictEqual(result.length, 3);
        assert.ok(result.every(e => e.kind === 'image'));
        const names = result.map(e => e.name).sort();
        assert.deepStrictEqual(names, ['banner.webp', 'logo.png', 'photo.jpeg']);
    });
    test('handles unreadable directory gracefully', async () => {
        const dirUri = URI.file('/test/unreadable');
        // Override resolve to throw for this URI
        instantiationService.stub(IFileService, {
            resolve: async (resource) => {
                if (resource.toString() === dirUri.toString()) {
                    throw new Error('Permission denied');
                }
                return createFileStat(resource, false, true, false);
            }
        });
        // Re-create service with the new stub
        service = instantiationService.createInstance(ChatAttachmentResolveService);
        service.resolveImageEditorAttachContext = async (resource) => {
            if (imageFileUris.has(resource.toString())) {
                return {
                    id: resource.toString(),
                    name: resource.path.split('/').pop(),
                    value: new Uint8Array([1, 2, 3]),
                    kind: 'image',
                };
            }
            return undefined;
        };
        const result = await service.resolveDirectoryImages(dirUri);
        assert.deepStrictEqual(result, []);
    });
    test('handles mixed directory with images and non-images', async () => {
        const dirUri = URI.file('/test/mixed');
        const gifUri = URI.file('/test/mixed/animation.gif');
        const jsUri = URI.file('/test/mixed/script.js');
        const bmpUri = URI.file('/test/mixed/icon.bmp');
        directoryTree.set(dirUri.toString(), [
            { resource: gifUri, isFile: true, isDirectory: false },
            { resource: jsUri, isFile: true, isDirectory: false },
            { resource: bmpUri, isFile: true, isDirectory: false },
        ]);
        imageFileUris.add(gifUri.toString());
        imageFileUris.add(bmpUri.toString());
        // bmp is NOT in CHAT_ATTACHABLE_IMAGE_MIME_TYPES (only png, jpg, jpeg, gif, webp)
        // so it should be skipped by the regex even though it would resolve successfully
        const result = await service.resolveDirectoryImages(dirUri);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'animation.gif');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBeUIsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUdsRixLQUFLLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO0lBQzFDLE1BQU0sZUFBZSxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFbEUsSUFBSSxvQkFBOEMsQ0FBQztJQUNuRCxJQUFJLE9BQXFDLENBQUM7SUFFMUM7OztPQUdHO0lBQ0gsSUFBSSxhQUFzRixDQUFDO0lBRTNGOzs7T0FHRztJQUNILElBQUksYUFBMEIsQ0FB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