/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';

/** Where chat onboarding may run. */
export interface IChatOnboardingEligibility {
	/** The Chat view widget onboarding may run in, or `undefined` while the user or surface is not eligible. */
	readonly eligibleChat: IObservable<IChatWidget | undefined>;
}

function isCopilotHarnessChatView(widget: IChatWidget): boolean {
	const sessionResource = widget.viewModel?.sessionResource;
	return widget.visible
		&& isIChatViewViewContext(widget.viewContext)
		&& !!sessionResource
		&& getChatSessionType(sessionResource) === SessionType.AgentHostCopilot;
}

/**
 * A Chat view widget is eligible for onboarding when it is visible and shows a Copilot
 * harness chat, and the user has never sent a chat message from an editor window.
 * `bypassNewUserCheck` lifts the message requirement, for `onboarding.developerMode`.
 */
export class ChatOnboardingEligibility extends Disposable implements IChatOnboardingEligibility {

	readonly eligibleChat: IObservable<IChatWidget | undefined>;

	constructor(
		bypassNewUserCheck: IObservable<boolean>,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const isNewUser = observableValue(this, new EditorChatUsage(storageService).getTelemetry().editorMessages === 0);
		this._register(chatService.onDidAcceptRequest(() => isNewUser.set(false, undefined)));

		const widgetsChanged = observableSignalFromEvent(this, Event.any<unknown>(chatWidgetService.onDidAddWidget, chatWidgetService.onDidRemoveWidget, chatWidgetService.onDidChangeWidgetVisibility));
		// A widget can switch sessions, for example to or from the Copilot harness.
		const sessionsChanged = observableSignal(this);
		this._register(autorun(reader => {
			widgetsChanged.read(reader);
			for (const widget of chatWidgetService.getAllWidgets()) {
				reader.store.add(widget.onDidChangeViewModel(() => sessionsChanged.trigger(undefined)));
			}
		}));
		const copilotHarnessChat = derived(this, reader => {
			widgetsChanged.read(reader);
			sessionsChanged.read(reader);
			return chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(isCopilotHarnessChatView);
		});
		this.eligibleChat = derived(this, reader => isNewUser.read(reader) || bypassNewUserCheck.read(reader)
			? copilotHarnessChat.read(reader)
			: undefined);
	}
}
