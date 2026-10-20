/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/newChatInSession.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { getChatHarness, IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { NewChatInputWidget } from './newChatInput.js';
import { isExperimentalSessionComposerLayoutEnabled } from './newChatWidget.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeLane } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeWidget.js';
import { chatInputStackClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';

// #region --- New Chat In Session Widget ---

const STORAGE_KEY_SUB_SESSION_TIP_DISMISSED = 'sessions.subSessionTipDismissed';

/**
 * A widget for composing a secondary chat within an existing session.
 * Reuses {@link NewChatInputWidget} but without workspace/session type pickers,
 * since the session already exists.
 */
/** Telemetry source of the session-type picker when it picks a new peer chat's harness. */
const NEW_CHAT_IN_SESSION_HARNESS_PICKER_TELEMETRY_SOURCE = 'NewChatInSessionHarnessPicker';

/** The session's unsent peer chat, whose harness the composer may choose; `undefined` for its main chat or a sent one. */
export function getUnsentPeerChat(session: IActiveSession | undefined, reader: IReader | undefined): IChat | undefined {
	if (!session || !session.isCreated.read(reader)) {
		return undefined;
	}
	const chat = session.activeChat.read(reader);
	return !isEqual(chat.resource, session.mainChat.read(reader).resource) && chat.status.read(reader) === SessionStatus.Untitled ? chat : undefined;
}

export class NewChatInSessionWidget extends Disposable {

	private readonly _newChatInput: NewChatInputWidget;
	private readonly _tipDisposable = this._register(new MutableDisposable());
	private readonly _session: IObservable<IActiveSession | undefined>;
	/**
	 * When the experimental composer layout is enabled, the in-session input mirrors the
	 * new-session composer: the mode/permissions control moves into the input row and the model
	 * picker is right-aligned, keeping both surfaces consistent.
	 */
	private readonly _useExperimentalComposerLayout: IObservable<boolean>;

	constructor(
		_options: IChatViewOptions & { readonly inputVisible?: IObservable<boolean>; readonly petHostPreferred?: IObservable<boolean> },
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._useExperimentalComposerLayout = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING)
				|| event.affectsConfiguration(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING)),
			() => isExperimentalSessionComposerLayoutEnabled(this.configurationService),
		);

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

		this._newChatInput = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			session: this._session,
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async ({ query, attachments, background, userInteraction }) => this._send(query, attachments, background, userInteraction),
			inputVisible: _options.inputVisible,
			hostVisible: _options.hostVisible,
			canSendRequest,
			loading: constObservable(false),
			historyKey: constObservable(undefined), // no persisted history for the new-chat-in-session view
			minEditorHeight: 64,
			placeholder: localize('newChatInSessionPlaceholder', 'Ask a follow-up question or start a new topic within this session...'),
			petHostPreferred: _options.petHostPreferred,
			renderRepositoryControls: false,
			supportsBackground: true,
			voiceRoutesWhileSessionActive: true,
			useExperimentalLayout: this._useExperimentalComposerLayout,
			sessionTypePickerOptions: {
				telemetrySource: NEW_CHAT_IN_SESSION_HARNESS_PICKER_TELEMETRY_SOURCE,
				peerChat: {
					chat: derived(reader => getUnsentPeerChat(this._session.read(reader), reader)),
					selectHarness: harness => this._selectHarness(harness),
				},
			},
		}));
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget.new-chat-in-session'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));
		this._register(autorun(reader => {
			chatWidgetContent.classList.toggle('experimental-new-session-composer', this._useExperimentalComposerLayout.read(reader));
		}));

		this._newChatInput.render(chatWidgetContent, parent);
		this._renderHarnessPicker();
		// Rendered after the composer: the tip docks inside the composer's stack,
		// so the pet stands on it rather than on the composer boundary.
		this._renderSubSessionTip();

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderHarnessPicker(): void {
		const container = this._newChatInput.sessionControlsElement;
		if (!container) {
			return;
		}
		// The shared session-type picker in peer-chat mode leads the session controls, ahead of the mode and permission pickers.
		this._newChatInput.sessionTypePicker.render(container, { className: 'sessions-chat-session-type-picker', before: container.firstChild });
	}

	/**
	 * Switches the unsent peer chat to `harness`: opens (or reuses) a draft of that harness and
	 * deletes the empty draft it replaces, rather than leaving it behind as an empty tab.
	 */
	protected async _selectHarness(harness: string): Promise<void> {
		const session = this._session.get();
		const draft = session && getUnsentPeerChat(session, undefined);
		if (!session || !draft || getChatHarness(session, draft) === harness) {
			return;
		}
		try {
			await this.sessionsService.openNewChatInSession(session, { harness });
			const replaced = !isEqual(session.activeChat.get().resource, draft.resource) && draft.status.get() === SessionStatus.Untitled;
			if (replaced) {
				await this.sessionsManagementService.deleteChat(session, draft.resource, { skipConfirmation: true });
			}
		} catch (error) {
			this.logService.error('[NewChatInSessionWidget] Failed to switch the new chat\'s harness', error);
		}
	}

	private _renderSubSessionTip(): void {
		if (this.storageService.getBoolean(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, StorageScope.PROFILE, false)) {
			return;
		}

		const tipContainer = this._newChatInput.hostNoticeContainerElement;
		if (!tipContainer) {
			return;
		}

		const store = new DisposableStore();
		tipContainer.classList.add('sub-session-tip-container');

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
			// The slot belongs to the composer, so only the tip inside it goes away.
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

	protected async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean, userInteraction?: NewChatUserInteraction): Promise<boolean> {
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

			userInteraction?.handoff(activeSession, activeChat);
			await this.sessionsManagementService.sendRequest(activeSession, activeChat, {
				query, attachedContext, background,
				...(userInteraction ? { onDidCreateResponse: userInteraction.onDidCreateResponse } : {}),
			});
			return true;
		} catch (e) {
			userInteraction?.cancel(isCancellationError(e) ? 'cancelled' : 'error');
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
