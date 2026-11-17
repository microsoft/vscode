/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ActiveAuxiliaryContext } from '../../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { localChatSessionType } from '../../../chat/common/chatSessionsService.js';
import { getChatSessionType, isUntitledChatSession } from '../../../chat/common/model/chatUri.js';
import { isSessionCreated } from '../../../../services/sessions/common/session.js';
import { IEditorWindowShownChatService } from '../agentsView/editorWindowMainSessionHost.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { ILocalChatAvailabilityService } from '../../../chat/common/localChatAvailability.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { AgentsViewAvailable } from '../agentsView/agentsChatPartContext.js';
import { IEditorWindowChatPartService } from '../agentsView/agentsChatPartContribution.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.ChatViewSessionsOpenInChatPart]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.openInChatPart', "Controls whether chats open in the chat area beside the Chat view, which then shows only its sessions, instead of in the Chat view. Applies while {0} is `sideBySide`.", '`#chat.viewSessions.orientation#`'),
		},
	},
});

/**
 * What moves to the other host as the chat part turns on or off: a session, a new chat with the input of the one it took
 * (`draft`), a new chat (`none`), or nothing (`stay`).
 */
type ChatHandover =
	| { readonly kind: 'session'; readonly resource: URI }
	| { readonly kind: 'draft'; readonly source: IChatWidget | undefined; readonly input: string; readonly attachments: readonly IChatRequestVariableEntry[] }
	| { readonly kind: 'none' }
	| { readonly kind: 'stay' };

/** The chat part docks beside the Chat view: the Agents viewlet docks it beside its own view, over this. */
const CHAT_VIEW_ANCHOR_PRIORITY = 1;

/**
 * Opens the chats of agent sessions in the chat part beside the Chat view while {@link ChatConfiguration.ChatViewSessionsOpenInChatPart}
 * is on and the configured sessions orientation is side by side (not the width-based layout),
 * in local editor windows: what would show a chat in the Chat view, such as opening a session or New Chat, shows it in
 * the chat part, as the Agents viewlet does, and the Chat view shows only its sessions. While it is off, the chat part does not
 * show and the Chat view is unchanged.
 */
export class ChatViewOpenInChatPartContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewOpenInChatPart';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IEditorWindowChatPartService chatPartService: IEditorWindowChatPartService,
		@IEditorWindowSessionsRuntime sessionsRuntime: IEditorWindowSessionsRuntime,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@ILocalChatAvailabilityService localChatAvailabilityService: ILocalChatAvailabilityService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IEditorWindowShownChatService private readonly _shownChatService: IEditorWindowShownChatService,
	) {
		super();

		if (environmentService.remoteAuthority || environmentService.isSessionsWindow) {
			return;
		}

		const openInChatPart = observableConfigValue(ChatConfiguration.ChatViewSessionsOpenInChatPart, false, configurationService);
		const orientation = observableConfigValue<unknown>(ChatConfiguration.ChatViewSessionsOrientation, 'sideBySide', configurationService);
		// What the chat part's host needs to show chats: not with AI features disabled, nor with agents disabled
		const available = ContextKeyExpr.and(ChatContextKeys.enabled, AgentsViewAvailable)!;
		const availableKeys = new Set(available.keys());
		const chatAvailable = observableFromEvent(this, Event.filter(_contextKeyService.onDidChangeContext, e => e.affectsSome(availableKeys)), () => _contextKeyService.contextMatchesRules(available));
		const enabled = derived(this, reader => openInChatPart.read(reader) && orientation.read(reader) !== 'stacked' && chatAvailable.read(reader));
		this._register(chatPartService.enable({ anchorViewId: ChatViewId, anchorPriority: CHAT_VIEW_ANCHOR_PRIORITY, enabled }));
		// As it turns on or off while the window runs, the chat that the Chat view or the chat part shows moves to the other,
		// not as the window starts, which restores each
		let started = false;
		let handovers = 0;
		const handOver = (handover: ChatHandover) => {
			const handoverId = ++handovers;
			this._handOver(handover, () => handoverId === handovers && !this._store.isDisposed).catch(onUnexpectedError);
		};
		// The sessions that the chat part shows are known while the Chat view lists them
		this._register(autorun(reader => {
			const isEnabled = enabled.read(reader);
			const turned = started;
			started = true;
			if (isEnabled) {
				// Taken from the Chat view before the chat part hosts what it shows
				const fromChatView = turned ? this._takeFromChatView() : undefined;
				// Taken from the chat part as it turns off, while it still hosts what it shows; not as chat itself goes
				reader.store.add(toDisposable(() => {
					if (!this._store.isDisposed && this._contextKeyService.contextMatchesRules(available)) {
						const fromChatPart = this._takeFromChatPart();
						queueMicrotask(() => handOver(fromChatPart));
					}
				}));
				reader.store.add(sessionsRuntime.enable({ viewIds: [ChatViewId] }));
				// The chats show in the chat part, so the Chat view shows only its sessions, except while it hosts a chat that the chat
				// part leaves to it, such as a local chat: the seam owns that rule.
				reader.store.add(this._chatViewHostService.register({ sessionsOnly: true }));
				// No local chats, which the chat part does not show: as with the sessions list of the Chat view, whose chats are those of sessions
				reader.store.add(localChatAvailabilityService.hide());
				if (fromChatView) {
					// Once the chat part's host, which another autorun of `enabled` registers, takes what opens
					queueMicrotask(() => handOver(fromChatView));
				}
			}
		}));
		this._hideMaximizeWhileSessionsOnly();
	}

	/**
	 * What the Chat view shows, to show in the chat part: its session, or the input of its new chat; a local chat stays, as
	 * the chat part shows only agent sessions.
	 */
	private _takeFromChatView(): ChatHandover {
		const resource = this._chatViewHostService.shownSession.get()?.resource;
		if (!resource) {
			return { kind: 'none' };
		}
		if (getChatSessionType(resource) === localChatSessionType) {
			return { kind: 'stay' };
		}
		return isUntitledChatSession(resource) ? this._takeDraft(this._chatWidgetService.getWidgetBySessionResource(resource)) : { kind: 'session', resource };
	}

	/** What the chat part shows, to show in the Chat view: its session, or the input of its new session. */
	private _takeFromChatPart(): ChatHandover {
		const shown = this._shownChatService.shown.get();
		if (!shown) {
			return { kind: 'none' };
		}
		return isSessionCreated(shown.session) ? { kind: 'session', resource: shown.chat.resource } : this._takeDraft(this._chatWidgetService.getWidgetBySessionResource(shown.chat.resource));
	}

	private _takeDraft(widget: IChatWidget | undefined): ChatHandover {
		return { kind: 'draft', source: widget, input: widget?.getInput() ?? '', attachments: [...widget?.attachmentModel.attachments ?? []] };
	}

	/**
	 * Shows what `handover` took in the host in use now: its session, unless it shows it already, else a new chat, with the
	 * input it took, which leaves its source only once the new chat holds it. A later handover supersedes it.
	 */
	private async _handOver(handover: ChatHandover, isCurrent: () => boolean): Promise<void> {
		if (handover.kind === 'stay') {
			return;
		}
		if (handover.kind === 'session') {
			if (!isEqual(this._chatViewHostService.shownSession.get()?.resource, handover.resource)) {
				await this._chatViewHostService.openSession(handover.resource, { preserveFocus: true });
			}
			return;
		}
		if (!await this._chatViewHostService.newChat(undefined, { ownChat: true, preserveFocus: true }) || !isCurrent()) {
			return;
		}
		if (handover.kind === 'draft' && (handover.input || handover.attachments.length)) {
			const target = await this._chatViewHostService.reveal(true);
			if (!target || target === handover.source || !isCurrent()) {
				return;
			}
			target.setInput(handover.input);
			target.attachmentModel.addContext(...handover.attachments);
			handover.source?.setInput('');
			handover.source?.attachmentModel.clear();
		}
	}

	/**
	 * While the Chat view shows only its sessions, as its sessions list says, the secondary side bar does not offer to
	 * maximize it.
	 */
	private _hideMaximizeWhileSessionsOnly(): void {
		const claim = this._register(new MutableDisposable());
		const activeAuxiliaryKeys = new Set([ActiveAuxiliaryContext.key]);
		const activeAuxiliary = observableFromEvent(this, Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(activeAuxiliaryKeys)), () => this._contextKeyService.getContextKeyValue<string>(ActiveAuxiliaryContext.key));
		// The Chat view can live in another container than its default one
		const chatViewContainer = observableFromEvent(this, Event.filter(this._viewDescriptorService.onDidChangeContainer, e => e.views.some(view => view.id === ChatViewId)), () => this._viewDescriptorService.getViewContainerByViewId(ChatViewId)?.id);
		this._register(autorun(reader => {
			const sessionsOnly = this._chatViewHostService.sessionsOnly.read(reader);
			const container = chatViewContainer.read(reader);
			const hidden = sessionsOnly && container !== undefined && activeAuxiliary.read(reader) === container;
			if (hidden && !claim.value) {
				claim.value = this._layoutService.hideAuxiliaryBarMaximize();
			} else if (!hidden) {
				claim.clear();
			}
		}));
	}
}

registerWorkbenchContribution2(ChatViewOpenInChatPartContribution.ID, ChatViewOpenInChatPartContribution, WorkbenchPhase.BlockStartup);
