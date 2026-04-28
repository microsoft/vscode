/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, createFileStat } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../../files/browser/files.js';
import { ExplorerItem } from '../../../files/common/explorerModel.js';
import { IFileService, IFileStat, IFileContent } from '../../../../../platform/files/common/files.js';
import { IEditorService, MODAL_GROUP } from '../../../../services/editor/common/editorService.js';
import { ImageCarouselEditorInput } from '../../browser/imageCarouselEditorInput.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

// Importing the contribution registers the actions
import '../../browser/imageCarousel.contribution.js';

function createExplorerItem(
	path: string,
	isFolder: boolean,
	fileService: IFileService,
	configService: TestConfigurationService,
	parent?: ExplorerItem,
): ExplorerItem {
	return new ExplorerItem(
		URI.file(path),
		fileService,
		configService,
		NullFilesConfigurationService,
		parent,
		isFolder,
	);
}

suite('OpenImagesInCarouselFromExplorerAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configService: TestConfigurationService;
	let openedInputs: { input: ImageCarouselEditorInput; group: typeof MODAL_GROUP }[];
	let infoMessages: string[];
	let errorMessages: string[];

	setup(() => {
		openedInputs = [];
		infoMessages = [];
		errorMessages = [];
		configService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService(undefined, disposables);
	});

	function stubFileService(resolveMap: Map<string, IFileStat>, fileContents: Map<string, VSBuffer>): void {
		instantiationService.stub(IFileService, 'resolve', async (resource: URI) => {
			const stat = resolveMap.get(resource.path);
			if (!stat) {
				throw new Error(`File not found: ${resource.path}`);
			}
			return stat;
		});

		instantiationService.stub(IFileService, 'readFile', async (resource: URI) => {
			const content = fileContents.get(resource.path);
			if (!content) {
				throw new Error(`Cannot read: ${resource.path}`);
			}
			return { resource, value: content } as IFileContent;
		});
	}

	function stubExplorerService(items: ExplorerItem[]): void {
		instantiationService.stub(IExplorerService, {
			getContext: () => items,
		});
	}

	function stubEditorService(): void {
		instantiationService.stub(IEditorService, 'openEditor', async (input: unknown, _options: unknown, group: unknown) => {
			if (input instanceof ImageCarouselEditorInput) {
				openedInputs.push({ input, group: group as typeof MODAL_GROUP });
				disposables.add(input);
			}
			return undefined;
		});
	}

	function stubNotificationService(): void {
		instantiationService.stub(INotificationService, 'info', (message: string) => {
			infoMessages.push(message);
		});
		instantiationService.stub(INotificationService, 'error', (message: string) => {
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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/images', createFileStat(
			URI.file('/workspace/images'), false, false, true, false, [
			{ resource: URI.file('/workspace/images/photo.png'), isFile: true },
			{ resource: URI.file('/workspace/images/other.jpg'), isFile: true },
			{ resource: URI.file('/workspace/images/readme.txt'), isFile: true },
			{ resource: URI.file('/workspace/images/subfolder'), isDirectory: true, isFile: false },
		]
		));

		const fileContents = new Map<string, VSBuffer>();
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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/images', createFileStat(
			URI.file('/workspace/images'), false, false, true, false, [
			{ resource: URI.file('/workspace/images/anim.gif'), isFile: true },
			{ resource: URI.file('/workspace/images/photo.webp'), isFile: true },
			{ resource: URI.file('/workspace/images/script.js'), isFile: true },
		]
		));

		const fileContents = new Map<string, VSBuffer>();
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

		const resolveMap = new Map<string, IFileStat>();

		const fileContents = new Map<string, VSBuffer>();
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
		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/photos', createFileStat(
			folderUri, false, false, true, false, [
			{ resource: URI.file('/workspace/photos/sunset.png'), isFile: true },
			{ resource: URI.file('/workspace/photos/mountain.jpg'), isFile: true },
			{ resource: URI.file('/workspace/photos/notes.txt'), isFile: true },
		]
		));

		const fileContents = new Map<string, VSBuffer>();
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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set(wsRoot.path, createFileStat(
			wsRoot, false, false, true, false, [
			{ resource: logoUri, isFile: true },
			{ resource: readmeUri, isFile: true },
		]
		));

		const fileContents = new Map<string, VSBuffer>();
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
		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/docs', createFileStat(
			folderUri, false, false, true, false, [
			{ resource: URI.file('/workspace/docs/readme.md'), isFile: true },
		]
		));

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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/docs', createFileStat(
			URI.file('/workspace/docs'), false, false, true, false, [
			{ resource: URI.file('/workspace/docs/readme.md'), isFile: true },
			{ resource: URI.file('/workspace/docs/notes.txt'), isFile: true },
		]
		));

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
		const resolveMap = new Map<string, IFileStat>();
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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/broken', createFileStat(
			folderUri, false, false, true, false, [
			{ resource: URI.file('/workspace/broken/corrupt.png'), isFile: true },
			{ resource: URI.file('/workspace/broken/missing.jpg'), isFile: true },
		]
		));

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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/media', createFileStat(
			URI.file('/workspace/media'), false, false, true, false, [
			{ resource: URI.file('/workspace/media/clip.mp4'), isFile: true },
			{ resource: URI.file('/workspace/media/photo.png'), isFile: true },
			{ resource: URI.file('/workspace/media/demo.webm'), isFile: true },
			{ resource: URI.file('/workspace/media/intro.mov'), isFile: true },
			{ resource: URI.file('/workspace/media/readme.txt'), isFile: true },
		]
		));

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

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/media', createFileStat(
			URI.file('/workspace/media'), false, false, true, false, [
			{ resource: URI.file('/workspace/media/clip.mp4'), isFile: true },
			{ resource: URI.file('/workspace/media/photo.png'), isFile: true },
			{ resource: URI.file('/workspace/media/notes.txt'), isFile: true },
		]
		));

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
