/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { escapeDoubleQuotes } from '../../../../base/common/htmlContent.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { escape } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities, GroupIdentifier, IMoveResult, ISaveOptions, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IOverlayWebview, IWebviewService } from '../../webview/browser/webview.js';
import { asWebviewUri, webviewGenericCspSource } from '../../webview/common/webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { AUDIO_PREVIEW_EDITOR_ID, isGitLfsPointer, VIDEO_PREVIEW_AUTO_PLAY_SETTING, VIDEO_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_LOOP_SETTING } from '../common/mediaPreview.js';
import { reopenInTextEditor } from './mediaPreviewErrors.js';
import { saveMediaFileAs } from './mediaPreviewSaveAs.js';

export type MediaPlayerKind = 'audio' | 'video';

export function isMediaPlayerKind(value: unknown): value is MediaPlayerKind {
	return value === 'audio' || value === 'video';
}

function getMediaPlayerEditorId(kind: MediaPlayerKind): string {
	return kind === 'audio' ? AUDIO_PREVIEW_EDITOR_ID : VIDEO_PREVIEW_EDITOR_ID;
}

/**
 * Editor input for previewing an audio or video file. Media plays in a webview since the
 * workbench doesn't allow loading media from arbitrary resources. Opens in the
 * {@link WebviewEditor}, which keeps the webview alive while the editor is hidden so playback
 * isn't interrupted.
 */
export class MediaPlayerEditorInput extends WebviewInput {

	static override readonly typeId = 'workbench.input.mediaPlayer';

	static create(instantiationService: IInstantiationService, kind: MediaPlayerKind, resource: URI, group: GroupIdentifier | undefined): MediaPlayerEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: getMediaPlayerEditorId(kind),
				title: basename(resource),
				options: { retainContextWhenHidden: true },
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [dirname(resource).with({ query: '', fragment: '' })],
				},
				extension: undefined,
			});
			const input = instantiationService.createInstance(MediaPlayerEditorInput, kind, resource, webview);
			if (typeof group === 'number') {
				input.updateGroup(group);
			}
			return input;
		});
	}

	private _fileSize: number | undefined;
	private _rendered: Promise<void> | undefined;

	private readonly _onDidChangeFileSize = this._register(new Emitter<void>());
	readonly onDidChangeFileSize = this._onDidChangeFileSize.event;

	constructor(
		readonly kind: MediaPlayerKind,
		private readonly _resource: URI,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@ILabelService private readonly _labelService: ILabelService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
	) {
		super({ viewType: getMediaPlayerEditorId(kind), providedId: undefined, name: basename(_resource), iconPath: undefined }, webview, themeService);

		this._register(webview.onMessage(e => {
			if (e.message?.type === 'reopen-as-text') {
				void reopenInTextEditor(this, this._editorService);
			}
		}));
	}

	override get typeId(): string {
		return MediaPlayerEditorInput.typeId;
	}

	override get resource(): URI {
		return this._resource;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.CanDropIntoEditor;
	}

	/**
	 * Size of the media file in bytes.
	 */
	get fileSize(): number | undefined {
		return this._fileSize;
	}

	override getName(): string {
		return this._labelService.getUriBasenameLabel(this._resource);
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
		const folder = dirname(this._resource);
		switch (verbosity) {
			case Verbosity.SHORT:
				return this._labelService.getUriBasenameLabel(folder);
			case Verbosity.LONG:
				return this._labelService.getUriLabel(folder);
			case Verbosity.MEDIUM:
			default:
				return this._labelService.getUriLabel(folder, { relative: true });
		}
	}

	override getTitle(verbosity?: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.getName();
			case Verbosity.LONG:
				return this._labelService.getUriLabel(this._resource);
			case Verbosity.MEDIUM:
			default:
				return this._labelService.getUriLabel(this._resource, { relative: true });
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || (other instanceof MediaPlayerEditorInput && this.kind === other.kind && isEqual(this._resource, other._resource));
	}

	override copy(): EditorInput {
		return MediaPlayerEditorInput.create(this._instantiationService, this.kind, this._resource, this.group);
	}

	override async rename(_group: GroupIdentifier, target: URI): Promise<IMoveResult> {
		// Let the resolver pick the editor for the new name, which may no longer be a media file
		return { editor: { resource: target } };
	}

	override async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const target = await saveMediaFileAs(this._resource, this._fileService, this._fileDialogService, options);
		return target ? (await this.rename(group, target)).editor : undefined;
	}

	override toUntyped(): IResourceEditorInput {
		return {
			resource: this._resource,
			options: {
				override: this.editorId,
			},
		};
	}

	override async resolve(): Promise<null> {
		this._rendered ??= this._initialRender();
		await this._rendered;
		return null;
	}

	private async _initialRender(): Promise<void> {
		await this._render();
		if (this.isDisposed()) {
			return;
		}

		const renderScheduler = this._register(new RunOnceScheduler(() => void this._render(), 100));
		const onDidFilesChange = (e: FileChangesEvent) => {
			if (e.contains(this._resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				renderScheduler.schedule();
			}
		};
		const watcher = this._register(this._fileService.createWatcher(this._resource, { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(onDidFilesChange));
		// File systems contributed by extensions only report uncorrelated changes
		this._register(this._fileService.onDidFilesChange(onDidFilesChange));
	}

	private async _render(): Promise<void> {
		// The message is shown in the webview rather than as an editor error, so the other side of
		// a diff stays visible
		const isGitLfs = await isGitLfsPointer(this._fileService, this._resource);
		if (this.isDisposed()) {
			return;
		}

		this.webview.setHtml(this._getHtml(isGitLfs));
		void this._updateFileSize();
	}

	private async _updateFileSize(): Promise<void> {
		try {
			const stat = await this._fileService.stat(this._resource);
			this._fileSize = stat.size;
		} catch {
			this._fileSize = undefined;
		}

		if (!this.isDisposed()) {
			this._onDidChangeFileSize.fire();
		}
	}

	private _getHtml(isGitLfs: boolean): string {
		// Avoid cache busting if there is already a query string
		const webviewUri = asWebviewUri(this._resource);
		const src = this._resource.query ? webviewUri : webviewUri.with({ query: `version=${Date.now()}` });
		const nonce = generateUuid();

		let media: string;
		let errorMessage: string;
		if (this.kind === 'audio') {
			media = `<audio src="${escapeDoubleQuotes(escape(src.toString()))}" controls></audio>`;
			errorMessage = isGitLfs
				? localize('audioPreview.gitLfs', "The audio file is stored with Git LFS and is not available for preview.")
				: localize('audioPreview.loadError', "An error occurred while loading the audio file.");
		} else {
			const autoPlay = this._configurationService.getValue<boolean>(VIDEO_PREVIEW_AUTO_PLAY_SETTING) === true;
			const loop = this._configurationService.getValue<boolean>(VIDEO_PREVIEW_LOOP_SETTING) === true;
			media = `<video src="${escapeDoubleQuotes(escape(src.toString()))}" controls playsinline${autoPlay ? ' autoplay muted' : ''}${loop ? ' loop' : ''}></video>`;
			errorMessage = isGitLfs
				? localize('videoPreview.gitLfs', "The video file is stored with Git LFS and is not available for preview.")
				: localize('videoPreview.loadError', "An error occurred while loading the video file.");
		}
		if (isGitLfs) {
			// The file only contains a pointer to the media, so don't try to play it
			media = '';
		}
		const openInTextEditor = localize('mediaPreview.openInTextEditor', "Open in Text Editor");

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webviewGenericCspSource} blob:; connect-src ${webviewGenericCspSource}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
	<style nonce="${nonce}">
		html, body {
			width: 100%;
			height: 100%;
			margin: 0;
			overflow: hidden;
		}
		body {
			box-sizing: border-box;
			padding: 5px 10px;
			display: flex;
			justify-content: center;
			align-items: center;
			text-align: center;
			-webkit-user-select: none;
			user-select: none;
		}
		video {
			max-width: 100%;
			max-height: 100%;
		}
		.load-error {
			display: none;
		}
		body.error audio,
		body.error video {
			display: none;
		}
		body.error .load-error {
			display: block;
		}
	</style>
</head>
<body${isGitLfs ? ' class="error"' : ''} data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
	${media}
	<div class="load-error">
		<p>${escape(errorMessage)}</p>
		<a href="#" class="open-in-text-editor">${escape(openInTextEditor)}</a>
	</div>
	<script nonce="${nonce}">
		(function () {
			const vscode = acquireVsCodeApi();
			const media = document.querySelector('audio, video');
			const showError = () => document.body.classList.add('error');

			// Some Electron builds ship an FFmpeg without the WebM container, so a WebM file
			// cannot be opened directly. Media Source Extensions parse WebM in Chromium itself.
			// Remove this fallback once the shipped FFmpeg supports WebM:
			// https://github.com/microsoft/vscode/issues/195758
			const webmCodecs = { V_VP8: 'vp8', V_VP9: 'vp9', V_AV1: 'av01.0.08M.08', A_OPUS: 'opus', A_VORBIS: 'vorbis' };
			// Bounds the memory the fallback may use; this limit only applies after normal playback failed
			const maxWebmBytes = 200 * 1024 * 1024;
			const isWebm = bytes => bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
			const getWebmType = bytes => {
				const header = Array.from(bytes.subarray(0, 65536), byte => String.fromCharCode(byte)).join('');
				const codecs = Object.keys(webmCodecs).filter(id => header.includes(id)).map(id => webmCodecs[id]);
				return codecs.length ? 'video/webm; codecs="' + codecs.join(',') + '"' : undefined;
			};
			const concat = (chunks, size) => {
				const bytes = new Uint8Array(size);
				let offset = 0;
				for (const chunk of chunks) {
					bytes.set(chunk, offset);
					offset += chunk.length;
				}
				return bytes;
			};
			// Streams the file so that other formats and oversized files are rejected without reading them completely
			const readWebm = async url => {
				const response = await fetch(url);
				if (!response.ok || !response.body) {
					throw new Error('Failed to load media: ' + response.status);
				}
				if (Number(response.headers.get('Content-Length')) > maxWebmBytes) {
					throw new Error('Media too large');
				}
				const reader = response.body.getReader();
				const chunks = [];
				let size = 0;
				let checkedSignature = false;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						chunks.push(value);
						size += value.length;
						if (size > maxWebmBytes) {
							throw new Error('Media too large');
						}
						if (!checkedSignature && size >= 4) {
							checkedSignature = true;
							if (!isWebm(concat(chunks, size))) {
								throw new Error('Unsupported media');
							}
						}
					}
				} finally {
					reader.cancel().catch(() => { });
				}
				if (!checkedSignature) {
					throw new Error('Unsupported media');
				}
				return concat(chunks, size);
			};
			const playWithMediaSource = async video => {
				const bytes = await readWebm(video.currentSrc || video.src);
				const type = getWebmType(bytes);
				if (!type || typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(type)) {
					throw new Error('Unsupported media');
				}
				const source = new MediaSource();
				const url = URL.createObjectURL(source);
				const opened = new Promise(resolve => source.addEventListener('sourceopen', resolve, { once: true }));
				video.src = url;
				await opened;
				URL.revokeObjectURL(url);
				const buffer = source.addSourceBuffer(type);
				await new Promise((resolve, reject) => {
					buffer.addEventListener('updateend', resolve, { once: true });
					buffer.addEventListener('error', reject, { once: true });
					buffer.appendBuffer(bytes);
				});
				source.endOfStream();
			};

			let triedMediaSource = false;
			media?.addEventListener('error', () => {
				if (media instanceof HTMLVideoElement && !triedMediaSource && media.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
					triedMediaSource = true;
					playWithMediaSource(media).catch(showError);
					return;
				}
				showError();
			});
			document.querySelector('.open-in-text-editor').addEventListener('click', e => {
				e.preventDefault();
				vscode.postMessage({ type: 'reopen-as-text' });
			});
		}());
	</script>
</body>
</html>`;
	}
}
