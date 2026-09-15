/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCanvas.css';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { $ } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { snapBrowserViewBounds } from '../../../../platform/browserView/common/browserView.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import type { IBrowserViewModel } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserViewPermissionHandler } from '../../../../workbench/contrib/browserView/electron-browser/browserViewPermissions.js';
import { focusWebContentsViewContainer, WebContentsViewHost } from '../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionCanvasService, SessionCanvasInput } from '../common/sessionCanvas.js';
import { SessionCanvasMount } from '../common/sessionCanvasMount.js';
import type { SessionCanvasPresentationStatus } from '../common/sessionCanvasPresentation.js';

export const sessionCanvasFocused = new RawContextKey<boolean>('sessionCanvasFocused', false);
export const sessionCanvasCanManage = new RawContextKey<boolean>('sessionCanvasCanManage', false);

export class SessionCanvasEditor extends EditorPane {
	private wrapper!: HTMLElement;
	private container!: HTMLElement;
	private message!: HTMLElement;
	private toolbar!: MenuWorkbenchToolBar;
	private host!: WebContentsViewHost;
	private model: IBrowserViewModel | undefined;
	private readonly modelLifetime = this._register(new DisposableStore());
	private readonly currentInput = observableValue<SessionCanvasInput | undefined>(this, undefined);
	private readonly presentationVisible = observableValue(this, false);
	private readonly nativeErrorCode = observableValue<number | undefined>(this, undefined);
	private readonly nativeLoading = observableValue(this, false);
	private scopedContext: IContextKeyService | undefined;
	private readonly semanticChanged = this._register(new Emitter<void>());
	private semanticText = '';
	private semanticSequence = 0;
	private helpAnnounced = false;
	override get scopedContextKeyService(): IContextKeyService | undefined { return this.scopedContext; }

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionCanvasService private readonly canvasService: ISessionCanvasService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
	) {
		super(SessionCanvasInput.EDITOR_ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const context = this._register(this.contextKeyService.createScoped(parent));
		this.scopedContext = context;
		sessionCanvasFocused.bindTo(context).set(true);
		const canManage = sessionCanvasCanManage.bindTo(context);
		const scoped = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
		const root = $('.browser-root.session-canvas-editor');
		const header = $('.session-canvas-header');
		const label = $('span');
		label.textContent = localize('canvas.header', "Canvas · tab close hides the view");
		this._register(this.hoverService.setupDelayedHover(label, {
			content: localize('canvas.headerHover', "Closing the tab or hiding Editor releases this view. The canvas stays in its owning chat until you choose Close Canvas."),
		}));
		const actions = $('.session-canvas-actions');
		header.append(label, actions);
		root.appendChild(header);
		parent.appendChild(root);
		this.toolbar = this._register(scoped.createInstance(MenuWorkbenchToolBar, actions, Menus.Canvas, {
			menuOptions: { shouldForwardArgs: true },
			ariaLabel: localize('canvas.toolbar', "Canvas actions"),
		}));
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
		this.host = this._register(scoped.createInstance(WebContentsViewHost, this.window, () => focusWebContentsViewContainer(this.container)));
		placeholder.append(this.host.screenshotElement, this.host.pauseElement);
		this.host.onContainerCreated(this.container);
		this._register(onDidChangeZoomLevel(windowId => {
			if (windowId === this.group.windowId) {
				this.layout();
			}
		}));
		const mount = this._register(new SessionCanvasMount(this.canvasService, this.currentInput, this.presentationVisible, this.group.windowId));
		this._register(autorun(reader => {
			const input = this.currentInput.read(reader);
			const closing = input && this.canvasService.isClosing(input.reference, reader);
			const enabled = this.canvasService.enabled.read(reader);
			const target = input && this.canvasService.getTarget(input.reference.session, input.reference.chat, reader);
			const availability = target?.canvases.availability.read(reader);
			const member = target?.canvases.entries.read(reader).some(entry => entry.resource === input?.reference.canvas.toString());
			canManage.set(enabled && availability === 'available' && !!member && !closing);
			const presentation = mount.presentation.read(reader);
			this.setModel(presentation?.model.read(reader));
			const loading = this.nativeLoading.read(reader);
			label.textContent = loading ? localize('canvas.headerLoading', "Canvas · loading page…") : localize('canvas.header', "Canvas · tab close hides the view");
			if (closing) {
				this.message.textContent = localize('canvas.closing', "Closing this logical canvas…");
				return;
			}
			if (!presentation) {
				this.message.textContent = !enabled ? localize('canvas.previewDisabled', "The canvas preview is disabled or AI features are hidden.")
					: availability === 'disconnected' ? localize('canvas.disconnected', "The owning runtime is disconnected. Reconnect it before showing this canvas; no actions will be replayed.")
						: availability === 'unsupported' ? presentationMessage('unsupported')
							: !target ? localize('canvas.ownerUnavailable', "The owning conversation is unavailable or archived. Restoring this tab does not recreate it.")
								: localize('canvas.viewUnavailable', "Show this view beside its owning conversation in the original Agents window. It cannot share an existing native attachment or move between windows.");
				return;
			}
			const errorCode = this.nativeErrorCode.read(reader);
			this.message.textContent = errorCode === undefined ? (loading ? localize('canvas.pageLoading', "Loading the native canvas page…") : presentationMessage(presentation.status.read(reader)))
				: localize('canvas.pageFailed', "The native page could not load ({0}). Use Reload View to read a fresh source.", errorCode);
		}));
	}

	override async setInput(input: SessionCanvasInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.currentInput.set(undefined, undefined);
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested && this.input === input) {
			this.toolbar.context = input.reference;
			this.currentInput.set(input, undefined);
		}
	}

	private setModel(model: IBrowserViewModel | undefined): void {
		if (this.model === model) {
			return;
		}
		this.modelLifetime.clear();
		this.model = model;
		this.invalidateSemanticContent();
		this.helpAnnounced = false;
		transaction(tx => {
			this.nativeErrorCode.set(model?.error?.errorCode, tx);
			this.nativeLoading.set(model?.loading ?? false, tx);
		});
		this.host.setModel(model);
		this.container.removeAttribute('data-native-view-id');
		if (!model) {
			return;
		}
		this.container.dataset.nativeViewId = model.id;
		this.modelLifetime.add(this.instantiationService.createInstance(BrowserViewPermissionHandler, model));
		this.modelLifetime.add(model.onDidChangeFocus(event => {
			if (event.focused) {
				this._onDidFocus?.fire();
				focusWebContentsViewContainer(this.container);
				if (!this.helpAnnounced && this.accessibilityService.isScreenReaderOptimized()) {
					const hint = this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.SessionCanvas);
					if (hint) {
						status(hint);
					}
					this.helpAnnounced = true;
				}
			}
		}));
		this.modelLifetime.add(model.onDidChangeLoadingState(event => {
			transaction(tx => {
				this.nativeErrorCode.set(event.error?.errorCode, tx);
				this.nativeLoading.set(event.loading, tx);
			});
		}));
		this.modelLifetime.add(model.onDidNavigate(() => this.invalidateSemanticContent()));
		this.host.setVisible(this.presentationVisible.get());
		this.layout();
	}

	private invalidateSemanticContent(): void {
		this.semanticSequence++;
		this.semanticText = localize('canvas.semanticChanged', "The presented canvas changed. Close Accessible View and open it again for the current canvas.");
		this.semanticChanged.fire();
	}

	override layout(): void {
		if (!this.model) {
			return;
		}
		const rect = this.wrapper.getBoundingClientRect();
		const zoomFactor = getZoomFactor(this.window);
		const bounds = snapBrowserViewBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, zoomFactor);
		this.wrapper.style.setProperty('--zoom-factor', String(zoomFactor));
		this.container.style.left = `${bounds.x - rect.left}px`;
		this.container.style.top = `${bounds.y - rect.top}px`;
		this.container.style.width = `${bounds.width}px`;
		this.container.style.height = `${bounds.height}px`;
		void this.model.layout({ ...bounds, windowId: this.group.windowId, zoomFactor, cornerRadius: 0 })
			.catch(() => this.logService.warn('Canvas native layout could not be updated.'));
		this.host.layout();
	}

	protected override setEditorVisible(visible: boolean): void {
		this.presentationVisible.set(visible, undefined);
		this.host?.setVisible(visible);
	}

	override focus(): void {
		if (!this.host.tryFocus()) {
			this.container.focus();
		}
	}

	override clearInput(): void {
		this.currentInput.set(undefined, undefined);
		super.clearInput();
	}

	override dispose(): void {
		this.currentInput.set(undefined, undefined);
		super.dispose();
	}

	createAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider {
		const input = this.input;
		const help = [
			localize('canvas.help.overview', "This canvas belongs to the conversation identified by its editor. The provider owns its application and files; VS Code presents a private native page."),
			localize('canvas.help.navigation', "Tab enters the page's controls. Use <keybinding:workbench.action.focusNextPart> to leave the native page for another workbench part."),
			localize('canvas.help.view', "Accessible View reads Chromium's main-frame accessible HTML names and control states for you only. It does not use an agent tool or share the page. Graphical content without HTML semantics has no inferred description."),
			localize('canvas.help.close', "Closing the tab, hiding Editor, or switching conversations releases the native view without closing the logical canvas. Choose Close Canvas to remove it from its chat. Provider-owned files are not deleted."),
			localize('canvas.help.recovery', "Reload View reads a fresh source without starting or restarting a provider. Restart Canvas Provider is an explicit operation and can affect every canvas sharing that provider in this chat. It does not replay actions. Broader owned-runtime recovery requires separate approval of its impact on resident chats."),
		].join('\n\n');
		this.semanticText = localize('canvas.reading', "Reading accessible HTML from the native page…");
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionCanvas, { type, language: 'plaintext' },
			() => type === AccessibleViewType.Help ? help : this.semanticText,
			() => {
				if (input instanceof SessionCanvasInput && this.input === input && !this._store.isDisposed
					&& !input.isDisposed() && this.presentationVisible.get() && this.canvasService.isVisibleOwner(input.reference)) {
					this.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionCanvas,
			type === AccessibleViewType.View ? () => { void this.refreshSemanticContent(); } : undefined,
			undefined, undefined, undefined, this.semanticChanged.event,
		);
	}

	private async refreshSemanticContent(): Promise<void> {
		const model = this.model;
		const sequence = ++this.semanticSequence;
		if (!model) {
			this.semanticText = localize('canvas.noPage', "No native page is currently attached.");
		} else {
			try {
				const snapshot = await model.getAccessibilitySnapshot();
				if (this.model !== model || sequence !== this.semanticSequence || this._store.isDisposed) {
					return;
				}
				this.semanticText = localize('canvas.semanticScope', "Accessible HTML snapshot (main frame, user only).") + '\n\n'
					+ (snapshot.text || localize('canvas.noSemantics', "This page exposes no named accessible content. No description of graphical content can be inferred."))
					+ (snapshot.truncated ? '\n\n' + localize('canvas.truncated', "The bounded snapshot is incomplete.") : '');
			} catch {
				if (this.model !== model || sequence !== this.semanticSequence || this._store.isDisposed) {
					return;
				}
				this.semanticText = localize('canvas.semanticError', "The native page's accessible content could not be read.");
			}
		}
		this.semanticChanged.fire();
	}
}

function presentationMessage(status: SessionCanvasPresentationStatus): string {
	switch (status) {
		case 'loading': return localize('canvas.loading', "Loading canvas state and reading its current source…");
		case 'attached': return '';
		case 'empty': return localize('canvas.empty', "The provider is live but has not produced content yet.");
		case 'pendingTrust': return localize('canvas.pendingTrust', "Waiting for source execution approval. Refreshing this view does not start the provider.");
		case 'blocked': return localize('canvas.blocked', "The canvas provider is blocked. Review source approval and runtime policy before trying again.");
		case 'unsupported': return localize('canvas.unsupported', "This runtime and client do not currently support canvases. The local desktop preview and a compatible runtime must both be available.");
		case 'unavailable': return localize('canvas.unavailable', "The canvas has no current source. Restart Canvas Provider requests explicit recovery without replaying actions. Broader runtime recovery requires separate approval.");
		case 'failed': return localize('canvas.failed', "Canvas state, source resolution, or native presentation failed. Reload View rereads the source. Restart Canvas Provider is a separate, explicit recovery operation.");
		case 'closed': return localize('canvas.closed', "This canvas is no longer in its owning chat. Close this tab or open a canvas from the live catalog.");
	}
}
