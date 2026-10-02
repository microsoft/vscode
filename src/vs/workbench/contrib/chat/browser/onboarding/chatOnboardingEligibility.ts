/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';

/** Where chat onboarding may run. Shared by every onboarding experience. */
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
 * Decides whether chat onboarding may run, independently of which onboarding
 * experience `chat.onboarding.experience` selects. A Chat view widget is eligible
 * when it is visible and shows a Copilot harness chat, and the user has never sent
 * a chat message from an editor window, as recorded by {@link EditorChatUsage}.
 *
 * `bypassNewUserCheck` lifts the "never sent a message" requirement, so an
 * experience can be previewed on demand with `onboarding.developerMode`.
 */
export class ChatOnboardingEligibility extends Disposable implements IChatOnboardingEligibility {

	/** Whether the user has never sent an editor chat message. Becomes `false` once they send one. */
	readonly isNewUser: IObservable<boolean>;

	/** The first visible Chat view widget showing a Copilot harness chat, regardless of the user. */
	readonly copilotHarnessChat: IObservable<IChatWidget | undefined>;

	readonly eligibleChat: IObservable<IChatWidget | undefined>;

	private readonly _widgetsChanged = observableSignal(this);
	private readonly _widgetListeners = this._register(new DisposableMap<IChatWidget>());

	constructor(
		bypassNewUserCheck: IObservable<boolean>,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const isNewUser = observableValue(this, new EditorChatUsage(storageService).getTelemetry().editorMessages === 0);
		this.isNewUser = isNewUser;
		this._register(chatService.onDidAcceptRequest(() => isNewUser.set(false, undefined)));

		for (const widget of chatWidgetService.getAllWidgets()) {
			this._watchWidget(widget);
		}
		this._register(chatWidgetService.onDidAddWidget(widget => {
			this._watchWidget(widget);
			this._widgetsChanged.trigger(undefined);
		}));
		this._register(chatWidgetService.onDidRemoveWidget(widget => {
			this._widgetListeners.deleteAndDispose(widget);
			this._widgetsChanged.trigger(undefined);
		}));
		this._register(chatWidgetService.onDidChangeWidgetVisibility(() => this._widgetsChanged.trigger(undefined)));

		this.copilotHarnessChat = derived(this, reader => {
			this._widgetsChanged.read(reader);
			return chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(isCopilotHarnessChatView);
		});
		this.eligibleChat = derived(this, reader => isNewUser.read(reader) || bypassNewUserCheck.read(reader)
			? this.copilotHarnessChat.read(reader)
			: undefined);
	}

	/** Re-evaluates when a widget switches sessions, e.g. to or from the Copilot harness. */
	private _watchWidget(widget: IChatWidget): void {
		if (!this._widgetListeners.has(widget)) {
			this._widgetListeners.set(widget, widget.onDidChangeViewModel(() => this._widgetsChanged.trigger(undefined)));
		}
	}
}
