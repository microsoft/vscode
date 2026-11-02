/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { WORKTREE_SUGGESTION_MIN_CREATED_SESSIONS, WORKTREE_SUGGESTION_SETTING, WORKTREE_SUGGESTION_VARIANTS, WorktreeSuggestionVariant } from '../common/worktreeSuggestion.js';
import { IWorktreeSuggestionService, WorktreeSuggestionService } from './worktreeSuggestionService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[WORKTREE_SUGGESTION_SETTING]: {
			type: 'string',
			enum: [...WORKTREE_SUGGESTION_VARIANTS],
			enumItemLabels: [
				localize('sessions.chat.worktreeSuggestion.offLabel', "Off"),
				localize('sessions.chat.worktreeSuggestion.spotlightOnSendLabel', "Spotlight on Send"),
				localize('sessions.chat.worktreeSuggestion.inlineHintLabel', "Inline Hint"),
				localize('sessions.chat.worktreeSuggestion.uncommittedFilesCountLabel', "Uncommitted Files Count"),
			],
			enumDescriptions: [
				localize('sessions.chat.worktreeSuggestion.off', "Don't suggest a new worktree."),
				localize('sessions.chat.worktreeSuggestion.spotlightOnSend', "Spotlight the isolation picker once, when you send a request, offering to send it in a new worktree."),
				localize('sessions.chat.worktreeSuggestion.inlineHint', "Show a hint below the input once you start typing, until you close it."),
				localize('sessions.chat.worktreeSuggestion.uncommittedFilesCount', "Show the number of uncommitted files after Branch in the isolation picker, which lists them."),
			],
			default: WorktreeSuggestionVariant.Off,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('sessions.chat.worktreeSuggestion', "Controls how a new session suggests a new worktree, in which the agent works on a separate copy of the files, when Branch is selected and the folder has uncommitted changes. Suggestions appear once you have started at least {0} sessions in the Agents window.", WORKTREE_SUGGESTION_MIN_CREATED_SESSIONS),
		},
	},
});

registerSingleton(IWorktreeSuggestionService, WorktreeSuggestionService, InstantiationType.Delayed);

interface IWorktreeSuggestionPreviewItem extends IQuickPickItem {
	readonly variant: WorktreeSuggestionVariant | undefined;
}

registerAction2(class PreviewWorktreeSuggestionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.worktreeSuggestion.preview',
			title: localize2('sessions.worktreeSuggestion.preview', "Preview Worktree Suggestion..."),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IWorktreeSuggestionService);
		const items: IWorktreeSuggestionPreviewItem[] = [
			{ variant: WorktreeSuggestionVariant.SpotlightOnSend, label: localize('sessions.worktreeSuggestion.preview.spotlightOnSend', "Spotlight on Send"), detail: localize('sessions.worktreeSuggestion.preview.spotlightOnSendDetail', "Spotlights the isolation picker when you send a request.") },
			{ variant: WorktreeSuggestionVariant.InlineHint, label: localize('sessions.worktreeSuggestion.preview.inlineHint', "Inline Hint"), detail: localize('sessions.worktreeSuggestion.preview.inlineHintDetail', "Shows a hint below the input once you start typing, which opens the isolation picker.") },
			{ variant: WorktreeSuggestionVariant.UncommittedFilesCount, label: localize('sessions.worktreeSuggestion.preview.uncommittedFilesCount', "Uncommitted Files Count"), detail: localize('sessions.worktreeSuggestion.preview.uncommittedFilesCountDetail', "Shows the number of uncommitted files after Branch, and lists them in the isolation picker.") },
			{ variant: undefined, label: localize('sessions.worktreeSuggestion.preview.stop', "Stop Preview"), detail: localize('sessions.worktreeSuggestion.preview.stopDetail', "Return to the configured setting.") },
		];
		const picked = await accessor.get(IQuickInputService).pick(items, {
			placeHolder: localize('sessions.worktreeSuggestion.preview.placeholder', "Preview a worktree suggestion in this window, even if you closed or saw it before, or started too few sessions"),
		});
		if (picked) {
			service.setPreview(picked.variant);
		}
	}
});

registerAction2(class ResetWorktreeSuggestionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.worktreeSuggestion.reset',
			title: localize2('sessions.worktreeSuggestion.reset', "Reset Worktree Suggestion State"),
			category: Categories.Developer,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IWorktreeSuggestionService).reset();
	}
});
