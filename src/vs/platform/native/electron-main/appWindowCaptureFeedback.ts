/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, screen } from 'electron';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';
import { IRectangle } from '../../window/common/window.js';

/** How long the feedback stays at most, should the window that showed it never end it. */
const FEEDBACK_TIMEOUT = 20000;

/**
 * The page of the overlay. `highlight` lights up the window, `fly` turns the window into its screenshot and shrinks
 * that into a rectangle, and `fade` puts the light out. The last two resolve once their animation ended.
 */
const OVERLAY_PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.light, .shot { position: absolute; box-sizing: border-box; border-radius: 12px; pointer-events: none; }
.shot { box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4); transform-origin: center; }
</style>
</head>
<body>
<script>
'use strict';
const light = document.createElement('div');
light.className = 'light';
// The window stays lit this long at least, however fast the capture is, so that the user sees which window it took.
const LIT_TIME = 450;
let litAt = 0;
function place(element, rect) {
	element.style.left = rect.x + 'px';
	element.style.top = rect.y + 'px';
	element.style.width = rect.width + 'px';
	element.style.height = rect.height + 'px';
}
function highlight(rect, color, reduceMotion) {
	place(light, rect);
	document.body.append(light);
	litAt = performance.now();
	const ring = '0 0 0 3px ' + color + ', 0 0 32px 6px ' + color;
	light.animate(reduceMotion ? [
		{ opacity: 0, boxShadow: ring },
		{ opacity: 1, boxShadow: ring },
	] : [
		{ opacity: 0, backgroundColor: 'rgba(255, 255, 255, 0)', boxShadow: '0 0 0 0 ' + color },
		{ opacity: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)', boxShadow: '0 0 0 3px ' + color + ', 0 0 56px 14px ' + color, offset: 0.35 },
		{ opacity: 1, backgroundColor: 'rgba(255, 255, 255, 0)', boxShadow: ring },
	], { duration: reduceMotion ? 150 : 500, easing: 'ease-out', fill: 'forwards' });
}
async function fade() {
	await light.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished;
}
async function fly(src, from, to, reduceMotion) {
	if (reduceMotion) {
		return fade();
	}
	const shot = new Image();
	shot.className = 'shot';
	shot.src = src;
	place(shot, from);
	try {
		await shot.decode();
	} catch {
		return fade();
	}
	const lit = performance.now() - litAt;
	if (lit < LIT_TIME) {
		await new Promise(resolve => setTimeout(resolve, LIT_TIME - lit));
	}
	document.body.append(shot);
	light.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
	const scale = Math.min(to.width / from.width, to.height / from.height);
	const moved = 'translate(' + (to.x + to.width / 2 - from.x - from.width / 2) + 'px, ' + (to.y + to.height / 2 - from.y - from.height / 2) + 'px) scale(' + scale + ')';
	// Scaled down, the corners would vanish, so they grow as the screenshot shrinks.
	const radius = Math.min(6 / scale, 120) + 'px';
	await shot.animate([
		{ transform: 'none', borderRadius: '12px', opacity: 1 },
		{ transform: 'scale(0.95)', borderRadius: '12px', opacity: 1, offset: 0.15 },
		{ transform: moved, borderRadius: radius, opacity: 1, offset: 0.9 },
		{ transform: moved, borderRadius: radius, opacity: 0 },
	], { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).finished;
}
</script>
</body>
</html>`;

export interface IAppWindowCaptureFeedbackOptions {
	/** The color of the light around the window, in CSS. */
	readonly color: string;
	/** Whether to only fade, rather than move the screenshot. */
	readonly reduceMotion: boolean;
}

interface IOverlay {
	readonly window: BrowserWindow;
	/** The display that the overlay covers, in screen coordinates. */
	readonly display: IRectangle;
	/** The window that is captured, in the coordinates of the overlay. */
	readonly target: IRectangle;
	readonly reduceMotion: boolean;
	/** Resolves whether the overlay lights up the window. */
	readonly ready: Promise<boolean>;
	readonly timeout: ReturnType<typeof setTimeout>;
}

/**
 * Shows the user that VS Code captures a window of another application: it lights up the window, then turns it into
 * its screenshot, which shrinks into the chat input that it goes to. It draws in a transparent window above every
 * other window, on the display of the captured window, which ignores the mouse and never takes focus.
 */
export class AppWindowCaptureFeedback extends Disposable {

	private overlay: IOverlay | undefined;

	constructor(private readonly logService: ILogService) {
		super();
		this._register(toDisposable(() => this.close(this.overlay)));
	}

	/** Lights up the window at the given bounds, in screen coordinates, and ends the feedback that showed before. */
	show(bounds: IRectangle, options: IAppWindowCaptureFeedbackOptions): void {
		this.close(this.overlay);

		const display = screen.getDisplayMatching(bounds).bounds;
		const window = new BrowserWindow({
			...display,
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
		window.setIgnoreMouseEvents(true);
		window.setAlwaysOnTop(true, 'screen-saver');
		// The captured window can be on another Space than VS Code.
		window.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
		if (isMacintosh) {
			window.excludedFromShownWindowsMenu = true;
		}

		const target = { x: bounds.x - display.x, y: bounds.y - display.y, width: bounds.width, height: bounds.height };
		const overlay: IOverlay = {
			window,
			display,
			target,
			reduceMotion: options.reduceMotion,
			ready: this.load(window, `highlight(${JSON.stringify(target)}, ${JSON.stringify(options.color)}, ${options.reduceMotion})`),
			timeout: setTimeout(() => this.close(overlay), FEEDBACK_TIMEOUT),
		};
		this.overlay = overlay;
	}

	/**
	 * Ends the feedback: given the screenshot as a `data:` URL, the window turns into it, which shrinks into the
	 * destination, in screen coordinates, or where the window is when the destination is on another display. Without a
	 * screenshot, the light goes out. Resolves once the feedback is gone.
	 */
	async end(screenshot: { readonly image: string; readonly destination: IRectangle | undefined } | undefined): Promise<void> {
		const overlay = this.overlay;
		if (!overlay) {
			return;
		}
		try {
			if (await overlay.ready && !overlay.window.isDestroyed()) {
				await overlay.window.webContents.executeJavaScript(screenshot
					? `fly(${JSON.stringify(screenshot.image)}, ${JSON.stringify(overlay.target)}, ${JSON.stringify(this.getDestination(overlay, screenshot.destination))}, ${overlay.reduceMotion})`
					: 'fade()');
			}
		} catch (error) {
			this.logService.error('[AppWindowCaptureFeedback] Ending the feedback failed:', error);
		} finally {
			this.close(overlay);
		}
	}

	private async load(window: BrowserWindow, script: string): Promise<boolean> {
		try {
			await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_PAGE)}`);
			if (window.isDestroyed()) {
				return false;
			}
			window.showInactive();
			await window.webContents.executeJavaScript(script);
			return true;
		} catch (error) {
			if (!window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] Showing the feedback failed:', error);
			}
			return false;
		}
	}

	/** The rectangle that the screenshot shrinks into, in the coordinates of the overlay. */
	private getDestination(overlay: IOverlay, destination: IRectangle | undefined): IRectangle {
		if (destination) {
			const rect = { x: destination.x - overlay.display.x, y: destination.y - overlay.display.y, width: destination.width, height: destination.height };
			const centerX = rect.x + rect.width / 2;
			const centerY = rect.y + rect.height / 2;
			if (centerX >= 0 && centerY >= 0 && centerX <= overlay.display.width && centerY <= overlay.display.height) {
				return rect;
			}
		}
		const { target } = overlay;
		return { x: target.x + target.width * 0.4, y: target.y + target.height * 0.4, width: target.width * 0.2, height: target.height * 0.2 };
	}

	private close(overlay: IOverlay | undefined): void {
		if (!overlay) {
			return;
		}
		if (this.overlay === overlay) {
			this.overlay = undefined;
		}
		clearTimeout(overlay.timeout);
		if (!overlay.window.isDestroyed()) {
			overlay.window.destroy();
		}
	}
}
