/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
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
	/** Chat panel (sidebar) and welcome screens. CTA = "Open Copilot Dashboard". */
	Panel = 'panel',
	/** Agents window. CTA = "Open Account" (opens the title-bar account panel). */
	Agents = 'agents',
}

/** External docs link shown alongside the banner copy. */
const GITHUB_DOCS_URL = 'https://docs.github.com/en/copilot/how-tos/manage-your-account';
/** Workbench command that opens the Copilot status dashboard (the popover anchored on the Copilot status bar entry). */
const PANEL_CTA_COMMAND_ID = 'workbench.action.chat.openStatusDashboard';
/** Agents-window command that opens the title-bar account & Copilot status panel. Registered in `sessions/contrib/accountMenu/browser/account.contribution.ts`. */
const AGENTS_CTA_COMMAND_ID = 'workbench.action.agents.openAccountMenu';

interface IBlob {
	x: number; y: number;
	rx: number; ry: number;
	speed: number; phase: number; ax: number; ay: number;
}

/** Blobs that drive the ASCII hero animation. Positions/radii are normalized 0..1. */
const BLOBS: ReadonlyArray<IBlob> = [
	{ x: 0.50, y: 0.55, rx: 0.60, ry: 0.95, speed: 0.8, phase: 0.2, ax: 0.06, ay: 0.07 },
	{ x: 0.82, y: 0.20, rx: 0.46, ry: 0.76, speed: 1.0, phase: 0.8, ax: 0.08, ay: 0.07 },
	{ x: 0.18, y: 0.78, rx: 0.43, ry: 0.72, speed: 1.1, phase: 1.2, ax: 0.065, ay: 0.08 },
];

// allow-any-unicode-next-line
const CHARS = ['.', '·', '¢', '¤', '£', '¥', '€', '$'];
// allow-any-unicode-next-line
const BG_CHARS = ['.', '·', '¢', '$'];
const FONT_SIZE = 10;
const SPEED = 0.18;

/**
 * Renders the ASCII canvas animation in the banner hero. Self-contained:
 * owns a single <canvas>, a `ResizeObserver`, and a `requestAnimationFrame`
 * loop. Disposing the instance cancels the frame loop and the observer.
 */
class BillingBannerCanvasAnimator extends Disposable {

	private readonly _ctx: CanvasRenderingContext2D;
	private _rafHandle: IDisposable | undefined;
	private _running = false;

	private _width = 0;
	private _height = 0;
	private _cols = 0;
	private _rows = 0;
	private _bgGrid: string[] = [];
	private _color = '#4e94ce';

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

		const targetWindow = dom.getWindow(this._container);
		const observer = new (targetWindow as Window & typeof globalThis).ResizeObserver(() => this._resize());
		observer.observe(this._container);
		this._register(toDisposable(() => observer.disconnect()));

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
			this._stopLoop();
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

	private _resize(): void {
		const targetWindow = dom.getWindow(this._container);
		const dpr = targetWindow.devicePixelRatio || 1;
		this._width = this._container.offsetWidth;
		this._height = this._container.offsetHeight;
		if (this._width === 0 || this._height === 0) {
			return;
		}
		// Re-read the live link color now that the container is attached and
		// CSS variables resolve. Canvas accepts the raw computed string.
		this._color = targetWindow.getComputedStyle(this._container)
			.getPropertyValue('--vscode-textLink-foreground').trim() || this._color;
		this._canvas.width = this._width * dpr;
		this._canvas.height = this._height * dpr;
		this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

		const ctx = this._ctx;
		ctx.clearRect(0, 0, this._width, this._height);
		ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
		ctx.textBaseline = 'top';
		ctx.fillStyle = this._color;

		const centers = BLOBS.map(b => ({
			cx: (b.x
				+ Math.sin(t * b.speed * SPEED + b.phase) * b.ax
				+ Math.sin(t * b.speed * SPEED * 0.61 + b.phase * 1.7) * b.ax * 0.5
				+ Math.cos(t * b.speed * SPEED * 1.37 + b.phase * 0.9) * b.ax * 0.25
			) * this._width,
			cy: (b.y
				+ Math.cos(t * b.speed * SPEED + b.phase) * b.ay
				+ Math.cos(t * b.speed * SPEED * 0.73 + b.phase * 1.3) * b.ay * 0.5
				+ Math.sin(t * b.speed * SPEED * 1.19 + b.phase * 0.6) * b.ay * 0.3
			) * this._height,
			rx: b.rx * this._width * 0.5,
			ry: b.ry * this._height * 0.5,
		}));

		// Drift a handful of ambient background characters per frame so the
		// outer field shimmers without rebuilding the entire grid.
		for (let i = 0; i < 4; i++) {
			const idx = (Math.random() * this._bgGrid.length) | 0;
			this._bgGrid[idx] = BG_CHARS[(Math.random() * BG_CHARS.length) | 0];
		}

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

				if (minDist < 0.4) {
					ctx.globalAlpha = 0.95;
					ctx.fillText(CHARS[CHARS.length - 1], col * FONT_SIZE, row * FONT_SIZE);
				} else if (minDist < 1.0) {
					const t2 = (minDist - 0.4) / 0.6;
					ctx.globalAlpha = 0.55 + (1 - minDist) * 0.4;
					ctx.fillText(CHARS[Math.round((1 - t2) * (CHARS.length - 1))], col * FONT_SIZE, row * FONT_SIZE);
				} else {
					ctx.globalAlpha = 0.28;
					ctx.fillText(this._bgGrid[row * this._cols + col], col * FONT_SIZE, row * FONT_SIZE);
				}
			}
		}
	}
}

/**
 * The Copilot usage-based billing onboarding banner. Renders a single
 * animated card above the chat input. Visible only while
 * {@link IChatBillingBannerService.shouldShow} is true; clicking the
 * close (×) affordance in the top-right marks the banner completed and
 * hides it permanently across restarts. The primary CTA executes a
 * host-specific command (open Copilot status dashboard or account
 * menu) without dismissing the banner.
 */
export class ChatBillingBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _animator: BillingBannerCanvasAnimator | undefined;

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

		this._register(this._bannerService.onDidChange(() => this._render()));
		this._register(this._accessibilityService.onDidChangeReducedMotion(() => {
			this._animator?.setReducedMotion(this._accessibilityService.isMotionReduced());
		}));
		this._render();
	}

	private _render(): void {
		this._renderDisposables.clear();
		this._animator = undefined;

		dom.clearNode(this.domNode);

		if (!this._bannerService.shouldShow) {
			this._setHostHasBanner(false);
			return;
		}

		this._setHostHasBanner(true);
		this._buildCard();
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

		// Close (×) floats top-right over the hero canvas; the primary CTA
		// sits below the body text in the card body.
		const closeBtn = dom.append(card, $('button.chat-billing-banner-close')) as HTMLButtonElement;
		closeBtn.type = 'button';
		closeBtn.setAttribute('aria-label', localize('billingBanner.close', "Close"));
		dom.append(closeBtn, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
		this._renderDisposables.add(dom.addDisposableListener(closeBtn, dom.EventType.CLICK, () => this._bannerService.markCompleted()));

		const body = dom.append(card, $('.chat-billing-banner-body'));
		const titleEl = dom.append(body, $('h2.chat-billing-banner-title'));
		titleEl.textContent = localize('billingBanner.title', "GitHub Copilot billing has changed");

		const descEl = dom.append(body, $('p.chat-billing-banner-desc'));
		descEl.textContent = localize('billingBanner.desc', "Copilot now measures usage in AI credits. Your subscription price remains unchanged and includes a monthly credit allowance.") + ' ';
		const inlineLink = dom.append(descEl, $('a.chat-billing-banner-link')) as HTMLAnchorElement;
		inlineLink.textContent = localize('billingBanner.docsLink', "Learn more about billing on GitHub Docs");
		inlineLink.href = GITHUB_DOCS_URL;
		inlineLink.rel = 'noopener noreferrer';
		this._renderDisposables.add(dom.addDisposableListener(inlineLink, dom.EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			this._openerService.open(URI.parse(GITHUB_DOCS_URL));
		}));

		const ctaBtn = this._renderDisposables.add(new Button(body, {
			...defaultButtonStyles,
			supportIcons: true,
		}));
		ctaBtn.element.classList.add('chat-billing-banner-cta');
		if (this._variant === ChatBillingBannerVariant.Panel) {
			ctaBtn.label = `$(${Codicon.copilot.id}) ${localize('billingBanner.cta.dashboard', "Open Copilot Dashboard")}`;
		} else {
			ctaBtn.label = `$(${Codicon.account.id}) ${localize('billingBanner.cta.viewAccount', "Open Account")}`;
		}
		this._renderDisposables.add(ctaBtn.onDidClick(() => this._handleCta()));
	}

	private _handleCta(): void {
		const commandId = this._variant === ChatBillingBannerVariant.Panel
			? PANEL_CTA_COMMAND_ID
			: AGENTS_CTA_COMMAND_ID;
		this._commandService.executeCommand(commandId);
	}
}
