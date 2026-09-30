/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { $, addDisposableListener, EventType, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import type { CodeWindow } from '../../../../base/browser/window.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IBrowserViewKeyDownEvent } from '../../../../platform/browserView/common/browserView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IBrowserViewModel } from '../common/browserView.js';
import { BrowserOverlayManager, BrowserOverlayType } from './overlayManager.js';

const originalHtmlElementFocus = HTMLElement.prototype.focus;

export function focusWebContentsViewContainer(container: HTMLElement): void {
	originalHtmlElementFocus.call(container);
	container.ownerDocument.getSelection()?.removeAllRanges();
}

/** Native browser content presentation without browser chrome or editor ownership. */
export class WebContentsViewHost extends Disposable {

	private _container: HTMLElement | undefined;
	private _model: IBrowserViewModel | undefined;
	private _editorVisible = false;
	private _overlayObscured = false;

	private readonly _placeholderScreenshot = $('.browser-placeholder-screenshot');
	private readonly _overlayPauseElement = $('.browser-overlay-paused');
	private readonly _overlayManager: BrowserOverlayManager;
	private readonly _modelStore = this._register(new DisposableStore());
	private readonly _screenshotHandle = this._register(new MutableDisposable());
	private _focusTimeout: ReturnType<typeof setTimeout> | undefined;
	private _screenshotSequence = 0;

	get screenshotElement(): HTMLElement { return this._placeholderScreenshot; }
	get pauseElement(): HTMLElement { return this._overlayPauseElement; }

	constructor(
		private readonly targetWindow: CodeWindow,
		private readonly ensureBrowserFocus: () => void,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		this._overlayManager = this._register(new BrowserOverlayManager(targetWindow));
		const message = $('.browser-overlay-paused-message');
		const heading = $('.browser-overlay-paused-heading');
		const detail = $('.browser-overlay-paused-detail');
		heading.textContent = localize('browser.overlayPauseHeading.notification', "Paused due to Notification");
		detail.textContent = localize('browser.overlayPauseDetail.notification', "Dismiss the notification to continue using the browser.");
		message.appendChild(heading);
		message.appendChild(detail);
		this._overlayPauseElement.appendChild(message);

		this._register(this._overlayManager.onDidChangeOverlayState(() => this._refreshOverlayObscured()));
		this._refresh();
	}

	onContainerCreated(container: HTMLElement): void {
		this._container = container;
		this._register(addDisposableListener(container, EventType.FOCUS, () => this.tryFocus()));
		this._register(addDisposableListener(container, EventType.BLUR, () => this._cancelFocusTimeout()));
		this._register(registerExternalFocusChecker(() => ({
			hasFocus: this._model?.focused ?? false,
			window: this._model?.focused ? this.targetWindow : undefined,
		})));
		this._refreshOverlayObscured();
	}

	setVisible(visible: boolean): void {
		if (this._editorVisible !== visible) {
			this._editorVisible = visible;
			this._refresh();
		}
	}

	layout(): void {
		this._refreshOverlayObscured();
	}

	tryFocus(): boolean {
		if (!this._model?.url) {
			return false;
		}
		this._container?.focus();
		if (this._focusTimeout || !this._model) {
			return true;
		}
		this._focusTimeout = setTimeout(() => {
			this._focusTimeout = undefined;
			const targetDocument = this.targetWindow.document;
			if (!targetDocument.hasFocus() || targetDocument.activeElement !== this._container) {
				return;
			}
			if (this._model?.visible) {
				void this._model.focus();
			} else {
				this.ensureBrowserFocus();
			}
		}, 10);
		return true;
	}

	setModel(model: IBrowserViewModel | undefined): void {
		if (model === this._model) {
			return;
		}
		this._detachModel();
		if (!model) {
			return;
		}
		this._model = model;
		this._setBackgroundImage(model.screenshot);
		this._modelStore.add(model.onDidChangeVisibility(() => void this._captureScreenshot()));
		this._modelStore.add(model.onDidKeyCommand(event => void this._handleKeyEvent(event)));
		this._modelStore.add(model.onDidNavigate(() => this._refresh(true)));
		this._modelStore.add(model.onDidChangeLoadingState(() => this._refresh(true)));
		this._modelStore.add(model.onWillDispose(() => this._detachModel(true)));
		this._refresh();
		void this._captureScreenshot();
	}

	private _detachModel(modelDisposing = false): void {
		this._screenshotSequence++;
		const model = this._model;
		if (model && !modelDisposing) {
			void model.setVisible(false).catch(error => this.logService.error('Failed to hide detached browser view', error));
		}
		this._model = undefined;
		this._modelStore.clear();
		this._screenshotHandle.clear();
		this._cancelFocusTimeout();
		this._setBackgroundImage(undefined);
		this._refresh();
	}

	override dispose(): void {
		this._detachModel();
		super.dispose();
	}

	private _shouldShowPage(): boolean {
		return this._editorVisible
			&& !this._overlayObscured
			&& !!this._model?.url
			&& !this._model.error;
	}

	private _refresh(restartScreenshot = false): void {
		if (restartScreenshot) {
			this._screenshotSequence++;
		}
		if (this._model?.error) {
			this._screenshotHandle.clear();
			this._setBackgroundImage(undefined);
		}
		const placeholderActive = !!this._model?.url && !this._model.error;
		this._placeholderScreenshot.style.display = placeholderActive ? '' : 'none';
		const pauseActive = !!this._model?.url && this._editorVisible && this._overlayObscured;
		this._overlayPauseElement.classList.toggle('visible', pauseActive);
		if (!this._model) {
			return;
		}
		const show = this._shouldShowPage();
		if (show === this._model.visible) {
			if (show && restartScreenshot) {
				void this._captureScreenshot();
			}
			return;
		}
		if (show) {
			void this._model.setVisible(true);
			const targetDocument = this.targetWindow.document;
			if (targetDocument.hasFocus() && targetDocument.activeElement === this._container) {
				this.tryFocus();
			}
		} else {
			void this._captureScreenshot();
			this.targetWindow.requestAnimationFrame(() => {
				if (this._model && !this._shouldShowPage()) {
					void this._model.setVisible(false);
				}
			});
		}
	}

	private _refreshOverlayObscured(): void {
		if (!this._container) {
			return;
		}
		const overlays = this._overlayManager.getOverlappingOverlays(this._container);
		const obscured = overlays.length > 0;
		this._overlayPauseElement.classList.toggle('show-message', overlays.some(overlay => overlay.type === BrowserOverlayType.Notification));
		if (obscured !== this._overlayObscured) {
			this._overlayObscured = obscured;
			this._refresh();
		}
	}

	private async _captureScreenshot(): Promise<void> {
		this._screenshotHandle.clear();
		const model = this._model;
		const sequence = this._screenshotSequence;
		if (!model?.url || model.error || !model.visible) {
			return;
		}
		try {
			const screenshot = await model.captureScreenshot({ quality: 80 });
			if (this._model === model && sequence === this._screenshotSequence && !model.error) {
				this._setBackgroundImage(screenshot);
			}
		} catch (error) {
			if (this._model === model && model.visible && !this._store.isDisposed) {
				this.logService.error('Failed to capture browser view screenshot', error);
			}
		}
		if (this._model === model && sequence === this._screenshotSequence && !model.error && !this._store.isDisposed) {
			const handle = setTimeout(() => void this._captureScreenshot(), 1000);
			this._screenshotHandle.value = toDisposable(() => clearTimeout(handle));
		}
	}

	private _setBackgroundImage(buffer: VSBuffer | undefined): void {
		this._placeholderScreenshot.style.backgroundImage = buffer
			? `url('data:image/jpeg;base64,${encodeBase64(buffer)}')`
			: '';
	}

	private async _handleKeyEvent(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		if (!this._container) {
			return;
		}
		try {
			const event = new StandardKeyboardEvent(new KeyboardEvent('keydown', keyEvent));
			this.keybindingService.dispatchEvent(event, this._container);
		} catch (error) {
			this.logService.error('Failed to dispatch browser view key event', error);
		}
	}

	private _cancelFocusTimeout(): void {
		if (this._focusTimeout) {
			clearTimeout(this._focusTimeout);
			this._focusTimeout = undefined;
		}
	}
}
