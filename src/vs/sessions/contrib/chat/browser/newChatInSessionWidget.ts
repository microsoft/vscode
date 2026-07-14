/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/newChatInSession.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { NewChatInputWidget } from './newChatInput.js';
import { sessionHasNoSelectableModel } from './modelPicker.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

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
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
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
			// Re-evaluate the no-available-model gate whenever the active
			// session's provider reports a model-list change. The provider
			// aggregates both language-model registry changes and (for cloud
			// sessions) option-group changes, matching the model picker's own
			// reactivity so the gate never goes stale.
			const provider = this.sessionsProvidersService.getProvider(session.providerId);
			if (provider) {
				observableSignalFromEvent(this, provider.onDidChangeModels).read(reader);
			}
			return !sessionHasNoSelectableModel(session, this.sessionsProvidersService);
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
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$('.new-chat-widget-content'));

		this._renderSubSessionTip(chatWidgetContent);
		this._newChatInput.render(chatWidgetContent, parent);

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderSubSessionTip(container: HTMLElement): void {
		if (this.storageService.getBoolean(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, StorageScope.PROFILE, false)) {
			return;
		}

		const tipContainer = dom.append(container, dom.$('.sub-session-tip-container'));
		const tipWidget = dom.append(tipContainer, dom.$('.sub-session-tip-widget'));
		tipWidget.setAttribute('role', 'status');
		tipWidget.setAttribute('aria-label', localize('subSessionTip.ariaLabel', "New chat tip"));

		// Tip icon
		const iconEl = dom.append(tipWidget, renderIcon(Codicon.lightbulb));
		iconEl.classList.add('sub-session-tip-icon');

		// Tip text
		const textEl = dom.append(tipWidget, dom.$('span.sub-session-tip-text'));
		textEl.textContent = localize(
			'subSessionTip.message',
			"Start a parallel conversation to build on all the changes made in this session."
		);

		// Dismiss button
		const dismissBtn = dom.append(tipWidget, dom.$('button.sub-session-tip-dismiss')) as HTMLButtonElement;
		dismissBtn.type = 'button';
		dismissBtn.setAttribute('aria-label', localize('subSessionTip.dismiss', "Dismiss tip"));
		dom.append(dismissBtn, renderIcon(Codicon.close));

		const dismiss = () => {
			this.storageService.store(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, true, StorageScope.PROFILE, StorageTarget.USER);
			tipContainer.remove();
			this._tipDisposable.clear();
		};

		const handleDismiss = (e: Event) => {
			dom.EventHelper.stop(e, true);
			dismiss();
		};

		const store = new DisposableStore();
		store.add(Gesture.addTarget(dismissBtn));
		store.add(dom.addDisposableListener(dismissBtn, dom.EventType.CLICK, handleDismiss));
		store.add(dom.addDisposableListener(dismissBtn, TouchEventType.Tap, handleDismiss));
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

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean): Promise<void> {
		const activeSession = this._session.get();
		if (!activeSession) {
			return;
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
		} catch (e) {
			this.logService.error('Failed to send secondary chat request:', e);
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
