/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append } from '../../../../../base/browser/dom.js';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { OverlayLayoutElement } from '../../../../../base/browser/overlayLayoutElement.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isNative } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorOptions, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { EditorCloseContext, EditorInputCapabilities, IEditorCloseEvent, IVisibleEditorPane } from '../../../../common/editor.js';
import { TestFileDialogService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { SideBySideEditor } from '../../../../browser/parts/editor/sideBySideEditor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP, PreferredGroup, USE_MODAL_EDITOR_SETTING } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOverlayWebview, IWebviewService, WebviewMessageReceivedEvent } from '../../../webview/browser/webview.js';
import { isCustomEditorCompatibleInput } from '../../../customEditor/common/customEditor.js';
import { AUDIO_PREVIEW_EDITOR_ID, IMAGE_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_EDITOR_ID } from '../../common/mediaPreview.js';
import { ImagePreviewEditorInput } from '../../browser/imagePreviewEditorInput.js';
import { MediaPlayerEditorInput, MediaPlayerKind } from '../../browser/mediaPlayerEditorInput.js';
import { uint16LE, wav, webm } from '../common/mediaTestFiles.js';

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
			customEditorViewType: isCustomEditorCompatibleInput(input) ? input.customEditorViewType : undefined,
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
			customEditorViewType: IMAGE_PREVIEW_EDITOR_ID,
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

	teardown(() => sinon.restore());

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
			customEditorViewTypes: [audio, video].map(input => isCustomEditorCompatibleInput(input) ? input.customEditorViewType : undefined),
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
			customEditorViewTypes: [AUDIO_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_EDITOR_ID],
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

	test('renders again on changes that are not reported to its watcher', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
		// Both changes are rendered together once the render delay has passed
		fileService.fireFileChanges(new FileChangesEvent([{ resource: input.resource, type: FileChangeType.UPDATED }], false));
		fileService.fireFileChanges(new FileChangesEvent([{ resource: input.resource, type: FileChangeType.UPDATED }], false));
		await timeout(1000);

		assert.strictEqual(renders, 2);
	}));

	test('shows Git LFS pointers as a message within the webview', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const pointer = VSBuffer.fromString('version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n');
		const fileService = instantiationService.get(IFileService);
		fileService.stat = async resource => ({ resource, size: pointer.byteLength } as IFileStatWithMetadata);
		fileService.readFile = async resource => ({ resource, value: pointer, size: pointer.byteLength } as IFileContent);

		let html = '';
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'video', URI.from({ scheme: Schemas.git, path: '/media/clip.webm' }), new class extends mock<IOverlayWebview>() {
			override readonly onMessage = Event.None;
			override setHtml(value: string) { html = value; }
			override dispose() { }
		}));
		await input.resolve();

		assert.deepStrictEqual({
			showsError: html.includes('<body class="error"'),
			showsLfsMessage: html.includes('The video file is stored with Git LFS and is not available for preview.'),
			hasVideo: html.includes('<video'),
		}, { showsError: true, showsLfsMessage: true, hasVideo: false });
	});

	async function createMediaPlayer(disposables: DisposableStore, kind: MediaPlayerKind, resource: URI, content: number[], reportedSize = content.length, configure?: (instantiationService: TestInstantiationService) => void) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		configure?.(instantiationService);
		const buffer = VSBuffer.fromByteArray(content);
		const fileService = instantiationService.get(IFileService);
		fileService.stat = async resource => ({ resource, size: reportedSize } as IFileStatWithMetadata);
		fileService.readFile = async resource => ({ resource, value: buffer, size: buffer.byteLength } as IFileContent);

		const webview = { html: '', container: $('.webview-overlay-content'), onMessage: disposables.add(new Emitter<WebviewMessageReceivedEvent>()), message: new DeferredPromise<unknown>(), openedExternally: [] as string[] };
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(target: URI | string, options?: OpenOptions) {
				if (options?.openExternal) {
					webview.openedExternally.push(target.toString());
				}
				return true;
			}
		});
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, kind, resource, new class extends mock<IOverlayWebview>() {
			override readonly container = webview.container;
			override readonly onMessage = webview.onMessage.event;
			override setHtml(value: string) { webview.html = value; }
			override async postMessage(value: unknown) {
				webview.message.complete(value);
				return true;
			}
			override dispose() { }
		}));
		await input.resolve();
		return webview;
	}

	test('cancels an interrupted native fullscreen exit without leaving an unhandled rejection', async () => {
		const webview = await createMediaPlayer(store.add(new DisposableStore()), 'video', URI.file('/media/clip.webm'), []);
		const outcomes = [];
		for (const scenario of ['already-exited', 'escape-during-exit', 'unexpected-failure']) {
			const document = new mainWindow.DOMParser().parseFromString(webview.html, 'text/html');
			const video = document.querySelector('video')!;
			video.setAttribute('data-fullscreen-dialog', '');
			let fullscreenElement: Element | null = scenario === 'already-exited' ? null : video;
			let exits = 0;
			sinon.stub(document, 'fullscreenElement').get(() => fullscreenElement);
			sinon.stub(document, 'exitFullscreen').callsFake(async () => {
				exits++;
				if (scenario === 'escape-during-exit') {
					fullscreenElement = null;
				}
				throw new TypeError('Fullscreen exit failed');
			});
			const messages: { type: string; error?: string }[] = [];
			let onMessage: ((event: MessageEvent) => Promise<void>) | undefined;
			new Function('acquireVsCodeApi', 'document', 'window', document.querySelector('script')!.textContent!)(
				() => ({ postMessage: (message: typeof messages[number]) => messages.push(message) }),
				document,
				{ addEventListener: (type: string, handler: typeof onMessage) => { if (type === 'message') { onMessage = handler; } } },
			);
			messages.length = 0;
			assert.ok(onMessage);
			await onMessage(new MessageEvent('message', { data: { type: 'exit-native-fullscreen' } }));
			outcomes.push({ scenario, exits, messages });
		}
		assert.deepStrictEqual(outcomes, [
			{ scenario: 'already-exited', exits: 0, messages: [{ type: 'cancel-fullscreen' }] },
			{ scenario: 'escape-during-exit', exits: 1, messages: [{ type: 'cancel-fullscreen', error: undefined }] },
			{ scenario: 'unexpected-failure', exits: 1, messages: [{ type: 'cancel-fullscreen', error: 'TypeError: Fullscreen exit failed' }] },
		]);
	});

	test('reveals the player after cancelling the native fullscreen handoff', async () => {
		const webview = await createMediaPlayer(store.add(new DisposableStore()), 'video', URI.file('/media/clip.webm'), []);
		webview.onMessage.fire({ message: { type: 'prepare-fullscreen' } });
		const prepared = webview.container.classList.contains('media-player-transition');
		webview.message = new DeferredPromise<unknown>();
		webview.onMessage.fire({ message: { type: 'cancel-fullscreen' } });
		const layout = await webview.message.p;
		const awaitingLayout = webview.container.classList.contains('media-player-transition');
		webview.onMessage.fire({ message: { type: 'video-layout', id: 1, width: 0, height: 0 } });
		assert.deepStrictEqual({
			prepared, awaitingLayout, layout,
			revealed: !webview.container.classList.contains('media-player-transition'),
		}, { prepared: true, awaitingLayout: true, layout: { type: 'layout-video', id: 1 }, revealed: true });
	});

	test('reveals native fullscreen and reports errors when the browser refuses to exit', async () => {
		const reportError = sinon.stub(errorHandler, 'onUnexpectedError');
		const webview = await createMediaPlayer(store.add(new DisposableStore()), 'video', URI.file('/media/clip.webm'), []);
		webview.onMessage.fire({ message: { type: 'prepare-fullscreen' } });
		webview.onMessage.fire({ message: { type: 'cancel-fullscreen', error: 'Fullscreen exit failed' } });
		const restored = {
			transitionMasked: webview.container.classList.contains('media-player-transition'),
			nativeMaskDisabled: webview.container.classList.contains('media-player-fullscreen-error'),
			error: reportError.firstCall.args[0].message,
		};
		webview.onMessage.fire({ message: { type: 'prepare-fullscreen' } });
		assert.deepStrictEqual({
			restored,
			nextRequestMasked: webview.container.classList.contains('media-player-transition'),
			nextRequestNativeMaskDisabled: webview.container.classList.contains('media-player-fullscreen-error'),
		}, {
			restored: { transitionMasked: false, nativeMaskDisabled: true, error: 'Fullscreen exit failed' },
			nextRequestMasked: true, nextRequestNativeMaskDisabled: false,
		});
	});

	test('offers dialog fullscreen for desktop video in both window types when modal editors are enabled', async () => {
		const results = [];
		for (const [kind, sessionsWindow, useModal] of [
			['video', true, 'some'],
			['video', false, 'some'],
			['audio', true, 'some'],
			['video', true, 'off'],
		] as const) {
			const webview = await createMediaPlayer(store.add(new DisposableStore()), kind, URI.file('/media/clip.webm'), [], 0, instantiationService => {
				instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: sessionsWindow });
				instantiationService.stub(IConfigurationService, new TestConfigurationService({ [USE_MODAL_EDITOR_SETTING]: useModal }));
			});
			const document = new mainWindow.DOMParser().parseFromString(webview.html, 'text/html');
			const video = document.querySelector('video');
			results.push({
				kind, sessionsWindow, useModal,
				addedButtons: document.querySelectorAll('button').length,
				dialog: video?.hasAttribute('data-fullscreen-dialog') ?? false,
				nativeFullscreenHidden: !!video?.getAttribute('controlslist') || webview.html.includes('::-webkit-media-controls-fullscreen-button'),
			});
		}
		assert.deepStrictEqual(results, [
			{ kind: 'video', sessionsWindow: true, useModal: 'some', addedButtons: 0, dialog: isNative, nativeFullscreenHidden: false },
			{ kind: 'video', sessionsWindow: false, useModal: 'some', addedButtons: 0, dialog: isNative, nativeFullscreenHidden: false },
			{ kind: 'audio', sessionsWindow: true, useModal: 'some', addedButtons: 0, dialog: false, nativeFullscreenHidden: false },
			{ kind: 'video', sessionsWindow: true, useModal: 'off', addedButtons: 0, dialog: false, nativeFullscreenHidden: false },
		]);
	});

	test('enables the native player fullscreen control only for supported desktop video previews', () => {
		const results: { fullscreen: boolean; suppressesNativeFullscreenPaint: boolean }[] = [];
		for (const [kind, sessionsWindow, useModal] of [
			['video', true, 'some'],
			['video', false, 'some'],
			['audio', true, 'some'],
			['video', true, 'off'],
		] as const) {
			const disposables = store.add(new DisposableStore());
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: sessionsWindow });
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [USE_MODAL_EDITOR_SETTING]: useModal }));
			instantiationService.stub(IWebviewService, {
				createWebviewOverlay: info => {
					results.push({
						fullscreen: info.options.allowFullscreen === true,
						suppressesNativeFullscreenPaint: info.options.customClasses === 'media-player-webview',
					});
					return new class extends mock<IOverlayWebview>() {
						override readonly onMessage = Event.None;
						override dispose() { }
					};
				},
			});
			disposables.add(MediaPlayerEditorInput.create(instantiationService, kind, URI.file('/media/clip.webm'), undefined));
		}
		assert.deepStrictEqual(results, [
			{ fullscreen: isNative, suppressesNativeFullscreenPaint: isNative },
			{ fullscreen: isNative, suppressesNativeFullscreenPaint: isNative },
			{ fullscreen: false, suppressesNativeFullscreenPaint: false },
			{ fullscreen: false, suppressesNativeFullscreenPaint: false },
		]);
	});

	test('disables dialog fullscreen in detached windows and restores it when moved back', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const claims: boolean[] = [];
		const webview = new class extends mock<IOverlayWebview>() {
			override readonly onMessage = Event.None;
			override options = { allowFullscreen: isNative };
			override claim() { claims.push(this.options.allowFullscreen); }
			override dispose() { }
		};
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'video', URI.file('/media/clip.webm'), webview));
		const owner = {};
		const detachedWindow = upcastPartial<CodeWindow>({ vscodeWindowId: mainWindow.vscodeWindowId + 1 });
		input.claim(owner, mainWindow, undefined);
		input.claim(owner, detachedWindow, undefined);
		input.claim(owner, mainWindow, undefined);
		assert.deepStrictEqual(claims, [isNative, false, isNative]);
	});

	(isNative ? test : test.skip)('closes the containing modal diff and reveals the player if closing is vetoed', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const modalElement = append(mainWindow.document.body, $('.part.modal-editor-part'));
		disposables.add(toDisposable(() => modalElement.remove()));
		const anchor = append(modalElement, $('.video-anchor'));
		anchor.style.cssText = 'width: 320px; height: 180px;';
		const overlay = disposables.add(new OverlayLayoutElement());
		append(modalElement, overlay.root);
		overlay.setAnchorElement(anchor);
		const onMessage = disposables.add(new Emitter<WebviewMessageReceivedEvent>());
		const layoutRequested = new DeferredPromise<void>();
		const messages: object[] = [];
		let closedInput: EditorInput | undefined;
		instantiationService.stub(IEditorService, { get visibleEditorPanes() { return [diffPane]; } });
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'video', URI.file('/media/clip.webm'), new class extends mock<IOverlayWebview>() {
			override readonly container = overlay.content;
			override readonly onMessage = onMessage.event;
			override async postMessage(message: { type: string }) {
				messages.push(message);
				if (message.type === 'layout-video') {
					layoutRequested.complete();
				}
				return true;
			}
			override dispose() { }
		}));
		const diffInput = disposables.add(instantiationService.createInstance(DiffEditorInput, 'Video Diff', undefined, input, input, true));
		const group = upcastPartial<IEditorGroup>({
			id: 1,
			closeEditor: async editor => { closedInput = editor; return false; },
		});
		const source = upcastPartial<IVisibleEditorPane>({ input, group });
		const diffPane = Object.assign(Object.create(SideBySideEditor.prototype), {
			_input: diffInput,
			getPrimaryEditorPane: () => undefined,
			getSecondaryEditorPane: () => source,
		}) as IVisibleEditorPane;
		onMessage.fire({ message: { type: 'prepare-fullscreen' } });
		onMessage.fire({ message: { type: 'toggle-fullscreen' } });
		await layoutRequested.p;
		onMessage.fire({
			message: {
				type: 'video-layout', id: 1,
				width: overlay.content.clientWidth, height: overlay.content.clientHeight,
			}
		});
		assert.deepStrictEqual({
			closedContainingDiff: closedInput === diffInput,
			revealed: !overlay.content.classList.contains('media-player-transition'),
			messages,
		}, {
			closedContainingDiff: true, revealed: true,
			messages: [{ type: 'exit-native-fullscreen' }, { type: 'layout-video', id: 1 }],
		});
	});

	(isNative ? test : test.skip)('shares a diff video without overriding remembered dialog state and restores its inner pane on close', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		const container = append(mainWindow.document.body, $('.part'));
		disposables.add(toDisposable(() => container.remove()));
		const anchor = append(container, $('.video-anchor'));
		anchor.style.cssText = 'width: 320px; height: 180px;';
		const modalElement = append(container, $('.modal-editor-part'));
		const modalAnchor = append(modalElement, $('.modal-anchor'));
		modalAnchor.style.cssText = 'width: 640px; height: 360px;';
		let headerFocused = false;
		instantiationService.stub(IEditorGroupsService, {
			activeModalEditorPart: upcastPartial<IModalEditorPart>({ focusToolbar: () => { headerFocused = true; } }),
		});
		const overlay = disposables.add(new OverlayLayoutElement());
		overlay.content.classList.add('webview-overlay-content');
		append(container, overlay.root);
		overlay.setAnchorElement(anchor, { clippingContainer: container });
		const onMessage = disposables.add(new Emitter<WebviewMessageReceivedEvent>());
		const onDidCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		const opened = new DeferredPromise<void>();
		const messages: object[] = [];
		const claims: object[] = [];
		let restoredAnchor: HTMLElement | undefined;
		let restoredClip: HTMLElement | undefined;
		let focused = false;
		let openCount = 0;
		instantiationService.stub(IEditorService, {
			get visibleEditorPanes() { return [diffPane]; },
		});
		instantiationService.stub(IEditorService, 'openEditor', async (editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup) => {
			openCount++;
			assert.deepStrictEqual({ sameInput: editor === input, options, group }, {
				sameInput: true, options: { pinned: true }, group: MODAL_GROUP,
			});
			input.updateGroup(2);
			overlay.setAnchorElement(modalAnchor);
			return upcastPartial<IVisibleEditorPane>({ input, group: modalGroup });
		});
		const input = disposables.add(instantiationService.createInstance(MediaPlayerEditorInput, 'video', URI.file('/media/clip.webm'), new class extends mock<IOverlayWebview>() {
			override readonly container = overlay.content;
			override readonly onMessage = onMessage.event;
			override claim(owner: object) { claims.push(owner); }
			override focus() { }
			override setAnchorElement(element: HTMLElement, clippingContainer?: HTMLElement) {
				restoredAnchor = element;
				restoredClip = clippingContainer;
				overlay.setAnchorElement(element, { clippingContainer });
			}
			override async postMessage(message: { type: string }) {
				messages.push(message);
				if (message.type === 'fullscreen') {
					opened.complete();
				}
				return true;
			}
			override dispose() { }
		}));
		const sourceGroup = upcastPartial<IEditorGroup>({ id: 1 });
		const source = upcastPartial<IVisibleEditorPane>({
			input, group: sourceGroup, isVisible: () => true,
			focus: () => { focused = true; },
		});
		const diffPane = Object.assign(Object.create(SideBySideEditor.prototype), {
			getPrimaryEditorPane: () => undefined,
			getSecondaryEditorPane: () => source,
		}) as IVisibleEditorPane;
		const modalGroup = upcastPartial<IEditorGroup>({
			id: 2, onDidCloseEditor: onDidCloseEditor.event,
			closeEditor: async editor => {
				assert.ok(editor);
				onDidCloseEditor.fire({ editor, groupId: 2, context: EditorCloseContext.UNKNOWN, index: 0, sticky: false });
				return true;
			},
		});
		onMessage.fire({ message: { type: 'prepare-fullscreen' } });
		onMessage.fire({ message: { type: 'toggle-fullscreen' } });
		onMessage.fire({ message: { type: 'toggle-fullscreen' } });
		await opened.p;
		const transitionOpacity = () => mainWindow.getComputedStyle(overlay.content).opacity;
		const transitionStates = [transitionOpacity()];
		onMessage.fire({ message: { type: 'video-layout', id: 0, width: 640, height: 360 } });
		transitionStates.push(transitionOpacity());
		onMessage.fire({ message: { type: 'video-layout', id: 1, width: 640, height: 360 } });
		transitionStates.push(transitionOpacity());
		modalAnchor.querySelector<HTMLElement>('[tabindex="0"]')!.dispatchEvent(new FocusEvent('focus'));
		overlay.content.querySelector<HTMLElement>('span[tabindex="0"]')!.dispatchEvent(new FocusEvent('focus'));
		onMessage.fire({ message: { type: 'toggle-fullscreen' } });
		transitionStates.push(transitionOpacity());
		onMessage.fire({ message: { type: 'video-layout', id: 1, width: 320, height: 180 } });
		transitionStates.push(transitionOpacity());
		onMessage.fire({ message: { type: 'video-layout', id: 2, width: 319, height: 180 } });
		transitionStates.push(transitionOpacity());
		onMessage.fire({ message: { type: 'video-layout', id: 3, width: 320, height: 180 } });
		transitionStates.push(transitionOpacity());
		assert.deepStrictEqual({
			openCount, messages, transitionStates, restoredOwner: claims[0] === source,
			restoredAnchor: restoredAnchor === anchor, restoredClip: restoredClip === container, group: input.group, focused,
			headerFocused, focusGuardsRemoved: overlay.content.querySelectorAll('span[tabindex="0"]').length === 0,
		}, {
			openCount: 1,
			messages: [
				{ type: 'exit-native-fullscreen' },
				{ type: 'layout-video', id: 1 },
				{ type: 'fullscreen', expanded: true },
				{ type: 'focus-video' },
				{ type: 'layout-video', id: 2 },
				{ type: 'fullscreen', expanded: false },
				{ type: 'layout-video', id: 3 },
			],
			transitionStates: ['0', '0', '1', '0', '0', '0', '1'],
			restoredOwner: true, restoredAnchor: true, restoredClip: true, group: 1, focused: true,
			headerFocused: true, focusGuardsRemoved: true,
		});
	});

	// Files can only be opened in an external application on desktop
	const openFile = isNative ? [{ label: 'Open File', message: 'open-externally' }] : [];
	const openInTextEditor = { label: 'Open in Text Editor', message: 'reopen-as-text' };

	test('sends the audio codecs to the webview on request, which warns if it cannot play them', async () => {
		const disposables = store.add(new DisposableStore());
		// A WAV file with GSM 6.10 audio
		const webview = await createMediaPlayer(disposables, 'audio', URI.file('/media/voice.wav'), wav(uint16LE(0x0031)));
		webview.onMessage.fire({ message: { type: 'get-codecs' } });

		assert.deepStrictEqual({
			hasWarningRegion: webview.html.includes('<div class="codec-warning-message" role="status"></div>'),
			message: await webview.message.p,
		}, {
			hasWarningRegion: true,
			message: {
				type: 'codecs',
				video: undefined,
				audio: {
					mimeTypes: ['audio/wav; codecs="49"'],
					warning: 'This audio file uses the GSM 6.10 codec, which can\'t be played in the audio preview.',
					actions: [...openFile, openInTextEditor],
				},
			},
		});
	});

	test('sends the video codecs of a WebM file to the webview on request, which warns if it cannot play them', async () => {
		const disposables = store.add(new DisposableStore());
		const webview = await createMediaPlayer(disposables, 'video', URI.file('/media/clip.webm'), webm([1, 'V_VP9'], [2, 'A_OPUS']));
		webview.onMessage.fire({ message: { type: 'get-codecs' } });

		// Only a video that can't be played fails to load, so only its warning offers the text editor
		assert.deepStrictEqual(await webview.message.p, {
			type: 'codecs',
			video: {
				mimeTypes: ['video/webm; codecs="vp9"'],
				warning: 'This video uses the VP9 codec, which can\'t be played in the video preview.',
				actions: [...openFile, openInTextEditor],
			},
			audio: {
				mimeTypes: ['audio/webm; codecs="opus"'],
				warning: 'This video\'s audio uses the Opus codec, which can\'t be played in the video preview.',
				actions: openFile,
			},
		});
	});

	test('opens only local media files in an external application from the codec warning', async () => {
		const disposables = store.add(new DisposableStore());
		const result: Record<string, { offersOpenFile: boolean; openedExternally: string[] }> = {};
		// The preview can show any file, such as a script disguised as a video, which the OS would run
		for (const resource of [URI.file('/media/clip.webm'), URI.file('/media/clip.command'), URI.from({ scheme: Schemas.vscodeRemote, authority: 'host', path: '/media/clip.webm' })]) {
			const webview = await createMediaPlayer(disposables, 'video', resource, webm([1, 'V_VP9']));
			webview.onMessage.fire({ message: { type: 'get-codecs' } });
			const message = await webview.message.p as { video: { actions: { message: string }[] } };
			webview.onMessage.fire({ message: { type: 'open-externally' } });
			result[resource.toString()] = { offersOpenFile: message.video.actions.some(action => action.message === 'open-externally'), openedExternally: webview.openedExternally };
		}

		assert.deepStrictEqual(result, {
			'file:///media/clip.webm': { offersOpenFile: isNative, openedExternally: isNative ? ['file:///media/clip.webm'] : [] },
			'file:///media/clip.command': { offersOpenFile: false, openedExternally: [] },
			'vscode-remote://host/media/clip.webm': { offersOpenFile: false, openedExternally: [] },
		});
	});

	test('sends the type of a WebM file to the webview on request, which needs it to play the file through Media Source Extensions', async () => {
		const disposables = store.add(new DisposableStore());
		// The file is too large to be read as a whole for the codec warning, but not for playback
		const webview = await createMediaPlayer(disposables, 'video', URI.file('/media/clip.webm'), webm([1, 'V_VP9'], [2, 'A_OPUS'], [2, 'A_OPUS']), 100 * 1024 * 1024);
		webview.onMessage.fire({ message: { type: 'get-webm-type' } });

		assert.deepStrictEqual(await webview.message.p, { type: 'webm-type', mimeType: 'video/webm; codecs="vp9,opus"' });
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
