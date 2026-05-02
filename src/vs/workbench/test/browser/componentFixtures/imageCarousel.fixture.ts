/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ImageCarouselEditor } from '../../../contrib/imageCarousel/browser/imageCarouselEditor.js';
import { ImageCarouselEditorInput } from '../../../contrib/imageCarousel/browser/imageCarouselEditorInput.js';
import { ICarouselImage, IImageCarouselCollection } from '../../../contrib/imageCarousel/browser/imageCarouselTypes.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import '../../../contrib/imageCarousel/browser/media/imageCarousel.css';
import { IFileService } from '../../../../platform/files/common/files.js';
import { NullFileSystemProvider } from '../../../../platform/files/test/common/nullFileSystemProvider.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';

function createSolidPng(r: number, g: number, b: number, width: number = 64, height: number = 64): VSBuffer {
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
	ctx.fillRect(0, 0, width, height);

	const dataUrl = canvas.toDataURL('image/png');
	const base64 = dataUrl.split(',')[1];
	return VSBuffer.wrap(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

function createTestImages(): ICarouselImage[] {
	return [
		{ id: 'img-1', name: 'Red', mimeType: 'image/png', data: createSolidPng(220, 50, 50), caption: 'A red image' },
		{ id: 'img-2', name: 'Green', mimeType: 'image/png', data: createSolidPng(50, 180, 50), caption: 'A green image' },
		{ id: 'img-3', name: 'Blue', mimeType: 'image/png', data: createSolidPng(50, 80, 220) },
		{ id: 'img-4', name: 'Yellow', mimeType: 'image/png', data: createSolidPng(230, 210, 50), caption: 'A yellow image' },
		{ id: 'img-5', name: 'Purple', mimeType: 'image/png', data: createSolidPng(150, 50, 200) },
	];
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

async function renderCarousel(context: ComponentFixtureContext, collection: IImageCarouselCollection, startIndex: number = 0): Promise<void> {
	const { container, disposableStore, theme } = context;

	container.style.width = '600px';
	container.style.height = '500px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: ({ defineInstance }) => {
			const fileService = new FileService(new NullLogService());
			fileService.registerProvider(Schemas.file, new NullFileSystemProvider());
			disposableStore.add(fileService);
			defineInstance(IFileService, fileService);
			defineInstance(IWebviewService, new class extends mock<IWebviewService>() { }());
		},
	});

	const editor = disposableStore.add(
		instantiationService.createInstance(ImageCarouselEditor, createMockEditorGroup())
	);
	editor.create(container);
	editor.layout(new Dimension(600, 500));

	const input = new ImageCarouselEditorInput(collection, startIndex);
	await editor.setInput(input, undefined, {}, CancellationToken.None);
}

function singleSectionCollection(): IImageCarouselCollection {
	return {
		id: 'fixture-single',
		title: 'Test Carousel',
		sections: [{ title: 'All Images', images: createTestImages() }],
	};
}

function multiSectionCollection(): IImageCarouselCollection {
	const images = createTestImages();
	return {
		id: 'fixture-multi',
		title: 'Multi-Section Carousel',
		sections: [
			{ title: 'Warm Colors', images: [images[0], images[3]] },
			{ title: 'Cool Colors', images: [images[2], images[4]] },
			{ title: 'Nature', images: [images[1]] },
		],
	};
}

function singleImageCollection(): IImageCarouselCollection {
	const images = createTestImages();
	return {
		id: 'fixture-single-image',
		title: 'Single Image',
		sections: [{ title: '', images: [images[0]] }],
	};
}

export default defineThemedFixtureGroup({ path: 'imageCarousel/' }, {
	SingleSection: defineComponentFixture({
		render: ctx => renderCarousel(ctx, singleSectionCollection()),
	}),
	SingleSectionMiddleImage: defineComponentFixture({
		render: ctx => renderCarousel(ctx, singleSectionCollection(), 2),
	}),
	MultipleSections: defineComponentFixture({
		render: ctx => renderCarousel(ctx, multiSectionCollection()),
	}),
	SingleImage: defineComponentFixture({
		render: ctx => renderCarousel(ctx, singleImageCollection()),
	}),
});
