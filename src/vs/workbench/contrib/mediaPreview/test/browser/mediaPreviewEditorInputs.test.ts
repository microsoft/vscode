/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { TestFileDialogService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { AUDIO_PREVIEW_EDITOR_ID, IMAGE_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_EDITOR_ID } from '../../common/mediaPreview.js';
import { ImagePreviewEditorInput } from '../../browser/imagePreviewEditorInput.js';
import { MediaPlayerEditorInput, MediaPlayerKind } from '../../browser/mediaPlayerEditorInput.js';

suite('Media Preview - ImagePreviewEditorInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('is a read-only resource editor for the image preview', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const resource = URI.file('/images/logo.png');

		const input = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, resource, undefined));
		const sameResource = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, URI.file('/images/logo.png'), undefined));
		const otherResource = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, URI.file('/images/other.png'), undefined));

		const untyped = input.toUntyped();
		assert.deepStrictEqual({
			typeId: input.typeId,
			editorId: input.editorId,
			name: input.getName(),
			readonly: input.hasCapability(EditorInputCapabilities.Readonly),
			canDropIntoEditor: input.hasCapability(EditorInputCapabilities.CanDropIntoEditor),
			matchesSameResource: input.matches(sameResource),
			matchesOtherResource: input.matches(otherResource),
			matchesUntypedPreview: input.matches({ resource, options: { override: IMAGE_PREVIEW_EDITOR_ID } }),
			matchesUntypedTextEditor: input.matches({ resource, options: { override: 'default' } }),
			untyped: { resource: untyped.resource?.toString(), override: untyped.options?.override },
		}, {
			typeId: ImagePreviewEditorInput.ID,
			editorId: IMAGE_PREVIEW_EDITOR_ID,
			name: 'logo.png',
			readonly: true,
			canDropIntoEditor: false,
			matchesSameResource: true,
			matchesOtherResource: false,
			matchesUntypedPreview: true,
			matchesUntypedTextEditor: false,
			untyped: { resource: resource.toString(), override: IMAGE_PREVIEW_EDITOR_ID },
		});
	});

	test('follows renamed files', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const input = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, URI.file('/images/logo.png'), undefined));
		const target = URI.file('/images/renamed/logo.png');

		const result = await input.rename(1, target);
		const editor = result?.editor as IResourceEditorInput | undefined;
		assert.deepStrictEqual({ resource: editor?.resource.toString(), override: editor?.options?.override }, { resource: target.toString(), override: undefined });
	});
});

suite('Media Preview - MediaPlayerEditorInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies audio and video previews by kind and resource', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const createInput = (kind: MediaPlayerKind, resource: URI) => disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, kind, resource, new class extends mock<IOverlayWebview>() {
			override readonly onMessage = Event.None;
			override dispose() { }
		}));

		const audioResource = URI.file('/media/song.mp3');
		const audio = createInput('audio', audioResource);
		const video = createInput('video', URI.file('/media/clip.webm'));

		const untyped = audio.toUntyped();
		assert.deepStrictEqual({
			typeIds: [audio.typeId, video.typeId],
			editorIds: [audio.editorId, video.editorId],
			name: audio.getName(),
			readonly: audio.hasCapability(EditorInputCapabilities.Readonly),
			singleton: audio.hasCapability(EditorInputCapabilities.Singleton),
			matchesSameKindAndResource: audio.matches(createInput('audio', URI.file('/media/song.mp3'))),
			matchesOtherKind: audio.matches(createInput('video', URI.file('/media/song.mp3'))),
			matchesUntypedPreview: audio.matches({ resource: audioResource, options: { override: AUDIO_PREVIEW_EDITOR_ID } }),
			matchesUntypedTextEditor: audio.matches({ resource: audioResource, options: { override: 'default' } }),
			untyped: { resource: untyped.resource?.toString(), override: untyped.options?.override },
		}, {
			typeIds: [MediaPlayerEditorInput.typeId, MediaPlayerEditorInput.typeId],
			editorIds: [AUDIO_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_EDITOR_ID],
			name: 'song.mp3',
			readonly: true,
			singleton: false,
			matchesSameKindAndResource: true,
			matchesOtherKind: false,
			matchesUntypedPreview: true,
			matchesUntypedTextEditor: false,
			untyped: { resource: audioResource.toString(), override: AUDIO_PREVIEW_EDITOR_ID },
		});

		const target = URI.file('/media/renamed/song.mp3');
		const renamed = (await audio.rename(1, target))?.editor as IResourceEditorInput | undefined;
		assert.deepStrictEqual({ resource: renamed?.resource.toString(), override: renamed?.options?.override }, { resource: target.toString(), override: undefined });
	});

	test('renders again on changes that are not reported to its watcher', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		let renders = 0;
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'video', URI.from({ scheme: 'extension-fs', path: '/media/clip.webm' }), new class extends mock<IOverlayWebview>() {
			override readonly onMessage = Event.None;
			override setHtml() { renders++; }
			override dispose() { }
		}));
		await input.resolve();

		// Extension file systems report changes to `IFileService.onDidFilesChange` only
		const fileService = instantiationService.get(IFileService) as TestFileService;
		fileService.fireFileChanges(new FileChangesEvent([{ resource: input.resource, type: FileChangeType.UPDATED }], false));
		fileService.fireFileChanges(new FileChangesEvent([{ resource: input.resource, type: FileChangeType.UPDATED }], false));
		for (let i = 0; i < 50 && renders < 2; i++) {
			await timeout(20);
		}
		await timeout(150);

		assert.strictEqual(renders, 2);
	});
});

suite('Media Preview - Save As', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function saveAs(instantiationService: TestInstantiationService, input: EditorInput, target: URI | undefined) {
		(instantiationService.get(IFileDialogService) as TestFileDialogService).setPickFileToSave(target!);
		const copies: string[][] = [];
		instantiationService.get(IFileService).copy = async (source: URI, destination: URI, overwrite?: boolean) => {
			copies.push([source.toString(), destination.toString(), String(overwrite)]);
			return undefined!;
		};
		const result = await input.saveAs(1);
		return { copies, result: (result as IResourceEditorInput | undefined)?.resource.toString() };
	}

	test('copies the file to the picked destination', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const image = URI.file('/media/logo.png');
		const audio = URI.file('/media/song.mp3');
		const imageTarget = URI.file('/backup/logo.png');
		const audioTarget = URI.file('/backup/song.mp3');

		const imageInput = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, image, undefined));
		const audioInput = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'audio', audio, new class extends mock<IOverlayWebview>() {
			override readonly onMessage = Event.None;
			override dispose() { }
		}));

		assert.deepStrictEqual({
			image: await saveAs(instantiationService, imageInput, imageTarget),
			audio: await saveAs(instantiationService, audioInput, audioTarget),
			cancelled: await saveAs(instantiationService, imageInput, undefined),
		}, {
			image: { copies: [[image.toString(), imageTarget.toString(), 'true']], result: imageTarget.toString() },
			audio: { copies: [[audio.toString(), audioTarget.toString(), 'true']], result: audioTarget.toString() },
			cancelled: { copies: [], result: undefined },
		});
	});
});
