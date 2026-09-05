/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IBrowserDeviceProfile } from '../common/browserView.js';
import { ILogService } from '../../log/common/log.js';
import type { BrowserView } from './browserView.js';
import { ICDPConnection } from '../common/cdp/types.js';

/**
 * Manages device emulation for a browser view. The renderer is authoritative
 * for the on-screen container size and scale; this class derives the emulated
 * viewport from the current device profile (falling back to container size /
 * scale when width/height are unset) and forwards values to
 * `webContents.enableDeviceEmulation`. It also manages the touch / media /
 * user-agent overrides that have no native Electron equivalent.
 */
export class BrowserViewEmulator extends Disposable {

	private _device: IBrowserDeviceProfile | undefined;
	private readonly _defaultUserAgent: string;
	private _lastLayout = { containerWidth: 1024, containerHeight: 768, scale: 1, hostZoom: 1 };
	private _lastApplied: { viewportWidth: number; viewportHeight: number; scale: number; hostZoom: number; mobile: boolean } | undefined;

	private readonly _onDidChange = this._register(new Emitter<IBrowserDeviceProfile | undefined>());
	readonly onDidChange: Event<IBrowserDeviceProfile | undefined> = this._onDidChange.event;

	constructor(
		private readonly browser: BrowserView,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._defaultUserAgent = this.browser.webContents.getUserAgent();

		// Chromium may reset emulation on cross-process navigation.
		const onNavigate = () => {
			this._lastApplied = undefined;
			void this._reapply();
		};
		this.browser.webContents.on('did-navigate', onNavigate);

		// Intercept external CDP emulation commands and fold them into the device profile so there is a single source of truth.
		this._register(this.browser.debugger.registerCommandInterceptor((method, params, session) => this._intercept(method, params, session)));
	}

	get device(): IBrowserDeviceProfile | undefined {
		return this._device;
	}

	get emulatedScaleFactor(): number {
		if (!this._lastLayout) {
			return 1;
		}
		return this._lastLayout.scale * this._lastLayout.hostZoom;
	}

	async setDevice(device: IBrowserDeviceProfile | undefined): Promise<void> {
		const prev = this._device;
		this._device = device;

		const nextUA = device?.userAgent;
		if (prev?.userAgent !== nextUA) {
			this.browser.webContents.setUserAgent(nextUA ?? this._defaultUserAgent);
		}

		if (prev && !device && this.isSafeToApplyEmulation()) {
			this.browser.webContents.disableDeviceEmulation();
			void this._applyTouchAndMedia();
		}

		this._lastApplied = undefined;
		if (device && this.isSafeToApplyEmulation()) {
			this._reapply();
		}

		this._onDidChange.fire(device);
	}

	/**
	 * Update the cached layout (container size + scale + host zoom) and reapply
	 * emulation. The emulated viewport is derived from the current device's
	 * width / height; when those are undefined the viewport auto-fits to the
	 * container at the given scale. `hostZoom` is the host window's
	 * CSS-to-screen zoom factor — bounds in main are multiplied by it, so the
	 * emulation scale must be too or the emulated viewport won't fill the
	 * WebContentsView when the workbench is zoomed.
	 */
	applyScreenEmulation(containerWidth: number, containerHeight: number, scale: number, hostZoom: number): void {
		this._lastLayout = { containerWidth, containerHeight, scale, hostZoom };
		this._reapply();
	}

	private _reapply(): void {
		if (!this._device || !this.isSafeToApplyEmulation()) {
			return;
		}
		const { containerWidth, containerHeight, scale, hostZoom } = this._lastLayout;
		const s = Math.max(0.01, scale);
		const z = Math.max(0.01, hostZoom);
		const w = Math.max(1, Math.round(this._device.width || containerWidth / s));
		const h = Math.max(1, Math.round(this._device.height || containerHeight / s));
		const mobile = !!this._device.mobile;
		const last = this._lastApplied;
		if (last && last.viewportWidth === w && last.viewportHeight === h
			&& Math.abs(last.scale - s) < 0.0001 && Math.abs(last.hostZoom - z) < 0.0001
			&& last.mobile === mobile) {
			return;
		}
		this._lastApplied = { viewportWidth: w, viewportHeight: h, scale: s, hostZoom: z, mobile };
		const params: Electron.Parameters = {
			screenPosition: mobile ? 'mobile' : 'desktop',
			screenSize: { width: w, height: h },
			viewSize: { width: w, height: h },
			deviceScaleFactor: this._device.deviceScaleFactor ?? 0,
			viewPosition: { x: 0, y: 0 },
			scale: s * z,
		};

		// There's a bug where `screenPosition: 'mobile'` doesn't apply scaling correctly on the first call of enabling emulation,
		// so we have to first enable emulation in desktop mode and then switch it to mobile below.
		if (mobile && !last) {
			this.browser.webContents.enableDeviceEmulation({
				...params,
				screenPosition: 'desktop',
			});
		}

		this.browser.webContents.enableDeviceEmulation(params);

		if (mobile !== last?.mobile) {
			void this._applyTouchAndMedia();
		}
	}

	private isSafeToApplyEmulation(): boolean {
		return !this.browser.webContents.isDestroyed() && !!this.browser.webContents.getURL();
	}

	private async _applyTouchAndMedia(): Promise<void> {
		if (!this.isSafeToApplyEmulation()) {
			return;
		}
		const device = this._device;
		const mobile = !!this._device?.mobile;
		try {
			await this.browser.debugger.sendCommandRaw('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
			if (this.device !== device) { return; } // Bail if device changed while we were awaiting

			await this.browser.debugger.sendCommandRaw('Emulation.setEmulatedMedia', { features: this._device ? [{ name: 'pointer', value: mobile ? 'coarse' : 'fine' }] : [] });
			if (this.device !== device) { return; } // Bail if device changed while we were awaiting

			await this.browser.debugger.sendCommandRaw('Emulation.setEmitTouchEventsForMouse', { enabled: mobile });
		} catch (err) {
			this.logService.error('[BrowserViewEmulator] _applyTouchAndMedia failed', err);
		}
	}

	/**
	 * Intercept incoming CDP emulation commands and fold the ones that map onto
	 * {@link IBrowserDeviceProfile} into the device. Anything we don't model
	 * (geolocation, timezone, CPU throttling, locale, vision deficiency, …)
	 * falls through to raw CDP. Only the root session is intercepted — worker
	 * and iframe sub-sessions get pass-through behavior.
	 */
	private _intercept(method: string, params: unknown, session: ICDPConnection | undefined): Promise<unknown> | undefined {
		if (session && session.targetId !== this.browser.debugger.targetId) {
			return undefined;
		}

		switch (method) {
			case 'Emulation.setDeviceMetricsOverride': {
				const p = (params ?? {}) as { width?: number; height?: number; mobile?: boolean; deviceScaleFactor?: number };
				const next: IBrowserDeviceProfile = {
					...this._device,
					// CDP uses 0 to disable the corresponding override.
					width: p.width || undefined,
					height: p.height || undefined,
					mobile: p.mobile ?? this._device?.mobile,
					deviceScaleFactor: p.deviceScaleFactor ?? this._device?.deviceScaleFactor,
				};
				return this.setDevice(next).then(() => ({}));
			}
			case 'Emulation.clearDeviceMetricsOverride': {
				if (!this._device) {
					return Promise.resolve({});
				}
				const { width, height, mobile, deviceScaleFactor, ...rest } = this._device;
				const hasRest = Object.values(rest).some(v => v !== undefined);
				return this.setDevice(hasRest ? rest : undefined).then(() => ({}));
			}
			case 'Emulation.setUserAgentOverride': {
				const p = (params ?? {}) as { userAgent?: string; acceptLanguage?: string; platform?: string; userAgentMetadata?: unknown };
				// Only fold the bare-string case; richer client-hint params would
				// not round-trip through our model, so let them go raw.
				if (p.acceptLanguage !== undefined || p.platform !== undefined || p.userAgentMetadata !== undefined) {
					return undefined;
				}
				const ua = p.userAgent || undefined;
				return this.setDevice({ ...this._device, userAgent: ua }).then(() => ({}));
			}
			case 'Input.dispatchMouseEvent':
			case 'Input.dispatchDragEvent':
			case 'Input.synthesizeScrollGesture':
			case 'Input.synthesizePinchGesture':
			case 'Input.synthesizeTapGesture':
			case 'Input.dispatchTouchEvent':
				this._scaleInputCoordinates(params);
				return undefined; // let the event pass through with the modified parameters
			default:
				return undefined;
		}
	}

	/**
	 * Scale any coordinate-bearing fields on a CDP `Input.*` params object in
	 * place so screen-space coordinates map onto the emulated viewport. Handles
	 * point coordinates (`x` / `y`), mouse wheel deltas (`deltaX` / `deltaY`),
	 * scroll distances (`xDistance` / `yDistance`) and touch points.
	 */
	private _scaleInputCoordinates(params: unknown): void {
		const scale = this.emulatedScaleFactor;
		const p = (params ?? {}) as {
			x?: number;
			y?: number;
			deltaX?: number;
			deltaY?: number;
			xDistance?: number;
			yDistance?: number;
			touchPoints?: { x: number; y: number }[];
		};
		if (p.x) {
			p.x *= scale;
		}
		if (p.y) {
			p.y *= scale;
		}
		if (p.deltaX) {
			p.deltaX *= scale;
		}
		if (p.deltaY) {
			p.deltaY *= scale;
		}
		if (p.xDistance) {
			p.xDistance *= scale;
		}
		if (p.yDistance) {
			p.yDistance *= scale;
		}
		if (Array.isArray(p.touchPoints)) {
			p.touchPoints = p.touchPoints.map((t) => ({
				...t,
				x: t.x * scale,
				y: t.y * scale,
			}));
		}
	}
}
