/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../common/constants.js';
import { CHAT_WELCOME_SETTING_ID, CUSTOMIZATION_HINT_SETTING_ID, getPlanFactText, parseTerminalAgents, PLAN_NUDGE_IDS, PLAN_SUGGESTIONS_SETTING_ID, PlanNudgeId, PlanNudgeSurface } from '../../common/planAwareness/chatPlanAwareness.js';
import { ChatPlanAwarenessContextKeys, ChatPlanAwarenessDeveloperModeSettingId, FOCUS_PLAN_MOMENT_COMMAND_ID, IChatPlanAwarenessService, IPlanMoment, PlanNudgeAction } from './chatPlanAwarenessService.js';
import { ChatPlanCardContribution } from './chatPlanCard.js';
import { ChatPlanCustomizationBanner } from './chatPlanCustomizationBanner.js';
import { ChatPlanAwarenessTriggers } from './chatPlanAwarenessTriggers.js';
import { ChatPlanMoments } from './chatPlanMoments.js';
import { ChatPlanWelcome } from './chatPlanWelcome.js';

const PREVIEW_ACTION_ID = 'workbench.action.chat.planAwareness.preview';

//#region Configuration

function getNudgeDescription(id: PlanNudgeId): string {
	switch (id) {
		case PlanNudgeId.CustomizationFile: return localize('planAwareness.nudge.customizationFile', "The line at the top of agent instructions, skill, agent and prompt files.");
		case PlanNudgeId.AgentUsageLimit: return localize('planAwareness.nudge.agentUsageLimit', "The card when another AI agent reaches its usage limit in the terminal.");
		case PlanNudgeId.ReviewChanges: return localize('planAwareness.nudge.reviewChanges', "The suggestion to review changes with Copilot, above the commit message in the Source Control view.");
		case PlanNudgeId.SearchFallback: return localize('planAwareness.nudge.searchFallback', "Asking Copilot when a search or Quick Open finds nothing.");
		case PlanNudgeId.ChatWelcome: return localize('planAwareness.nudge.chatWelcome', "What your plan includes, in the center of the empty Chat view. Developer mode still hides it once you sent two requests in the window.");
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	properties: {
		[PLAN_SUGGESTIONS_SETTING_ID]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.planAwareness.enabled', "Show occasional suggestions about what your Copilot plan includes, at moments where Copilot could help. Suggestions only appear for paid Copilot plans when you have not used Copilot in the last 28 days, and stop after you have seen two different ones."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[CUSTOMIZATION_HINT_SETTING_ID]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.planAwareness.customizationHint.enabled', "Show a line at the top of agent instructions, skill, agent and prompt files, such as CLAUDE.md or AGENTS.md, that Copilot picks them up too. The line only appears for paid Copilot plans when you have not used Copilot in the last two weeks and hardly used it in the last four weeks, until you close it."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[CHAT_WELCOME_SETTING_ID]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.planAwareness.chatWelcome.enabled', "Show what your Copilot plan includes in the empty Chat view, such as your AI credits and the models you can use. Only appears for Copilot Business and Enterprise plans when you hardly used Copilot for a while."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[ChatPlanAwarenessDeveloperModeSettingId]: {
			type: 'object',
			default: Object.fromEntries(PLAN_NUDGE_IDS.map(id => [id, false])),
			properties: Object.fromEntries(PLAN_NUDGE_IDS.map(id => [id, { type: 'boolean', default: false, description: getNudgeDescription(id) }])),
			additionalProperties: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.planAwareness.developerMode', "Map of Copilot plan suggestion id to whether developer mode is enabled for it. When enabled for a suggestion, it shows whenever its moment comes, even if suggestions are turned off, you used Copilot recently, you dismissed it, it was shown too often or you have seen enough suggestions. Suggestions shown in developer mode are not remembered as seen. A paid Copilot plan is still required. Developer mode for any suggestion also enables the search fallback."),
			tags: ['experimental'],
		},
	}
});

//#endregion

//#region Search fallback

// Offered by the Search view and Quick Open when they find nothing, to users who may see suggestions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: '_chat.planAwareness.askFromSearch',
			title: localize2('planAwareness.search.ask', "Ask Copilot"),
			tooltip: localize2('planAwareness.search.askTooltip', "Copilot searches by meaning, not only by exact text. Included in your Copilot plan."),
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.SearchNoResults,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPlanAwarenessContextKeys.targeted),
			},
		});
	}

	run(accessor: ServicesAccessor, query: unknown): Promise<void> | void {
		if (typeof query !== 'string' || !query.trim()) {
			return;
		}
		const planAwarenessService = accessor.get(IChatPlanAwarenessService);
		planAwarenessService.recordAction(PlanNudgeId.SearchFallback, PlanNudgeSurface.Hint, PlanNudgeAction.Primary);
		return planAwarenessService.openChat({
			mode: ChatModeKind.Ask,
			query: localize('planAwareness.search.query', "Where does this workspace deal with \"{0}\"?", query.trim()),
			isPartialQuery: true,
		});
	}
});

//#endregion

//#region Actions

interface IPreviewItem extends IQuickPickItem {
	readonly moment?: (moments: ChatPlanMoments) => IPlanMoment;
	readonly reset?: boolean;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: PREVIEW_ACTION_ID,
			title: localize2('planAwareness.preview', "Preview Copilot Plan Suggestion..."),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const planAwarenessService = accessor.get(IChatPlanAwarenessService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const moments = accessor.get(IInstantiationService).createInstance(ChatPlanMoments);

		// The product configures the agents, so only they can be previewed
		const items: (IPreviewItem | IQuickPickSeparator)[] = [];
		const agents = parseTerminalAgents(accessor.get(IProductService).chatPlanAwarenessTerminalAgents);
		if (agents.length) {
			items.push({ type: 'separator', label: localize('planAwareness.preview.otherAgents', "Uses Another AI Agent") });
			for (const agent of agents) {
				items.push(
					{ label: localize('planAwareness.preview.approaching', "{0} Is Close to Its Usage Limit", agent.name), moment: m => m.agentUsageLimit(agent, undefined, false) },
					{ label: localize('planAwareness.preview.limit', "{0} Reached Its Usage Limit", agent.name), moment: m => m.agentUsageLimit(agent, localize('planAwareness.preview.limitPrompt', "add input validation to the signup form"), true) },
				);
			}
			items.push({ type: 'separator' });
		}
		items.push({ label: localize('planAwareness.preview.reset', "Reset Suggestion History"), reset: true });

		const pick = await quickInputService.pick(items, { placeHolder: localize('planAwareness.preview.placeholder', "Select a Copilot plan suggestion to preview") });
		if (!pick) {
			return;
		}
		if (pick.reset) {
			planAwarenessService.resetState();
			status(localize('planAwareness.preview.resetDone', "Copilot plan suggestion history reset"));
			return;
		}
		if (!planAwarenessService.plan.get()) {
			notificationService.info(localize('planAwareness.preview.unavailable', "Copilot plan suggestions apply to paid Copilot plans only."));
			return;
		}
		if (pick.moment) {
			planAwarenessService.closeMoment(false);
			planAwarenessService.showMoment(pick.moment(moments), true);
		}
	}
});

//#endregion

//#region Accessibility

class ChatPlanMomentAccessibilityHelp implements IAccessibleViewImplementation {

	readonly priority = 105;
	readonly name = 'chatPlanMoment';
	readonly type = AccessibleViewType.Help;
	readonly when = ChatPlanAwarenessContextKeys.momentFocused;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const planAwarenessService = accessor.get(IChatPlanAwarenessService);
		const editorService = accessor.get(IEditorService);
		const previouslyFocusedElement = dom.getActiveElement();
		const moment = planAwarenessService.moment.get();
		const content = [
			localize('planAwareness.help.overview', "You are on a Copilot plan suggestion card in the bottom right corner of the window. It appears when Copilot can take over what you are doing, such as when another agent reaches its usage limit, and tells you what your Copilot plan includes."),
			moment ? [moment.title, moment.message, ...(moment.showPlan ? planAwarenessService.getPlanFacts().map(getPlanFactText) : [])].join('\n') : '',
			localize('planAwareness.help.keys', "Press Tab to move between the actions. Continue with Copilot opens Copilot, prepared for what you were doing. Nothing is sent until you send it. Press Escape to close the card for now, or use Don't Show Again in its header to stop the suggestion."),
			localize('planAwareness.help.focus', "When a suggestion appears, run the command Focus Copilot Plan Suggestion{0} to move focus to it. Suggestions never take focus by themselves.", `<keybinding:${FOCUS_PLAN_MOMENT_COMMAND_ID}>`),
			localize('planAwareness.help.chat', "In a new chat, what your plan includes appears in the center of the Chat view. Its AI credits open your Copilot usage, and its models and harnesses select them."),
			localize('planAwareness.help.hints', "Copilot may also offer help where you work: on changes in the Source Control view, at the top of agent instructions, skill, agent and prompt files, and when a search finds nothing."),
			localize('planAwareness.help.limit', "Suggestions stop after you have seen two different ones."),
			localize('planAwareness.help.settings', "To stop all Copilot plan suggestions, turn off the setting {0}.", PLAN_SUGGESTIONS_SETTING_ID),
		].filter(line => !!line).join('\n\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatPlanNudge,
			{ type: AccessibleViewType.Help },
			() => content,
			() => {
				if (dom.isHTMLElement(previouslyFocusedElement) && previouslyFocusedElement.isConnected) {
					previouslyFocusedElement.focus();
				} else {
					editorService.activeEditorPane?.focus();
				}
			},
			AccessibilityVerbositySettingId.ChatPlanNudge,
		);
	}
}

AccessibleViewRegistry.register(new ChatPlanMomentAccessibilityHelp());

//#endregion

registerWorkbenchContribution2(ChatPlanCardContribution.ID, ChatPlanCardContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatPlanAwarenessTriggers.ID, ChatPlanAwarenessTriggers, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatPlanCustomizationBanner.ID, ChatPlanCustomizationBanner, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatPlanWelcome.ID, ChatPlanWelcome, WorkbenchPhase.AfterRestored);
