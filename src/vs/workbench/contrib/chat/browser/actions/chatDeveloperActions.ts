/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IChatWidgetService } from '../chat.js';

function uriReplacer(_key: string, value: unknown): unknown {
	if (URI.isUri(value)) {
		return value.toString();
	}

	if (isUriComponents(value)) {
		// This shouldn't be necessary but it seems that some URIs in ChatModels aren't properly revived
		return URI.from(value).toString();
	}

	return value;
}

export function registerChatDeveloperActions() {
	registerAction2(LogChatInputHistoryAction);
	registerAction2(LogChatIndexAction);
	registerAction2(InspectChatModelAction);
	registerAction2(ClearRecentlyUsedLanguageModelsAction);
}

class LogChatInputHistoryAction extends Action2 {
	static readonly ID = 'workbench.action.chat.logInputHistory';

	constructor() {
		super({
			id: LogChatInputHistoryAction.ID,
			title: localize2('workbench.action.chat.logInputHistory.label', "Log Chat Input History"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		chatWidgetService.lastFocusedWidget?.logInputHistory();
	}
}

class LogChatIndexAction extends Action2 {
	static readonly ID = 'workbench.action.chat.logChatIndex';

	constructor() {
		super({
			id: LogChatIndexAction.ID,
			title: localize2('workbench.action.chat.logChatIndex.label', "Log Chat Index"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatService = accessor.get(IChatService);
		chatService.logChatIndex();
	}
}

class InspectChatModelAction extends Action2 {
	static readonly ID = 'workbench.action.chat.inspectChatModel';

	constructor() {
		super({
			id: InspectChatModelAction.ID,
			title: localize2('workbench.action.chat.inspectChatModel.label', "Inspect Chat Model"),
			icon: Codicon.inspect,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorService = accessor.get(IEditorService);
		const widget = chatWidgetService.lastFocusedWidget;

		if (!widget?.viewModel) {
			return;
		}

		const model = widget.viewModel.model;
		const modelData = model.toJSON();

		// Build markdown output with latest response at the top
		let output = '# Chat Model Inspection\n\n';

		// Show latest response first if it exists
		const requests = modelData.requests;
		if (requests && requests.length > 0) {
			const latestRequest = requests[requests.length - 1];
			if (latestRequest.response) {
				output += '## Latest Response\n\n';
				output += '```json\n' + JSON.stringify(latestRequest.response, uriReplacer, 2) + '\n```\n\n';
			}
		}

		// Show full model data
		output += '## Full Chat Model\n\n';
		output += '```json\n' + JSON.stringify(modelData, uriReplacer, 2) + '\n```\n';

		await editorService.openEditor({
			resource: undefined,
			contents: output,
			languageId: 'markdown',
			options: {
				pinned: true
			}
		});
	}
}

class ClearRecentlyUsedLanguageModelsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.clearRecentlyUsedLanguageModels';

	constructor() {
		super({
			id: ClearRecentlyUsedLanguageModelsAction.ID,
			title: localize2('workbench.action.chat.clearRecentlyUsedLanguageModels.label', "Clear Recently Used Language Models"),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(ILanguageModelsService).clearRecentlyUsedList();
	}
}
