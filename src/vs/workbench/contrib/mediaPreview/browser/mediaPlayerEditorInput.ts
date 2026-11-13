/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { escapeDoubleQuotes } from '../../../../base/common/htmlContent.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { isNative } from '../../../../base/common/platform.js';
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
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities, GroupIdentifier, IMoveResult, ISaveOptions, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICustomEditorCompatibleInput } from '../../customEditor/common/customEditor.js';
import { IOverlayWebview, IWebviewService } from '../../webview/browser/webview.js';
import { asWebviewUri, webviewGenericCspSource } from '../../webview/common/webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IMediaInfo, IMediaTrack, readMediaInfo } from '../common/mediaCodecs.js';
import { AUDIO_PREVIEW_EDITOR_ID, isGitLfsPointer, VIDEO_PREVIEW_AUTO_PLAY_SETTING, VIDEO_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_LOOP_SETTING } from '../common/mediaPreview.js';
import { reopenInTextEditor } from './mediaPreviewErrors.js';
import { saveMediaFileAs } from './mediaPreviewSaveAs.js';

export type MediaPlayerKind = 'audio' | 'video';

// Bounds the memory that playing a WebM file through Media Source Extensions may use, which only
// happens after normal playback failed
const maxMediaSourceSize = 200 * 1024 * 1024;

/**
 * Button below a codec warning, which sends a message of the given type to the editor input when clicked.
 */
interface ICodecWarningAction {
	readonly label: string;
	readonly message: 'open-externally' | 'reopen-as-text';
}

function getOpenInTextEditorLabel(): string {
	return localize('mediaPreview.openInTextEditor', "Open in Text Editor");
}

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
export class MediaPlayerEditorInput extends WebviewInput implements ICustomEditorCompatibleInput {

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
	private _mediaInfo: Promise<IMediaInfo | undefined> = Promise.resolve(undefined);

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
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super({ viewType: getMediaPlayerEditorId(kind), providedId: undefined, name: basename(_resource), iconPath: undefined }, webview, themeService);

		this._register(webview.onMessage(e => {
			if (e.message?.type === 'reopen-as-text') {
				void reopenInTextEditor(this, this._editorService);
			} else if (e.message?.type === 'open-externally') {
				this._openExternally();
			} else if (e.message?.type === 'get-codecs') {
				void this._postCodecs();
			} else if (e.message?.type === 'get-webm-type') {
				void this._postWebmType();
			}
		}));
	}

	override get typeId(): string {
		return MediaPlayerEditorInput.typeId;
	}

	override get resource(): URI {
		return this._resource;
	}

	get customEditorViewType(): string {
		return this.viewType;
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

		// Read the codecs while the webview loads, since reading them can be slow for remote files
		this._mediaInfo = isGitLfs ? Promise.resolve(undefined) : readMediaInfo(this._fileService, this._resource);
		this.webview.setHtml(this._getHtml(isGitLfs));
		void this._updateFileSize();
	}

	/**
	 * Sends the video and audio codecs of the file to the webview, which warns if it can't play any
	 * codec of a kind. The webview requests them whenever its content loads, so the warning survives
	 * the webview being recreated, such as when the editor moves to another window.
	 */
	private async _postCodecs(): Promise<void> {
		const mediaInfo = this._mediaInfo;
		const info = await mediaInfo;
		// The webview of a newer render requests its own codecs
		if (!info || this.isDisposed() || mediaInfo !== this._mediaInfo) {
			return;
		}

		const openExternally: ICodecWarningAction[] = this._canOpenExternally() ? [{ label: localize('mediaPreview.openExternally', "Open File"), message: 'open-externally' }] : [];
		const openInTextEditor: ICodecWarningAction = { label: getOpenInTextEditorLabel(), message: 'reopen-as-text' };
		const getCodecs = (kind: IMediaTrack['kind']) => {
			const tracks = info.tracks.filter(track => track.kind === kind);
			return tracks.length ? {
				mimeTypes: tracks.map(track => `${kind}/${info.container}; codecs="${track.codec}"`),
				warning: this._getUnsupportedCodecWarning(tracks[0]),
				// Only a file whose own kind of track can't be played fails to load
				actions: kind === this.kind ? [...openExternally, openInTextEditor] : openExternally,
			} : undefined;
		};
		const video = this.kind === 'video' ? getCodecs('video') : undefined;
		const audio = getCodecs('audio');
		if (video || audio) {
			void this.webview.postMessage({ type: 'codecs', video, audio });
		}
	}

	/**
	 * Sends the type of a WebM file, with the codecs of all its tracks, to the webview, which needs
	 * it to play the file through Media Source Extensions if it can't be played directly.
	 */
	private async _postWebmType(): Promise<void> {
		const mediaInfo = this._mediaInfo;
		// Media Source Extensions need the whole file anyway, so it may also be read as a whole to
		// find the codecs of files that are too large otherwise
		const info = await mediaInfo ?? await readMediaInfo(this._fileService, this._resource, maxMediaSourceSize);
		if (this.isDisposed() || mediaInfo !== this._mediaInfo) {
			return;
		}

		const codecs = info?.container === 'webm' ? [...new Set(info.tracks.map(track => track.codec))] : [];
		void this.webview.postMessage({
			type: 'webm-type',
			mimeType: codecs.length ? `video/webm; codecs="${codecs.join(',')}"` : undefined,
		});
	}

	private _getUnsupportedCodecWarning(track: IMediaTrack): string {
		if (track.kind === 'video') {
			return track.name
				? localize('videoPreview.unsupportedVideoCodec', "This video uses the {0} codec, which can't be played in the video preview.", track.name)
				: localize('videoPreview.unsupportedUnknownVideoCodec', "This video uses a codec that can't be played in the video preview.");
		}
		if (this.kind === 'audio') {
			return track.name
				? localize('audioPreview.unsupportedCodec', "This audio file uses the {0} codec, which can't be played in the audio preview.", track.name)
				: localize('audioPreview.unsupportedUnknownCodec', "This audio file uses a codec that can't be played in the audio preview.");
		}
		return track.name
			? localize('videoPreview.unsupportedAudioCodec', "This video's audio uses the {0} codec, which can't be played in the video preview.", track.name)
			: localize('videoPreview.unsupportedUnknownAudioCodec', "This video's audio uses a codec that can't be played in the video preview.");
	}

	/**
	 * Whether the file can be opened in the application the OS associates with it. The OS picks that
	 * application by the file's extension and the preview can show any file, so only files with a
	 * media extension are opened, never ones that the OS would run.
	 */
	private _canOpenExternally(): boolean {
		const mimeType = getMediaMime(this._resource.path);
		return isNative && this._resource.scheme === Schemas.file && !!mimeType && /^(audio|video)\//.test(mimeType);
	}

	private _openExternally(): void {
		if (this._canOpenExternally()) {
			void this._openerService.open(this._resource, { openExternal: true });
		}
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
		const openInTextEditor = getOpenInTextEditorLabel();

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
			flex-direction: column;
			justify-content: center;
			align-items: center;
			text-align: center;
			-webkit-user-select: none;
			user-select: none;
		}
		video {
			max-width: 100%;
			max-height: 100%;
			min-height: 0;
		}
		.codec-warning {
			flex-shrink: 0;
			max-width: 600px;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: var(--vscode-spacing-size120);
		}
		/* Separates the warning from media that still plays, such as a video whose audio can't be played */
		body:not(.error) .codec-warning:has(.codec-warning-message:not(:empty)) {
			margin-bottom: var(--vscode-spacing-size120);
		}
		.codec-warning-actions {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			gap: var(--vscode-spacing-size80);
		}
		.codec-warning-actions:empty {
			display: none;
		}
		.codec-warning-actions button {
			padding: var(--vscode-spacing-size40) var(--vscode-spacing-size80);
			border: var(--vscode-strokeThickness) solid var(--vscode-button-border, transparent);
			border-radius: var(--vscode-cornerRadius-small);
			color: var(--vscode-button-foreground);
			background-color: var(--vscode-button-background);
			font-family: inherit;
			font-size: var(--vscode-fontSize-label1);
			line-height: 16px;
			cursor: pointer;
		}
		.codec-warning-actions button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.codec-warning-actions button.secondary {
			border-color: var(--vscode-button-secondaryBorder, var(--vscode-button-border, transparent));
			color: var(--vscode-button-secondaryForeground);
			background-color: var(--vscode-button-secondaryBackground);
		}
		.codec-warning-actions button.secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		.codec-warning-actions button:focus-visible {
			outline: var(--vscode-strokeThickness) solid var(--vscode-focusBorder);
			outline-offset: 2px;
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
		/* Media whose own kind of track can't be played fails to load, which the codec warning already explains */
		body.error.unsupported-codec .load-error {
			display: none;
		}
	</style>
</head>
<body${isGitLfs ? ' class="error"' : ''} data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
	<div class="codec-warning">
		<div class="codec-warning-message" role="status"></div>
		<div class="codec-warning-actions"></div>
	</div>
	${media}
	<div class="load-error">
		<p class="load-error-message">${escape(errorMessage)}</p>
		<a href="#" class="open-in-text-editor">${escape(openInTextEditor)}</a>
	</div>
	<script nonce="${nonce}">
		(function () {
			const vscode = acquireVsCodeApi();
			const media = document.querySelector('audio, video');
			const showError = () => document.body.classList.add('error');

			// Browsers don't explain why a file fails to load and silently drop audio tracks they can't
			// decode, so warn about codecs that can't be played instead of letting the file seem broken
			const showCodecWarning = ({ warning, actions }) => {
				document.querySelector('.codec-warning-message').textContent = warning;
				document.querySelector('.codec-warning-actions').replaceChildren(...actions.map(({ label, message }, index) => {
					const button = document.createElement('button');
					button.textContent = label;
					// The first action is the main one
					button.classList.toggle('secondary', index > 0);
					button.addEventListener('click', () => vscode.postMessage({ type: message }));
					return button;
				}));
			};
			const checkCodecs = ({ video, audio }) => {
				if (!media) {
					return;
				}
				const canPlay = type => media.canPlayType(type) !== '' || (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type));
				const isUnsupported = codecs => codecs && !codecs.mimeTypes.some(canPlay);
				// The audio of a video that can't be played doesn't matter
				const unsupported = isUnsupported(video) ? video : isUnsupported(audio) ? audio : undefined;
				if (unsupported) {
					showCodecWarning(unsupported);
					document.body.classList.toggle('unsupported-codec', unsupported === (media instanceof HTMLVideoElement ? video : audio));
				}
			};

			// Some Electron builds ship an FFmpeg without the WebM container, so a WebM file
			// cannot be opened directly. Media Source Extensions parse WebM in Chromium itself.
			// Remove this fallback once the shipped FFmpeg supports WebM:
			// https://github.com/microsoft/vscode/issues/195758
			const maxMediaSourceBytes = ${maxMediaSourceSize};
			let resolveWebmType;
			const getWebmType = () => new Promise(resolve => {
				resolveWebmType = resolve;
				vscode.postMessage({ type: 'get-webm-type' });
			});
			const concat = (chunks, size) => {
				const bytes = new Uint8Array(size);
				let offset = 0;
				for (const chunk of chunks) {
					bytes.set(chunk, offset);
					offset += chunk.length;
				}
				return bytes;
			};
			// Streams the file so that oversized files are rejected without reading them completely
			const readMedia = async url => {
				const response = await fetch(url);
				if (!response.ok || !response.body) {
					throw new Error('Failed to load media: ' + response.status);
				}
				if (Number(response.headers.get('Content-Length')) > maxMediaSourceBytes) {
					throw new Error('Media too large');
				}
				const reader = response.body.getReader();
				const chunks = [];
				let size = 0;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						chunks.push(value);
						size += value.length;
						if (size > maxMediaSourceBytes) {
							throw new Error('Media too large');
						}
					}
				} finally {
					reader.cancel().catch(() => { });
				}
				return concat(chunks, size);
			};
			const playWithMediaSource = async video => {
				// Get the type first, so that other formats are rejected without reading them
				const type = await getWebmType();
				if (!type || typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(type)) {
					throw new Error('Unsupported media');
				}
				const bytes = await readMedia(video.currentSrc || video.src);
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

			window.addEventListener('message', e => {
				if (e.data?.type === 'codecs') {
					checkCodecs(e.data);
				} else if (e.data?.type === 'webm-type') {
					resolveWebmType?.(e.data.mimeType);
				}
			});
			vscode.postMessage({ type: 'get-codecs' });

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
