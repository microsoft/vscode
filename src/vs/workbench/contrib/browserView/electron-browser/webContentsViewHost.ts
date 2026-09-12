/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, EventType, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import type { CodeWindow } from '../../../../base/browser/window.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IBrowserViewKeyDownEvent } from '../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../common/browserView.js';
import { BrowserOverlayManager, BrowserOverlayType } from './overlayManager.js';
import { BrowserFileTrustWidget } from './browserFileTrustWidget.js';

const originalHtmlElementFocus = HTMLElement.prototype.focus;

/** Keep the DOM focus anchor without taking native focus away from the guest page. */
export function focusWebContentsViewContainer(container: HTMLElement): void {
	originalHtmlElementFocus.call(container);
	container.ownerDocument.getSelection()?.removeAllRanges();
}

/** Native content presentation, independent of browser chrome and editor-input ownership. */
export class WebContentsViewHost extends Disposable {

	private _container: HTMLElement | undefined;
	private _model: IBrowserViewModel | undefined;
	private _editorVisible = false;
	private _overlayObscured = false;

	private readonly _placeholderScreenshot = $('.browser-placeholder-screenshot');
	private readonly _overlayPauseEl = $('.browser-overlay-paused');
	private readonly _overlayManager: BrowserOverlayManager;
	private readonly _fileTrust: BrowserFileTrustWidget;

	private readonly _modelStore = this._register(new DisposableStore());
	private readonly _screenshotHandle = this._register(new MutableDisposable());
	private _focusTimeout: ReturnType<typeof setTimeout> | undefined;
	private _screenshotSequence = 0;

	get screenshotElement(): HTMLElement { return this._placeholderScreenshot; }
	get pauseElement(): HTMLElement { return this._overlayPauseEl; }

	constructor(
		private readonly targetWindow: CodeWindow,
		private readonly ensureBrowserFocus: () => void,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._overlayManager = this._register(new BrowserOverlayManager(targetWindow));
		this._fileTrust = this._register(instantiationService.createInstance(BrowserFileTrustWidget));

		// Build overlay-pause DOM
		const message = $('.browser-overlay-paused-message');
		const heading = $('.browser-overlay-paused-heading');
		const detail = $('.browser-overlay-paused-detail');
		heading.textContent = localize('browser.overlayPauseHeading.notification', "Paused due to Notification");
		detail.textContent = localize('browser.overlayPauseDetail.notification', "Dismiss the notification to continue using the browser.");
		message.appendChild(heading);
		message.appendChild(detail);
		this._overlayPauseEl.appendChild(message);

		this._register(this._overlayManager.onDidChangeOverlayState(() => this._refreshOverlayObscured()));
		this._refresh();
	}

	onContainerCreated(container: HTMLElement): void {
		this._container = container;
		container.appendChild(this._fileTrust.element);
		this._register(toDisposable(() => this._fileTrust.element.remove()));

		this._register(addDisposableListener(container, EventType.FOCUS, () => this.tryFocus()));
		this._register(addDisposableListener(container, EventType.BLUR, () => this._cancelFocusTimeout()));

		// Cross-window focus logic uses this checker because the WCV lives
		// outside the DOM tree and can't be detected with activeElement.
		this._register(registerExternalFocusChecker(() => ({
			hasFocus: this._model?.focused ?? false,
			window: this._model?.focused ? this.targetWindow : undefined,
		})));

		this._refreshOverlayObscured();
	}

	// -- Base contribution hooks --------------------------------------------

	setVisible(visible: boolean): void {
		if (this._editorVisible === visible) {
			return;
		}
		this._editorVisible = visible;
		this._refresh();
	}

	layout(): void {
		// Container moved or resized — overlays that overlap us might have
		// shifted relative to the container even though their own DOM didn't
		// change. Recompute obscured state so the page can hide accordingly.
		this._refreshOverlayObscured();
	}

	tryFocus(): boolean {
		if (this._fileTrust.focus()) {
			return true;
		}
		if (!this._model?.url) {
			return false;
		}
		this._container?.focus();
		if (this._focusTimeout || !this._model) {
			return true;
		}
		this._focusTimeout = setTimeout(() => {
			this._focusTimeout = undefined;
			const doc = this._container?.ownerDocument;
			if (!doc?.hasFocus() || doc.activeElement !== this._container) {
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

	// -- Model lifecycle ----------------------------------------------------

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

		const store = this._modelStore;
		store.add(model.onDidChangeVisibility(() => void this._doScreenshot()));
		store.add(model.onDidKeyCommand(keyEvent => void this._handleKeyEvent(keyEvent)));
		store.add(model.onDidNavigate(() => this._refresh(true)));
		store.add(model.onDidChangeLoadingState(() => this._refresh(true)));
		store.add(model.onWillDispose(() => this._detachModel(true)));

		this._refresh();
		void this._doScreenshot();
	}

	private _detachModel(modelDisposing = false): void {
		this._screenshotSequence++;
		const model = this._model;
		if (model && !modelDisposing) {
			void model.setVisible(false).catch(error => {
				this.logService.error('WebContentsViewHost: Failed to hide detached browser view', error);
			});
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

	// -- Internals ----------------------------------------------------------

	private _shouldShowPage(): boolean {
		return this._editorVisible
			&& !this._overlayObscured
			&& !!this._model?.url
			&& !this._model?.error;
	}

	/**
	 * Recompute visibility of our content layers and the underlying page based
	 * on the latest editor/overlay/model state.
	 */
	private _refresh(restartScreenshot = false): void {
		this._fileTrust.update(this._model);
		if (restartScreenshot) {
			this._screenshotSequence++;
		}
		if (this._model?.error) {
			this._screenshotHandle.clear();
			this._setBackgroundImage(undefined);
		}
		// Placeholder screenshot: shown whenever there's a page to render
		// (covered by the WCV when it's up, visible during hide/show swaps).
		const placeholderActive = !!this._model?.url && !this._model?.error;
		this._placeholderScreenshot.style.display = placeholderActive ? '' : 'none';

		// Overlay-pause overlay: fades in when an overlay obscures the page.
		const pauseActive = !!this._model?.url && this._editorVisible && this._overlayObscured;
		this._overlayPauseEl.classList.toggle('visible', pauseActive);

		if (!this._model) {
			return;
		}
		const show = this._shouldShowPage();
		if (show === this._model.visible) {
			if (show && restartScreenshot) {
				void this._doScreenshot();
			}
			return;
		}
		if (show) {
			void this._model.setVisible(true);
			// If the editor container is focused, ensure the WCV gets focus too.
			const ownerDoc = this._container?.ownerDocument;
			if (ownerDoc?.hasFocus() && ownerDoc.activeElement === this._container) {
				this.tryFocus();
			}
		} else {
			void this._doScreenshot();
			// Defer the hide one frame so the latest screenshot has a chance to paint first.
			this.targetWindow.requestAnimationFrame(() => {
				// Double check that we should still hide the page.
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
		const hasNotification = overlays.some(o => o.type === BrowserOverlayType.Notification);
		this._overlayPauseEl.classList.toggle('show-message', hasNotification);
		if (obscured !== this._overlayObscured) {
			this._overlayObscured = obscured;
			this._refresh();
		}
	}

	private async _doScreenshot(): Promise<void> {
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
			const handle = setTimeout(() => void this._doScreenshot(), 1000);
			this._screenshotHandle.value = toDisposable(() => clearTimeout(handle));
		}
	}

	private _setBackgroundImage(buffer: VSBuffer | undefined): void {
		if (buffer) {
			const dataUrl = `data:image/jpeg;base64,${encodeBase64(buffer)}`;
			this._placeholderScreenshot.style.backgroundImage = `url('${dataUrl}')`;
		} else {
			this._placeholderScreenshot.style.backgroundImage = '';
		}
	}

	private async _handleKeyEvent(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		if (!this._container) {
			return;
		}
		try {
			const syntheticEvent = new KeyboardEvent('keydown', keyEvent);
			const standardEvent = new StandardKeyboardEvent(syntheticEvent);
			this.keybindingService.dispatchEvent(standardEvent, this._container);
		} catch (error) {
			this.logService.error('WebContentsViewHost: Error dispatching key event', error);
		}
	}

	private _cancelFocusTimeout(): void {
		if (this._focusTimeout) {
			clearTimeout(this._focusTimeout);
			this._focusTimeout = undefined;
		}
	}
}
