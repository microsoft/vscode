/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemController, IChatSessionsService } from '../../common/chatSessionsService.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { IAgentSession } from '../agentSessions/agentSessionsModel.js';
import { ISessionOpenerParticipant, ISessionOpenOptions, sessionOpenerRegistry } from '../agentSessions/agentSessionsOpener.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../actions/chatActions.js';

/**
 * Core-side growth session controller that shows a single "attention needed"
 * session item in the agent sessions view for anonymous/new users.
 *
 * When the user clicks the session, we open the chat panel (which triggers the
 * anonymous setup flow). When the user opens chat at all, the badge is cleared.
 *
 * The session is shown at most once, tracked via a storage flag.
 */
export class GrowthSessionController extends Disposable implements IChatSessionItemController {

	static readonly STORAGE_KEY = 'chat.growthSession.dismissed';

	private static readonly SESSION_URI = URI.from({ scheme: AgentSessionProviders.Growth, path: '/growth-welcome' });

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	readonly onDidChangeChatSessionItems: Event<void> = this._onDidChangeChatSessionItems.event;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private readonly _created = Date.now();

	private _dismissed: boolean;
	get isDismissed(): boolean { return this._dismissed; }

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._dismissed = this.storageService.getBoolean(GrowthSessionController.STORAGE_KEY, StorageScope.APPLICATION, false);

		// Dismiss the growth session when the user opens chat.
		// Wait until the workbench is fully restored so we skip widgets
		// that were restored from a previous session at startup.
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed || this._dismissed) {
				return;
			}
			this._register(this.chatWidgetService.onDidAddWidget(() => {
				this.dismiss();
			}));
		});
	}

	get items(): readonly IChatSessionItem[] {
		if (this._dismissed) {
			return [];
		}

		return [{
			resource: GrowthSessionController.SESSION_URI,
			label: localize('growthSession.label', "Try Copilot"),
			description: localize('growthSession.description', "GitHub Copilot is available. Try it for free."),
			status: ChatSessionStatus.NeedsInput,
			iconPath: Codicon.lightbulb,
			timing: {
				created: this._created,
				lastRequestStarted: undefined,
				lastRequestEnded: undefined,
			},
		}];
	}

	async refresh(): Promise<void> {
		// Nothing to refresh -- this is a static, local-only session item
	}

	private dismiss(): void {
		if (this._dismissed) {
			return;
		}

		this.logService.trace('[GrowthSession] Dismissing growth session');
		this._dismissed = true;
		this.storageService.store(GrowthSessionController.STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);

		// Fire change event first so that listeners (like the model) see empty items
		this._onDidChangeChatSessionItems.fire();
		// Then fire dismiss event which triggers unregistration of the controller.
		this._onDidDismiss.fire();
	}
}

/**
 * Handles clicks on the growth session item in the agent sessions view.
 * Opens a new local chat session with a pre-seeded welcome message.
 * The user can then send messages that go through the normal agent.
 */
export class GrowthSessionOpenerParticipant implements ISessionOpenerParticipant {

	async handleOpenSession(accessor: ServicesAccessor, session: IAgentSession, _openOptions?: ISessionOpenOptions): Promise<boolean> {
		if (session.providerType !== AgentSessionProviders.Growth) {
			return false;
		}

		const commandService = accessor.get(ICommandService);
		const opts: IChatViewOpenOptions = {
			query: '',
			isPartialQuery: true,
			previousRequests: [{
				request: localize('growthSession.previousRequest', "Tell me about GitHub Copilot!"),
				// allow-any-unicode-next-line
				response: localize('growthSession.previousResponse', "Welcome to GitHub Copilot, your AI coding assistant! Here are some things you can try:\n\n- 🐛 *\"Help me debug this error\"* — paste an error message and get a fix\n- 🧪 *\"Write tests for my function\"* — select code and ask for unit tests\n- 💡 *\"Explain this code\"* — highlight something unfamiliar and ask what it does\n- 🚀 *\"Scaffold a REST API\"* — describe what you want and let Agent mode build it\n- 🎨 *\"Refactor this to be more readable\"* — select messy code and clean it up\n\nType anything below to get started!"),
			}],
		};
		await commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
		return true;
	}
}

/**
 * Registers the growth session controller and opener participant.
 * Returns a disposable that cleans up all registrations.
 */
export function registerGrowthSession(chatSessionsService: IChatSessionsService, growthController: GrowthSessionController): IDisposable {
	const disposables = new DisposableStore();

	// Register as session item controller so it appears in the sessions view
	disposables.add(chatSessionsService.registerChatSessionItemController(AgentSessionProviders.Growth, growthController));

	// Register opener participant so clicking the growth session opens chat
	disposables.add(sessionOpenerRegistry.registerParticipant(new GrowthSessionOpenerParticipant()));

	return disposables;
}

// #region Developer Actions

registerAction2(class ResetGrowthSessionAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.resetGrowthSession',
			title: localize2('resetGrowthSession', "Reset Growth Session Notification"),
			category: localize2('developer', "Developer"),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		storageService.remove(GrowthSessionController.STORAGE_KEY, StorageScope.APPLICATION);
	}
});

// #endregion
