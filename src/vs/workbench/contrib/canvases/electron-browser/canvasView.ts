/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCanvas.css';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { $, isAncestorOfActiveElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IBrowserViewBounds } from '../../../../platform/browserView/common/browserView.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { focusWebContentsViewContainer, WebContentsViewHost } from '../../browserView/electron-browser/webContentsViewHost.js';
import { ICanvas, ICanvasReference, ICanvasService } from '../common/canvas.js';

export const SessionCanvasFocusedContext = new RawContextKey<boolean>('sessionCanvasFocused', false);

type CanvasLoadEvent = {
	schemaVersion: number;
	outcome: 'loaded' | 'error' | 'cancelled' | 'interrupted';
	durationMs: number;
};

type CanvasLoadClassification = {
	owner: 'jruales';
	comment: 'Measures completed canvas load attempts, not first paint or application readiness. Crashes may leave no completion.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Canvas load event schema version.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the load completed, failed, was cancelled, or became irrelevant after an input, owner, or editor lifetime change.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds from starting browser creation through the load attempt completion.' };
};

/** The canvas a {@link CanvasView} presents. */
export interface ICanvasViewInput {
	readonly reference: ICanvasReference;
	readonly canvas: IObservable<ICanvas | undefined>;
	/** Whether the canvas state is restored but its live membership is not yet known. */
	readonly membershipPending: IObservable<boolean>;
}

export interface ICanvasViewOptions {
	/** Prefixes log messages, such as `[CanvasEditor]`. */
	readonly logPrefix: string;
	/** Shown while the canvas may not be presented by this view. */
	readonly notPresentableMessage: IObservable<string>;
	/** The accessibility help text that describes this view's surface. */
	readonly getHelpContent: () => string;
}

/**
 * The view that currently has each live browser model attached. A native web
 * contents view can only follow one host, so attaching a model elsewhere detaches
 * it here first.
 */
const attachedViews = new WeakMap<IBrowserViewModel, CanvasView>();
const liveViews = new Set<CanvasView>();

/** Returns the canvas view that contains keyboard focus, if any. */
export function getFocusedCanvasView(): CanvasView | undefined {
	for (const view of liveViews) {
		if (isAncestorOfActiveElement(view.element)) {
			return view;
		}
	}
	return undefined;
}

/**
 * Presents one live canvas in a native web contents view, independent of the
 * surface that hosts it. It loads the canvas model retained by {@link ICanvasService},
 * keeps the native view hidden until its bounds are applied, and reports status
 * and accessible content.
 */
export class CanvasView extends Disposable {

	readonly element: HTMLElement;
	private readonly wrapper: HTMLElement;
	private readonly container: HTMLElement;
	private readonly message: HTMLElement;
	private readonly host: WebContentsViewHost;
	private model: IBrowserViewModel | undefined;
	private readonly modelLifetime = this._register(new DisposableStore());
	private readonly pendingVisibleLayout = this._register(new MutableDisposable());
	private readonly currentInput = observableValue<ICanvasViewInput | undefined>(this, undefined);
	private readonly viewVisible = observableValue(this, false);
	private readonly _presentationVisible = observableValue(this, false);
	/** Whether the native view is shown at applied, visible bounds. */
	readonly presentationVisible: IObservable<boolean> = this._presentationVisible;
	private readonly semanticChanged = this._register(new Emitter<void>());
	private readonly _onDidFocus = this._register(new Emitter<void>());
	/** Fires when the native page gains focus. */
	readonly onDidFocus = this._onDidFocus.event;
	private loadSequence = 0;
	private layoutSequence = 0;
	private loadingKey: string | undefined;
	private loadedKey: string | undefined;
	/** The load key whose model another view took over; reclaimed once this view is laid out visibly. */
	private yieldedKey: string | undefined;
	private semanticSequence = 0;
	private semanticText = '';
	private helpAnnounced = false;

	constructor(
		parent: HTMLElement,
		private readonly targetWindow: CodeWindow,
		private readonly options: ICanvasViewOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.element = $('.browser-root.session-canvas-editor');
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		SessionCanvasFocusedContext.bindTo(scopedContextKeyService).set(true);

		this.wrapper = $('.browser-container-wrapper');
		this.container = $('.browser-container');
		this.container.tabIndex = 0;
		this.container.setAttribute('role', 'group');
		this.container.setAttribute('aria-label', localize('canvas.content', "Canvas content. Use Accessibility Help for keyboard navigation."));
		const placeholder = $('.browser-placeholder-contents');
		this.message = $('.session-canvas-message');
		this.message.setAttribute('role', 'status');
		placeholder.appendChild(this.message);
		this.container.appendChild(placeholder);
		this.wrapper.appendChild(this.container);
		this.element.appendChild(this.wrapper);
		parent.appendChild(this.element);
		this._register(toDisposable(() => this.element.remove()));

		this.host = this._register(instantiationService.createInstance(WebContentsViewHost, targetWindow, () => focusWebContentsViewContainer(this.container)));
		placeholder.append(this.host.screenshotElement, this.host.pauseElement);
		this.host.onContainerCreated(this.container);

		liveViews.add(this);
		this._register(toDisposable(() => liveViews.delete(this)));

		this._register(onDidChangeZoomLevel(windowId => {
			if (windowId === this.targetWindow.vscodeWindowId) {
				this.layout();
			}
		}));
		this._register(autorun(reader => {
			const input = this.currentInput.read(reader);
			if (!input || !this.canvasService.enabled.read(reader) || !this.canvasService.isOwnerPresentable(input.reference, reader)) {
				this.yieldedKey = undefined;
				this._detach(this.options.notPresentableMessage.read(reader));
				return;
			}
			const canvas = input.canvas.read(reader);
			if (input.membershipPending.read(reader)) {
				this._detach(localize('canvas.pending', "Waiting for this canvas to become available."));
				return;
			}
			if (!canvas) {
				this._detach(localize('canvas.closed', "This canvas is no longer available."));
				return;
			}
			if (canvas.source === undefined) {
				this._detach(localize('canvas.unavailable', "The canvas provider is temporarily unavailable."));
				return;
			}
			const key = getLoadKey(canvas.resource, canvas.source);
			if (this.loadingKey !== key && this.loadedKey !== key && this.yieldedKey !== key) {
				void this._load(input, key);
			}
		}));
	}

	get input(): ICanvasViewInput | undefined {
		return this.currentInput.get();
	}

	setInput(input: ICanvasViewInput | undefined): void {
		if (this.currentInput.get() === input) {
			return;
		}
		this.yieldedKey = undefined;
		this.currentInput.set(input, undefined);
	}

	/** Detaches the current canvas and clears every status message. */
	clearInput(): void {
		this.setInput(undefined);
		this._detach('');
	}

	private async _load(input: ICanvasViewInput, key: string): Promise<void> {
		const canvas = input.canvas.get();
		if (canvas === undefined || canvas.source === undefined) {
			return;
		}
		this._detach(localize('canvas.loading', "Loading canvas…"));
		const sequence = ++this.loadSequence;
		this.loadingKey = key;
		const stopwatch = StopWatch.create();
		let outcome: CanvasLoadEvent['outcome'] = 'error';
		let reused = false;
		try {
			const source = canvas.source;
			const resolution = await this.canvasService.resolveCanvasModel(input.reference, source);
			const model = resolution.model;
			reused = resolution.reused;
			if (!this._isCurrent(input, source, sequence)) {
				outcome = 'interrupted';
				return;
			}
			if (!this._claim(model)) {
				this.yieldedKey = key;
				this.message.textContent = localize('canvas.shownElsewhere', "This canvas is shown in another view.");
				outcome = 'interrupted';
				return;
			}
			this._setModel(model);
			this.message.textContent = localize('canvas.pageLoading', "Loading canvas page…");
			this.loadedKey = key;
			this.message.textContent = model.error ? localize('canvas.pageFailed', "The canvas page failed to load.") : '';
			outcome = model.error ? 'error' : 'loaded';
		} catch (error) {
			const current = this._isCurrent(input, canvas.source, sequence);
			outcome = !current ? 'interrupted' : isCancellationError(error) ? 'cancelled' : 'error';
			if (current && !isCancellationError(error)) {
				this._detach(localize('canvas.loadFailed', "The canvas could not be loaded."));
				this.logService.error(`${this.options.logPrefix} Failed to load canvas`);
			}
		} finally {
			if (sequence === this.loadSequence && this.loadingKey === key) {
				this.loadingKey = undefined;
			}
			if (!reused) {
				this.telemetryService.publicLog2<CanvasLoadEvent, CanvasLoadClassification>('agentCanvas.loadCompleted', {
					schemaVersion: 1,
					outcome,
					durationMs: stopwatch.elapsed(),
				});
			}
		}
	}

	private _isCurrent(input: ICanvasViewInput, source: URI, sequence: number): boolean {
		return !this._store.isDisposed
			&& sequence === this.loadSequence
			&& this.currentInput.get() === input
			&& isEqual(input.canvas.get()?.source, source)
			&& this.canvasService.isOwnerPresentable(input.reference);
	}

	/**
	 * Takes `model` over from the view it is attached to, which only a visible view
	 * may do, so a hidden view never steals the page from the one showing it.
	 */
	private _claim(model: IBrowserViewModel): boolean {
		const owner = attachedViews.get(model);
		if (!owner || owner === this) {
			return true;
		}
		if (!this._measure().visible) {
			return false;
		}
		owner._yield();
		return true;
	}

	private _yield(): void {
		const key = this.loadedKey;
		this._detach(localize('canvas.shownElsewhere', "This canvas is shown in another view."));
		this.yieldedKey = key;
	}

	private _setModel(model: IBrowserViewModel | undefined): void {
		if (this.model === model) {
			return;
		}
		this.modelLifetime.clear();
		this.model = model;
		this.layoutSequence++;
		this._presentationVisible.set(false, undefined);
		if (model) {
			attachedViews.set(model, this);
			this.modelLifetime.add(toDisposable(() => {
				if (attachedViews.get(model) === this) {
					attachedViews.delete(model);
				}
			}));
			// Attach hidden: only `layout` may reveal the native view, after its visible bounds are applied.
			this.host.setVisible(false);
		}
		this.host.setModel(model);
		this.invalidateSemanticContent();
		this.helpAnnounced = false;
		if (!model) {
			return;
		}
		this.modelLifetime.add(model.onDidChangeFocus(event => {
			if (!event.focused) {
				return;
			}
			this._onDidFocus.fire();
			focusWebContentsViewContainer(this.container);
			if (!this.helpAnnounced && this.accessibilityService.isScreenReaderOptimized()) {
				const hint = this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.SessionCanvas);
				if (hint) {
					status(hint);
				}
				this.helpAnnounced = true;
			}
		}));
		this.modelLifetime.add(model.onDidChangeLoadingState(event => {
			this.message.textContent = event.error
				? localize('canvas.pageFailed', "The canvas page failed to load.")
				: event.loading ? localize('canvas.pageLoading', "Loading canvas page…") : '';
		}));
		this.modelLifetime.add(model.onDidNavigate(() => this.invalidateSemanticContent()));
		this.modelLifetime.add(model.onDidRequestOpenExternal(url => {
			void this._openExternalLink(url);
		}));
		this.modelLifetime.add(model.onWillDispose(() => {
			if (this.model !== model) {
				return;
			}
			this.model = undefined;
			this.loadedKey = undefined;
			this.host.setModel(undefined);
			const input = this.currentInput.get();
			const canvas = input?.canvas.get();
			if (input && canvas?.source && this.canvasService.isOwnerPresentable(input.reference)) {
				void this._load(input, getLoadKey(canvas.resource, canvas.source));
			}
		}));
		this.layout();
	}

	private async _openExternalLink(url: string): Promise<void> {
		try {
			const opened = await this.openerService.open(url, {
				openExternal: true,
				fromUserGesture: true,
				allowContributedOpeners: true,
			});
			if (!opened) {
				this.logService.warn(`${this.options.logPrefix} External canvas link was not opened`);
			}
		} catch (error) {
			this.logService.error(`${this.options.logPrefix} Failed to open external canvas link`, error);
		}
	}

	private _detach(message: string): void {
		this.loadSequence++;
		this.loadingKey = undefined;
		this.loadedKey = undefined;
		this._setModel(undefined);
		this.message.textContent = message;
	}

	layout(): void {
		const model = this.model;
		if (!model) {
			this._reclaimIfVisible();
			return;
		}
		const sequence = ++this.layoutSequence;
		const { rect, bounds, visible } = this._measure();
		this.container.style.left = `${bounds.x - rect.left}px`;
		this.container.style.top = `${bounds.y - rect.top}px`;
		this.container.style.width = `${bounds.width}px`;
		this.container.style.height = `${bounds.height}px`;
		if (!visible) {
			// Keep the last valid native bounds; empty or off-screen bounds must never be revealed.
			this._presentationVisible.set(false, undefined);
			this.host.setVisible(false);
			this.host.layout();
			return;
		}
		void this._layoutAndReveal(model, bounds, sequence);
	}

	/** Takes back a model that another view showed meanwhile, once this view is visible again. */
	private _reclaimIfVisible(): void {
		const key = this.yieldedKey;
		const input = this.currentInput.get();
		if (key === undefined || !input || !this._measure().visible) {
			return;
		}
		this.yieldedKey = undefined;
		void this._load(input, key);
	}

	/**
	 * Reveals the native view only after it has applied `bounds`, or it shows at stale bounds.
	 * A newer layout, a hide or a model change supersedes the reveal.
	 */
	private async _layoutAndReveal(model: IBrowserViewModel, bounds: IBrowserViewBounds, sequence: number): Promise<void> {
		let applied = false;
		try {
			await model.layout(bounds);
			applied = true;
		} catch (error) {
			this.logService.error(`${this.options.logPrefix} Failed to layout canvas`, error);
		}
		if (sequence !== this.layoutSequence || this.model !== model) {
			return;
		}
		// The view can be hidden or moved off-screen without a new layout while the bounds are applied.
		const visible = applied && this._measure().visible;
		this._presentationVisible.set(visible, undefined);
		if (!visible) {
			this.host.setVisible(false);
		}
		// Refreshing overlays can reveal a visible host that is no longer obscured, so it must follow the bounds.
		this.host.layout();
		if (visible) {
			this.host.setVisible(true);
		}
	}

	private _measure(): { readonly rect: DOMRect; readonly bounds: IBrowserViewBounds; readonly visible: boolean } {
		const rect = this.wrapper.getBoundingClientRect();
		const zoomFactor = getZoomFactor(this.targetWindow);
		const snap = (value: number) => Math.floor(value * zoomFactor) / zoomFactor;
		// The native view paints above the DOM, so it takes its corner shape from the container's CSS.
		const cornerRadius = parseFloat(this.targetWindow.getComputedStyle(this.container).borderTopLeftRadius) || 0;
		const bounds = { x: snap(rect.left), y: snap(rect.top), width: snap(rect.width), height: snap(rect.height), windowId: this.targetWindow.vscodeWindowId, zoomFactor, cornerRadius };
		const visible = this.viewVisible.get()
			&& bounds.width > 0
			&& bounds.height > 0
			&& rect.right > 0
			&& rect.bottom > 0
			&& rect.left < this.targetWindow.innerWidth
			&& rect.top < this.targetWindow.innerHeight;
		return { rect, bounds, visible };
	}

	setVisible(visible: boolean): void {
		this.viewVisible.set(visible, undefined);
		this.pendingVisibleLayout.clear();
		if (!visible) {
			this.layoutSequence++;
			this._presentationVisible.set(false, undefined);
			this.host.setVisible(false);
			return;
		}
		// A view can be told it is visible inside a hidden container, so only `layout` reveals it.
		this.pendingVisibleLayout.value = scheduleAtNextAnimationFrame(this.targetWindow, () => {
			if (this.viewVisible.get()) {
				this.layout();
			}
		});
	}

	focus(): void {
		if (!this.host.tryFocus()) {
			this.container.focus();
		}
	}

	override dispose(): void {
		this.clearInput();
		super.dispose();
	}

	createAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider {
		const input = this.currentInput.get();
		const help = this.options.getHelpContent();
		this.semanticText = localize('canvas.reading', "Reading accessible canvas content…");
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionCanvas,
			{ type, language: 'plaintext' },
			() => type === AccessibleViewType.Help ? help : this.semanticText,
			() => {
				if (input && this.currentInput.get() === input && this._presentationVisible.get() && this.canvasService.isOwnerPresentable(input.reference)) {
					this.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionCanvas,
			type === AccessibleViewType.View ? () => { void this.refreshSemanticContent(); } : undefined,
			undefined,
			undefined,
			undefined,
			this.semanticChanged.event,
		);
	}

	private invalidateSemanticContent(): void {
		this.semanticSequence++;
		this.semanticText = localize('canvas.semanticChanged', "The canvas changed. Reopen Accessible View to read its current content.");
		this.semanticChanged.fire();
	}

	private async refreshSemanticContent(): Promise<void> {
		const model = this.model;
		const sequence = ++this.semanticSequence;
		if (!model) {
			this.semanticText = localize('canvas.noPage', "No canvas page is currently attached.");
		} else {
			try {
				const snapshot = await model.getAccessibilitySnapshot();
				if (this.model !== model || sequence !== this.semanticSequence || this._store.isDisposed) {
					return;
				}
				this.semanticText = snapshot.text || localize('canvas.noSemantics', "This canvas exposes no named accessible content.");
				if (snapshot.truncated) {
					this.semanticText += '\n\n' + localize('canvas.truncated', "The bounded accessible snapshot is incomplete.");
				}
			} catch (error) {
				if (this.model !== model || sequence !== this.semanticSequence || this._store.isDisposed) {
					return;
				}
				this.semanticText = localize('canvas.semanticError', "The canvas accessible content could not be read.");
				this.logService.error(`${this.options.logPrefix} Failed to read accessible canvas content`, error);
			}
		}
		this.semanticChanged.fire();
	}
}

function getLoadKey(resource: URI, source: URI): string {
	return `${resource.toString()}\u0000${source.toString()}`;
}
