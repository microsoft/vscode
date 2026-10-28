/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, DisposableResizeObserver, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { IPixelRatioMonitor, PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../common/constants.js';
import { chatWorkingProgressInsidersIconForeground, chatWorkingProgressStableIconForeground } from '../../common/widget/chatColors.js';
import { CHAT_WORKING_LOGO_DRAW_PAINT_ORDER, ChatWorkingLogoDrawBand, chatWorkingLogoDrawDuration, chatWorkingLogoFacePaths, getChatWorkingLogoDrawFrame } from './chatWorkingLogoDraw.js';
import { acquireChatWorkingLogoAtlas, getChatWorkingLogoAtlasKeyframes, hasChatWorkingLogoAtlas, loadChatWorkingLogoAtlasImage } from './chatWorkingLogoAtlas.js';
import './media/chatWorkingLogo.css';

const fallbackFrameRate = 60;
/**
 * Generating an atlas costs main-thread time, so it must not compete with preparing and sending a request.
 * New atlases are only generated once an indicator has been animating this long, by which point the request
 * has been sent; atlases that already exist in the window are used immediately.
 */
const atlasPreparationDelay = 2000;
let drawMaskIdPool = 0;

function isDrawAnimation(animation: ChatProgressAnimation): boolean {
	return animation === ChatProgressAnimation.Draw || animation === ChatProgressAnimation.DrawMonochrome;
}

function observeVisibility(element: HTMLElement, onDidChange: (visible: boolean) => void, intersectionObserver?: typeof IntersectionObserver): IDisposable {
	let disposed = false;
	let observer: IntersectionObserver | undefined;
	let visibilityListener: IDisposable | undefined;
	onDidChange(false);
	queueMicrotask(() => {
		if (disposed) {
			return;
		}
		const targetWindow = getWindow(element);
		const Observer = intersectionObserver ?? targetWindow.IntersectionObserver;
		if (typeof Observer !== 'function') {
			onDidChange(true);
			return;
		}
		let intersecting = false;
		const update = () => onDidChange(!targetWindow.document.hidden && intersecting);
		observer = new Observer(entries => {
			const entry = findLast(entries, entry => entry.target === element);
			if (entry) {
				intersecting = entry.isIntersecting;
				update();
			}
		});
		visibilityListener = addDisposableListener(targetWindow.document, 'visibilitychange', update);
		observer.observe(element);
	});
	return toDisposable(() => {
		disposed = true;
		observer?.disconnect();
		visibilityListener?.dispose();
	});
}

/** Plays the product mark from a shared 120 Hz atlas, with a 60 Hz SVG fallback and static reduced-motion artwork. */
export class ChatWorkingLogo extends Disposable {
	readonly domNode: HTMLElement;
	readonly drawDurationMs = chatWorkingLogoDrawDuration;

	private animationFrame: MutableDisposable<IDisposable> | undefined;
	private readonly atlasRequest = this._register(new MutableDisposable<DisposableStore>());
	private readonly atlasRefresh = this._register(new MutableDisposable<IDisposable>());
	private readonly windowDisposables = this._register(new DisposableStore());
	private atlasKey: string | undefined;
	private atlasPlaying = false;
	private targetWindow: Window | undefined;
	private pixelRatio: IPixelRatioMonitor | undefined;
	private drawPaths: Map<ChatWorkingLogoDrawBand, SVGPathElement> | undefined;
	private drawPathData: Map<ChatWorkingLogoDrawBand, string> | undefined;
	private readonly now: () => number;
	private readonly scheduleFrame: (targetWindow: Window, runner: () => void) => IDisposable;
	private readonly isMotionReducedOverride: (() => boolean) | undefined;
	private animation = ChatProgressAnimation.Off;
	private active = false;
	private visible = false;
	private animationStartedAt = 0;
	private lastDrawFrame = -1;

	constructor(
		animation: ChatProgressAnimation,
		quality: 'stable' | 'insider' = 'stable',
		private readonly animationOptions: {
			readonly now?: () => number;
			readonly scheduleFrame?: (targetWindow: Window, runner: () => void) => IDisposable;
			readonly isMotionReduced?: () => boolean;
			readonly observeVisibility?: (element: HTMLElement, onDidChange: (visible: boolean) => void) => IDisposable;
			readonly intersectionObserver?: typeof IntersectionObserver;
			readonly resizeObserver?: typeof ResizeObserver;
			readonly pixelRatio?: IPixelRatioMonitor;
			readonly acquireAtlas?: typeof acquireChatWorkingLogoAtlas;
			readonly hasAtlas?: typeof hasChatWorkingLogoAtlas;
			readonly atlasPreparationDelay?: number;
			readonly onAtlasError?: (error: Error) => void;
		} = {},
	) {
		super();
		this.domNode = $('span.chat-working-logo', { 'aria-hidden': 'true' });
		this.domNode.style.color = asCssVariable(quality === 'insider' ? chatWorkingProgressInsidersIconForeground : chatWorkingProgressStableIconForeground);
		this.now = animationOptions.now ?? (() => {
			const targetWindow = getWindow(this.domNode);
			const time = targetWindow.document.timeline.currentTime;
			return typeof time === 'number' ? time : targetWindow.performance.now();
		});
		this.scheduleFrame = animationOptions.scheduleFrame ?? ((targetWindow, runner) => scheduleAtNextAnimationFrame(targetWindow, runner));
		this.isMotionReducedOverride = animationOptions.isMotionReduced;

		const wrapper = append(this.domNode, $('span.chat-working-logo-face'));
		wrapper.appendChild($.SVG<SVGSVGElement>('svg', { viewBox: '6 6 84 84', width: '100%', height: '100%', focusable: 'false' },
			...chatWorkingLogoFacePaths.map(path => $.SVG<SVGPathElement>('path', { d: path, fill: 'currentColor' }))));
		const visibilityObserver: typeof observeVisibility = animationOptions.observeVisibility ?? observeVisibility;
		this._register(visibilityObserver(this.domNode, visible => {
			if (this.visible !== visible) {
				this.visible = visible;
				this.restartDrawAnimation();
			}
		}, animationOptions.intersectionObserver));
		this.setAnimation(animation);
		this.setActive(true);
		queueMicrotask(() => {
			if (!this._store.isDisposed) {
				this.observeSizeAndPixelRatio();
			}
		});
	}

	setAnimation(animation: ChatProgressAnimation): void {
		const noIcon = animation === ChatProgressAnimation.DrawMonochromeNoIcon;
		const draw = isDrawAnimation(animation);
		if (draw) {
			this.ensureDrawArtwork();
		}
		this.animation = animation;
		this.domNode.classList.toggle('chat-working-logo-draw', draw);
		this.domNode.classList.toggle('chat-working-logo-monochrome', animation === ChatProgressAnimation.DrawMonochrome || noIcon);
		this.domNode.classList.toggle('chat-working-logo-no-icon', noIcon);
		this.domNode.dataset.animation = animation;
		this.restartDrawAnimation();
	}

	setActive(active: boolean): void {
		if (this.active === active) {
			return;
		}
		this.active = active;
		this.domNode.classList.toggle('chat-working-logo-active', active);
		this.restartDrawAnimation();
	}

	protected refreshMotion(): void {
		this.restartDrawAnimation();
	}

	protected refreshAppearance(): void {
		this.clearAtlas();
		if (this.canAnimate()) {
			this.renderNextDrawFrame();
			this.scheduleAtlasRefresh();
		}
	}

	override dispose(): void {
		this.clearAtlas();
		this.domNode.remove();
		super.dispose();
	}

	private canAnimate(): boolean {
		return this.active && this.visible && isDrawAnimation(this.animation) && !this.isMotionReduced() && !this._store.isDisposed;
	}

	private observeSizeAndPixelRatio(): void {
		const targetWindow = getWindow(this.domNode);
		if (this.targetWindow === targetWindow) {
			return;
		}
		this.clearAtlas();
		this.windowDisposables.clear();
		this.targetWindow = targetWindow;
		this.pixelRatio = this.animationOptions.pixelRatio ?? PixelRatio.getInstance(targetWindow);
		this.windowDisposables.add(this.pixelRatio.onDidChange(() => this.refreshAppearance()));
		const resizeObserver = this.windowDisposables.add(new DisposableResizeObserver('ChatWorkingLogo.atlasSize', () => this.scheduleAtlasRefresh(), targetWindow, {
			resizeObserverCtor: this.animationOptions.resizeObserver,
		}));
		this.windowDisposables.add(resizeObserver.observe(this.domNode));
		this.windowDisposables.add(addDisposableListener(targetWindow.matchMedia('(prefers-reduced-motion: reduce)'), 'change', () => this.refreshMotion()));
		this.scheduleAtlasRefresh();
	}

	private clearAtlas(): void {
		this.atlasRefresh.clear();
		this.atlasPlaying = false;
		this.atlasRequest.clear();
		this.atlasKey = undefined;
		this.domNode.classList.remove('chat-working-logo-atlas');
	}

	private scheduleAtlasRefresh(): void {
		if (this.atlasRefresh.value || !this.canAnimate()) {
			return;
		}
		this.atlasRefresh.value = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
			this.atlasRefresh.clear();
			void this.updateAtlas();
		});
	}

	private async updateAtlas(): Promise<void> {
		if (!this.canAnimate()) {
			return;
		}
		this.observeSizeAndPixelRatio();
		const targetWindow = getWindow(this.domNode);
		const bounds = this.domNode.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) {
			return;
		}
		// Read resolved CSS once per appearance change, including custom theme colors.
		const color = targetWindow.getComputedStyle(this.domNode).color;
		const ratio = this.pixelRatio!.value;
		const options = { width: Math.max(1, Math.round(bounds.width * ratio)), height: Math.max(1, Math.round(bounds.height * ratio)), color };
		const key = JSON.stringify([bounds.width, bounds.height, options.width, options.height, color]);
		if (key === this.atlasKey) {
			return;
		}
		this.clearAtlas();
		this.renderNextDrawFrame();
		const remainingDelay = (this.animationOptions.atlasPreparationDelay ?? atlasPreparationDelay) - (this.now() - this.animationStartedAt);
		if (remainingDelay > 0 && !(this.animationOptions.hasAtlas ?? hasChatWorkingLogoAtlas)(targetWindow, options)) {
			// Keep the SVG fallback while the request is prepared instead of generating frames on its critical path.
			const handle = targetWindow.setTimeout(() => {
				this.atlasRefresh.clear();
				this.scheduleAtlasRefresh();
			}, remainingDelay);
			this.atlasRefresh.value = toDisposable(() => targetWindow.clearTimeout(handle));
			return;
		}
		this.atlasKey = key;
		const request = this.atlasRequest.value = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		request.add(toDisposable(() => cancellation.dispose(true)));
		try {
			const reference = request.add((this.animationOptions.acquireAtlas ?? acquireChatWorkingLogoAtlas)(targetWindow, options));
			const atlas = await raceCancellationError(reference.object, cancellation.token);
			const viewport = $('span.chat-working-logo-atlas-viewport');
			const image = $<HTMLImageElement>('img.chat-working-logo-atlas-sheet', { alt: '', 'aria-hidden': 'true', draggable: false });
			request.add(toDisposable(() => {
				viewport.remove();
				image.removeAttribute('src');
			}));
			image.style.width = `${atlas.width * bounds.width / atlas.frameWidth}px`;
			image.style.height = `${atlas.height * bounds.height / atlas.frameHeight}px`;
			viewport.appendChild(image);
			await loadChatWorkingLogoAtlasImage(image, atlas.url, cancellation.token);
			if (request !== this.atlasRequest.value) {
				return;
			}
			if (!this.canAnimate() || targetWindow !== getWindow(this.domNode)) {
				this.clearAtlas();
				this.scheduleAtlasRefresh();
				return;
			}
			this.domNode.appendChild(viewport);
			const animation = image.animate(getChatWorkingLogoAtlasKeyframes(atlas, bounds.width, bounds.height), {
				duration: this.drawDurationMs, iterations: Infinity, fill: 'both',
			});
			request.add(toDisposable(() => animation.cancel()));
			animation.currentTime = (this.now() - this.animationStartedAt) % this.drawDurationMs;
			this.atlasPlaying = true;
			this.domNode.classList.add('chat-working-logo-atlas');
			this.domNode.classList.remove('chat-working-logo-draw-assembled');
			this.animationFrame?.clear();
		} catch (error) {
			if (isCancellationError(error) || request !== this.atlasRequest.value) {
				return;
			}
			this.atlasRequest.clear();
			const failure = new Error('Unable to prepare Draw atlas; using SVG animation', { cause: error });
			(this.animationOptions.onAtlasError ?? onUnexpectedError)(failure);
			this.renderNextDrawFrame();
		}
	}

	private ensureDrawArtwork(): void {
		if (this.drawPaths) {
			return;
		}
		this.animationFrame = this._register(new MutableDisposable());
		this.drawPaths = new Map();
		this.drawPathData = new Map();
		const maskId = ++drawMaskIdPool;
		const defs = $.SVG<SVGDefsElement>('defs');
		const artwork = $.SVG<SVGGElement>('g', { class: 'chat-working-logo-draw-artwork' });
		for (let index = 0; index < CHAT_WORKING_LOGO_DRAW_PAINT_ORDER.length; index++) {
			const band = CHAT_WORKING_LOGO_DRAW_PAINT_ORDER[index];
			const maskPath = $.SVG<SVGPathElement>('path', {
				class: `chat-working-logo-draw-band chat-working-logo-draw-band-${band}`,
				fill: '#fff',
				stroke: '#fff',
				'stroke-width': '4',
				'stroke-linejoin': 'round',
				transform: 'translate(6 6) scale(0.84)',
			});
			const mask = $.SVG<SVGMaskElement>('mask', {
				id: `chat-working-logo-draw-mask-${maskId}-${band}`,
				x: '0',
				y: '0',
				width: '96',
				height: '96',
				maskUnits: 'userSpaceOnUse',
				'mask-type': 'alpha',
			}, maskPath);
			const renderedFace = $.SVG<SVGPathElement>('path', {
				class: `chat-working-logo-draw-face chat-working-logo-draw-face-${band}`,
				d: chatWorkingLogoFacePaths[index],
				fill: 'currentColor',
				mask: `url(#chat-working-logo-draw-mask-${maskId}-${band})`,
			});
			defs.appendChild(mask);
			artwork.appendChild(renderedFace);
			this.drawPaths.set(band, maskPath);
		}
		const wrapper = append(this.domNode, $('span.chat-working-logo-draw-container'));
		wrapper.appendChild($.SVG<SVGSVGElement>('svg', {
			viewBox: '6 6 84 84',
			width: '100%',
			height: '100%',
			focusable: 'false',
			'shape-rendering': 'geometricPrecision',
		}, defs, artwork));
		this.renderDrawFrame(0.5);
	}

	private restartDrawAnimation(): void {
		this.animationFrame?.clear();
		this.clearAtlas();
		if (!isDrawAnimation(this.animation)) {
			return;
		}
		if (!this.active || this.isMotionReduced()) {
			this.renderDrawFrame(0.5);
			return;
		}
		if (!this.visible) {
			return;
		}
		this.animationStartedAt = this.now();
		this.lastDrawFrame = Math.floor(this.animationStartedAt * fallbackFrameRate / 1000);
		this.renderDrawFrame(0);
		this.queueAnimationFrame();
		this.scheduleAtlasRefresh();
	}

	private queueAnimationFrame(): void {
		const animationFrame = this.animationFrame;
		if (!animationFrame || animationFrame.value || this.atlasPlaying || !this.active || !this.visible || !isDrawAnimation(this.animation)) {
			return;
		}
		animationFrame.value = this.scheduleFrame(getWindow(this.domNode), () => {
			animationFrame.clear();
			this.renderNextDrawFrame();
		});
	}

	private renderNextDrawFrame(): void {
		if (this.atlasPlaying || !this.active || !this.visible || !isDrawAnimation(this.animation)) {
			return;
		}
		if (this.isMotionReduced()) {
			this.renderDrawFrame(0.5);
			return;
		}
		const now = this.now();
		const frame = Math.floor(now * fallbackFrameRate / 1000);
		if (frame !== this.lastDrawFrame) {
			this.lastDrawFrame = frame;
			this.renderDrawFrame(((now - this.animationStartedAt) % this.drawDurationMs) / this.drawDurationMs);
		}
		this.queueAnimationFrame();
	}

	private renderDrawFrame(progress: number): void {
		if (!this.drawPaths) {
			return;
		}
		const frame = getChatWorkingLogoDrawFrame(progress);
		this.domNode.classList.toggle('chat-working-logo-draw-assembled', frame.assembled);
		if (frame.assembled) {
			return;
		}
		for (const band of CHAT_WORKING_LOGO_DRAW_PAINT_ORDER) {
			const pathData = frame.paths[band];
			if (this.drawPathData?.get(band) === pathData) {
				continue;
			}
			this.drawPaths.get(band)?.setAttribute('d', pathData);
			this.drawPathData?.set(band, pathData);
		}
	}

	private isMotionReduced(): boolean {
		// Component fixtures freeze all motion with `.disable-animations`, even when they opt into motion.
		if (this.domNode.closest('.disable-animations')) {
			return true;
		}
		if (this.domNode.closest('.monaco-enable-motion')) {
			return false;
		}
		if (this.domNode.closest('.monaco-reduce-motion')) {
			return true;
		}
		return this.isMotionReducedOverride?.() ?? getWindow(this.domNode).matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
}

export class ChatWorkingProgressLogo extends ChatWorkingLogo {
	constructor(
		quality: 'stable' | 'insider',
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super(getConfiguredProgressAnimation(configurationService, logService), quality, {
			isMotionReduced: () => accessibilityService.isMotionReduced(),
			onAtlasError: error => logService.error(error),
		});
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.PersistentProgress)) {
				this.setAnimation(getConfiguredProgressAnimation(configurationService, logService));
			}
		}));
		this._register(accessibilityService.onDidChangeReducedMotion(() => this.refreshMotion()));
		this._register(themeService.onDidColorThemeChange(() => this.refreshAppearance()));
	}
}

const warnedUnsupportedAnimations = new Set<string>();

export function getConfiguredProgressAnimation(configurationService: IConfigurationService, logService: ILogService): ChatProgressAnimation {
	const animation = configurationService.getValue<string | undefined>(ChatConfiguration.PersistentProgress);
	switch (animation) {
		case undefined:
			return ChatProgressAnimation.Off;
		case ChatProgressAnimation.Off:
		case ChatProgressAnimation.Draw:
		case ChatProgressAnimation.DrawMonochrome:
		case ChatProgressAnimation.DrawMonochromeNoIcon:
			return animation;
		case 'ribbon':
		case 'weave':
		case 'orbit':
		case 'accordion':
		case 'dial':
			return ChatProgressAnimation.Draw;
		default: {
			// Resolved on render hot paths, so an unknown value (e.g. from an experiment targeting a newer
			// client) must not warn on every call.
			const key = String(animation);
			if (!warnedUnsupportedAnimations.has(key)) {
				warnedUnsupportedAnimations.add(key);
				logService.warn('ChatWorkingProgressLogo: unsupported progress animation, using Off', animation);
			}
			return ChatProgressAnimation.Off;
		}
	}
}
