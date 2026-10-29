/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { $, addDisposableListener, DisposableResizeObserver, getWindow } from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignal } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { focusWebContentsViewContainer, WebContentsViewHost } from '../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { ICanvas, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IInboxCanvasHost, IInboxCanvasHostService } from '../browser/inboxCanvasHost.js';
import { CHAT_INBOX_ENABLED_SETTING } from '../browser/inboxNotificationsConstants.js';

export class InboxCanvasHostService implements IInboxCanvasHostService {
	declare readonly _serviceBrand: undefined;
	readonly supported = true;
	readonly enabled;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICanvasService canvasService: ICanvasService,
	) {
		this.enabled = canvasService.enabled;
	}

	create(container: HTMLElement, viewport: HTMLElement, session: ISession, chat: IChat, canvas: ICanvas): IInboxCanvasHost {
		return this.instantiationService.createInstance(InboxCanvasHost, container, viewport, session, chat, canvas);
	}
}

class InboxCanvasHost extends Disposable implements IInboxCanvasHost {
	private readonly container: HTMLElement;
	private readonly message: HTMLElement;
	private readonly host: WebContentsViewHost;
	private readonly model = this._register(new MutableDisposable<IBrowserViewModel>());
	private readonly modelStore = this._register(new DisposableStore());
	private readonly semanticChanged = this._register(new Emitter<void>());
	private semanticText = '';
	private layoutSequence = 0;
	private permitted = false;
	private visible = true;

	constructor(
		parent: HTMLElement,
		private readonly viewport: HTMLElement,
		session: ISession,
		chat: IChat,
		canvas: ICanvas,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@ICanvasService canvasService: ICanvasService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IConfigurationService configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.container = parent.appendChild($('.browser-container.inbox-evidence-native-canvas', {
			tabindex: '0',
			role: 'group',
			'aria-label': localize('inbox.canvas.content', "Extension canvas: {0}. Use Accessibility Help for navigation.", canvas.title),
		}));
		const placeholder = this.container.appendChild($('.browser-placeholder-contents'));
		this.message = placeholder.appendChild($('.inbox-evidence-note', { role: 'status' }));
		const targetWindow = getWindow(parent);
		this.host = this._register(instantiationService.createInstance(WebContentsViewHost, targetWindow, () => focusWebContentsViewContainer(this.container)));
		placeholder.append(this.host.screenshotElement, this.host.pauseElement);
		this.host.onContainerCreated(this.container);
		this._register(addDisposableListener(viewport, 'scroll', () => this.layout(), true));
		this._register(addDisposableListener(targetWindow.document, 'visibilitychange', () => this.layout()));
		this._register(onDidChangeZoomLevel(() => this.layout()));
		const resize = this._register(new DisposableResizeObserver('InboxCanvasHost', () => this.layout()));
		this._register(resize.observe(parent));
		this._register(resize.observe(viewport));
		const membership = observableSignal(this);
		this._register(sessionsManagementService.onDidChangeSessions(() => membership.trigger(undefined)));
		this._register(sessionsManagementService.onDidDeleteChat(() => membership.trigger(undefined)));
		const inboxEnabled = observableConfigValue(CHAT_INBOX_ENABLED_SETTING, false, configurationService);
		this._register(autorun(reader => {
			membership.read(reader);
			const live = chat.canvases?.read(reader)?.find(candidate => isEqual(candidate.resource, canvas.resource));
			this.permitted = inboxEnabled.read(reader) && canvasService.enabled.read(reader)
				&& sessionsManagementService.getSession(session.resource) === session
				&& !session.isArchived.read(reader)
				&& session.capabilities.read(reader).supportsCanvases === true
				&& session.chats.read(reader).some(candidate => candidate === chat)
				&& live?.instanceId !== undefined && isEqual(live.source, canvas.source);
			if (!this.permitted) {
				this.detach();
				this.message.textContent = localize('inbox.canvas.unavailable', "This extension canvas is no longer available.");
			}
		}));
		if (this.permitted && canvas.source) {
			void this.load(canvas.source, chat);
		}
	}

	private async load(source: URI, chat: IChat): Promise<void> {
		this.message.textContent = localize('inbox.canvas.loading', "Loading extension canvas…");
		try {
			// A separate native model keeps this presentation from taking over an editor's host or working set.
			const model = await this.browserViewService.createExternalBrowserView(source.toString(true), 'canvas', { type: 'agent', sessionId: chat.resource.toString() });
			if (this._store.isDisposed || !this.permitted) {
				model.dispose();
				return;
			}
			this.model.value = model;
			this.host.setVisible(false);
			this.host.setModel(model);
			this.modelStore.add(model.onDidChangeFocus(event => {
				if (event.focused) {
					focusWebContentsViewContainer(this.container);
				}
			}));
			this.modelStore.add(model.onDidChangeLoadingState(event => {
				this.message.textContent = event.error ? localize('inbox.canvas.loadError', "The extension canvas could not load.") : event.loading ? localize('inbox.canvas.loading', "Loading extension canvas…") : '';
				this.layout();
			}));
			this.modelStore.add(model.onDidRequestOpenExternal(url => {
				void this.openerService.open(url, { openExternal: true, fromUserGesture: true, allowContributedOpeners: true }).then(opened => {
					if (!opened) {
						this.logService.warn('[InboxCanvasHost] External link was not opened');
						this.message.textContent = localize('inbox.canvas.linkError', "The external link could not be opened.");
					}
				}, error => {
					this.logService.error('[InboxCanvasHost] Could not open external link', error);
					this.message.textContent = localize('inbox.canvas.linkError', "The external link could not be opened.");
				});
			}));
			this.message.textContent = '';
			this.layout();
		} catch (error) {
			if (!this._store.isDisposed) {
				this.logService.error('[InboxCanvasHost] Could not create canvas', error);
				this.message.textContent = localize('inbox.canvas.loadError', "The extension canvas could not load.");
			}
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.layout();
	}

	layout(): void {
		const model = this.model.value;
		const sequence = ++this.layoutSequence;
		this.host.setVisible(false);
		if (!model || !this.permitted || !this.visible) {
			return;
		}
		this.container.style.height = `${Math.max(80, Math.min(360, this.viewport.clientHeight - 100))}px`;
		const bounds = this.measure();
		if (!bounds) {
			return;
		}
		void model.layout(bounds).then(() => {
			if (sequence === this.layoutSequence && this.model.value === model && this.measure()) {
				this.host.layout();
				this.host.setVisible(true);
			}
		}, error => {
			this.logService.error('[InboxCanvasHost] Could not position canvas', error);
			if (sequence === this.layoutSequence) {
				this.message.textContent = localize('inbox.canvas.layoutError', "The canvas could not be displayed. Hide it and try again.");
			}
		});
	}

	private measure() {
		const rect = this.container.getBoundingClientRect();
		const viewport = this.viewport.getBoundingClientRect();
		const targetWindow = getWindow(this.container);
		if (!this.permitted || !this.visible || !this.container.isConnected || targetWindow.document.hidden || rect.width <= 0 || rect.height <= 0
			|| rect.top < Math.max(0, viewport.top) || rect.bottom > Math.min(viewport.bottom, targetWindow.innerHeight)
			|| rect.left < Math.max(0, viewport.left) || rect.right > Math.min(viewport.right, targetWindow.innerWidth)) {
			return undefined;
		}
		const zoomFactor = getZoomFactor(targetWindow);
		const snap = (value: number) => Math.floor(value * zoomFactor) / zoomFactor;
		return { x: snap(rect.left + this.container.clientLeft), y: snap(rect.top + this.container.clientTop), width: snap(this.container.clientWidth), height: snap(this.container.clientHeight), windowId: targetWindow.vscodeWindowId, zoomFactor, cornerRadius: 0 };
	}

	createAccessibleProvider(): AccessibleContentProvider {
		this.semanticText = localize('inbox.canvas.reading', "Reading extension canvas content…");
		return new AccessibleContentProvider(
			AccessibleViewProviderId.InboxNotifications,
			{ type: AccessibleViewType.View, language: 'plaintext' },
			() => this.semanticText,
			() => { if (!this._store.isDisposed) { this.container.focus(); } },
			AccessibilityVerbositySettingId.InboxNotifications,
			() => { void this.refreshSemanticContent(); },
			undefined, undefined, undefined, this.semanticChanged.event,
		);
	}

	private async refreshSemanticContent(): Promise<void> {
		const model = this.model.value;
		if (!model) {
			this.semanticText = localize('inbox.canvas.noContent', "No canvas page is attached.");
		} else {
			try {
				const snapshot = await model.getAccessibilitySnapshot();
				if (this._store.isDisposed || this.model.value !== model) {
					return;
				}
				this.semanticText = snapshot.text || localize('inbox.canvas.noSemantics', "This extension canvas exposes no named accessible content.");
				if (snapshot.truncated) {
					this.semanticText += '\n\n' + localize('inbox.canvas.incomplete', "The accessible snapshot is incomplete.");
				}
			} catch (error) {
				this.logService.error('[InboxCanvasHost] Could not read accessible content', error);
				this.semanticText = localize('inbox.canvas.readError', "Could not read the extension canvas's accessible content.");
			}
		}
		this.semanticChanged.fire();
	}

	private detach(): void {
		this.layoutSequence++;
		this.host.setVisible(false);
		this.host.setModel(undefined);
		this.modelStore.clear();
		this.model.clear();
	}

	override dispose(): void {
		this.detach();
		super.dispose();
	}
}

registerSingleton(IInboxCanvasHostService, InboxCanvasHostService, InstantiationType.Delayed);
