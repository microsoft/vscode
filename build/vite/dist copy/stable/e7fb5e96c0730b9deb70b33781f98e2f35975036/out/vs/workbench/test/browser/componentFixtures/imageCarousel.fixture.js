/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ImageCarouselEditor } from '../../../contrib/imageCarousel/browser/imageCarouselEditor.js';
import { ImageCarouselEditorInput } from '../../../contrib/imageCarousel/browser/imageCarouselEditorInput.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import '../../../contrib/imageCarousel/browser/media/imageCarousel.css';
import { IFileService } from '../../../../platform/files/common/files.js';
import { NullFileSystemProvider } from '../../../../platform/files/test/common/nullFileSystemProvider.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';
function createSolidPng(r, g, b, width = 64, height = 64) {
    const canvas = mainWindow.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    return VSBuffer.wrap(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}
function createTestImages() {
    return [
        { id: 'img-1', name: 'Red', mimeType: 'image/png', data: createSolidPng(220, 50, 50), caption: 'A red image' },
        { id: 'img-2', name: 'Green', mimeType: 'image/png', data: createSolidPng(50, 180, 50), caption: 'A green image' },
        { id: 'img-3', name: 'Blue', mimeType: 'image/png', data: createSolidPng(50, 80, 220) },
        { id: 'img-4', name: 'Yellow', mimeType: 'image/png', data: createSolidPng(230, 210, 50), caption: 'A yellow image' },
        { id: 'img-5', name: 'Purple', mimeType: 'image/png', data: createSolidPng(150, 50, 200) },
    ];
}
function createMockEditorGroup() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.windowId = mainWindow.vscodeWindowId;
        }
    }();
}
async function renderCarousel(context, collection, startIndex = 0) {
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
            defineInstance(IWebviewService, new class extends mock() {
            }());
        },
    });
    const editor = disposableStore.add(instantiationService.createInstance(ImageCarouselEditor, createMockEditorGroup()));
    editor.create(container);
    editor.layout(new Dimension(600, 500));
    const input = new ImageCarouselEditorInput(collection, startIndex);
    await editor.setInput(input, undefined, {}, CancellationToken.None);
}
function singleSectionCollection() {
    return {
        id: 'fixture-single',
        title: 'Test Carousel',
        sections: [{ title: 'All Images', images: createTestImages() }],
    };
}
function multiSectionCollection() {
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
function singleImageCollection() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VDYXJvdXNlbC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9pbWFnZUNhcm91c2VsLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBRTlHLE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNwSSxPQUFPLGdFQUFnRSxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsU0FBUyxjQUFjLENB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