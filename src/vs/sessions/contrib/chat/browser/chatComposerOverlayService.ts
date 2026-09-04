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
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatComposerOverlayVisibleContext, IChatComposerOverlayService, OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID } from '../common/chatComposerOverlay.js';
import { NewChatInputWidget } from './newChatInput.js';

class ChatComposerOverlay extends Disposable {

	private readonly session = this._register(disposableObservableValue<VisibleSession | undefined>(this, undefined));
	private readonly cancellation = this._register(new CancellationTokenSource());
	private readonly input: NewChatInputWidget;
	private readonly dialog: Dialog;
	private body: HTMLElement | undefined;
	private sending = false;

	constructor(
		private readonly onDidClose: () => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
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

		this.setSession(this.sessionsManagementService.createQuickChatOverlaySession());

		const canSendRequest = derived(this, reader => {
			const session = this.session.read(reader);
			return !!session && !session.loading.read(reader);
		});
		const loading = derived(this, reader => this.session.read(reader)?.loading.read(reader) ?? false);

		this.input = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			session: this.session,
			getContextFolderUri: () => undefined,
			sendRequest: async ({ query, attachments, background }) => this.send(query, attachments, background),
			canSendRequest,
			loading,
			historyKey: constObservable(undefined),
			renderSessionTypePickerInControls: false,
			renderChatPet: false,
			supportsBackground: true,
			deferredNotificationsEnabled: constObservable(false),
			voiceRoutesWhileSessionActive: true,
		}));
		this._register(this.input.sessionTypePicker.onDidSelectSessionType(pick => {
			if (this.sending || !pick) {
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
			this.input.focus();
		}));

		const activeContainer = layoutService.activeContainer;
		activeContainer.classList.add('chat-composer-overlay-open');
		this._register(toDisposable(() => activeContainer.classList.remove('chat-composer-overlay-open')));
		this.dialog = this._register(new Dialog(
			activeContainer,
			localize('quickChatOverlay.title', "Quick Chat"),
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
				if (commandId === OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID) {
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
		content.classList.add('quick-chat');
		const pickerHost = dom.append(content, dom.$('.new-session-quick-chat-header.sessions-workspace-category-picker'));
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

	private async send(query: string, attachedContext?: readonly IChatRequestVariableEntry[], background = false): Promise<boolean> {
		const session = this.session.get();
		if (!session) {
			return false;
		}

		let sentSession: ISession | undefined;
		try {
			this.sending = true;
			const options = {
				query,
				attachedContext: attachedContext ? [...attachedContext] : undefined,
				background,
			};
			const request = this.sessionsManagementService.sendQuickChatOverlayRequest(session, options, this.cancellation.token);
			this.session.set(undefined, undefined);
			sentSession = await request;
		} catch (error) {
			this.sending = false;
			if (this._store.isDisposed) {
				return false;
			}
			this.logService.error('[ChatComposerOverlay] Failed to send the request.', error);
			this.notificationService.error(localize('quickChatOverlay.sendError', "Unable to send the Quick Chat request."));
			try {
				this.setSession(this.sessionsManagementService.createQuickChatOverlaySession());
			} catch (createError) {
				this.logService.error('[ChatComposerOverlay] Failed to recreate the Quick Chat draft.', createError);
			}
			return false;
		}

		if (!background && sentSession) {
			try {
				await this.sessionsService.openSession(sentSession.resource, { source: 'chat' });
			} catch (error) {
				this.logService.error('[ChatComposerOverlay] Sent the Quick Chat request but failed to open the session.', error);
				this.notificationService.error(localize('quickChatOverlay.openSessionError', "The Quick Chat request was sent, but its session could not be opened."));
			}
		}
		this.dispose();
		return true;
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
		this.sessionsManagementService.discardQuickChatOverlaySession(this.session.get());
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
		this.show();
	}

	private show(): void {
		try {
			this.overlay.clear();
			const overlay = this.instantiationService.createInstance(ChatComposerOverlay, () => {
				if (this.overlay.value === overlay) {
					this.overlay.clear();
				}
			});
			this.overlay.value = overlay;
		} catch (error) {
			this.logService.error('[ChatComposerOverlay] Failed to open.', error);
			this.notificationService.error(localize('quickChatOverlay.openError', "Unable to open Quick Chat."));
		}
	}
}

registerSingleton(IChatComposerOverlayService, ChatComposerOverlayService, InstantiationType.Delayed);
