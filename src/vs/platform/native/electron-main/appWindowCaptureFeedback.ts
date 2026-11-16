/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, screen } from 'electron';
import { release } from 'os';
import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';
import { IRectangle } from '../../window/common/window.js';

/** How long the feedback stays at most, should the window that showed it never end it. */
const FEEDBACK_TIMEOUT = 20000;

/**
 * The page of the overlay, which draws the window as a card: a white light, then the screenshot under it. `flash` lights
 * up the window, `reveal` turns it into its screenshot, which lifts off the window as the light fades, `fly` moves the
 * card into a rectangle, `land` fades it there, `fade` puts it out, and `dim` only the light. All but `flash` resolve
 * once their animation ended, except `reveal`, which resolves once the screenshot shows.
 */
const OVERLAY_PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.card { position: absolute; box-sizing: border-box; overflow: hidden; pointer-events: none; }
.card > * { position: absolute; inset: 0; width: 100%; height: 100%; }
.card > img { object-fit: cover; }
.light { background: white; opacity: 0; }
</style>
</head>
<body>
<script>
'use strict';
// The window lights up this fast. As the light fades, the screenshot lifts off the window, until it flies into its
// destination, where it stays a moment before it fades, so that the destination shows under it first.
const FLASH_TIME = 120;
const LIFT_TIME = 180;
const LIFT_SCALE = 0.95;
const FLY_TIME = 280;
const LAND_DELAY = 60;
const LAND_TIME = 140;
const FADE_TIME = 150;
const card = document.createElement('div');
card.className = 'card';
const light = document.createElement('div');
light.className = 'light';
card.append(light);
let target;
let reduceMotion = false;
let peak = 0;
let revealed = false;
function frame(rect, radius) {
	return { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: radius + 'px' };
}
function scale(rect, factor) {
	const width = rect.width * factor;
	const height = rect.height * factor;
	return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}
function wait(time) {
	return new Promise(resolve => setTimeout(resolve, Math.max(time, 0)));
}
function fadeOut(element, duration) {
	return element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' }).finished;
}
function flash(rect, radius, reduce) {
	target = { rect, radius };
	reduceMotion = reduce;
	Object.assign(card.style, frame(rect, radius));
	document.body.append(card);
	peak = performance.now() + FLASH_TIME;
	light.animate([{ opacity: 0 }, { opacity: reduce ? 0.4 : 1 }], { duration: FLASH_TIME, easing: 'ease-out', fill: 'forwards' });
}
async function reveal(src) {
	let image;
	if (!reduceMotion) {
		image = new Image();
		image.alt = '';
		image.src = src;
		try {
			await image.decode();
		} catch {
			image = undefined;
		}
	}
	// The screenshot takes the place of the window under the light, at its brightest.
	await wait(peak - performance.now());
	if (image) {
		card.insertBefore(image, light);
		revealed = true;
		card.animate([frame(target.rect, target.radius), frame(scale(target.rect, LIFT_SCALE), target.radius)], { duration: LIFT_TIME, easing: 'ease-out', fill: 'forwards' });
	}
	void fadeOut(light, LIFT_TIME);
	await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));
}
async function fly(to, radius, src) {
	if (!revealed && src) {
		await reveal(src);
	}
	if (!revealed) {
		return fade();
	}
	for (const animation of card.getAnimations()) {
		animation.commitStyles();
		animation.cancel();
	}
	const from = { left: card.style.left, top: card.style.top, width: card.style.width, height: card.style.height, borderRadius: card.style.borderRadius };
	if (to) {
		await card.animate([from, frame(to, radius)], { duration: FLY_TIME, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).finished;
	} else {
		await card.animate([{ ...from, opacity: 1 }, { ...frame(scale(target.rect, 0.2), target.radius), opacity: 0 }], { duration: FLY_TIME, easing: 'ease-in', fill: 'forwards' }).finished;
	}
}
async function land() {
	if (revealed) {
		await wait(LAND_DELAY);
		await fadeOut(card, LAND_TIME);
	}
}
async function fade() {
	await fadeOut(card, FADE_TIME);
}
async function dim() {
	await fadeOut(light, FADE_TIME);
}
</script>
</body>
</html>`;

export interface IAppWindowCaptureFeedbackOptions {
	/** Whether to flash less, and keep the screenshot from moving. */
	readonly reduceMotion: boolean;
}

/** How the feedback ends, see {@link AppWindowCaptureFeedback.end}. */
export interface IAppWindowCaptureFeedbackEnd {
	/** The screenshot as a `data:` URL, which the feedback needs when the capture didn't show it. */
	readonly image?: string;
	/** The rectangle that the screenshot flies into, in screen coordinates. */
	readonly destination?: IRectangle;
	/** The corner radius of the destination. */
	readonly radius?: number;
}

/** The feedback of a capture, which the capture shows the screenshot in. */
export interface IAppWindowCaptureOverlay {
	/** Turns the window into its screenshot, a PNG, which lifts off the window. Resolves once the screenshot shows. */
	reveal(image: Buffer): Promise<void>;
	/** Puts out the flash when the capture has no screenshot to show yet, so that the window shows meanwhile. */
	dim(): Promise<void>;
}

/**
 * Shows the user which window of another application VS Code captures: the window flashes, then turns into its
 * screenshot, which lifts off the window and flies into the chat input that it goes to, where it fades as its
 * attachment shows. It draws in a transparent panel above every other window, on the display of the captured window,
 * even above applications in full screen. The panel ignores the mouse and never takes focus.
 */
export class AppWindowCaptureFeedback extends Disposable {

	/** The feedback of the capture that is under way, until the capture ends it. */
	private current: CaptureOverlay | undefined;

	private readonly overlays = new Set<CaptureOverlay>();

	constructor(private readonly logService: ILogService) {
		super();
		this._register(toDisposable(() => {
			for (const overlay of this.overlays) {
				overlay.dispose();
			}
		}));
	}

	/** Flashes the window at the given bounds, in screen coordinates, and ends the feedback that showed before. */
	show(bounds: IRectangle, options: IAppWindowCaptureFeedbackOptions): IAppWindowCaptureOverlay {
		this.current?.dispose();
		const overlay = new CaptureOverlay(bounds, options, this.logService, () => {
			this.overlays.delete(overlay);
			if (this.current === overlay) {
				this.current = undefined;
			}
		});
		this.overlays.add(overlay);
		this.current = overlay;
		return overlay;
	}

	/**
	 * Ends the feedback. Given a destination on the display of the window, the screenshot flies into it, then fades as
	 * the destination shows under it; without one, it shrinks where the window is. Without a screenshot, the flash
	 * fades. Resolves once the screenshot covers the destination, or once the feedback is gone.
	 */
	async end(screenshot: IAppWindowCaptureFeedbackEnd | undefined): Promise<void> {
		const overlay = this.current;
		this.current = undefined;
		if (!overlay) {
			return;
		}
		if (screenshot && await overlay.fly(screenshot)) {
			void overlay.land().finally(() => overlay.dispose());
			return;
		}
		if (!screenshot) {
			await overlay.fade();
		}
		overlay.dispose();
	}
}

class CaptureOverlay implements IAppWindowCaptureOverlay, IDisposable {

	private readonly window: BrowserWindow;

	/** The display that the overlay covers, in screen coordinates. */
	private readonly display: IRectangle;

	/** Resolves whether the overlay shows. */
	private readonly ready: Promise<boolean>;

	/** Completes once the overlay is gone, when Electron leaves the page's functions that were running unsettled. */
	private readonly disposed = new DeferredPromise<void>();

	private readonly timeout: ReturnType<typeof setTimeout>;

	constructor(bounds: IRectangle, options: IAppWindowCaptureFeedbackOptions, private readonly logService: ILogService, private readonly onDidDispose: () => void) {
		this.display = screen.getDisplayMatching(bounds).bounds;
		this.window = new BrowserWindow({
			...this.display,
			// Unlike other windows, a panel shows above applications in full screen.
			...(isMacintosh ? { type: 'panel' } : {}),
			show: false,
			frame: false,
			transparent: true,
			backgroundColor: '#00000000',
			hasShadow: false,
			resizable: false,
			movable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			focusable: false,
			skipTaskbar: true,
			alwaysOnTop: true,
			hiddenInMissionControl: true,
			enableLargerThanScreen: true,
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				spellcheck: false,
				backgroundThrottling: false,
			},
		});
		this.window.setIgnoreMouseEvents(true);
		this.window.setAlwaysOnTop(true, 'screen-saver');
		// The captured window can be on another Space than VS Code, or in full screen.
		this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
		if (isMacintosh) {
			this.window.excludedFromShownWindowsMenu = true;
		}

		const target = { x: bounds.x - this.display.x, y: bounds.y - this.display.y, width: bounds.width, height: bounds.height };
		this.ready = this.load(`flash(${JSON.stringify(target)}, ${getWindowRadius(bounds, this.display)}, ${JSON.stringify(!!options.reduceMotion)})`);
		this.timeout = setTimeout(() => this.dispose(), FEEDBACK_TIMEOUT);
	}

	async reveal(image: Buffer): Promise<void> {
		await this.run(`reveal(${JSON.stringify(`data:image/png;base64,${image.toString('base64')}`)})`);
	}

	async dim(): Promise<void> {
		await this.run('dim()');
	}

	/** Flies the screenshot into the destination, or shrinks it where the window is. Resolves whether it covers the destination. */
	async fly(screenshot: IAppWindowCaptureFeedbackEnd): Promise<boolean> {
		const destination = this.toOverlay(screenshot.destination);
		const flown = await this.run(`fly(${JSON.stringify(destination ?? null)}, ${JSON.stringify(Number(screenshot.radius) || 0)}, ${JSON.stringify(screenshot.image ?? null)})`);
		return flown && !!destination;
	}

	land(): Promise<boolean> {
		return this.run('land()');
	}

	fade(): Promise<boolean> {
		return this.run('fade()');
	}

	dispose(): void {
		clearTimeout(this.timeout);
		void this.disposed.complete();
		if (!this.window.isDestroyed()) {
			this.window.destroy();
		}
		this.onDidDispose();
	}

	private async load(script: string): Promise<boolean> {
		try {
			await this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_PAGE)}`);
			if (this.window.isDestroyed()) {
				return false;
			}
			this.window.showInactive();
			return await this.execute(script);
		} catch (error) {
			if (!this.window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] Showing the feedback failed:', error);
			}
			return false;
		}
	}

	/** Runs a function of the page, and resolves whether it ran. */
	private async run(script: string): Promise<boolean> {
		try {
			if (!await this.ready || this.window.isDestroyed()) {
				return false;
			}
			return await this.execute(script);
		} catch (error) {
			if (!this.window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] The feedback failed:', error);
			}
			return false;
		}
	}

	/** Runs a script in the page, and resolves whether it ran, or `false` once the overlay is gone. */
	private execute(script: string): Promise<boolean> {
		return Promise.race([this.window.webContents.executeJavaScript(script).then(() => true), this.disposed.p.then(() => false)]);
	}

	/** The rectangle in the coordinates of the overlay, when its center is on the display of the overlay. */
	private toOverlay(rect: IRectangle | undefined): IRectangle | undefined {
		if (!rect) {
			return undefined;
		}
		const x = rect.x - this.display.x;
		const y = rect.y - this.display.y;
		const centerX = x + rect.width / 2;
		const centerY = y + rect.height / 2;
		return centerX >= 0 && centerY >= 0 && centerX <= this.display.width && centerY <= this.display.height ? { x, y, width: rect.width, height: rect.height } : undefined;
	}
}

/** The corner radius of a window of macOS, which macOS 26 (Darwin 25) rounds more. A window in full screen has none. */
function getWindowRadius(bounds: IRectangle, display: IRectangle): number {
	if (bounds.x <= display.x && bounds.y <= display.y && bounds.x + bounds.width >= display.x + display.width && bounds.y + bounds.height >= display.y + display.height) {
		return 0;
	}
	return parseInt(release(), 10) >= 25 ? 16 : 10;
}
