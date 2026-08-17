/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/chatComposerOverlay.css';
import * as dom from '../../../../base/browser/dom.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, disposableObservableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { ICreateNewSessionOptions, inheritableSessionTarget, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ChatComposerOverlayVisibleContext, IChatComposerOverlayService, OPEN_NEW_SESSION_OVERLAY_COMMAND_ID, OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID } from '../common/chatComposerOverlay.js';
import { NewChatInputWidget, renderQuickChatHeader } from './newChatInput.js';
import { renderNewSessionWorkspacePicker } from './newChatWidget.js';
import { WorkspacePicker } from './sessionWorkspacePicker.js';

const enum ChatComposerOverlayKind {
	QuickChat,
	NewSession,
}

class ChatComposerOverlay extends Disposable {

	private readonly session = this._register(disposableObservableValue<VisibleSession | undefined>(this, undefined));
	private readonly cancellation = this._register(new CancellationTokenSource());
	private readonly sessionCreation = this._register(new MutableDisposable());
	private readonly workspacePicker: WorkspacePicker | undefined;
	private readonly input: NewChatInputWidget;
	private readonly dialog: Dialog;
	private body: HTMLElement | undefined;
	private sending = false;

	constructor(
		private readonly kind: ChatComposerOverlayKind,
		private readonly onDidClose: () => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
	) {
		super();
		const overlayVisibleContext = ChatComposerOverlayVisibleContext.bindTo(contextKeyService);
		overlayVisibleContext.set(true);
		this._register(toDisposable(() => overlayVisibleContext.reset()));

		if (kind === ChatComposerOverlayKind.QuickChat) {
			this.setSession(this.sessionsManagementService.createQuickChatOverlaySession());
		} else {
			this.workspacePicker = this._register(this.instantiationService.createInstance(WorkspacePicker, {
				canSelectWorkspace: (folderUri, providerId) => this.requestWorkspaceTrust(folderUri, providerId),
			}));
			const activeSession = this.sessionsService.activeSession.get();
			const activeFolderUri = activeSession?.isQuickChat?.get() ? undefined : activeSession?.workspace.get()?.folders[0]?.root;
			if (activeFolderUri) {
				this.workspacePicker.setSelectedWorkspace(activeFolderUri, {
					fireEvent: false,
					providerId: activeSession?.providerId,
					persist: false,
				});
			}
			const selectedFolderUri = this.workspacePicker.selectedFolderUri;
			if (selectedFolderUri) {
				const createOptions = activeFolderUri
					? inheritableSessionTarget(this.sessionsManagementService, activeSession, selectedFolderUri)
					: undefined;
				void this.createNewSession(selectedFolderUri, createOptions);
			}
			this._register(this.workspacePicker.onDidSelectWorkspace(folderUri => {
				void this.createNewSession(folderUri);
			}));
		}

		const canSendRequest = derived(this, reader => {
			const session = this.session.read(reader);
			return !!session && !session.loading.read(reader);
		});
		const loading = derived(this, reader => this.session.read(reader)?.loading.read(reader) ?? false);

		this.input = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			session: this.session,
			getContextFolderUri: () => this.workspacePicker?.selectedFolderUri,
			sendRequest: async ({ query, attachments }) => this.send(query, attachments),
			canSendRequest,
			loading,
			historyKey: constObservable(undefined),
			renderSessionTypePickerInControls: false,
			renderChatPet: false,
			supportsBackground: false,
			deferredNotificationsEnabled: constObservable(false),
			voiceRoutesWhileSessionActive: true,
		}));
		this._register(this.input.sessionTypePicker.onDidSelectSessionType(pick => {
			if (this.sending) {
				return;
			}
			if (this.kind === ChatComposerOverlayKind.QuickChat) {
				if (!pick) {
					return;
				}
				try {
					this.setSession(this.sessionsManagementService.createQuickChatOverlaySession({
						providerId: pick.providerId,
						sessionTypeId: pick.sessionTypeId,
					}));
				} catch (error) {
					this.logService.error('[ChatComposerOverlay] Failed to change the Quick Chat type.', error);
					this.notificationService.error(localize('quickChatOverlay.changeTypeError', "Unable to change the Quick Chat type."));
				}
			} else {
				void this.createNewSession(this.workspacePicker?.selectedFolderUri, pick ? {
					providerId: pick.providerId,
					sessionTypeId: pick.sessionTypeId,
				} : undefined);
			}
			this.input.focus();
		}));

		const activeContainer = layoutService.activeContainer;
		activeContainer.classList.add('chat-composer-overlay-open');
		this._register(toDisposable(() => activeContainer.classList.remove('chat-composer-overlay-open')));
		this.dialog = this._register(new Dialog(
			activeContainer,
			kind === ChatComposerOverlayKind.QuickChat
				? localize('quickChatOverlay.title', "Quick Chat")
				: localize('newSessionOverlay.title', "New Session"),
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-composer-overlay-dialog'],
				cancelId: 0,
				disableDefaultAction: true,
				renderBody: container => this.render(container),
				getFocusableElements: () => this.getFocusableElements(),
				isExternalFocusAllowed: isChatComposerOverlayPopupTarget,
			}, keybindingService, layoutService, hostService, undefined, (commandId, event) => {
				if (commandId === OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID || commandId === OPEN_NEW_SESSION_OVERLAY_COMMAND_ID) {
					return false;
				}
				const target = event.target;
				return target instanceof dom.getWindow(activeContainer).HTMLElement
					&& (!!this.body?.contains(target) || isChatComposerOverlayPopupTarget(target));
			}),
		));

		void this.show();
	}

	private render(container: HTMLElement): void {
		this.body = container;
		container.classList.add('chat-composer-overlay-body');
		const widgetContainer = dom.append(container, dom.$('.new-chat-widget-container.revealed.chat-composer-overlay-widget'));
		const content = dom.append(widgetContainer, dom.$('.new-chat-widget-content'));
		let pickerHost: HTMLElement;
		if (this.kind === ChatComposerOverlayKind.QuickChat) {
			content.classList.add('quick-chat');
			pickerHost = renderQuickChatHeader(content);
		} else {
			const workspacePicker = this.workspacePicker;
			if (!workspacePicker) {
				throw new Error('New Session overlay requires a workspace picker');
			}
			const workspacePickerContainer = dom.append(content, dom.$('.new-session-workspace-picker-container'));
			const renderedWorkspacePicker = renderNewSessionWorkspacePicker(workspacePickerContainer, workspacePicker);
			this._register(renderedWorkspacePicker.disposable);
			const withLabel = dom.append(renderedWorkspacePicker.row, dom.$('.session-workspace-picker-label.session-workspace-picker-with-label'));
			withLabel.textContent = localize('newSessionWith', "with");
			pickerHost = renderedWorkspacePicker.row;
		}
		this.input.render(content, widgetContainer);
		this.input.sessionTypePicker.render(pickerHost, { className: 'sessions-chat-session-type-picker' });
	}

	private async show(): Promise<void> {
		const result = this.dialog.show();
		this.input.layout(0, this.body?.clientWidth ?? 0);
		this.input.focus();
		await result;
		this.dispose();
		this.onDidClose();
	}

	private async createNewSession(folderUri: URI | undefined, options?: ICreateNewSessionOptions): Promise<void> {
		if (this.sending) {
			return;
		}
		const creation = new CancellationTokenSource();
		this.sessionCreation.value = toDisposable(() => creation.dispose(true));
		if (!folderUri) {
			this.sessionsManagementService.discardNewSessionOverlaySession(this.session.get());
			this.session.set(undefined, undefined);
			return;
		}
		try {
			if (!await this.requestWorkspaceTrust(folderUri, options?.providerId) || creation.token.isCancellationRequested) {
				return;
			}
			this.setSession(this.sessionsManagementService.createNewSessionOverlaySession(folderUri, options));
		} catch (error) {
			if (creation.token.isCancellationRequested || this._store.isDisposed) {
				return;
			}
			this.logService.error('[ChatComposerOverlay] Failed to create the New Session draft.', error);
			this.notificationService.error(localize('newSessionOverlay.createError', "Unable to create the New Session draft."));
		}
	}

	private async requestWorkspaceTrust(folderUri: URI, providerId?: string): Promise<boolean> {
		const resolved = this.sessionsManagementService.resolveWorkspace(folderUri, providerId);
		if (!resolved?.workspace.requiresWorkspaceTrust) {
			return true;
		}
		return await this.workspaceTrustRequestService.requestResourcesTrust({
			uri: folderUri,
			message: localize('newSessionOverlay.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
		}) === true;
	}

	private async send(query: string, attachedContext?: readonly IChatRequestVariableEntry[]): Promise<boolean> {
		const session = this.session.get();
		if (!session) {
			return false;
		}

		try {
			this.sending = true;
			const options = {
				query,
				attachedContext: attachedContext ? [...attachedContext] : undefined,
				background: true,
			};
			const request = this.kind === ChatComposerOverlayKind.QuickChat
				? this.sessionsManagementService.sendQuickChatOverlayRequest(session, options, this.cancellation.token)
				: this.sessionsManagementService.sendNewSessionOverlayRequest(session, options, this.cancellation.token);
			this.session.set(undefined, undefined);
			await request;
			this.dispose();
			return true;
		} catch (error) {
			this.sending = false;
			if (this._store.isDisposed) {
				return false;
			}
			this.logService.error('[ChatComposerOverlay] Failed to send the request.', error);
			this.notificationService.error(this.kind === ChatComposerOverlayKind.QuickChat
				? localize('quickChatOverlay.sendError', "Unable to send the Quick Chat request.")
				: localize('newSessionOverlay.sendError', "Unable to send the New Session request."));
			if (this.kind === ChatComposerOverlayKind.QuickChat) {
				try {
					this.setSession(this.sessionsManagementService.createQuickChatOverlaySession());
				} catch (createError) {
					this.logService.error('[ChatComposerOverlay] Failed to recreate the Quick Chat draft.', createError);
				}
			} else {
				void this.createNewSession(this.workspacePicker?.selectedFolderUri, {
					providerId: session.providerId,
					sessionTypeId: session.sessionType,
				});
			}
			return false;
		}
	}

	private setSession(session: ISession): void {
		this.session.set(new VisibleSession(session, session.mainChat.get()), undefined);
	}

	private getFocusableElements(): readonly HTMLElement[] {
		const body = this.body;
		const dialog = body?.closest<HTMLElement>('.chat-composer-overlay-dialog');
		if (!body || !dialog) {
			return [];
		}

		const targetWindow = dom.getWindow(dialog);
		const elements: HTMLElement[] = [];
		const walker = targetWindow.document.createTreeWalker(dialog, targetWindow.NodeFilter.SHOW_ELEMENT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node instanceof targetWindow.HTMLElement) {
				elements.push(node);
			}
		}
		return elements.filter(element => {
			if (element === dialog) {
				return false;
			}
			if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute('disabled')) {
				return false;
			}
			for (let current: HTMLElement | null = element; current; current = current.parentElement) {
				if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
					return false;
				}
				const style = targetWindow.getComputedStyle(current);
				if (style.display === 'none' || style.visibility === 'hidden') {
					return false;
				}
				if (current === dialog) {
					break;
				}
			}
			return true;
		});
	}

	override dispose(): void {
		this.cancellation.cancel();
		if (this.kind === ChatComposerOverlayKind.QuickChat) {
			this.sessionsManagementService.discardQuickChatOverlaySession(this.session.get());
		} else {
			this.sessionsManagementService.discardNewSessionOverlaySession(this.session.get());
		}
		super.dispose();
	}
}

function isChatComposerOverlayPopupTarget(target: HTMLElement): boolean {
	const dialog = target.closest('.monaco-dialog-box');
	if (dialog && !dialog.classList.contains('chat-composer-overlay-dialog')) {
		return true;
	}
	return !!target.closest('.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content, .suggest-widget');
}

export class ChatComposerOverlayService extends Disposable implements IChatComposerOverlayService {

	declare readonly _serviceBrand: undefined;

	private readonly overlay = this._register(new MutableDisposable<ChatComposerOverlay>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	showQuickChat(): void {
		this.show(ChatComposerOverlayKind.QuickChat);
	}

	showNewSession(): void {
		this.show(ChatComposerOverlayKind.NewSession);
	}

	private show(kind: ChatComposerOverlayKind): void {
		try {
			this.overlay.clear();
			const overlay = this.instantiationService.createInstance(ChatComposerOverlay, kind, () => {
				if (this.overlay.value === overlay) {
					this.overlay.clear();
				}
			});
			this.overlay.value = overlay;
		} catch (error) {
			this.logService.error('[ChatComposerOverlay] Failed to open.', error);
			this.notificationService.error(kind === ChatComposerOverlayKind.QuickChat
				? localize('quickChatOverlay.openError', "Unable to open Quick Chat.")
				: localize('newSessionOverlay.openError', "Unable to open New Session."));
		}
	}
}

registerSingleton(IChatComposerOverlayService, ChatComposerOverlayService, InstantiationType.Delayed);
