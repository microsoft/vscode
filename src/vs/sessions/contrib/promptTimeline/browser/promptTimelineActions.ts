/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { PromptTimelineCommandId, PROMPT_TIMELINE_ENABLED_SETTING } from '../common/promptTimeline.js';
import { PromptTimelineWidgetContrib } from './promptTimelineWidgetContrib.js';

const CATEGORY = localize2('promptTimeline.category', "Chat");

/** True unless the prompt timeline setting is explicitly disabled. */
const TIMELINE_ENABLED = ContextKeyExpr.notEquals(`config.${PROMPT_TIMELINE_ENABLED_SETTING}`, false);

/** Commands require AI features to be on and the prompt timeline setting to be enabled. */
const TIMELINE_PRECONDITION = ContextKeyExpr.and(ChatContextKeys.enabled, TIMELINE_ENABLED);

/** Resolves the prompt timeline contribution for the active session's chat widget. */
function getPromptTimeline(accessor: ServicesAccessor): PromptTimelineWidgetContrib | undefined {
	const widgetService = accessor.get(IChatWidgetService);
	const sessionsService = accessor.get(ISessionsService);
	const resource = sessionsService.activeSession.get()?.activeChat.get().resource;
	const widget = (resource && widgetService.getWidgetBySessionResource(resource)) ?? widgetService.lastFocusedWidget;
	return widget?.getContrib<PromptTimelineWidgetContrib>(PromptTimelineWidgetContrib.ID);
}

interface IPromptPickItem extends IQuickPickItem {
	readonly requestId: string;
}

function formatStat(tick: { stat?: { added: number; removed: number; fileCount: number } }): string | undefined {
	if (!tick.stat) {
		return undefined;
	}
	const files = tick.stat.fileCount === 1
		? localize('promptTimeline.oneFile', "1 file")
		: localize('promptTimeline.nFiles', "{0} files", tick.stat.fileCount);
	return localize('promptTimeline.statDetail', "+{0} \u2212{1} · {2}", tick.stat.added, tick.stat.removed, files);
}

class GoToPromptAction extends Action2 {
	constructor() {
		super({
			id: PromptTimelineCommandId.GoToPrompt,
			title: localize2('promptTimeline.goToPrompt', "Go to Prompt..."),
			category: CATEGORY,
			f1: true,
			precondition: TIMELINE_PRECONDITION,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const contrib = getPromptTimeline(accessor);
		const prompts = contrib?.getAllPrompts() ?? [];
		if (!contrib || prompts.length === 0) {
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const items: IPromptPickItem[] = prompts.map(prompt => ({
			label: prompt.text || localize('promptTimeline.emptyPrompt', "(empty prompt)"),
			description: formatStat(prompt),
			requestId: prompt.requestId,
		}));

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('promptTimeline.pickPlaceholder', "Go to a prompt in this chat"),
			matchOnDescription: true,
		});
		if (picked) {
			contrib.reveal(picked.requestId);
		}
	}
}

export function registerPromptTimelineActions(): void {
	registerAction2(GoToPromptAction);
}
