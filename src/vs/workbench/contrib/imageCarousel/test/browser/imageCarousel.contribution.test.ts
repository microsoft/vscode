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
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../../files/browser/files.js';
import { ExplorerItem } from '../../../files/common/explorerModel.js';
import { IFileService, IFileStat, IFileContent } from '../../../../../platform/files/common/files.js';
import { IEditorService, MODAL_GROUP } from '../../../../services/editor/common/editorService.js';
import { ImageCarouselEditorInput } from '../../browser/imageCarouselEditorInput.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

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

function createFileStat(resource: URI, isDirectory: boolean, children?: IFileStat[]): IFileStat {
	return {
		resource,
		name: resource.path.split('/').pop()!,
		isFile: !isDirectory,
		isDirectory,
		isSymbolicLink: false,
		mtime: 0,
		ctime: 0,
		size: 100,
		etag: '',
		children,
	};
}

suite('OpenImagesInCarouselFromExplorerAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configService: TestConfigurationService;
	let openedInputs: { input: ImageCarouselEditorInput; group: typeof MODAL_GROUP }[];

	setup(() => {
		openedInputs = [];
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

	test('single image file opens carousel with sibling images', async () => {
		const fileService = instantiationService.get(IFileService);
		const parent = createExplorerItem('/workspace/images', true, fileService, configService);
		const imageItem = createExplorerItem('/workspace/images/photo.png', false, fileService, configService, parent);

		const pngData = VSBuffer.fromString('fake-png');
		const jpgData = VSBuffer.fromString('fake-jpg');
		const txtData = VSBuffer.fromString('text file');

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/images', createFileStat(
			URI.file('/workspace/images'), true, [
			createFileStat(URI.file('/workspace/images/photo.png'), false),
			createFileStat(URI.file('/workspace/images/other.jpg'), false),
			createFileStat(URI.file('/workspace/images/readme.txt'), false),
			createFileStat(URI.file('/workspace/images/subfolder'), true),
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
		assert.strictEqual(images[0].name, 'photo.png');
		assert.strictEqual(images[1].name, 'other.jpg');

		// Start index should be the selected image (photo.png = index 0)
		assert.strictEqual(input.startIndex, 0);
	});

	test('folder opens carousel with all contained images', async () => {
		const fileService = instantiationService.get(IFileService);
		const folderItem = createExplorerItem('/workspace/images', true, fileService, configService);

		const gifData = VSBuffer.fromString('fake-gif');
		const webpData = VSBuffer.fromString('fake-webp');

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/images', createFileStat(
			URI.file('/workspace/images'), true, [
			createFileStat(URI.file('/workspace/images/anim.gif'), false),
			createFileStat(URI.file('/workspace/images/photo.webp'), false),
			createFileStat(URI.file('/workspace/images/script.js'), false),
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

	test('empty selection does not open carousel', async () => {
		stubExplorerService([]);
		stubEditorService();

		const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
		const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
		assert.ok(command);

		await instantiationService.invokeFunction(command.handler);

		assert.strictEqual(openedInputs.length, 0, 'Should not open carousel for empty selection');
	});

	test('folder with no images does not open carousel', async () => {
		const fileService = instantiationService.get(IFileService);
		const folderItem = createExplorerItem('/workspace/docs', true, fileService, configService);

		const resolveMap = new Map<string, IFileStat>();
		resolveMap.set('/workspace/docs', createFileStat(
			URI.file('/workspace/docs'), true, [
			createFileStat(URI.file('/workspace/docs/readme.md'), false),
			createFileStat(URI.file('/workspace/docs/notes.txt'), false),
		]
		));

		stubFileService(resolveMap, new Map());
		stubExplorerService([folderItem]);
		stubEditorService();

		const { CommandsRegistry } = await import('../../../../../platform/commands/common/commands.js');
		const command = CommandsRegistry.getCommand('workbench.action.openImagesInCarousel');
		assert.ok(command);

		await instantiationService.invokeFunction(command.handler);

		assert.strictEqual(openedInputs.length, 0, 'Should not open carousel when folder has no images');
	});
});
