/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCanvas.css';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { $, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { focusWebContentsViewContainer, WebContentsViewHost } from '../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionCanvasAvailability } from '../../../services/sessions/common/session.js';
import { ISessionCanvasService, SessionCanvasInput } from '../common/sessionCanvas.js';

export const SessionCanvasFocusedContext = new RawContextKey<boolean>('sessionCanvasFocused', false);

export class SessionCanvasEditor extends EditorPane {

	static readonly ID = SessionCanvasInput.EDITOR_ID;

	private wrapper!: HTMLElement;
	private container!: HTMLElement;
	private message!: HTMLElement;
	private host!: WebContentsViewHost;
	private model: IBrowserViewModel | undefined;
	private readonly modelLifetime = this._register(new DisposableStore());
	private readonly browserModel = this._register(new MutableDisposable<IBrowserViewModel>());
	private readonly pendingVisibleLayout = this._register(new MutableDisposable());
	private readonly currentInput = observableValue<SessionCanvasInput | undefined>(this, undefined);
	private readonly presentationVisible = observableValue(this, false);
	private readonly semanticChanged = this._register(new Emitter<void>());
	private loadSequence = 0;
	private loadingKey: string | undefined;
	private loadedKey: string | undefined;
	private semanticSequence = 0;
	private semanticText = '';
	private helpAnnounced = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionCanvasService private readonly canvasService: ISessionCanvasService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
		@ILogService private readonly logService: ILogService,
	) {
		super(SessionCanvasEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		SessionCanvasFocusedContext.bindTo(scopedContextKeyService).set(true);

		const root = $('.browser-root.session-canvas-editor');
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
		root.appendChild(this.wrapper);
		parent.appendChild(root);

		this.host = this._register(this.instantiationService.createInstance(WebContentsViewHost, this.window, () => focusWebContentsViewContainer(this.container)));
		placeholder.append(this.host.screenshotElement, this.host.pauseElement);
		this.host.onContainerCreated(this.container);

		this._register(onDidChangeZoomLevel(windowId => {
			if (windowId === this.group.windowId) {
				this.layout();
			}
		}));
		this._register(autorun(reader => {
			const input = this.currentInput.read(reader);
			if (!input || !this.canvasService.enabled.read(reader) || !this.canvasService.isActiveOwner(input.reference, reader)) {
				this._detach(localize('canvas.ownerUnavailable', "This canvas is only shown beside its owning conversation."));
				return;
			}
			const canvas = input.canvas.read(reader);
			if (!canvas) {
				this._detach(localize('canvas.closed', "This canvas is no longer available."));
				return;
			}
			if (canvas.availability !== SessionCanvasAvailability.Ready) {
				this._detach(localize('canvas.unavailable', "The canvas provider is temporarily unavailable."));
				return;
			}
			const key = `${canvas.resource.toString()}\u0000${canvas.revision}`;
			if (this.loadingKey !== key && this.loadedKey !== key) {
				void this._load(input, key);
			}
		}));
	}

	override async setInput(input: SessionCanvasInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.currentInput.set(undefined, undefined);
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested && this.input === input) {
			this.currentInput.set(input, undefined);
		}
	}

	private async _load(input: SessionCanvasInput, key: string): Promise<void> {
		const canvas = input.canvas.get();
		if (!canvas) {
			return;
		}
		this._detach(localize('canvas.loading', "Loading canvas…"));
		const sequence = ++this.loadSequence;
		this.loadingKey = key;
		try {
			const source = await canvas.resolveSource();
			if (!this._isCurrent(input, canvas.revision, sequence)) {
				return;
			}
			const model = await this.browserViewService.createExternalBrowserView(source.toString(true));
			if (!this._isCurrent(input, canvas.revision, sequence)) {
				model.dispose();
				return;
			}
			this._setModel(model);
			this.browserModel.value = model;
			this.message.textContent = localize('canvas.pageLoading', "Loading canvas page…");
			this.loadedKey = key;
			this.message.textContent = model.error ? localize('canvas.pageFailed', "The canvas page failed to load.") : '';
		} catch (error) {
			if (this._isCurrent(input, canvas.revision, sequence)) {
				this._detach(localize('canvas.loadFailed', "The canvas could not be loaded."));
				this.logService.error('[SessionCanvasEditor] Failed to load canvas', error);
			}
		} finally {
			if (this.loadingKey === key) {
				this.loadingKey = undefined;
			}
		}
	}

	private _isCurrent(input: SessionCanvasInput, revision: number, sequence: number): boolean {
		return !this._store.isDisposed
			&& sequence === this.loadSequence
			&& this.currentInput.get() === input
			&& input.canvas.get()?.revision === revision
			&& this.canvasService.isActiveOwner(input.reference);
	}

	private _setModel(model: IBrowserViewModel | undefined): void {
		if (this.model === model) {
			return;
		}
		this.modelLifetime.clear();
		this.model = model;
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
			this._onDidFocus?.fire();
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
		this.modelLifetime.add(model.onWillDispose(() => {
			if (this.model !== model) {
				return;
			}
			this.model = undefined;
			this.loadedKey = undefined;
			this.host.setModel(undefined);
			const input = this.currentInput.get();
			const canvas = input?.canvas.get();
			if (input && canvas?.availability === SessionCanvasAvailability.Ready && this.canvasService.isActiveOwner(input.reference)) {
				void this._load(input, `${canvas.resource.toString()}\u0000${canvas.revision}`);
			}
		}));
		const visible = this.presentationVisible.get() || this.group.activeEditor === this.input;
		this.presentationVisible.set(visible, undefined);
		this.host.setVisible(visible);
		this.layout();
	}

	private _detach(message: string, disposeInput = true): void {
		this.loadSequence++;
		this.loadingKey = undefined;
		this.loadedKey = undefined;
		this._setModel(undefined);
		if (disposeInput) {
			this.browserModel.clear();
		}
		this.message.textContent = message;
	}

	override layout(): void {
		if (!this.model) {
			return;
		}
		const rect = this.wrapper.getBoundingClientRect();
		const zoomFactor = getZoomFactor(this.window);
		const snap = (value: number) => Math.floor(value * zoomFactor) / zoomFactor;
		const x = snap(rect.left);
		const y = snap(rect.top);
		const width = snap(rect.width);
		const height = snap(rect.height);
		const visible = width > 0
			&& height > 0
			&& rect.right > 0
			&& rect.bottom > 0
			&& rect.left < this.window.innerWidth
			&& rect.top < this.window.innerHeight;
		this.presentationVisible.set(visible, undefined);
		this.host.setVisible(visible);
		this.container.style.left = `${x - rect.left}px`;
		this.container.style.top = `${y - rect.top}px`;
		this.container.style.width = `${width}px`;
		this.container.style.height = `${height}px`;
		void this.model.layout({ x, y, width, height, windowId: this.group.windowId, zoomFactor, cornerRadius: 0 })
			.catch(error => this.logService.error('[SessionCanvasEditor] Failed to layout canvas', error));
		this.host.layout();
	}

	protected override setEditorVisible(visible: boolean): void {
		this.presentationVisible.set(visible, undefined);
		this.host?.setVisible(visible);
		this.pendingVisibleLayout.clear();
		if (visible) {
			this.pendingVisibleLayout.value = scheduleAtNextAnimationFrame(this.window, () => {
				if (this.presentationVisible.get()) {
					this.layout();
				}
			});
		}
	}

	override focus(): void {
		if (!this.host.tryFocus()) {
			this.container.focus();
		}
	}

	override clearInput(): void {
		this.currentInput.set(undefined, undefined);
		this._detach('');
		super.clearInput();
	}

	override dispose(): void {
		this.currentInput.set(undefined, undefined);
		this._detach('');
		super.dispose();
	}

	createAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider {
		const input = this.input;
		const help = [
			localize('canvas.help.overview', "This canvas is a private page owned by the active conversation."),
			localize('canvas.help.navigation', "Tab moves through page controls. Use <keybinding:workbench.action.focusNextPart> to leave the page."),
			localize('canvas.help.close', "Closing the tab hides the canvas until the agent opens that instance again."),
		].join('\n\n');
		this.semanticText = localize('canvas.reading', "Reading accessible canvas content…");
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionCanvas,
			{ type, language: 'plaintext' },
			() => type === AccessibleViewType.Help ? help : this.semanticText,
			() => {
				if (input instanceof SessionCanvasInput && this.input === input && this.presentationVisible.get() && this.canvasService.isActiveOwner(input.reference)) {
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
				this.logService.error('[SessionCanvasEditor] Failed to read accessible canvas content', error);
			}
		}
		this.semanticChanged.fire();
	}
}
