/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';

import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { chatSubcommandLeader, IParsedChatRequest } from '../../common/chatParserTypes.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { IChatWidget } from '../chat.js';
import { ChatModeKind } from '../../common/constants.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';

/**
 * Action ID for the `Save Prompt` action.
 */
export const SAVE_TO_PROMPT_ACTION_ID = 'workbench.action.chat.save-to-prompt';

/**
 * Name of the in-chat slash command associated with this action.
 */
export const SAVE_TO_PROMPT_SLASH_COMMAND_NAME = 'save';

/**
 * Options for the {@link SaveToPromptAction} action.
 */
interface ISaveToPromptActionOptions {
	/**
	 * Chat widget reference to save session of.
	 */
	readonly chat: IChatWidget;
}

/**
 * Class that defines the `Save Prompt` action.
 */
class SaveToPromptAction extends Action2 {
	constructor() {
		super({
			id: SAVE_TO_PROMPT_ACTION_ID,
			title: localize2(
				'workbench.actions.save-to-prompt.label',
				"Save chat session to a prompt file",
			),
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
		});
	}

	public async run(
		accessor: ServicesAccessor,
		options: ISaveToPromptActionOptions,
	): Promise<void> {
		const logService = accessor.get(ILogService);
		const editorService = accessor.get(IEditorService);
		const rewriter = accessor.get(IInstantiationService).createInstance(PromptFileRewriter);

		const logPrefix = 'save to prompt';
		const chatWidget = options.chat;
		const mode = chatWidget.input.currentModeObs.get();
		const model = chatWidget.input.selectedLanguageModel;

		const toolAndToolsetMap = chatWidget.input.selectedToolsModel.entriesMap.get();

		const output = [];
		output.push('---');
		output.push(`description: New prompt created from chat session`);
		output.push(`mode: ${mode.kind}`);
		if (mode.kind === ChatModeKind.Agent) {
			output.push(`tools: ${rewriter.getNewValueString(toolAndToolsetMap)}`);
		}
		if (model) {
			output.push(`model: ${ILanguageModelChatMetadata.asQualifiedName(model.metadata)}`);
		}
		output.push('---');

		const viewModel = chatWidget.viewModel;
		if (viewModel) {

			for (const request of viewModel.model.getRequests()) {
				const { message, response: responseModel } = request;

				if (isSaveToPromptSlashCommand(message)) {
					continue;
				}

				if (responseModel === undefined) {
					logService.warn(`[${logPrefix}]: skipping request '${request.id}' with no response`);
					continue;
				}

				const { response } = responseModel;

				output.push(`<user>`);
				output.push(request.message.text);
				output.push(`</user>`);
				output.push();
				output.push(`<assistant>`);
				output.push(response.getMarkdown());
				output.push(`</assistant>`);
				output.push();
			}
			const promptText = output.join('\n');

			const untitledPath = 'new.prompt.md';
			const untitledResource = URI.from({ scheme: Schemas.untitled, path: untitledPath });

			const editor = await editorService.openEditor({
				resource: untitledResource,
				contents: promptText,
				languageId: PROMPT_LANGUAGE_ID,
			});

			editor?.focus();
		}
	}
}

/**
 * Check if provided message belongs to the `save to prompt` slash
 * command itself that was run in the chat to invoke this action.
 */
function isSaveToPromptSlashCommand(message: IParsedChatRequest): boolean {
	const { parts } = message;
	if (parts.length < 1) {
		return false;
	}

	const firstPart = parts[0];
	if (firstPart.kind !== 'slash') {
		return false;
	}

	if (firstPart.text !== `${chatSubcommandLeader}${SAVE_TO_PROMPT_SLASH_COMMAND_NAME}`) {
		return false;
	}

	return true;
}

/**
 * Helper to register all the `Save Prompt` actions.
 */
export function registerSaveToPromptActions(): void {
	registerAction2(SaveToPromptAction);
}
