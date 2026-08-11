/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';
import { IActivityService, NumberBadge } from '../../../../services/activity/common/activity.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { CHAT_CATEGORY, CHAT_OPEN_ACTION_ID, TOGGLE_CHAT_ACTION_ID } from '../actions/chatActions.js';
import { ChatViewContainerId, ChatViewId, IChatWidgetService } from '../chat.js';
import {
	CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID,
	CHAT_MODEL_PICKER_TOUR_ID,
	ChatModelPickerTourArmedContext,
	chatModelPickerTourWhen,
	createChatModelPickerTour,
} from './chatModelPickerTour.js';

/**
 * Holds the live contribution so the command-palette action can arm the tour
 * without introducing a dedicated service.
 */
let activeContribution: ChatModelPickerTourContribution | undefined;

/**
 * Registers the chat model-picker onboarding tour and the command-palette entry
 * that arms it.
 *
 * Flow:
 *  1. User runs **Chat: Start Model Picker Tour** from the command palette.
 *  2. A small activity badge ("pip") appears on the Chat icon in the activity bar.
 *  3. Clicking Chat opens the panel (if needed) and starts the spotlight tour on
 *     the model picker.
 */
class ChatModelPickerTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.modelPickerTour';

	private readonly _badge = this._register(new MutableDisposable());
	private readonly _armedContext: IContextKey<boolean>;
	private _armed = false;
	private _starting = false;

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@IActivityService private readonly activityService: IActivityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._armedContext = ChatModelPickerTourArmedContext.bindTo(contextKeyService);
		this._register({ dispose: () => this._armedContext.reset() });

		activeContribution = this;
		this._register({ dispose: () => { if (activeContribution === this) { activeContribution = undefined; } } });

		this._register(onboardingScenarioRegistry.register(createChatModelPickerTour()));

		// When the user opens Chat while the tour is armed, start the spotlight.
		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId && e.visible && this._armed) {
				void this.startTourFromChatOpen();
			}
		}));
		this._register(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.PANEL_PART && e.visible && this._armed && this.viewsService.isViewVisible(ChatViewId)) {
				void this.startTourFromChatOpen();
			}
		}));
		this._register(this.commandService.onDidExecuteCommand(e => {
			if (e.commandId === TOGGLE_CHAT_ACTION_ID && this._armed) {
				void this.startTourFromChatOpen();
			}
		}));
	}

	/** Arms the tour: show the activity-bar pip and wait for Chat to open. */
	arm(): void {
		if (this._armed || this._starting) {
			return;
		}
		this._armed = true;
		this._armedContext.set(true);
		this._badge.value = this.activityService.showViewContainerActivity(ChatViewContainerId, {
			badge: new NumberBadge(1, () => localize('chat.onboarding.modelPicker.badge', "New: choose a model that fits the task")),
		});

		// If Chat is already open, start immediately so the command is still useful.
		if (this.viewsService.isViewVisible(ChatViewId) && this.layoutService.isVisible(Parts.PANEL_PART)) {
			void this.startTourFromChatOpen();
		}
	}

	async startTourFromChatOpen(): Promise<void> {
		if (!this._armed || this._starting) {
			return;
		}
		this._starting = true;
		this._armed = false;
		this._armedContext.set(false);
		this._badge.clear();

		try {
			// Ensure the chat widget is revealed and the input (with model picker) is mounted.
			await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
			await this.chatWidgetService.revealWidget();
			await this.onboardingScenarioService.runScenario(CHAT_MODEL_PICKER_TOUR_ID);
		} finally {
			this._starting = false;
		}
	}
}

registerWorkbenchContribution2(ChatModelPickerTourContribution.ID, ChatModelPickerTourContribution, WorkbenchPhase.AfterRestored);

registerAction2(class ArmChatModelPickerTourAction extends Action2 {
	constructor() {
		super({
			id: CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID,
			title: localize2('chat.onboarding.modelPicker.arm', "Start Model Picker Tour"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: chatModelPickerTourWhen,
		});
	}

	run(_accessor: ServicesAccessor): void {
		activeContribution?.arm();
	}
});
