/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, nativeImage, WebFrameMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IPreviewCaptureService, ClipThumbnail } from '../common/previewCapture.js';
import { ILogService } from '../../log/common/log.js';

interface BufferFrame {
	jpeg: Buffer;
	previewBase64: string;
	stripBase64: string;
	thumbnail: Buffer;
	timestamp: number;
}

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const DEBUG_LOG = path.join(os.tmpdir(), 'autothropic-capture-debug.log');
function debugLog(msg: string): void {
	try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* */ }
}

export class PreviewCaptureMainService extends Disposable implements IPreviewCaptureService {

	declare readonly _serviceBrand: undefined;

	private frames: BufferFrame[] = [];
	private snapshot: BufferFrame[] = [];
	private maxFrames = 100; // 20 FPS × 5 seconds
	private timer: ReturnType<typeof setInterval> | null = null;
	private proxyPort = 0;
	private active = false;
	private capturing = false;

	// Cached iframe rect (refreshed periodically)
	private cachedRect: Rect | null = null;
	private lastRectUpdate = 0;
	private _lastDiagTime = 0;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	// --- Screenshot ---

	async screenshot(proxyPort: number, deviceInfo?: { width: number; height: number; dpr: number }): Promise<{ dataUrl: string }> {
		this.logService.info('[previewCapture] screenshot()');

		const result = this.findPreviewFrame(proxyPort);
		if (!result) {
			throw new Error(`No preview frame found for proxy port ${proxyPort}`);
		}

		let image = await this.captureIframeContent(result);
		if (!image || image.isEmpty()) {
			throw new Error('capturePage returned empty image');
		}

		// Resize to actual device resolution if device info provided
		if (deviceInfo && deviceInfo.dpr > 0) {
			const targetWidth = Math.round(deviceInfo.width * deviceInfo.dpr);
			const targetHeight = Math.round(deviceInfo.height * deviceInfo.dpr);
			if (targetWidth > 0 && targetHeight > 0) {
				image = image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
				this.logService.info(`[previewCapture] Resized to ${targetWidth}x${targetHeight} (${deviceInfo.dpr}x DPR)`);
			}
		}

		const dataUrl = 'data:image/png;base64,' + image.toPNG().toString('base64');
		return { dataUrl };
	}

	// --- Clip Buffer ---

	async startClipBuffer(proxyPort: number): Promise<void> {
		if (this.active && this.proxyPort === proxyPort) {
			return;
		}

		this.logService.info('[previewCapture] startClipBuffer()', { proxyPort });

		if (this.active) {
			await this.stopClipBuffer();
		}

		this.proxyPort = proxyPort;
		this.frames = [];
		this.snapshot = [];
		this.active = true;
		this.cachedRect = null;

		// Capture at ~20 FPS like the original app
		this.timer = setInterval(() => this.captureFrame(), 50);
	}

	async stopClipBuffer(): Promise<void> {
		this.active = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.frames = [];
		// Keep snapshot for grabSelected()
	}

	async getClipThumbnails(seconds: number): Promise<ClipThumbnail[]> {
		const cutoff = Date.now() - seconds * 1000;
		this.snapshot = this.frames.filter(f => f.timestamp >= cutoff);

		return this.snapshot.map((f, i) => ({
			index: i,
			timestamp: f.timestamp,
			preview: f.previewBase64,
			strip: f.stripBase64,
		}));
	}

	async getSuggestedIndices(seconds: number, maxFrames: number): Promise<number[]> {
		if (this.snapshot.length === 0) {
			const cutoff = Date.now() - seconds * 1000;
			this.snapshot = this.frames.filter(f => f.timestamp >= cutoff);
		}
		if (this.snapshot.length === 0) { return []; }
		return this.selectKeyframeIndices(this.snapshot, maxFrames);
	}

	async grabSelected(indices: number[]): Promise<{ filePaths: string[] }> {
		const valid = indices.filter(i => i >= 0 && i < this.snapshot.length);
		if (valid.length === 0) { return { filePaths: [] }; }

		const tmpDir = path.join(os.tmpdir(), 'autothropic-clips');
		try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { /* exists */ }

		const ts = Date.now();
		const filePaths: string[] = [];

		for (let i = 0; i < valid.length; i++) {
			const frame = this.snapshot[valid[i]];
			const img = nativeImage.createFromBuffer(frame.jpeg);
			if (img.isEmpty()) { continue; }
			const filePath = path.join(tmpDir, `clip-${ts}-${i + 1}.png`);
			fs.writeFileSync(filePath, img.toPNG());
			filePaths.push(filePath);
		}

		return { filePaths };
	}

	async getClipStatus(): Promise<{ active: boolean; frameCount: number }> {
		return { active: this.active, frameCount: this.frames.length };
	}

	// --- Private: Capture the preview iframe content only ---

	private async captureIframeContent(
		result: { webContents: Electron.WebContents; frame: WebFrameMain },
	): Promise<Electron.NativeImage | null> {
		try {
			const rect = await this.getPreviewRect(result);

			if (rect && rect.width > 10 && rect.height > 10) {
				// Capture just the iframe area from the main window
				const image = await result.webContents.capturePage(rect);
				if (!image.isEmpty()) {
					return image;
				}
			}

			// Fallback: capture full window (better than nothing)
			this.logService.warn('[previewCapture] Rect unavailable, capturing full window');
			return await result.webContents.capturePage();
		} catch (err) {
			this.logService.warn('[previewCapture] captureIframeContent failed:', err);
			return null;
		}
	}

	/**
	 * Get the preview iframe's rect within the main window (CSS pixels).
	 * Uses two executeJavaScript calls:
	 * 1. In the webview frame: get the #preview-iframe element's position
	 * 2. In the main frame: get the webview iframe's position
	 * Then combines them for the absolute rect.
	 */
	private async getPreviewRect(
		result: { webContents: Electron.WebContents; frame: WebFrameMain },
	): Promise<Rect | null> {
		// Cache for 2 seconds
		if (this.cachedRect && Date.now() - this.lastRectUpdate < 2000) {
			return this.cachedRect;
		}

		try {
			const previewFrame = result.frame;

			// Walk up the frame tree to understand the hierarchy
			const ancestors: { url: string; name: string }[] = [];
			let cur: WebFrameMain | null = previewFrame;
			while (cur) {
				ancestors.push({ url: cur.url?.substring(0, 80) ?? '(none)', name: cur.name ?? '(none)' });
				cur = cur.parent;
			}
			if (!this._lastDiagTime || Date.now() - this._lastDiagTime > 10000) {
				this.logService.info('[previewCapture] Frame hierarchy:', JSON.stringify(ancestors));
			}

			// The preview iframe's parent should be the webview content frame
			const webviewFrame = previewFrame.parent;
			if (!webviewFrame) {
				this.logService.warn('[previewCapture] getPreviewRect: no parent frame');
				return null;
			}

			// Step 1: Get preview iframe rect within the webview content frame
			// Try multiple selectors since the iframe might not have id="preview-iframe"
			const innerRect = await webviewFrame.executeJavaScript(`
				(function() {
					var iframe = document.getElementById('preview-iframe');
					if (!iframe) {
						// Try finding any iframe
						var iframes = document.querySelectorAll('iframe');
						for (var i = 0; i < iframes.length; i++) {
							if (iframes[i].src && iframes[i].src.indexOf('127.0.0.1') !== -1) {
								iframe = iframes[i]; break;
							}
						}
					}
					if (!iframe) return { error: 'no iframe found', iframeCount: document.querySelectorAll('iframe').length, bodyHTML: document.body ? document.body.innerHTML.substring(0, 200) : 'no body' };
					var r = iframe.getBoundingClientRect();
					return { x: r.x, y: r.y, width: r.width, height: r.height };
				})()
			`) as (Rect & { error?: string; iframeCount?: number; bodyHTML?: string }) | null;

			if (!innerRect || innerRect.error) {
				if (!this._lastDiagTime || Date.now() - this._lastDiagTime > 10000) {
					this.logService.warn('[previewCapture] innerRect failed:', JSON.stringify(innerRect));
				}
				return null;
			}
			if (innerRect.width < 1) {
				this.logService.warn('[previewCapture] innerRect too small:', JSON.stringify(innerRect));
				return null;
			}

			// Step 2: Walk up to find the topmost webview container frame (child of mainFrame)
			// We need to find the position of the outermost webview iframe in the main window
			let topWebviewFrame = webviewFrame;
			while (topWebviewFrame.parent && topWebviewFrame.parent !== result.webContents.mainFrame) {
				topWebviewFrame = topWebviewFrame.parent;
			}

			const topFrameName = topWebviewFrame.name;
			if (!topFrameName) {
				this.logService.warn('[previewCapture] topWebviewFrame has no name, url:', topWebviewFrame.url?.substring(0, 80));
				// Try a different approach: get all iframes in main frame and find by URL
				const outerRect = await result.webContents.mainFrame.executeJavaScript(`
					(function() {
						var all = document.querySelectorAll('iframe');
						for (var i = 0; i < all.length; i++) {
							if (all[i].src && all[i].src.indexOf('vscode-webview') !== -1) {
								var r = all[i].getBoundingClientRect();
								if (r.width > 100 && r.height > 100) {
									return { x: r.x, y: r.y, width: r.width, height: r.height, src: all[i].src.substring(0, 60) };
								}
							}
						}
						return { error: 'no webview iframe', count: all.length };
					})()
				`) as (Rect & { error?: string; src?: string }) | null;

				if (!outerRect || outerRect.error) {
					this.logService.warn('[previewCapture] outerRect fallback failed:', JSON.stringify(outerRect));
					return null;
				}

				this.cachedRect = {
					x: Math.round(outerRect.x + innerRect.x),
					y: Math.round(outerRect.y + innerRect.y),
					width: Math.round(innerRect.width),
					height: Math.round(innerRect.height),
				};
				this.lastRectUpdate = Date.now();
				this.logService.info('[previewCapture] Rect (fallback):', JSON.stringify(this.cachedRect));
				return this.cachedRect;
			}

			const outerRect = await result.webContents.mainFrame.executeJavaScript(`
				(function() {
					var iframe = document.querySelector('iframe[name="${topFrameName}"]');
					if (!iframe) {
						var all = document.querySelectorAll('iframe');
						for (var i = 0; i < all.length; i++) {
							if (all[i].name === '${topFrameName}') { iframe = all[i]; break; }
						}
					}
					if (!iframe) return { error: 'not found by name: ${topFrameName}', count: document.querySelectorAll('iframe').length };
					var r = iframe.getBoundingClientRect();
					return { x: r.x, y: r.y, width: r.width, height: r.height };
				})()
			`) as (Rect & { error?: string }) | null;

			if (!outerRect || outerRect.error) {
				this.logService.warn('[previewCapture] outerRect failed:', JSON.stringify(outerRect));
				return null;
			}

			// If there are intermediate frames between topWebviewFrame and webviewFrame,
			// we need to account for their offsets too
			let intermediateX = 0;
			let intermediateY = 0;
			if (topWebviewFrame !== webviewFrame) {
				// Walk from webviewFrame up to topWebviewFrame, accumulating offsets
				let walkFrame: WebFrameMain | null = webviewFrame;
				while (walkFrame && walkFrame !== topWebviewFrame) {
					try {
						const frameOffset = await walkFrame.executeJavaScript(`
							(function() { return { x: window.frameElement ? window.frameElement.getBoundingClientRect().x : 0, y: window.frameElement ? window.frameElement.getBoundingClientRect().y : 0 }; })()
						`) as { x: number; y: number } | null;
						if (frameOffset) {
							intermediateX += frameOffset.x;
							intermediateY += frameOffset.y;
						}
					} catch { /* frame might not have access */ }
					walkFrame = walkFrame.parent;
				}
			}

			this.cachedRect = {
				x: Math.round(outerRect.x + intermediateX + innerRect.x),
				y: Math.round(outerRect.y + intermediateY + innerRect.y),
				width: Math.round(innerRect.width),
				height: Math.round(innerRect.height),
			};
			this.lastRectUpdate = Date.now();
			this.logService.info('[previewCapture] Rect computed:', JSON.stringify(this.cachedRect));
			return this.cachedRect;
		} catch (err) {
			this.logService.warn('[previewCapture] getPreviewRect failed:', err);
			return null;
		}
	}

	// --- Private: Frame Capture (clip buffer) ---

	private async captureFrame(): Promise<void> {
		if (!this.active || this.capturing) { return; }
		this.capturing = true;

		try {
			const result = this.findPreviewFrame(this.proxyPort);
			if (!result) {
				this.capturing = false;
				return;
			}

			const image = await this.captureIframeContent(result);
			if (!image || image.isEmpty()) {
				this.capturing = false;
				return;
			}

			// Full-quality JPEG for export (same as original app)
			const jpeg = image.toJPEG(85);
			// Full-size preview as base64 (same as original - no resize for preview)
			const previewBase64 = 'data:image/jpeg;base64,' + jpeg.toString('base64');

			// 64px strip for filmstrip
			const stripImg = image.resize({ width: 64, quality: 'good' });
			const stripBase64 = 'data:image/jpeg;base64,' + stripImg.toJPEG(60).toString('base64');

			// 80px bitmap for scene detection
			const detectionImg = image.resize({ width: 80, quality: 'good' });
			const thumbnail = detectionImg.toBitmap();

			this.frames.push({ jpeg, previewBase64, stripBase64, thumbnail, timestamp: Date.now() });
			if (this.frames.length > this.maxFrames) { this.frames.shift(); }
		} catch {
			// webContents may have been destroyed
		}

		this.capturing = false;
	}

	// --- Private: Frame Lookup ---

	private findPreviewFrame(port: number): { webContents: Electron.WebContents; frame: WebFrameMain } | null {
		const prefix = `http://127.0.0.1:${port}`;
		const windows = BrowserWindow.getAllWindows();

		for (const win of windows) {
			try {
				const wc = win.webContents;
				if (!wc || wc.isDestroyed()) { continue; }

				for (const frame of wc.mainFrame.framesInSubtree) {
					try {
						if (frame.url && frame.url.startsWith(prefix)) {
							return { webContents: wc, frame };
						}
					} catch { /* frame may be destroyed */ }
				}
			} catch { /* window may be destroyed */ }
		}

		// Throttled diagnostic
		if (!this._lastDiagTime || Date.now() - this._lastDiagTime > 10000) {
			this._lastDiagTime = Date.now();
			this.logService.warn(`[previewCapture] No frame found for port ${port}`);
		}

		return null;
	}

	// --- Private: Scene Detection (same as original app) ---

	private selectKeyframeIndices(frames: BufferFrame[], maxKeyframes: number): number[] {
		if (frames.length <= 2) { return frames.map((_, i) => i); }
		if (frames.length <= maxKeyframes) { return frames.map((_, i) => i); }

		const diffs: { index: number; score: number }[] = [];
		for (let i = 1; i < frames.length; i++) {
			diffs.push({ index: i, score: this.frameDiff(frames[i - 1], frames[i]) });
		}

		const sorted = diffs.map(d => d.score).sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const threshold = Math.max(median * 3, 5);

		const changes = diffs.filter(d => d.score > threshold);
		changes.sort((a, b) => b.score - a.score);

		const picked = new Set<number>();
		picked.add(0);
		picked.add(frames.length - 1);

		const slots = maxKeyframes - 2;
		for (let i = 0; i < Math.min(changes.length, slots); i++) {
			picked.add(changes[i].index);
		}

		if (picked.size < maxKeyframes) {
			const remaining = maxKeyframes - picked.size;
			const step = frames.length / (remaining + 1);
			for (let j = 1; j <= remaining; j++) {
				picked.add(Math.round(step * j));
			}
		}

		return Array.from(picked).sort((a, b) => a - b).slice(0, maxKeyframes);
	}

	private frameDiff(a: BufferFrame, b: BufferFrame): number {
		const bufA = a.thumbnail;
		const bufB = b.thumbnail;
		const len = Math.min(bufA.length, bufB.length);
		if (len === 0) { return 255; }

		let total = 0;
		let pixels = 0;
		for (let i = 0; i < len; i += 4) {
			total +=
				(Math.abs(bufA[i] - bufB[i]) +
					Math.abs(bufA[i + 1] - bufB[i + 1]) +
					Math.abs(bufA[i + 2] - bufB[i + 2])) / 3;
			pixels++;
		}
		return pixels > 0 ? total / pixels : 0;
	}

	override dispose(): void {
		this.active = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.frames = [];
		this.snapshot = [];
		super.dispose();
	}
}
