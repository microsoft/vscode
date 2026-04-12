/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, createFileStat } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../../files/browser/files.js';
import { ExplorerItem } from '../../../files/common/explorerModel.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ImageCarouselEditorInput } from '../../browser/imageCarouselEditorInput.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
// Importing the contribution registers the actions
import '../../browser/imageCarousel.contribution.js';
function createExplorerItem(path, isFolder, fileService, configService, parent) {
    return new ExplorerItem(URI.file(path), fileService, configService, NullFilesConfigurationService, parent, isFolder);
}
suite('OpenImagesInCarouselFromExplorerAction', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configService;
    let openedInputs;
    let infoMessages;
    let errorMessages;
    setup(() => {
        openedInputs = [];
        infoMessages = [];
        errorMessages = [];
        configService = new TestConfigurationService();
        instantiationService = workbenchInstantiationService(undefined, disposables);
    });
    function stubFileService(resolveMap, fileContents) {
        instantiationService.stub(IFileService, 'resolve', async (resource) => {
            const stat = resolveMap.get(resource.path);
            if (!stat) {
                throw new Error(`File not found: ${resource.path}`);
            }
            return stat;
        });
        instantiationService.stub(IFileService, 'readFile', async (resource) => {
            const content = fileContents.get(resource.path);
            if (!content) {
                throw new Error(`Cannot read: ${resource.path}`);
            }
            return { resource, value: content };
        });
    }
    function stubExplorerService(items) {
        instantiationService.stub(IExplorerService, {
            getContext: () => items,
        });
    }
    function stubEditorService() {
        instantiationService.stub(IEditorService, 'openEditor', async (input, _options, group) => {
            if (input instanceof ImageCarouselEditorInput) {
                openedInputs.push({ input, group: group });
                disposables.add(input);
            }
            return undefined;
        });
    }
    function stubNotificationService() {
        instantiationService.stub(INotificationService, 'info', (message) => {
            infoMessages.push(message);
        });
        instantiationService.stub(INotificationService, 'error', (message) => {
            errorMessages.push(message);
        });
    }
    test('single image file opens carousel with sibling images', async () => {
        const fileService = instantiationService.get(IFileService);
        const parent = createExplorerItem('/workspace/images', true, fileService, configService);
        const imageItem = createExplorerItem('/workspace/images/photo.png', false, fileService, configService, parent);
        const pngData = VSBuffer.fromString('fake-png');
        const jpgData = VSBuffer.fromString('fake-jpg');
        const txtData = VSBuffer.fromString('text file');
        const resolveMap = new Map();
        resolveMap.set('/workspace/images', createFileStat(URI.file('/workspace/images'), false, false, true, false, [
            { resource: URI.file('/workspace/images/photo.png'), isFile: true },
            { resource: URI.file('/workspace/images/other.jpg'), isFile: true },
            { resource: URI.file('/workspace/images/readme.txt'), isFile: true },
            { resource: URI.file('/workspace/images/subfolder'), isDirectory: true, isFile: false },
        ]));
        const fileContents = new Map();
        fileContents.set('/workspace/images/photo.png', pngData);
        fileContents.set('/workspace/images/other.jpg', jpgData);
        fileContents.set('/workspace/images/readme.txt', txtData);
        stubFileService(resolveMap, fileContents);
        stubExplorerService([imageItem]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command, 'Command should be registered');
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1, 'Should open one editor');
        const input = openedInputs[0].input;
        assert.strictEqual(input.collection.sections.length, 1);
        const images = input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include 2 image siblings (png + jpg), not txt');
        // Images are sorted by basename: other.jpg before photo.png
        assert.strictEqual(images[0].name, 'other.jpg');
        assert.strictEqual(images[1].name, 'photo.png');
        // Start index should be the selected image (photo.png = index 1 after sorting)
        assert.strictEqual(input.startIndex, 1);
    });
    test('folder opens carousel with all contained images', async () => {
        const fileService = instantiationService.get(IFileService);
        const folderItem = createExplorerItem('/workspace/images', true, fileService, configService);
        const gifData = VSBuffer.fromString('fake-gif');
        const webpData = VSBuffer.fromString('fake-webp');
        const resolveMap = new Map();
        resolveMap.set('/workspace/images', createFileStat(URI.file('/workspace/images'), false, false, true, false, [
            { resource: URI.file('/workspace/images/anim.gif'), isFile: true },
            { resource: URI.file('/workspace/images/photo.webp'), isFile: true },
            { resource: URI.file('/workspace/images/script.js'), isFile: true },
        ]));
        const fileContents = new Map();
        fileContents.set('/workspace/images/anim.gif', gifData);
        fileContents.set('/workspace/images/photo.webp', webpData);
        stubFileService(resolveMap, fileContents);
        stubExplorerService([folderItem]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1);
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include 2 images (gif + webp), not js');
        assert.strictEqual(images[0].name, 'anim.gif');
        assert.strictEqual(images[1].name, 'photo.webp');
    });
    test('multiple selected images open in carousel', async () => {
        const fileService = instantiationService.get(IFileService);
        const img1 = createExplorerItem('/workspace/a.png', false, fileService, configService);
        const img2 = createExplorerItem('/workspace/b.svg', false, fileService, configService);
        const txtFile = createExplorerItem('/workspace/notes.txt', false, fileService, configService);
        const pngData = VSBuffer.fromString('fake-png');
        const svgData = VSBuffer.fromString('<svg></svg>');
        const resolveMap = new Map();
        const fileContents = new Map();
        fileContents.set('/workspace/a.png', pngData);
        fileContents.set('/workspace/b.svg', svgData);
        stubFileService(resolveMap, fileContents);
        stubExplorerService([img1, img2, txtFile]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1);
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include only image files');
        assert.strictEqual(images[0].name, 'a.png');
        assert.strictEqual(images[1].name, 'b.svg');
    });
    test('empty selection with resource argument opens carousel from that folder', async () => {
        const pngData = VSBuffer.fromString('fake-png');
        const jpgData = VSBuffer.fromString('fake-jpg');
        const folderUri = URI.file('/workspace/photos');
        const resolveMap = new Map();
        resolveMap.set('/workspace/photos', createFileStat(folderUri, false, false, true, false, [
            { resource: URI.file('/workspace/photos/sunset.png'), isFile: true },
            { resource: URI.file('/workspace/photos/mountain.jpg'), isFile: true },
            { resource: URI.file('/workspace/photos/notes.txt'), isFile: true },
        ]));
        const fileContents = new Map();
        fileContents.set('/workspace/photos/sunset.png', pngData);
        fileContents.set('/workspace/photos/mountain.jpg', jpgData);
        stubFileService(resolveMap, fileContents);
        stubExplorerService([]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        // Pass the folder URI as the resource argument (as explorer does for empty-space click)
        await instantiationService.invokeFunction(command.handler, folderUri);
        assert.strictEqual(openedInputs.length, 1, 'Should open carousel using resource argument fallback');
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include 2 images from the folder');
    });
    test('empty selection without resource falls back to first workspace folder', async () => {
        const pngData = VSBuffer.fromString('fake-png');
        // Derive the workspace root from IWorkspaceContextService so the test
        // works on all platforms (the path differs on Windows vs Unix).
        const contextService = instantiationService.get(IWorkspaceContextService);
        const wsRoot = contextService.getWorkspace().folders[0].uri;
        const logoUri = URI.joinPath(wsRoot, 'logo.png');
        const readmeUri = URI.joinPath(wsRoot, 'readme.md');
        const resolveMap = new Map();
        resolveMap.set(wsRoot.path, createFileStat(wsRoot, false, false, true, false, [
            { resource: logoUri, isFile: true },
            { resource: readmeUri, isFile: true },
        ]));
        const fileContents = new Map();
        fileContents.set(logoUri.path, pngData);
        stubFileService(resolveMap, fileContents);
        stubExplorerService([]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        // No resource argument — should fall back to workspace root
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1, 'Should open carousel using workspace root fallback');
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 1, 'Should include image from workspace root');
        assert.strictEqual(images[0].name, 'logo.png');
    });
    test('empty selection with no images shows notification', async () => {
        const folderUri = URI.file('/workspace/docs');
        const resolveMap = new Map();
        resolveMap.set('/workspace/docs', createFileStat(folderUri, false, false, true, false, [
            { resource: URI.file('/workspace/docs/readme.md'), isFile: true },
        ]));
        stubFileService(resolveMap, new Map());
        stubExplorerService([]);
        stubEditorService();
        stubNotificationService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler, folderUri);
        assert.strictEqual(openedInputs.length, 0, 'Should not open carousel when folder has no images');
        assert.strictEqual(infoMessages.length, 1, 'Should show notification');
    });
    test('folder with no images shows notification', async () => {
        const fileService = instantiationService.get(IFileService);
        const folderItem = createExplorerItem('/workspace/docs', true, fileService, configService);
        const resolveMap = new Map();
        resolveMap.set('/workspace/docs', createFileStat(URI.file('/workspace/docs'), false, false, true, false, [
            { resource: URI.file('/workspace/docs/readme.md'), isFile: true },
            { resource: URI.file('/workspace/docs/notes.txt'), isFile: true },
        ]));
        stubFileService(resolveMap, new Map());
        stubExplorerService([folderItem]);
        stubEditorService();
        stubNotificationService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 0, 'Should not open carousel when folder has no images');
        assert.strictEqual(infoMessages.length, 1, 'Should show notification about no images');
    });
    test('folder read error shows error notification', async () => {
        const fileService = instantiationService.get(IFileService);
        const folderItem = createExplorerItem('/workspace/restricted', true, fileService, configService);
        // resolve throws to simulate a permission error
        const resolveMap = new Map();
        stubFileService(resolveMap, new Map());
        stubExplorerService([folderItem]);
        stubEditorService();
        stubNotificationService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 0, 'Should not open carousel on folder read error');
        assert.strictEqual(errorMessages.length, 1, 'Should show error notification');
        assert.strictEqual(infoMessages.length, 0, 'Should not show info notification');
    });
    test('images with URIs are passed lazily without reading file contents', async () => {
        const folderUri = URI.file('/workspace/broken');
        const resolveMap = new Map();
        resolveMap.set('/workspace/broken', createFileStat(folderUri, false, false, true, false, [
            { resource: URI.file('/workspace/broken/corrupt.png'), isFile: true },
            { resource: URI.file('/workspace/broken/missing.jpg'), isFile: true },
        ]));
        // No file contents — with lazy loading, no readFile should be called at action time
        let readFileCallCount = 0;
        stubFileService(resolveMap, new Map());
        instantiationService.stub(IFileService, 'readFile', async () => {
            readFileCallCount++;
            throw new Error('readFile should not be called');
        });
        stubExplorerService([]);
        stubEditorService();
        stubNotificationService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler, folderUri);
        assert.strictEqual(readFileCallCount, 0, 'readFile should not be called during action');
        assert.strictEqual(openedInputs.length, 1, 'Should open carousel with lazy image entries');
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include 2 lazy image entries');
        assert.strictEqual(images[0].data, undefined, 'Image data should not be loaded eagerly');
        assert.ok(images[0].uri, 'Image should have a URI for lazy loading');
    });
    test('folder includes video files alongside images', async () => {
        const fileService = instantiationService.get(IFileService);
        const folderItem = createExplorerItem('/workspace/media', true, fileService, configService);
        const resolveMap = new Map();
        resolveMap.set('/workspace/media', createFileStat(URI.file('/workspace/media'), false, false, true, false, [
            { resource: URI.file('/workspace/media/clip.mp4'), isFile: true },
            { resource: URI.file('/workspace/media/photo.png'), isFile: true },
            { resource: URI.file('/workspace/media/demo.webm'), isFile: true },
            { resource: URI.file('/workspace/media/intro.mov'), isFile: true },
            { resource: URI.file('/workspace/media/readme.txt'), isFile: true },
        ]));
        stubFileService(resolveMap, new Map());
        stubExplorerService([folderItem]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1);
        const images = openedInputs[0].input.collection.sections[0].images;
        assert.strictEqual(images.length, 4, 'Should include mp4 + webm + mov + png, not txt');
        assert.strictEqual(images[0].name, 'clip.mp4');
        assert.strictEqual(images[1].name, 'demo.webm');
        assert.strictEqual(images[2].name, 'intro.mov');
        assert.strictEqual(images[3].name, 'photo.png');
    });
    test('single video file opens carousel with sibling media', async () => {
        const fileService = instantiationService.get(IFileService);
        const parent = createExplorerItem('/workspace/media', true, fileService, configService);
        const videoItem = createExplorerItem('/workspace/media/clip.mp4', false, fileService, configService, parent);
        const resolveMap = new Map();
        resolveMap.set('/workspace/media', createFileStat(URI.file('/workspace/media'), false, false, true, false, [
            { resource: URI.file('/workspace/media/clip.mp4'), isFile: true },
            { resource: URI.file('/workspace/media/photo.png'), isFile: true },
            { resource: URI.file('/workspace/media/notes.txt'), isFile: true },
        ]));
        stubFileService(resolveMap, new Map());
        stubExplorerService([videoItem]);
        stubEditorService();
        const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
        const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
        assert.ok(command);
        await instantiationService.invokeFunction(command.handler);
        assert.strictEqual(openedInputs.length, 1);
        const input = openedInputs[0].input;
        const images = input.collection.sections[0].images;
        assert.strictEqual(images.length, 2, 'Should include mp4 + png siblings');
        assert.strictEqual(images[0].name, 'clip.mp4');
        assert.strictEqual(images[1].name, 'photo.png');
        assert.strictEqual(input.startIndex, 0, 'Start index should point to the selected video');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VDYXJvdXNlbC5jb250cmlidXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ltYWdlQ2Fyb3VzZWwvdGVzdC9icm93c2VyL2ltYWdlQ2Fyb3VzZWwuY29udHJpYnV0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsWUFBWSxFQUEyQixNQUFNLCtDQUErQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQWUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxtREFBbUQ7QUFDbkQsT0FBTyw2Q0FBNkMsQ0FBQztB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