/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/newChatInSession.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { NewChatInputWidget } from './newChatInput.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeLane } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeWidget.js';
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';

// #region --- New Chat In Session Widget ---

const STORAGE_KEY_SUB_SESSION_TIP_DISMISSED = 'sessions.subSessionTipDismissed';

/**
 * A widget for composing a secondary chat within an existing session.
 * Reuses {@link NewChatInputWidget} but without workspace/session type pickers,
 * since the session already exists.
 */
export class NewChatInSessionWidget extends Disposable {

	private readonly _newChatInput: NewChatInputWidget;
	private readonly _tipDisposable = this._register(new MutableDisposable());
	private readonly _session: IObservable<IActiveSession | undefined>;

	constructor(
		_options: IChatViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._session = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession;
		});

		const canSendRequest = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			return true;
		});

		const loading = derived(_reader => false);

		this._newChatInput = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			session: this._session,
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async ({ query, attachments, background }) => this._send(query, attachments, background),
			canSendRequest,
			loading,
			historyKey: constObservable(undefined), // no persisted history for the new-chat-in-session view
			minEditorHeight: 64,
			placeholder: localize('newChatInSessionPlaceholder', 'Ask a follow-up question or start a new topic within this session...'),
			supportsBackground: true,
			voiceRoutesWhileSessionActive: true,
		}));
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget.new-chat-in-session'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));

		this._renderSubSessionTip(chatWidgetContent);
		this._newChatInput.render(chatWidgetContent, parent);

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderSubSessionTip(container: HTMLElement): void {
		if (this.storageService.getBoolean(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, StorageScope.PROFILE, false)) {
			return;
		}

		const store = new DisposableStore();
		const tipContainer = dom.append(container, dom.$(`.sub-session-tip-container.${chatInputStackSlotClass}`));

		const message = localize(
			'subSessionTip.message',
			"Start a parallel conversation to build on all the changes made in this session."
		);

		// Named by what it says, like every other tip: the label is both what the
		// landmark is called and what is spoken when the tip first appears.
		const tip = store.add(new ChatInputNoticeWidget({
			container: tipContainer,
			variant: ChatInputNoticeVariant.Tip,
			ariaLabel: message,
			ariaRoleDescription: localize('subSessionTip.ariaLabel', "New chat tip"),
		}));

		const iconEl = dom.append(tip.domNode, renderIcon(Codicon.lightbulb));
		iconEl.classList.add('sub-session-tip-icon');

		const textEl = dom.append(tip.domNode, dom.$('span.sub-session-tip-text'));
		textEl.textContent = message;

		const dismiss = () => {
			// Removing the banner would strand keyboard focus on <body>, which also
			// drops the context keys the chat keybindings depend on.
			const hadFocus = tip.hasFocus();
			this.storageService.store(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, true, StorageScope.PROFILE, StorageTarget.USER);
			// Stood down before it leaves the DOM: once detached it cannot report.
			setChatInputStackSlot(tipContainer, ChatInputStackSlot.Empty);
			tipContainer.remove();
			this._tipDisposable.clear();
			if (hadFocus) {
				this._newChatInput.focus();
			}
		};

		tip.addDismissAction({
			ariaLabel: localize('subSessionTip.dismiss', "Dismiss tip"),
			onActivate: dismiss,
		});

		// Claims the tip lane above this input, so the banner yields to a
		// notification or a first-run introduction instead of stacking with them.
		// Hidden until the claim leads, which it does immediately when nothing
		// else holds the space.
		let leading = false;
		let announced = false;
		setChatInputStackSlot(tipContainer, ChatInputStackSlot.Empty);
		store.add(this._newChatInput.noticeHost.occupy(ChatInputNoticeLane.Tip, {
			focusTarget: {
				hasFocus: () => tip.hasFocus(),
				focus: () => tip.focus(),
				canFocus: () => leading,
			},
			onDidChangeLeading: isLeading => {
				leading = isLeading;
				setChatInputStackSlot(tipContainer, isLeading ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
				// Spoken once, the first time it actually reaches the screen. The
				// lane can hand back and forth as notifications come and go, and
				// re-announcing on every return would talk over the user.
				if (isLeading && !announced) {
					announced = true;
					tip.announce();
				}
			},
		}));
		this._tipDisposable.value = store;
	}

	/**
	 * Returns the workspace URI from the active session's workspace.
	 */
	private _getContextFolderUri(): URI | undefined {
		const session = this._session.get();
		const workspace = session?.workspace.get();
		return workspace?.folders[0]?.workingDirectory;
	}

	// --- Send ---

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean): Promise<boolean> {
		const activeSession = this._session.get();
		if (!activeSession) {
			return false;
		}
		const activeChat = activeSession.activeChat.get();
		try {
			// Reset the composer before dispatching the send: both touch shared
			// chat-session state for chats in the same group, and running them
			// concurrently races and leaves the sent chat stuck spinning.
			if (background) {
				await this.sessionsService.openNewChatInSession(activeSession, { forceNew: true });
			}

			await this.sessionsManagementService.sendRequest(activeSession, activeChat, { query, attachedContext, background });
			return true;
		} catch (e) {
			this.logService.error('Failed to send secondary chat request:', e);
			return false;
		}
	}

	layout(height: number, width: number): void {
		this._newChatInput.layout(height, width);
	}

	focusInput(): void {
		this._newChatInput.focus();
	}

	attach(uris: URI[]): void {
		this._newChatInput.attach(uris);
	}
}

// #endregion
