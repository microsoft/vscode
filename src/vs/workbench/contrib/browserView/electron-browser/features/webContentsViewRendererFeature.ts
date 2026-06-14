/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $, addDisposableListener, EventType, registerExternalFocusChecker } from '../../../../../base/browser/dom.js';
import { getZoomFactor } from '../../../../../base/browser/browser.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IBrowserViewKeyDownEvent,
} from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	IBrowserEditorWidget,
	IContainerLayout,
	IContainerLayoutOverride,
} from '../browserEditor.js';
import { BrowserOverlayManager, BrowserOverlayType } from '../overlayManager.js';

/**
 * Default browser renderer: drives a Chromium WebContentsView.
 *
 * Owns everything that exists only because of how the WCV behaves:
 * - placeholder screenshot to mask the page during show/hide swaps,
 * - overlay-pause UI for when a workbench modal sits on top of the WCV,
 * - the focus dance that bounces focus between the workbench DOM and the WCV,
 * - native key event forwarding through the keybinding service,
 * - the pixel-snap layout contribution that keeps the container on physical
 *   pixel boundaries (registered late in the priority chain so it refines
 *   whatever sizing other contributions produce).
 *
 * An alternative renderer (e.g. an in-DOM iframe) would replace this
 * contribution and need none of the above.
 */
class WebContentsViewRendererFeature extends BrowserEditorContribution {

	private _container: HTMLElement | undefined;
	private _model: IBrowserViewModel | undefined;
	private _editorVisible = false;
	private _overlayObscured = false;

	private readonly _placeholderScreenshot = $('.browser-placeholder-screenshot');
	private readonly _overlayPauseEl = $('.browser-overlay-paused');
	private readonly _overlayManager: BrowserOverlayManager;

	private readonly _placeholderContent: IBrowserEditorWidget;
	private readonly _overlayPauseContent: IBrowserEditorWidget;

	private readonly _screenshotHandle = this._register(new MutableDisposable());
	private _focusTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(
		editor: BrowserEditor,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(editor);

		this._overlayManager = this._register(new BrowserOverlayManager(editor.window));

		// Build overlay-pause DOM
		const message = $('.browser-overlay-paused-message');
		const heading = $('.browser-overlay-paused-heading');
		const detail = $('.browser-overlay-paused-detail');
		heading.textContent = localize('browser.overlayPauseHeading.notification', "Paused due to Notification");
		detail.textContent = localize('browser.overlayPauseDetail.notification', "Dismiss the notification to continue using the browser.");
		message.appendChild(heading);
		message.appendChild(detail);
		this._overlayPauseEl.appendChild(message);

		this._placeholderContent = { location: BrowserWidgetLocation.ContentArea, element: this._placeholderScreenshot, order: 100 };
		this._overlayPauseContent = { location: BrowserWidgetLocation.ContentArea, element: this._overlayPauseEl, order: 200 };

		this._register(this._overlayManager.onDidChangeOverlayState(() => this._refreshOverlayObscured()));
		this._refresh();
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [this._placeholderContent, this._overlayPauseContent];
	}

	override beforeContainerLayout(): IContainerLayoutOverride {
		return {
			padding: { top: 3, right: 3, bottom: 3, left: 3 },

			// Snap CSS-pixel values down so `v × hostZoom` is an exact integer:
			// main places the WCV at `round(v × hostZoom) × systemDPR` physical
			// pixels while CSS renders it at `v × hostZoom × systemDPR`, so this
			// collapses main's rounding to a no-op and keeps the WebContentsView
			// aligned with the placeholder screenshot. We snap the absolute
			// origin (pane origin + local offset) then derive the corresponding
			// local position so the DOM element and the WCV land on the same
			// physical pixel. Runs late so it refines whatever sizing upstream
			// contributions (e.g. device emulation) produced.
			compute: (current, pane): IContainerLayout => {
				const z = getZoomFactor(this.editor.window);
				const snap = (v: number) => Math.floor(v * z) / z;
				const absLeft = pane.originX + (current.left ?? 0);
				const absTop = pane.originY + (current.top ?? 0);
				return {
					...current,
					width: snap(current.width),
					height: snap(current.height),
					left: snap(absLeft) - pane.originX,
					top: snap(absTop) - pane.originY,
				};
			},
			priority: 1000,
		};
	}

	override onContainerCreated(container: HTMLElement): void {
		this._container = container;

		this._register(addDisposableListener(container, EventType.FOCUS, (event: FocusEvent) => {
			// When the browser container gets focus, make sure the browser view also gets focused —
			// but only if focus was already in the workbench (and not e.g. clicking back into the
			// workbench from the browser view itself).
			if (event.relatedTarget) {
				this.tryFocus();
			}
		}));
		this._register(addDisposableListener(container, EventType.BLUR, () => this._cancelFocusTimeout()));

		// Cross-window focus logic uses this checker because the WCV lives
		// outside the DOM tree and can't be detected with activeElement.
		this._register(registerExternalFocusChecker(() => ({
			hasFocus: this._model?.focused ?? false,
			window: this._model?.focused ? this.editor.window : undefined,
		})));

		this._refreshOverlayObscured();
	}

	// -- Base contribution hooks --------------------------------------------

	override onPaneVisibilityChanged(visible: boolean): void {
		if (this._editorVisible === visible) {
			return;
		}
		this._editorVisible = visible;
		this._refresh();
	}

	override afterContainerLayout(): void {
		// Container moved or resized — overlays that overlap us might have
		// shifted relative to the container even though their own DOM didn't
		// change. Recompute obscured state so the page can hide accordingly.
		this._refreshOverlayObscured();
	}

	override tryFocus(): boolean {
		if (!this._shouldShowPage()) {
			return false;
		}
		this.editor.ensureBrowserFocus();
		if (this._focusTimeout || !this._model) {
			return true;
		}
		this._focusTimeout = setTimeout(() => {
			this._focusTimeout = undefined;
			if (this._model) {
				void this._model.focus();
			}
		}, 0);
		return true;
	}

	// -- Model lifecycle ----------------------------------------------------

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._model = model;
		this._setBackgroundImage(model.screenshot);

		store.add(model.onDidChangeVisibility(() => void this._doScreenshot()));
		store.add(model.onDidKeyCommand(keyEvent => void this._handleKeyEvent(keyEvent)));
		store.add(model.onDidNavigate(() => this._refresh()));
		store.add(model.onDidChangeLoadingState(() => this._refresh()));

		this._refresh();
		void this._doScreenshot();
	}

	override onModelDetached(): void {
		if (this._model) {
			void this._model.setVisible(false);
		}
		this._model = undefined;
		this._screenshotHandle.clear();
		this._cancelFocusTimeout();
		this._setBackgroundImage(undefined);
		this._refresh();
	}

	override dispose(): void {
		this._cancelFocusTimeout();
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
	private _refresh(): void {
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
			this.editor.window.requestAnimationFrame(() => {
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
		if (!this._model) {
			return;
		}
		this._screenshotHandle.clear();
		if (!this._model.visible) {
			return;
		}
		try {
			const screenshot = await this._model.captureScreenshot({ quality: 80 });
			this._setBackgroundImage(screenshot);
		} catch (error) {
			this.logService.error('Failed to capture browser view screenshot', error);
		}
		const handle = setTimeout(() => void this._doScreenshot(), 1000);
		this._screenshotHandle.value = toDisposable(() => clearTimeout(handle));
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
			this.logService.error('WebContentsViewRendererFeature: Error dispatching key event', error);
		}
	}

	private _cancelFocusTimeout(): void {
		if (this._focusTimeout) {
			clearTimeout(this._focusTimeout);
			this._focusTimeout = undefined;
		}
	}
}

BrowserEditor.registerContribution(WebContentsViewRendererFeature);
