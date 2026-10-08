/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ColorScheme, isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { GlyphSurface } from './chatImageGlyphSurface.js';
import { ImageSamples, ITextureRevealTiming } from './chatImageTextures.js';
import './chatImageReveal.css';

export interface IChatImageRevealOrigin {
	readonly container: HTMLElement;
}

const revealProperties = ['frame', 'frame-width', 'image'];

/** Expands the loading glyph band into the generated image as soon as its bytes are ready. */
export class ChatImageReveal extends Disposable {
	private readonly effects = this._register(new DisposableStore());
	private readonly surface: GlyphSurface;
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
			container.classList.remove('pending', 'revealing', 'chat-image-generation-line');
			for (const property of revealProperties) {
				container.style.removeProperty(`--chat-image-reveal-${property}`);
			}
			origin?.container.classList.remove('chat-image-reveal-pending', 'chat-image-reveal-running');
		}));
		this.surface = this.effects.add(instantiationService.createInstance(GlyphSurface, container));
		this.effects.add(accessibilityService.onDidChangeReducedMotion(() => this.finishIfMotionDisabled()));
		this.effects.add(themeService.onDidColorThemeChange(() => this.finishIfMotionDisabled()));
	}

	reveal(loadedAt = dom.getWindow(this.container).performance.now()): void {
		if (this.started || this._store.isDisposed) {
			return;
		}
		this.started = true;
		const band = this.container.getBoundingClientRect();
		this.container.classList.remove('pending');
		const performance = dom.getWindow(this.container).performance;
		const { width, height } = this.image.getBoundingClientRect();
		const timing = this.surface.getRevealTiming(band.width, Date.now() * 2);
		const deadline = loadedAt + timing.pace.duration;
		if (!this.motionEnabled || !width || !height || performance.now() >= deadline) {
			this.effects.clear();
			return;
		}
		if (!this.revealTexture(band, width, height, timing, deadline - performance.now())) {
			this.effects.clear();
			return;
		}
		this.origin?.container.classList.replace('chat-image-reveal-pending', 'chat-image-reveal-running');
		this.effects.add(disposableTimeout(() => this.effects.clear(), Math.max(0, deadline - performance.now())));
	}

	private revealTexture(band: DOMRect, width: number, height: number, timing: ITextureRevealTiming, duration: number): boolean {
		const samples = ImageSamples.create(this.image, width, height, this.themeService.getColorTheme().type === ColorScheme.LIGHT);
		if (!samples) {
			return false;
		}
		const frameWidth = this.container.getBoundingClientRect().width;
		this.container.style.setProperty('--chat-image-reveal-frame-width', `${band.width}px`);
		this.container.style.setProperty('--chat-image-reveal-frame', `${band.height}px`);
		this.container.classList.add('revealing');
		this.surface.reveal({
			image: this.image,
			samples,
			fromWidth: band.width,
			fromHeight: band.height,
			timing,
			duration,
			onFrame: frame => {
				// Canvas samples round to whole pixels; keep the measured CSS size at the final handoff.
				this.container.style.setProperty('--chat-image-reveal-frame-width', `${frame.width === samples.width ? frameWidth : frame.width}px`);
				this.container.style.setProperty('--chat-image-reveal-frame', `${frame.height === samples.height ? height : frame.height}px`);
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
