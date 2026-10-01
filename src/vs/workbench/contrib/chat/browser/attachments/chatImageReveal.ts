/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { synchronizeCSSAnimations } from '../../../../../base/browser/animationSync.js';
import { asCSSUrl } from '../../../../../base/browser/cssValue.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ChatImageLoadingSurfaces } from './chatImageLoadingSurfaces.js';
import { getMotionScale, getTexturePalette, ImageSamples, RevealPace, TextureSurface } from './chatImageTextures.js';
import './chatImageReveal.css';

export interface IChatImageRevealOrigin {
	readonly container: HTMLElement;
}

const lineAnimationNames = new Set(['chat-image-generation-line-travel']);

/** Post-load time, at normal speed, for the line to trace the frame and the image to appear inside it. */
const revealDuration = 2000;

const revealProperties = ['height', 'width', 'duration', 'trace-length', 'trace-start', 'trace-descent', 'frame', 'frame-width', 'image'];

interface IRevealTrace {
	/** The straight loading line the frame grows from. */
	readonly track: string;
	readonly path: string;
	/** The full perimeter of the frame. */
	readonly length: number;
	/** The top edge, which the loading line has already drawn. */
	readonly start: number;
	/** From the top-right to the bottom-right corner, where the frame opens. */
	readonly descent: number;
}

/**
 * Creates a rounded frame path that runs clockwise from the left end of its top edge,
 * so the loading line can turn its right corner and circle back to where it started.
 */
function createRevealTrace(width: number, height: number, radius: number, stroke: number): IRevealTrace {
	const inset = stroke / 2;
	const left = inset;
	const top = inset;
	const right = width - inset;
	const bottom = height - inset;
	const corner = Math.max(0, Math.min(radius - inset, (right - left) / 2, (bottom - top) / 2));
	const horizontal = right - left - 2 * corner;
	const vertical = bottom - top - 2 * corner;
	const arc = Math.PI * corner / 2;
	const turn = (x: number, y: number) => `A${corner} ${corner} 0 0 1 ${x} ${y}`;
	return {
		track: `M0 ${top}H${width}`,
		path: `M${left + corner} ${top}H${right - corner}${turn(right, top + corner)}V${bottom - corner}${turn(right - corner, bottom)}H${left + corner}${turn(left, bottom - corner)}V${top + corner}${turn(left + corner, top)}Z`,
		length: 2 * (horizontal + vertical) + 4 * arc,
		start: horizontal,
		descent: vertical + 2 * arc,
	};
}

/**
 * A one-shot reveal for the development image-generation mock. Line reveals trace the frame with
 * the loading line and then reveal the image inside it. Texture reveals, which a variant selects
 * through `--chat-image-reveal-texture`, carry a dither or glyph band on into a texture derived
 * from the image, which resolves into the image itself. `--chat-image-motion-scale` slows both,
 * and a texture reveal eases from it to `--chat-image-motion-scale-end` when that is set.
 */
export class ChatImageReveal extends Disposable {
	private readonly effects = this._register(new DisposableStore());
	private readonly surfaces: ChatImageLoadingSurfaces;
	private started = false;

	constructor(
		private readonly container: HTMLElement,
		private readonly image: HTMLImageElement,
		private readonly origin: IChatImageRevealOrigin | undefined,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		container.classList.add('chat-image-reveal', 'pending', 'chat-image-generation-line');
		origin?.container.classList.add('chat-image-reveal-pending');
		this.effects.add(toDisposable(() => {
			container.classList.remove('pending', 'revealing', 'chat-image-reveal-textured', 'chat-image-generation-line');
			for (const property of revealProperties) {
				container.style.removeProperty(`--chat-image-reveal-${property}`);
			}
			origin?.container.classList.remove('chat-image-reveal-pending', 'chat-image-reveal-running');
			origin?.container.style.removeProperty('--chat-image-reveal-duration');
		}));
		this.surfaces = this.effects.add(instantiationService.createInstance(ChatImageLoadingSurfaces, container));
		this.effects.add(dom.addDisposableListener(container, 'animationstart', (event: AnimationEvent) => {
			if (lineAnimationNames.has(event.animationName)) {
				synchronizeCSSAnimations(container, { subtree: true, animationNames: lineAnimationNames });
			}
		}));
		this.effects.add(accessibilityService.onDidChangeReducedMotion(() => this.finishIfMotionDisabled()));
		this.effects.add(themeService.onDidColorThemeChange(() => this.finishIfMotionDisabled()));
	}

	reveal(loadedAt = dom.getWindow(this.container).performance.now()): void {
		if (this.started || this._store.isDisposed) {
			return;
		}
		this.started = true;
		// The band's size, which a texture reveal's frame grows from, before the band gives way to the image.
		const band = this.container.getBoundingClientRect();
		this.container.classList.remove('pending');

		const targetWindow = dom.getWindow(this.container);
		const performance = targetWindow.performance;
		const style = targetWindow.getComputedStyle(this.container);
		const transition = style.getPropertyValue('--chat-image-reveal-texture').trim();
		const surface = transition ? this.surfaces.get(transition) : undefined;
		const { width, height } = this.image.getBoundingClientRect();
		const length = surface?.lengthOf(transition, band.width, Math.round(width));
		const deadline = loadedAt + (length === undefined ? revealDuration * getMotionScale(this.container) : RevealPace.of(this.container, length).duration);
		if (!this.motionEnabled || !width || !height || performance.now() >= deadline) {
			this.effects.clear();
			return;
		}

		// Set the duration first: CSS animations read it when they start.
		const remaining = deadline - performance.now();
		this.container.style.setProperty('--chat-image-reveal-duration', `${remaining}ms`);
		this.origin?.container.style.setProperty('--chat-image-reveal-duration', `${remaining}ms`);
		if (surface ? !this.revealTexture(surface, transition, band, width, height, remaining) : !this.revealLine(style, width, height)) {
			this.effects.clear();
			return;
		}
		this.origin?.container.classList.replace('chat-image-reveal-pending', 'chat-image-reveal-running');
		this.effects.add(disposableTimeout(() => this.effects.clear(), Math.max(0, deadline - performance.now())));
	}

	private revealLine(style: CSSStyleDeclaration, width: number, height: number): boolean {
		const trace = createRevealTrace(width, height, parseFloat(style.borderTopLeftRadius) || 0, parseFloat(style.getPropertyValue('--vscode-strokeThickness')) || 1);
		this.container.style.setProperty('--chat-image-reveal-height', `${height}px`);
		this.container.style.setProperty('--chat-image-reveal-width', `${width}px`);
		this.container.style.setProperty('--chat-image-reveal-trace-length', `${trace.length}px`);
		this.container.style.setProperty('--chat-image-reveal-trace-start', `${trace.start}px`);
		this.container.style.setProperty('--chat-image-reveal-trace-descent', `${trace.descent / (trace.length - trace.start)}`);
		const blur = dom.append(this.container, dom.$('.chat-image-reveal-blur', { 'aria-hidden': 'true' }));
		blur.style.backgroundImage = asCSSUrl(URI.parse(this.image.src));
		const scan = dom.append(this.container, dom.$('.chat-image-reveal-scan', { 'aria-hidden': 'true' }));
		const frame = dom.append(this.container, dom.$.SVG<SVGSVGElement>('svg', { class: 'chat-image-reveal-trace', 'aria-hidden': 'true', width, height, viewBox: `0 0 ${width} ${height}` },
			dom.$.SVG('path', { class: 'chat-image-reveal-trace-track', d: trace.track }),
			dom.$.SVG('path', { class: 'chat-image-reveal-trace-line', d: trace.path }),
			dom.$.SVG('g', { class: 'chat-image-reveal-trace-head' }, ...['tail', 'body', 'core'].map(part => dom.$.SVG('path', { class: `chat-image-reveal-trace-${part}`, d: trace.path }))),
		));
		this.effects.add(toDisposable(() => {
			blur.remove();
			scan.remove();
			frame.remove();
		}));
		this.container.classList.add('revealing', 'chat-image-generation-line');
		synchronizeCSSAnimations(this.container, { subtree: true, animationNames: lineAnimationNames });
		return true;
	}

	/**
	 * Hands the reveal to a texture surface, which paints the frame and fades the image in. The
	 * frame grows or narrows from the `band` to the image's size, since neither its width nor its
	 * height is known while the image is generated.
	 */
	private revealTexture(surface: TextureSurface, transition: string, band: DOMRect, width: number, height: number, duration: number): boolean {
		const samples = ImageSamples.create(this.image, width, height, getTexturePalette(this.themeService.getColorTheme()).invert);
		if (!samples) {
			return false;
		}
		const continuing = surface.showingBand;
		for (const other of this.surfaces.all) {
			if (other !== surface) {
				other.canvas.style.display = 'none';
			}
		}
		this.container.style.setProperty('--chat-image-reveal-width', `${width}px`);
		this.container.style.setProperty('--chat-image-reveal-frame-width', `${band.width}px`);
		this.container.style.setProperty('--chat-image-reveal-frame', `${band.height}px`);
		this.container.classList.add('revealing', 'chat-image-reveal-textured');
		surface.reveal(transition, {
			image: this.image,
			samples,
			fromWidth: band.width,
			fromHeight: band.height,
			continuing,
			duration,
			onFrame: frame => {
				this.container.style.setProperty('--chat-image-reveal-frame-width', `${frame.width ?? width}px`);
				this.container.style.setProperty('--chat-image-reveal-frame', `${frame.height}px`);
				this.container.style.setProperty('--chat-image-reveal-image', `${frame.imageOpacity}`);
			},
		});
		return true;
	}

	private get motionEnabled(): boolean {
		return !this.accessibilityService.isMotionReduced() && !isHighContrast(this.themeService.getColorTheme().type);
	}

	private finishIfMotionDisabled(): void {
		if (this.started && !this.motionEnabled) {
			this.effects.clear();
		}
	}
}
