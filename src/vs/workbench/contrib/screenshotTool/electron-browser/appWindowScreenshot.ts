/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeAppWindow, INativeAppWindows, INativeHostService } from '../../../../platform/native/common/native.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IScreenshotToolImage } from '../browser/screenshotTool.js';

export const IAppWindowScreenshotService = createDecorator<IAppWindowScreenshotService>('appWindowScreenshotService');

/** How a capture found the window of another app: the frontmost one, or one that the user picked in a list or in the system's picker. */
export type AppWindowScreenshotTarget = 'frontmost' | 'picked' | 'systemPicked';

export type AppWindowScreenshotResult =
	| { readonly kind: 'captured'; readonly target: AppWindowScreenshotTarget; readonly window: INativeAppWindow; readonly image: IScreenshotToolImage }
	/** The user cancelled picking the window. */
	| { readonly kind: 'cancelled'; readonly target: AppWindowScreenshotTarget }
	/** No other app shows a window. */
	| { readonly kind: 'noWindow'; readonly target: AppWindowScreenshotTarget }
	/** macOS needs the Screen Recording permission, see {@link IAppWindowScreenshotService.requestPermission}. */
	| { readonly kind: 'permissionRequired'; readonly target: AppWindowScreenshotTarget }
	| { readonly kind: 'failed'; readonly target: AppWindowScreenshotTarget; readonly window: INativeAppWindow | undefined };

export interface IAppWindowScreenshotOptions {
	/** Lets the user pick the window in a list, instead of capturing the frontmost window of another app. */
	readonly pick?: boolean;
	/** The window to capture, such as the frontmost window that a menu named before the user chose it. */
	readonly window?: INativeAppWindow;
}

/** Whether capturing the windows of other apps has the permission that it needs. */
export type AppWindowScreenshotPermission =
	| 'granted'
	/** macOS needs the Screen Recording permission, which the user can turn on in System Settings. */
	| 'notGranted'
	/** The Screen Recording permission is restricted, such as by parental controls or by the organization that manages the Mac. */
	| 'restricted'
	/** The platform needs no permission. */
	| 'notRequired';

/**
 * Captures the windows of other apps, such as a browser or a simulator that runs the app that the user builds.
 */
export interface IAppWindowScreenshotService {
	readonly _serviceBrand: undefined;

	/** Whether the user has captured the window of another app, in any window of VS Code or of the Agents window. */
	readonly hasCaptured: boolean;

	/** Fires when {@link hasCaptured} changes, including when another window captured. */
	readonly onDidChangeHasCaptured: Event<void>;

	/**
	 * Returns the window that a capture takes: the frontmost window of another app, which is the one that the user looks
	 * at, or the one they left for VS Code. It never shows system UI, so it returns `undefined` when finding the window
	 * needs a permission or the system's window picker.
	 */
	getFrontmostWindow(): Promise<INativeAppWindow | undefined>;

	/** Returns whether capturing has the permission that it needs, without asking for it. */
	getPermission(): Promise<AppWindowScreenshotPermission>;

	/**
	 * Asks for the Screen Recording permission on macOS, which lists VS Code under Screen Recording in System Settings,
	 * and opens System Settings there, where the user turns it on. macOS also prompts the first time.
	 */
	requestPermission(): Promise<void>;

	/**
	 * Captures the window of another app as it is shown. Only call it when the user asked for it, as it asks for the
	 * Screen Recording permission on macOS the first time, and shows the system's window picker in Wayland sessions.
	 */
	capture(options?: IAppWindowScreenshotOptions): Promise<AppWindowScreenshotResult>;
}

/** Names a window of another app by its title. */
export function getAppWindowLabel(window: INativeAppWindow): string {
	return window.title.trim() || localize('untitledAppWindow', "Untitled Window");
}

/** Lets a capture keep the resolution of windows on large displays, which Chromium would otherwise scale down to 2880×1800. */
const MAX_CAPTURE_SIZE = 8192;

/** How long a capture waits for the first frame of the window. */
const FRAME_TIMEOUT = 5000;

const MAC_SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** Remembers that the user captured the window of another app, for VS Code and the Agents window alike. */
const CAPTURED_STORAGE_KEY = 'chat.appWindowScreenshots.captured';

/** Electron's constraints to capture a desktop media source, which the DOM typings don't describe. */
type DesktopMediaTrackConstraints = MediaTrackConstraints & {
	readonly mandatory: {
		readonly chromeMediaSource: 'desktop';
		readonly chromeMediaSourceId: string;
		readonly maxWidth: number;
		readonly maxHeight: number;
	};
};

interface IAppWindowPickItem extends IQuickPickItem {
	readonly window: INativeAppWindow;
}

export class AppWindowScreenshotService extends Disposable implements IAppWindowScreenshotService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeHasCaptured = this._register(new Emitter<void>());
	readonly onDidChangeHasCaptured = this._onDidChangeHasCaptured.event;

	get hasCaptured(): boolean {
		return this.storageService.getBoolean(CAPTURED_STORAGE_KEY, StorageScope.APPLICATION_SHARED, false);
	}

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, CAPTURED_STORAGE_KEY, this._store)(() => this._onDidChangeHasCaptured.fire()));
	}

	async getFrontmostWindow(): Promise<INativeAppWindow | undefined> {
		try {
			const windows = await this.nativeHostService.getAppWindows();
			return windows.kind === 'windows' ? windows.windows[0] : undefined;
		} catch (error) {
			this.logService.error('[AppWindowScreenshot] Listing the windows of other apps failed:', error);
			return undefined;
		}
	}

	async getPermission(): Promise<AppWindowScreenshotPermission> {
		if (!isMacintosh) {
			return 'notRequired';
		}
		switch (await this.nativeHostService.getMediaAccessStatus('screen')) {
			case 'granted': return 'granted';
			case 'restricted': return 'restricted';
			default: return 'notGranted';
		}
	}

	async requestPermission(): Promise<void> {
		if (!isMacintosh) {
			return;
		}
		try {
			await this.nativeHostService.requestScreenCaptureAccess();
		} catch (error) {
			// Without the permission, the request rejects after macOS listed VS Code, and prompted the first time.
			this.logService.trace('[AppWindowScreenshot] The Screen Recording request was rejected:', error);
		}
		await this.nativeHostService.openExternal(MAC_SCREEN_RECORDING_SETTINGS_URL);
	}

	async capture(options: IAppWindowScreenshotOptions = {}): Promise<AppWindowScreenshotResult> {
		let target: AppWindowScreenshotTarget = options.pick ? 'picked' : 'frontmost';
		let window = options.window;
		if (!window) {
			let windows: INativeAppWindows;
			try {
				windows = await this.nativeHostService.getAppWindows();
				if (windows.kind === 'systemPicker') {
					target = 'systemPicked';
				}
				if (windows.kind !== 'windows') {
					windows = await this.nativeHostService.getAppWindows({ interactive: true });
				}
			} catch (error) {
				if (target === 'systemPicked') {
					// Electron rejects when the user dismisses the system's picker, which it doesn't tell apart from a failure.
					this.logService.trace('[AppWindowScreenshot] The system picker returned no window:', error);
					return { kind: 'cancelled', target };
				}
				this.logService.error('[AppWindowScreenshot] Listing the windows of other apps failed:', error);
				return { kind: 'failed', target, window: undefined };
			}
			if (windows.kind === 'permissionRequired') {
				return { kind: 'permissionRequired', target };
			}
			if (windows.kind !== 'windows') {
				return { kind: 'failed', target, window: undefined };
			}
			if (target === 'systemPicked') {
				// The system's picker lists the window that the user picked, or none when they cancelled.
				window = windows.windows[0];
				if (!window) {
					return { kind: 'cancelled', target };
				}
			} else if (!windows.windows.length) {
				return { kind: 'noWindow', target };
			} else if (options.pick) {
				window = await this.pick(windows.windows);
				if (!window) {
					return { kind: 'cancelled', target };
				}
			} else {
				window = windows.windows[0];
			}
		}

		try {
			const image = await this.captureWindow(window);
			if (!image) {
				return { kind: 'failed', target, window };
			}
			if (!this.hasCaptured) {
				this.storageService.store(CAPTURED_STORAGE_KEY, true, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			}
			return { kind: 'captured', target, window, image };
		} catch (error) {
			// macOS can revoke Screen Recording while the user picks the window.
			const permission = await this.getPermission();
			if (permission === 'notGranted' || permission === 'restricted') {
				return { kind: 'permissionRequired', target };
			}
			this.logService.error('[AppWindowScreenshot] Capturing a window failed:', error);
			return { kind: 'failed', target, window };
		}
	}

	private async pick(windows: readonly INativeAppWindow[]): Promise<INativeAppWindow | undefined> {
		const picked = await this.quickInputService.pick<IAppWindowPickItem>(windows.map(window => ({
			label: getAppWindowLabel(window),
			iconPath: window.iconDataUrl ? { dark: URI.parse(window.iconDataUrl) } : undefined,
			window,
		})), {
			placeHolder: localize('pickAppWindow', "Select the window of the app to capture"),
		});
		return picked?.window;
	}

	/** Captures one frame of the window, at its full resolution. */
	private async captureWindow(window: INativeAppWindow): Promise<IScreenshotToolImage | undefined> {
		const video: DesktopMediaTrackConstraints = {
			mandatory: {
				chromeMediaSource: 'desktop',
				chromeMediaSourceId: window.sourceId,
				maxWidth: MAX_CAPTURE_SIZE,
				maxHeight: MAX_CAPTURE_SIZE,
			},
		};
		const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
		try {
			const [track] = stream.getVideoTracks();
			if (!track) {
				return undefined;
			}
			const grab = new ImageCapture(track).grabFrame();
			// A frame that arrives after the timeout holds the full image until it is closed.
			const frame = await raceTimeout(grab, FRAME_TIMEOUT, () => {
				void grab.then(late => late.close(), () => { });
			});
			if (!frame) {
				return undefined;
			}
			try {
				const canvas = $<HTMLCanvasElement>('canvas');
				canvas.width = frame.width;
				canvas.height = frame.height;
				const context = canvas.getContext('2d');
				if (!context) {
					return undefined;
				}
				context.drawImage(frame, 0, 0);
				return { dataUrl: canvas.toDataURL('image/png'), width: frame.width, height: frame.height };
			} finally {
				frame.close();
			}
		} finally {
			for (const track of stream.getTracks()) {
				track.stop();
			}
		}
	}
}
