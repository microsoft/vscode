/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../../../base/common/mime.js';
import { FileAccess, Schemas } from '../../../../../../base/common/network.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { isMacintosh, isWindows } from '../../../../../../base/common/platform.js';
import { basename, dirname, joinPath } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { isHighContrast } from '../../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ChatMediaKind, getChatMediaWebm, IChatMediaItem } from '../../../common/chatMediaPreview.js';
import { IChatMediaPreviewPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatImageCarouselService } from '../../chatImageCarouselService.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import './media/chatMediaPreview.css';

/** Where a file that isn't served from disk (as in the web) is read into memory, at most this much. */
const maxReadBytes = 64 * 1024 * 1024;
const slideImagePattern = /\.(png|jpe?g|webp)$/i;

/** What a preview keeps while the chat re-renders its response. */
interface IChatMediaPreviewState {
	ready: boolean;
	expanded: boolean;
	page: number;
	time: number;
}

/**
 * The videos and decks a turn records, at the top of its response: cards that grow into players. The part is
 * created once per turn, even before there is media, and adds each card in place, so it stays first while the
 * response streams.
 */
export class ChatMediaPreviewContentPart extends Disposable implements IChatContentPart {

	private static readonly _states = new WeakMap<IChatContentPartRenderContext['element'], Map<string, IChatMediaPreviewState>>();

	readonly domNode = dom.$('.chat-media-preview-part');
	private readonly _element: IChatContentPartRenderContext['element'];
	private readonly _statesByUri: Map<string, IChatMediaPreviewState>;
	private readonly _shown = new Set<string>();

	constructor(
		content: IChatMediaPreviewPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._element = context.element;
		let states = ChatMediaPreviewContentPart._states.get(context.element);
		if (!states) {
			states = new Map();
			ChatMediaPreviewContentPart._states.set(context.element, states);
		}
		this._statesByUri = states;
		this._addCards(content.items);
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		if (other.kind !== 'mediaPreview' || element !== this._element) {
			return false;
		}
		this._addCards(other.items);
		return true;
	}

	private _addCards(items: readonly IChatMediaItem[]): void {
		for (const item of items) {
			const key = item.uri.toString();
			if (this._shown.has(key)) {
				continue;
			}
			this._shown.add(key);
			const state = this._statesByUri.get(key) ?? { ready: false, expanded: false, page: 0, time: 0 };
			this._statesByUri.set(key, state);
			this.domNode.appendChild(this._register(this._instantiationService.createInstance(ChatMediaPreview, item, state)).domNode);
		}
	}
}

/**
 * A video or deck shown as a card: its picture, title and a button. The same
 * frame grows into a full-width player in place, and shrinks back on Collapse.
 */
class ChatMediaPreview extends Disposable {

	readonly domNode: HTMLElement;
	private readonly _frame: HTMLElement;
	private readonly _info: HTMLElement;
	private readonly _meta: HTMLElement;
	private readonly _button: Button;
	private readonly _actions: ActionBar;
	private readonly _video: HTMLVideoElement | undefined;
	private readonly _pages = observableValue<readonly URI[]>(this, []);
	private readonly _page = observableValue(this, 0);
	private readonly _urls = new Map<string, Promise<string | undefined>>();
	private _morphing = false;

	constructor(
		private readonly _item: IChatMediaItem,
		private readonly _state: IChatMediaPreviewState,
		@IFileService private readonly _fileService: IFileService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IThemeService private readonly _themeService: IThemeService,
		@IChatImageCarouselService private readonly _chatImageCarouselService: IChatImageCarouselService,
	) {
		super();
		const isVideo = _item.kind === ChatMediaKind.Video;
		this.domNode = dom.$(`.chat-media-preview.${isVideo ? 'kind-video' : 'kind-deck'}`);
		this.domNode.hidden = !_state.ready;
		this._frame = dom.append(this.domNode, dom.$('.chat-media-preview-frame'));
		this._info = dom.append(this.domNode, dom.$('.chat-media-preview-info'));
		const text = dom.append(this._info, dom.$('.chat-media-preview-text'));
		dom.append(text, dom.$('.chat-media-preview-title', undefined, _item.label));
		this._meta = dom.append(text, dom.$('.chat-media-preview-meta'));
		this._button = this._register(new Button(this._info, { ...defaultButtonStyles, supportIcons: true }));
		this._button.label = isVideo
			? `$(play) ${localize('chatMediaPreview.playVideo', "Play Video")}`
			: `$(preview) ${localize('chatMediaPreview.viewSlides', "View Slides")}`;
		this._register(this._button.onDidClick(() => this._toggle(true)));
		this._actions = this._register(new ActionBar(dom.append(this._info, dom.$('.chat-media-preview-actions')), {
			ariaLabel: localize('chatMediaPreview.actions', "{0} actions", _item.label),
		}));
		this._register(dom.addDisposableListener(this._frame, dom.EventType.CLICK, () => {
			if (!this._state.expanded) {
				this._toggle(true);
			} else if (!isVideo) {
				this._openSlidesFullScreen();
			}
		}));

		if (isVideo) {
			this._video = this._renderVideo();
		} else {
			this._renderSlides();
		}
		this._applyLayout(_state.expanded);
	}

	private _renderVideo(): HTMLVideoElement {
		const video = dom.append(this._frame, dom.$<HTMLVideoElement>('video', { controlslist: 'nodownload noplaybackrate', 'aria-label': localize('chatMediaPreview.videoLabel', "Video: {0}", this._item.label) }));
		video.preload = 'auto';
		video.disablePictureInPicture = true;
		dom.append(this._frame, dom.$('span.chat-media-preview-play', { 'aria-hidden': 'true' }, renderIcon(Codicon.play)));
		this._register(dom.addDisposableListener(video, 'loadeddata', () => {
			video.currentTime = this._state.time;
			const seconds = Math.floor(video.duration);
			this._setMeta(localize('chatMediaPreview.video', "Video"), `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
			this._setReady(true);
		}));
		this._register(dom.addDisposableListener(video, 'timeupdate', () => this._state.time = video.currentTime));
		this._register(dom.addDisposableListener(video, 'error', () => this._setReady(false)));
		this._register(toDisposable(() => video.pause()));
		// VS Code's window decodes WebM but not MP4, so it plays the WebM the skill delivers beside the recorded video.
		this._url(getChatMediaWebm(this._item.uri), 'video/webm').then(url => {
			if (url) {
				video.src = url;
			} else {
				this._setReady(false);
			}
		});
		return video;
	}

	private async _renderSlides(): Promise<void> {
		this._frame.setAttribute('role', 'group');
		this._frame.setAttribute('aria-label', localize('chatMediaPreview.slidesLabel', "Slides: {0}", this._item.label));
		const strip = this.domNode.insertBefore(dom.$('.chat-media-preview-strip', { 'aria-hidden': 'true' }), this._info);
		const image = dom.append(this._frame, dom.$<HTMLImageElement>('img'));
		const counter = dom.append(this._frame, dom.$('span.chat-media-preview-counter'));
		const previous = this._navButton(Codicon.chevronLeft, localize('chatMediaPreview.previousSlide', "Previous Slide"), -1);
		const next = this._navButton(Codicon.chevronRight, localize('chatMediaPreview.nextSlide', "Next Slide"), 1);
		this._register(dom.addDisposableListener(this._frame, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			const count = this._pages.get().length;
			if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Home) || event.equals(KeyCode.End)) {
				this._goToPage(event.equals(KeyCode.Home) ? 0 : event.equals(KeyCode.End) ? count - 1 : this._page.get() + (event.equals(KeyCode.LeftArrow) ? -1 : 1));
			} else if (event.equals(KeyCode.Enter)) {
				if (e.target !== this._frame) {
					// The chat list would cancel the click that Enter gives a focused slide button.
					e.stopPropagation();
					return;
				}
				this._openSlidesFullScreen();
			} else {
				return;
			}
			dom.EventHelper.stop(e, true);
		}));

		let pages: URI[] = [];
		try {
			const folder = await this._fileService.resolve(joinPath(dirname(this._item.uri), 'slides'));
			pages = (folder.children ?? [])
				.filter(child => child.isFile && slideImagePattern.test(child.name))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
				.map(child => child.resource);
		} catch {
			// A deck without page images stays hidden; its artifact pill still opens the PDF.
		}
		if (this._store.isDisposed || !pages.length) {
			return;
		}
		this._page.set(Math.min(this._state.page, pages.length - 1), undefined);
		this._pages.set(pages, undefined);
		this._setMeta(localize('chatMediaPreview.slideDeck', "Slide Deck"), pages.length === 1
			? localize('chatMediaPreview.oneSlide', "1 slide")
			: localize('chatMediaPreview.slides', "{0} slides", pages.length));
		this._setReady(true);

		const thumbnails = pages.map((page, index) => {
			const thumbnail = dom.append(strip, dom.$<HTMLImageElement>('img', { loading: 'lazy' }));
			this._url(page, 'image/png').then(url => {
				if (url) {
					thumbnail.src = url;
				}
			});
			this._register(dom.addDisposableListener(thumbnail, dom.EventType.CLICK, () => {
				this._goToPage(index);
				this._frame.focus({ preventScroll: true });
			}));
			return thumbnail;
		});
		this._register(autorun(reader => {
			const index = this._page.read(reader);
			image.alt = localize('chatMediaPreview.slideAlt', "Slide {0} of {1}", index + 1, pages.length);
			counter.textContent = `${index + 1} / ${pages.length}`;
			previous.setAttribute('aria-disabled', String(index === 0));
			next.setAttribute('aria-disabled', String(index === pages.length - 1));
			thumbnails.forEach((thumbnail, thumbnailIndex) => thumbnail.classList.toggle('selected', thumbnailIndex === index));
			this._url(pages[index], 'image/png').then(url => {
				if (url && this._page.read(undefined) === index) {
					image.src = url;
				}
			});
		}));
	}

	private _navButton(icon: ThemeIcon, label: string, step: number): HTMLButtonElement {
		const button = dom.append(this._frame, dom.$<HTMLButtonElement>('button.chat-media-preview-nav', { type: 'button', 'aria-label': label, title: label }, renderIcon(icon)));
		this._register(dom.addDisposableListener(button, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._goToPage(this._page.get() + step);
		}));
		return button;
	}

	private _setMeta(kind: string, detail: string): void {
		this._meta.textContent = [kind, detail, basename(this._item.uri)].join(' \u00b7 ');
	}

	private _setReady(ready: boolean): void {
		this._state.ready = ready;
		this.domNode.hidden = !ready;
	}

	/** A URL for a local file: served from disk on desktop, otherwise read into memory. */
	private _url(uri: URI, fallbackMime: string): Promise<string | undefined> {
		let url = this._urls.get(uri.toString());
		if (!url) {
			const browserUri = FileAccess.uriToBrowserUri(uri);
			url = browserUri.scheme === Schemas.vscodeFileResource ? Promise.resolve(browserUri.toString(true)) : this._readIntoBlob(uri, fallbackMime);
			this._urls.set(uri.toString(), url);
		}
		return url;
	}

	private async _readIntoBlob(uri: URI, fallbackMime: string): Promise<string | undefined> {
		try {
			const content = await this._fileService.readFile(uri, { limits: { size: maxReadBytes } });
			if (this._store.isDisposed) {
				return undefined;
			}
			const url = URL.createObjectURL(new Blob([content.value.buffer as Uint8Array<ArrayBuffer>], { type: getMediaMime(uri.path) ?? fallbackMime }));
			this._register(toDisposable(() => URL.revokeObjectURL(url)));
			return url;
		} catch {
			return undefined;
		}
	}

	private _applyLayout(expanded: boolean): void {
		this._state.expanded = expanded;
		this.domNode.classList.toggle('expanded', expanded);
		if (this._video) {
			this._video.controls = expanded;
			this._video.tabIndex = expanded ? 0 : -1;
		} else {
			this._frame.tabIndex = expanded ? 0 : -1;
		}
		this._actions.clear();
		this._actions.push([
			toAction({
				id: 'chatMediaPreview.reveal',
				label: isMacintosh ? localize('chatMediaPreview.revealMac', "Reveal in Finder") : isWindows ? localize('chatMediaPreview.revealWindows', "Reveal in File Explorer") : localize('chatMediaPreview.revealLinux', "Open Containing Folder"),
				class: ThemeIcon.asClassName(Codicon.folderOpened),
				run: () => this._commandService.executeCommand('revealFileInOS', this._item.uri),
			}),
			toAction({
				id: 'chatMediaPreview.copyPath',
				label: localize('chatMediaPreview.copyPath', "Copy Path"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => this._clipboardService.writeText(this._item.uri.fsPath),
			}),
			...(expanded ? [toAction({
				id: 'chatMediaPreview.collapse',
				label: localize('chatMediaPreview.collapse', "Collapse"),
				class: ThemeIcon.asClassName(Codicon.chevronUp),
				run: () => this._toggle(false),
			})] : []),
		], { icon: true, label: false });
	}

	/** Grows the card's picture into the player, or shrinks it back, moving the frame from where it was. */
	private _toggle(expanded: boolean): void {
		if (this._morphing || this._state.expanded === expanded) {
			return;
		}
		// Keeps the chat anchored on the preview instead of the bottom of the list while the height changes.
		this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
		const from = this._frame.getBoundingClientRect();
		const fromHeight = this.domNode.offsetHeight;
		if (!expanded) {
			this._video?.pause();
		}
		this._applyLayout(expanded);
		const to = this._frame.getBoundingClientRect();
		if (from.width && to.width && !this._accessibilityService.isMotionReduced() && !isHighContrast(this._themeService.getColorTheme().type)) {
			const timing: KeyframeAnimationOptions = { duration: 340, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
			const animations = [
				this.domNode.animate([{ height: `${fromHeight}px` }, { height: `${this.domNode.offsetHeight}px` }], timing),
				this._frame.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` }, { transform: 'none' }], timing),
				this._info.animate([{ opacity: 0 }, { opacity: 1 }], timing),
			];
			// The chat keeps a toggled part in place only while its height changes every frame, and an
			// animation otherwise holds its first frame for the next one, so they start on this frame.
			const startTime = this.domNode.ownerDocument.timeline.currentTime;
			for (const animation of animations) {
				animation.startTime = startTime;
			}
			this._morphing = true;
			this.domNode.classList.add('morphing');
			Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
				this._morphing = false;
				this.domNode.classList.remove('morphing');
			});
		}
		if (expanded) {
			(this._video ?? this._frame).focus({ preventScroll: true });
			this._video?.play().catch(() => { /* playback needs another gesture */ });
		} else {
			this._button.focus();
		}
	}

	private _goToPage(index: number): void {
		const count = this._pages.get().length;
		const page = Math.max(0, Math.min(count - 1, index));
		if (count && page !== this._page.get()) {
			this._state.page = page;
			this._page.set(page, undefined);
			status(localize('chatMediaPreview.slidePosition', "Slide {0} of {1}", page + 1, count));
		}
	}

	private _openSlidesFullScreen(): void {
		const pages = this._pages.get();
		this._chatImageCarouselService.openCarouselAtResource(pages[this._page.get()], undefined, {
			additionalImages: pages.map(page => ({ uri: page, mimeType: getMediaMime(page.path) ?? 'image/png', name: basename(page) })),
		});
	}
}
