/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IBrowserDeviceProfile } from '../common/browserView.js';
import { ILogService } from '../../log/common/log.js';
import type { BrowserView } from './browserView.js';

/**
 * Manages device emulation for a browser view. The renderer is authoritative
 * for layout (it computes the on-screen size and emulation scale); this class
 * just forwards values to `webContents.enableDeviceEmulation` and manages the
 * touch / media / user-agent overrides that have no native Electron equivalent.
 */
export class BrowserViewEmulator extends Disposable {

	private _device: IBrowserDeviceProfile | undefined;
	private readonly _defaultUserAgent: string;
	private _lastApplied: { viewportWidth: number; viewportHeight: number; scale: number; hostZoom: number } | undefined;

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
			if (this._device) {
				void this._applyTouchAndMedia();
				this._lastApplied = undefined;
			}
		};
		this.browser.webContents.on('did-navigate', onNavigate);
		this._register(toDisposable(() => this.browser.webContents.removeListener('did-navigate', onNavigate)));
	}

	get device(): IBrowserDeviceProfile | undefined {
		return this._device;
	}

	async setDevice(device: IBrowserDeviceProfile | undefined): Promise<void> {
		const prev = this._device;
		this._device = device;

		const nextUA = device?.userAgent;
		if (prev?.userAgent !== nextUA) {
			this.browser.webContents.setUserAgent(nextUA ?? this._defaultUserAgent);
		}

		const mobileChanged = !!prev?.mobile !== !!device?.mobile;
		const toggled = !!prev !== !!device;
		if (mobileChanged || toggled) {
			await this._applyTouchAndMedia();
		}

		this._lastApplied = undefined;
		if (!device && this.isSafeToApplyEmulation()) {
			this.browser.webContents.disableDeviceEmulation();
		}

		this._onDidChange.fire(device);
	}

	/**
	 * Apply viewport + scale via Chromium's emulation API. `hostZoom` is the host
	 * window's CSS-to-screen zoom factor: bounds in main are multiplied by it,
	 * so the emulation scale must be too or the emulated viewport won't fill
	 * the WebContentsView when the workbench is zoomed.
	 */
	applyScreenEmulation(viewportWidth: number, viewportHeight: number, scale: number, hostZoom: number): void {
		if (!this._device || !this.isSafeToApplyEmulation()) {
			return;
		}
		const w = Math.max(1, Math.round(viewportWidth));
		const h = Math.max(1, Math.round(viewportHeight));
		const z = Math.max(0.01, hostZoom);
		const s = Math.max(0.01, scale);
		const last = this._lastApplied;
		if (last && last.viewportWidth === w && last.viewportHeight === h
			&& Math.abs(last.scale - s) < 0.0001 && Math.abs(last.hostZoom - z) < 0.0001) {
			return;
		}
		this._lastApplied = { viewportWidth: w, viewportHeight: h, scale: s, hostZoom: z };
		this.browser.webContents.enableDeviceEmulation({
			screenPosition: this._device.mobile ? 'mobile' : 'desktop',
			screenSize: { width: w, height: h },
			viewSize: { width: w, height: h },
			deviceScaleFactor: this._device.deviceScaleFactor ?? 0,
			viewPosition: { x: 0, y: 0 },
			scale: s * z,
		});
	}

	private isSafeToApplyEmulation(): boolean {
		return !this.browser.webContents.isDestroyed() && !!this.browser.webContents.getURL();
	}

	private async _applyTouchAndMedia(): Promise<void> {
		if (!this.isSafeToApplyEmulation()) {
			return;
		}
		const mobile = !!this._device?.mobile;
		try {
			await this.browser.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
			await this.browser.debugger.sendCommand('Emulation.setEmulatedMedia', { features: this._device ? [{ name: 'pointer', value: mobile ? 'coarse' : 'fine' }] : [] });
			await this.browser.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', { enabled: mobile });
		} catch (err) {
			this.logService.error('[BrowserViewEmulator] _applyTouchAndMedia failed', err);
		}
	}
}
