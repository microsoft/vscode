/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatBillingBannerService } from './chatBillingBannerService.js';
import './media/chatBillingBannerWidget.css';

const $ = dom.$;

/**
 * Variant of the banner per host surface. Differs by primary CTA label and
 * its target action.
 */
export const enum ChatBillingBannerVariant {
	/** Chat panel (sidebar) and welcome screens. CTA = "Copilot Dashboard". */
	Panel = 'panel',
	/** Agents window. CTA = "View Account" (opens the title-bar account panel). */
	Agents = 'agents',
}

/** External docs link shown on slide 3 of every variant. */
const GITHUB_DOCS_URL = 'https://docs.github.com/en/copilot/how-tos/manage-your-account';
/** Workbench command that opens the Copilot status dashboard (the popover anchored on the Copilot status bar entry). */
const PANEL_CTA_COMMAND_ID = 'workbench.action.chat.openStatusDashboard';
/** Agents-window command that opens the title-bar account & Copilot status panel. Registered in `sessions/contrib/accountMenu/browser/account.contribution.ts`. */
const AGENTS_CTA_COMMAND_ID = 'workbench.action.agents.openAccountMenu';

interface ISlide {
	readonly title: string;
	readonly description: string;
	readonly linkLabel?: string;
	readonly linkHref?: string;
}

interface IBlobConfig {
	x: number; y: number;
	rx: number; ry: number;
}

/**
 * Per-slide blob layout — values are normalized 0..1 (cell positions x/y,
 * radii rx/ry). Ported directly from the prototype's `SLIDE_BLOBS`.
 */
const SLIDE_BLOBS: ReadonlyArray<ReadonlyArray<IBlobConfig>> = [
	[
		{ x: 0.50, y: 0.55, rx: 0.60, ry: 0.95 },
		{ x: 0.82, y: 0.20, rx: 0.46, ry: 0.76 },
		{ x: 0.18, y: 0.78, rx: 0.43, ry: 0.72 },
	],
	[
		{ x: 0.18, y: 0.65, rx: 0.32, ry: 0.52 },
		{ x: 0.72, y: 0.30, rx: 0.66, ry: 0.95 },
		{ x: 0.92, y: 0.78, rx: 0.36, ry: 0.58 },
	],
	[
		{ x: 0.68, y: 0.52, rx: 0.54, ry: 0.88 },
		{ x: 0.92, y: 0.22, rx: 0.40, ry: 0.66 },
		{ x: 0.52, y: 0.78, rx: 0.46, ry: 0.74 },
	],
];

// allow-any-unicode-next-line
const CHARS = ['.', '·', '¢', '¤', '£', '¥', '€', '$'];
// allow-any-unicode-next-line
const BG_CHARS = ['.', '·', '¢', '$'];
const FONT_SIZE = 10;
const SPEED = 0.18;
const LERP = 0.028;
const BG_SWAPS_PER_FRAME = 4;

// Slide-to-slide cross-fade. Half a beat shorter than the standard
// editor flyout transitions so the carousel reads as responsive.
const SLIDE_FADE_MS = 160;

interface IBlobState {
	cx: number; cy: number; crx: number; cry: number; // current (lerped)
	tx: number; ty: number; trx: number; try: number; // target
	speed: number; phase: number; ax: number; ay: number;
}

const BLOB_DYNAMICS = [
	{ speed: 0.8, phase: 0.2, ax: 0.06, ay: 0.07 },
	{ speed: 1.0, phase: 0.8, ax: 0.08, ay: 0.07 },
	{ speed: 1.1, phase: 1.2, ax: 0.065, ay: 0.08 },
];

/**
 * Renders the ASCII canvas animation in the banner hero. Self-contained:
 * owns a single <canvas>, a `ResizeObserver`, and a `requestAnimationFrame`
 * loop. Disposing the instance cancels the frame loop and the observer.
 */
class BillingBannerCanvasAnimator extends Disposable {

	private readonly _ctx: CanvasRenderingContext2D;
	private readonly _blobs: IBlobState[];
	private _rafHandle: IDisposable | undefined;
	private _running = false;

	private _width = 0;
	private _height = 0;
	private _cols = 0;
	private _rows = 0;
	private _dpr = 1;
	private _bgGrid: string[] = [];

	private _colorR = 78;
	private _colorG = 148;
	private _colorB = 206;

	constructor(
		private readonly _canvas: HTMLCanvasElement,
		private readonly _container: HTMLElement,
		initialReducedMotion: boolean = false,
	) {
		super();

		const ctx = this._canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to obtain 2D canvas context for billing banner');
		}
		this._ctx = ctx;

		this._blobs = SLIDE_BLOBS[0].map((cfg, i) => ({
			cx: cfg.x, cy: cfg.y, crx: cfg.rx, cry: cfg.ry,
			tx: cfg.x, ty: cfg.y, trx: cfg.rx, try: cfg.ry,
			speed: BLOB_DYNAMICS[i].speed,
			phase: BLOB_DYNAMICS[i].phase,
			ax: BLOB_DYNAMICS[i].ax,
			ay: BLOB_DYNAMICS[i].ay,
		}));

		const targetWindow = dom.getWindow(this._container);

		const observer = new (targetWindow as Window & typeof globalThis).ResizeObserver(() => this._resize());
		observer.observe(this._container);
		this._register(toDisposable(() => observer.disconnect()));

		// `_resize()` reads the live theme color the first time the container
		// has non-zero dimensions, so no pre-read here.
		this._resize();

		if (initialReducedMotion) {
			this._draw(performance.now());
		} else {
			this._startLoop();
		}
		this._register(toDisposable(() => this._stopLoop()));
	}

	setReducedMotion(reduced: boolean): void {
		if (reduced) {
			if (this._running) {
				this._stopLoop();
			}
			this._draw(performance.now());
		} else if (!this._running) {
			this._startLoop();
		}
	}

	private _startLoop(): void {
		if (this._running) {
			return;
		}
		this._running = true;
		const targetWindow = dom.getWindow(this._container);
		const tick = (ts: number) => {
			if (!this._running) {
				return;
			}
			this._draw(ts);
			this._rafHandle = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(performance.now()));
		};
		this._rafHandle = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(performance.now()));
	}

	private _stopLoop(): void {
		this._running = false;
		this._rafHandle?.dispose();
		this._rafHandle = undefined;
	}

	setSlideTargets(slideIndex: number): void {
		const targets = SLIDE_BLOBS[slideIndex];
		if (!targets) {
			return;
		}
		for (let i = 0; i < this._blobs.length && i < targets.length; i++) {
			this._blobs[i].tx = targets[i].x;
			this._blobs[i].ty = targets[i].y;
			this._blobs[i].trx = targets[i].rx;
			this._blobs[i].try = targets[i].ry;
		}
		if (!this._running) {
			for (const b of this._blobs) {
				b.cx = b.tx; b.cy = b.ty; b.crx = b.trx; b.cry = b.try;
			}
			for (let i = 0; i < this._bgGrid.length; i++) {
				this._bgGrid[i] = BG_CHARS[(Math.random() * BG_CHARS.length) | 0];
			}
			this._draw(performance.now());
		}
	}

	private _readColor(): void {
		const raw = dom.getWindow(this._container).getComputedStyle(this._container)
			.getPropertyValue('--vscode-textLink-foreground').trim();
		const hex = raw.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
		const rgb = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (hex) {
			this._colorR = parseInt(hex[1], 16);
			this._colorG = parseInt(hex[2], 16);
			this._colorB = parseInt(hex[3], 16);
		} else if (rgb) {
			this._colorR = parseInt(rgb[1], 10);
			this._colorG = parseInt(rgb[2], 10);
			this._colorB = parseInt(rgb[3], 10);
		}
	}

	private _resize(): void {
		this._dpr = dom.getWindow(this._container).devicePixelRatio || 1;
		this._width = this._container.offsetWidth;
		this._height = this._container.offsetHeight;
		if (this._width === 0 || this._height === 0) {
			return;
		}
		// Re-read the theme color now that the container is in the live DOM
		// tree; the constructor runs before attachment so CSS variables aren't
		// inherited yet at that point.
		this._readColor();
		this._canvas.width = this._width * this._dpr;
		this._canvas.height = this._height * this._dpr;
		this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
		this._cols = Math.ceil(this._width / FONT_SIZE);
		this._rows = Math.ceil(this._height / FONT_SIZE);
		this._bgGrid = new Array(this._rows * this._cols);
		for (let i = 0; i < this._bgGrid.length; i++) {
			this._bgGrid[i] = BG_CHARS[(Math.random() * BG_CHARS.length) | 0];
		}
		if (!this._running) {
			this._draw(performance.now());
		}
	}

	private _draw(ts: number): void {
		if (this._width === 0 || this._height === 0) {
			return;
		}
		const t = ts * 0.001;

		for (const b of this._blobs) {
			b.cx += (b.tx - b.cx) * LERP;
			b.cy += (b.ty - b.cy) * LERP;
			b.crx += (b.trx - b.crx) * LERP;
			b.cry += (b.try - b.cry) * LERP;
		}

		const ctx = this._ctx;
		ctx.clearRect(0, 0, this._width, this._height);
		ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
		ctx.textBaseline = 'top';

		const centers = this._blobs.map(b => ({
			cx: (b.cx
				+ Math.sin(t * b.speed * SPEED + b.phase) * b.ax
				+ Math.sin(t * b.speed * SPEED * 0.61 + b.phase * 1.7) * b.ax * 0.5
				+ Math.cos(t * b.speed * SPEED * 1.37 + b.phase * 0.9) * b.ax * 0.25
			) * this._width,
			cy: (b.cy
				+ Math.cos(t * b.speed * SPEED + b.phase) * b.ay
				+ Math.cos(t * b.speed * SPEED * 0.73 + b.phase * 1.3) * b.ay * 0.5
				+ Math.sin(t * b.speed * SPEED * 1.19 + b.phase * 0.6) * b.ay * 0.3
			) * this._height,
			rx: b.crx * this._width * 0.5,
			ry: b.cry * this._height * 0.5,
		}));

		for (let i = 0; i < BG_SWAPS_PER_FRAME; i++) {
			const idx = (Math.random() * this._bgGrid.length) | 0;
			this._bgGrid[idx] = BG_CHARS[(Math.random() * BG_CHARS.length) | 0];
		}

		const r = this._colorR;
		const g = this._colorG;
		const b = this._colorB;

		for (let row = 0; row < this._rows; row++) {
			for (let col = 0; col < this._cols; col++) {
				const px = col * FONT_SIZE + FONT_SIZE / 2;
				const py = row * FONT_SIZE + FONT_SIZE / 2;

				let minDist = Infinity;
				for (const { cx, cy, rx, ry } of centers) {
					const d = Math.sqrt(((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2);
					if (d < minDist) {
						minDist = d;
					}
				}

				let charIdx: number;
				if (minDist < 0.4) {
					charIdx = CHARS.length - 1;
				} else if (minDist < 1.0) {
					const t2 = (minDist - 0.4) / 0.6;
					charIdx = Math.round((1 - t2) * (CHARS.length - 1));
				} else {
					ctx.fillStyle = `rgba(${r},${g},${b},0.28)`;
					ctx.fillText(this._bgGrid[row * this._cols + col], col * FONT_SIZE, row * FONT_SIZE);
					continue;
				}

				const alpha = 0.55 + (1 - Math.min(minDist, 1)) * 0.4;
				ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
				ctx.fillText(CHARS[charIdx], col * FONT_SIZE, row * FONT_SIZE);
			}
		}
	}
}

/**
 * The Copilot usage-based billing onboarding banner. Renders an animated
 * carousel of three slides above the chat input. Visible only while
 * {@link IChatBillingBannerService.shouldShow} is true; clicking the
 * primary CTA on slide 3 marks the banner completed and hides it
 * permanently across restarts.
 */
export class ChatBillingBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _animator: BillingBannerCanvasAnimator | undefined;

	private readonly _slides: ReadonlyArray<ISlide>;

	private _step = 0;
	private _titleEl: HTMLElement | undefined;
	private _descEl: HTMLElement | undefined;
	private _counterEl: HTMLElement | undefined;
	private _prevBtn: HTMLButtonElement | undefined;
	private _nextBtn: HTMLButtonElement | undefined;
	private _ctaBtn: Button | undefined;
	private _dismissBtn: Button | undefined;
	private _bodyEl: HTMLElement | undefined;
	private _fadeTimeout: number | undefined;

	constructor(
		private readonly _variant: ChatBillingBannerVariant,
		@IChatBillingBannerService private readonly _bannerService: IChatBillingBannerService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this.domNode = $('.chat-billing-banner-widget');
		this.domNode.classList.add(`variant-${_variant}`);
		this.domNode.classList.toggle('motion-reduced', this._accessibilityService.isMotionReduced());

		// Slide 3 differs by host surface: the panel variant points users at
		// the in-product Copilot status dashboard, while the Agents variant
		// surfaces the title-bar account menu (which shows the user's
		// Copilot subscription state) since the dashboard isn't reachable
		// from the Agents window.
		const slide3Desc = _variant === ChatBillingBannerVariant.Agents
			? localize('billingBanner.slide3.desc.agents', "Your credits reset monthly. View your Copilot subscription and remaining allowance from your account in the title bar.")
			: localize('billingBanner.slide3.desc', "Your credits reset monthly. Open the Copilot status dashboard to check your remaining allowance, upgrade, or manage your budget.");

		this._slides = [
			{
				title: localize('billingBanner.slide1.title', "Copilot billing has changed"),
				description: localize('billingBanner.slide1.desc', "Copilot now measures usage in AI credits. Your plan includes a monthly credit allowance, and your subscription price is unchanged."),
			},
			{
				title: localize('billingBanner.slide2.title', "Cost scales with the work done"),
				description: localize('billingBanner.slide2.desc', "A quick chat can cost a fraction of a credit. Multi-agent workflows and more powerful models cost more because they do more."),
			},
			{
				title: localize('billingBanner.slide3.title', "Monitor and manage your usage"),
				description: slide3Desc,
				linkLabel: localize('billingBanner.slide3.link', "Learn more on GitHub Docs"),
				linkHref: GITHUB_DOCS_URL,
			},
		];

		this._register(this._bannerService.onDidChange(() => this._render()));
		this._register(this._accessibilityService.onDidChangeReducedMotion(() => this._applyReducedMotion()));
		this._render();
	}

	private _applyReducedMotion(): void {
		const reduced = this._accessibilityService.isMotionReduced();
		this.domNode.classList.toggle('motion-reduced', reduced);
		this._animator?.setReducedMotion(reduced);
	}

	private _render(): void {
		this._renderDisposables.clear();
		this._animator = undefined;
		this._titleEl = this._descEl = this._counterEl = undefined;
		this._prevBtn = this._nextBtn = this._ctaBtn = undefined;
		this._dismissBtn = undefined;
		this._bodyEl = undefined;
		if (this._fadeTimeout !== undefined) {
			dom.getWindow(this.domNode).clearTimeout(this._fadeTimeout);
			this._fadeTimeout = undefined;
		}

		dom.clearNode(this.domNode);

		if (!this._bannerService.shouldShow) {
			this._setHostHasBanner(false);
			return;
		}

		this._setHostHasBanner(true);
		this._step = 0;
		this._buildCard();
		this._applyStep(0);
	}

	/**
	 * Toggle `has-billing-banner` on both the immediate container and on the
	 * input-part ancestor that owns layout. CSS rules can then key off either
	 * level: the container class drives the container's own display, while
	 * the ancestor class is used to suppress sibling above-input chrome
	 * (e.g. the getting-started tip) without a `:has()` selector.
	 */
	private _setHostHasBanner(on: boolean): void {
		const container = this.domNode.parentElement;
		container?.classList.toggle('has-billing-banner', on);
		const host = container?.parentElement;
		host?.classList.toggle('has-billing-banner', on);
	}

	private _buildCard(): void {
		const card = dom.append(this.domNode, $('.chat-billing-banner-card'));
		card.setAttribute('role', 'region');
		card.setAttribute('aria-label', localize('billingBanner.regionLabel', "Copilot billing update"));

		const banner = dom.append(card, $('.chat-billing-banner-hero'));
		const canvas = dom.append(banner, $('canvas.chat-billing-banner-canvas')) as HTMLCanvasElement;
		canvas.setAttribute('aria-hidden', 'true');

		this._animator = this._renderDisposables.add(new BillingBannerCanvasAnimator(canvas, banner, this._accessibilityService.isMotionReduced()));

		const body = dom.append(card, $('.chat-billing-banner-body'));
		this._bodyEl = body;
		this._titleEl = dom.append(body, $('h2.chat-billing-banner-title'));
		this._descEl = dom.append(body, $('p.chat-billing-banner-desc'));

		const nav = dom.append(card, $('.chat-billing-banner-nav'));

		const navLeft = dom.append(nav, $('.chat-billing-banner-nav-left'));
		this._prevBtn = dom.append(navLeft, $('button.chat-billing-banner-arrow')) as HTMLButtonElement;
		this._prevBtn.type = 'button';
		this._prevBtn.setAttribute('aria-label', localize('billingBanner.prev', "Previous"));
		dom.append(this._prevBtn, dom.$(ThemeIcon.asCSSSelector(Codicon.chevronLeft)));
		this._renderDisposables.add(dom.addDisposableListener(this._prevBtn, dom.EventType.CLICK, () => this._goto(this._step - 1)));

		this._nextBtn = dom.append(navLeft, $('button.chat-billing-banner-arrow')) as HTMLButtonElement;
		this._nextBtn.type = 'button';
		this._nextBtn.setAttribute('aria-label', localize('billingBanner.next', "Next"));
		dom.append(this._nextBtn, dom.$(ThemeIcon.asCSSSelector(Codicon.chevronRight)));
		this._renderDisposables.add(dom.addDisposableListener(this._nextBtn, dom.EventType.CLICK, () => this._goto(this._step + 1)));

		// Keyboard handling for the nav buttons:
		//  - Left/Right arrows always navigate by one slide
		//  - Enter/Space activate the focused button. We handle these
		//    explicitly because the workbench keybinding service can intercept
		//    Enter and call preventDefault before the browser's native button
		//    activation kicks in.
		for (const btn of [this._prevBtn, this._nextBtn]) {
			const isNext = btn === this._nextBtn;
			this._renderDisposables.add(dom.addDisposableListener(btn, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const ev = new StandardKeyboardEvent(e);
				if (ev.keyCode === KeyCode.LeftArrow) {
					ev.preventDefault();
					ev.stopPropagation();
					this._goto(this._step - 1);
				} else if (ev.keyCode === KeyCode.RightArrow) {
					ev.preventDefault();
					ev.stopPropagation();
					this._goto(this._step + 1);
				} else if (ev.keyCode === KeyCode.Enter || ev.keyCode === KeyCode.Space) {
					ev.preventDefault();
					ev.stopPropagation();
					if (isNext) {
						this._goto(this._step + 1);
					} else {
						this._goto(this._step - 1);
					}
				}
			}));
		}

		this._counterEl = dom.append(navLeft, $('span.chat-billing-banner-counter'));
		this._counterEl.setAttribute('aria-live', 'polite');

		const navRight = dom.append(nav, $('.chat-billing-banner-nav-right'));

		this._dismissBtn = this._renderDisposables.add(new Button(navRight, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
		}));
		this._dismissBtn.element.classList.add('chat-billing-banner-cta', 'chat-billing-banner-dismiss');
		this._dismissBtn.element.style.display = 'none';
		this._dismissBtn.label = `$(${Codicon.check.id}) ${localize('billingBanner.dismiss', "Dismiss")}`;
		this._renderDisposables.add(this._dismissBtn.onDidClick(() => this._bannerService.markCompleted()));

		this._ctaBtn = this._renderDisposables.add(new Button(navRight, {
			...defaultButtonStyles,
			supportIcons: true,
		}));
		this._ctaBtn.element.classList.add('chat-billing-banner-cta');
		this._ctaBtn.element.style.display = 'none';
		this._renderDisposables.add(this._ctaBtn.onDidClick(() => this._handleCta()));

		if (this._variant === ChatBillingBannerVariant.Panel) {
			this._ctaBtn.label = `$(${Codicon.copilot.id}) ${localize('billingBanner.cta.dashboard', "Copilot Dashboard")}`;
		} else {
			this._ctaBtn.label = `$(${Codicon.account.id}) ${localize('billingBanner.cta.viewAccount', "View Account")}`;
		}
	}

	private _goto(target: number): void {
		const clamped = Math.max(0, Math.min(this._slides.length - 1, target));
		if (clamped === this._step) {
			return;
		}

		if (!this._bodyEl || this._accessibilityService.isMotionReduced()) {
			this._applyStep(clamped);
			return;
		}

		const body = this._bodyEl;
		body.classList.add('fading');
		if (this._fadeTimeout !== undefined) {
			dom.getWindow(this.domNode).clearTimeout(this._fadeTimeout);
		}
		this._fadeTimeout = dom.getWindow(this.domNode).setTimeout(() => {
			this._fadeTimeout = undefined;
			this._applyStep(clamped);
			body.classList.remove('fading');
		}, SLIDE_FADE_MS);
	}

	private _applyStep(index: number): void {
		this._step = index;
		const slide = this._slides[index];
		const isLast = index === this._slides.length - 1;

		if (this._titleEl) {
			this._titleEl.textContent = slide.title;
		}
		if (this._descEl) {
			// Rebuild the description so an optional trailing link can be
			// appended inline. textContent is used for the localized prose so
			// nothing in the message is parsed as markup.
			dom.clearNode(this._descEl);
			this._descEl.appendChild(dom.getWindow(this._descEl).document.createTextNode(slide.description));
			if (slide.linkLabel && slide.linkHref) {
				this._descEl.appendChild(dom.getWindow(this._descEl).document.createTextNode(' '));
				const inlineLink = dom.append(this._descEl, $('a.chat-billing-banner-link')) as HTMLAnchorElement;
				inlineLink.textContent = slide.linkLabel;
				inlineLink.href = slide.linkHref;
				inlineLink.rel = 'noopener noreferrer';
				const href = slide.linkHref;
				this._renderDisposables.add(dom.addDisposableListener(inlineLink, dom.EventType.CLICK, (e: MouseEvent) => {
					e.preventDefault();
					this._openerService.open(URI.parse(href));
				}));
			}
		}
		if (this._counterEl) {
			this._counterEl.textContent = isLast ? '' : `${index + 1}/${this._slides.length}`;
			this._counterEl.style.display = isLast ? 'none' : '';
		}
		if (this._prevBtn) {
			this._prevBtn.disabled = index === 0;
		}
		if (this._nextBtn) {
			this._nextBtn.disabled = isLast;
		}
		if (this._dismissBtn) {
			this._dismissBtn.element.style.display = isLast ? '' : 'none';
		}
		if (this._ctaBtn) {
			this._ctaBtn.element.style.display = isLast ? '' : 'none';
		}
		this._animator?.setSlideTargets(index);
	}

	private _handleCta(): void {
		const commandId = this._variant === ChatBillingBannerVariant.Panel
			? PANEL_CTA_COMMAND_ID
			: AGENTS_CTA_COMMAND_ID;
		this._commandService.executeCommand(commandId);
	}
}
