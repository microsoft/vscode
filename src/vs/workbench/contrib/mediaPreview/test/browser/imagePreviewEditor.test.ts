/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
import { ImagePreviewEditor } from '../../browser/imagePreviewEditor.js';
import { ImagePreviewEditorInput } from '../../browser/imagePreviewEditorInput.js';

interface ImagePreviewEditorTestAccessor {
	_reloadImage(input: ImagePreviewEditorInput, initialViewState: undefined): Promise<void>;
}

function createPng(width: number, height: number): VSBuffer {
	const canvas = $<HTMLCanvasElement>('canvas');
	canvas.width = width;
	canvas.height = height;
	canvas.getContext('2d')!.fillRect(0, 0, width, height);
	const base64 = canvas.toDataURL('image/png').split(',')[1];
	return VSBuffer.wrap(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

suite('Media Preview - ImagePreviewEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a pending reload does not replace a newer image', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IClipboardService, new TestClipboardService());
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() { }());

		const imageA = URI.file('/images/a.png');
		const imageB = URI.file('/images/b.png');
		const contents = new ResourceMap<VSBuffer>([[imageA, createPng(40, 20)], [imageB, createPng(10, 10)]]);
		let pendingRead: DeferredPromise<IFileContent> | undefined;
		const fileService = instantiationService.get(IFileService);
		fileService.readFile = async resource => {
			if (pendingRead) {
				const read = pendingRead;
				pendingRead = undefined;
				return read.p;
			}
			const value = contents.get(resource)!;
			return { resource, value, size: value.byteLength } as IFileContent;
		};

		const container = $('div');
		container.style.width = '400px';
		container.style.height = '400px';
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		const editor = disposables.add(instantiationService.createInstance(ImagePreviewEditor, new TestEditorGroupView(1)));
		editor.create(container);
		const inputA = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, imageA, undefined));
		const inputB = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, imageB, undefined));

		await editor.setInput(inputA, undefined, {}, CancellationToken.None);

		// Start reloading image A, then switch to image B before the reload's read completes
		pendingRead = new DeferredPromise<IFileContent>();
		const staleRead = pendingRead;
		const reload = (editor as unknown as ImagePreviewEditorTestAccessor)._reloadImage(inputA, undefined);
		await editor.setInput(inputB, undefined, {}, CancellationToken.None);
		const imageAContent = contents.get(imageA)!;
		await staleRead.complete({ resource: imageA, value: imageAContent, size: imageAContent.byteLength } as IFileContent);
		await reload;

		assert.deepStrictEqual({
			input: editor.input?.resource?.toString(),
			naturalSize: editor.imageViewer?.naturalSize,
			fileSize: editor.fileSize,
		}, {
			input: imageB.toString(),
			naturalSize: { width: 10, height: 10 },
			fileSize: contents.get(imageB)!.byteLength,
		});
	});

	test('reloads an image that changes while it is loading', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IClipboardService, new TestClipboardService());
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() { }());

		const image = URI.file('/images/generated.png');
		const versions = [createPng(40, 20), createPng(10, 10)];
		const initialRead = new DeferredPromise<IFileContent>();
		let reads = 0;
		const onDidChange = disposables.add(new Emitter<FileChangesEvent>());
		const fileService = instantiationService.get(IFileService);
		fileService.createWatcher = () => ({ onDidChange: onDidChange.event, dispose: () => { } });
		fileService.readFile = async resource => {
			if (reads++ === 0) {
				return initialRead.p;
			}
			return { resource, value: versions[1], size: versions[1].byteLength } as IFileContent;
		};

		const container = $('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		const editor = disposables.add(instantiationService.createInstance(ImagePreviewEditor, new TestEditorGroupView(1)));
		editor.create(container);
		const input = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, image, undefined));

		// The file changes after the initial read started but before it completed
		const setInput = editor.setInput(input, undefined, {}, CancellationToken.None);
		while (reads === 0) {
			await timeout(0);
		}
		onDidChange.fire(new FileChangesEvent([{ resource: image, type: FileChangeType.UPDATED }], false));
		await initialRead.complete({ resource: image, value: versions[0], size: versions[0].byteLength } as IFileContent);
		await setInput;

		for (let i = 0; i < 50 && editor.imageViewer?.naturalSize?.width !== 10; i++) {
			await timeout(20);
		}

		assert.deepStrictEqual({ reads, naturalSize: editor.imageViewer?.naturalSize }, { reads: 2, naturalSize: { width: 10, height: 10 } });
	});

	test('reloads an image on changes that are not reported to its watcher', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IClipboardService, new TestClipboardService());
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() { }());

		// Extension file systems report changes to `IFileService.onDidFilesChange` only
		const image = URI.from({ scheme: 'extension-fs', path: '/images/generated.png' });
		const versions = [createPng(40, 20), createPng(10, 10)];
		let reads = 0;
		const fileService = instantiationService.get(IFileService) as TestFileService;
		fileService.readFile = async resource => {
			const value = versions[Math.min(reads++, 1)];
			return { resource, value, size: value.byteLength } as IFileContent;
		};

		const container = $('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		const editor = disposables.add(instantiationService.createInstance(ImagePreviewEditor, new TestEditorGroupView(1)));
		editor.create(container);
		const input = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, image, undefined));
		await editor.setInput(input, undefined, {}, CancellationToken.None);

		fileService.fireFileChanges(new FileChangesEvent([{ resource: image, type: FileChangeType.UPDATED }], false));
		for (let i = 0; i < 50 && editor.imageViewer?.naturalSize?.width !== 10; i++) {
			await timeout(20);
		}

		assert.deepStrictEqual({ reads, naturalSize: editor.imageViewer?.naturalSize }, { reads: 2, naturalSize: { width: 10, height: 10 } });
	});
});
