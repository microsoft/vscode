/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../chat.js';
import { CHAT_CATEGORY } from '../chatActions.js';
import { localize2 } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/constants.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { chatSubcommandLeader, IParsedChatRequest } from '../../../common/chatParserTypes.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IUntitledTextEditorModel } from '../../../../../services/untitled/common/untitledTextEditorModel.js';
import { IUntitledTextEditorService } from '../../../../../services/untitled/common/untitledTextEditorService.js';

/**
 * Action ID for the `Save Prompt` action.
 */
const SAVE_TO_PROMPT_ACTION_ID = 'workbench.action.chat.save-to-prompt';

/**
 * TODO: @legomushroom
 */
interface ISaveToPromptActionOptions {
	/**
	 * Model of a chat session to save.
	 */
	chat: IChatWidget;
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
	): Promise<IUntitledTextEditorModel> {
		const logService = accessor.get(ILogService);
		const editorService = accessor.get(IUntitledTextEditorService);
		// TODO: @legomushroom
		// TODO: @legomushroom - use the copilot output channel for logging
		const logPrefix = 'save prompt action';

		const { chat } = options;

		const { viewModel } = chat;
		assertDefined(
			viewModel,
			'No view model found on currently the active chat widget.',
		);

		const { model } = viewModel;

		const turns: ITurn[] = [];
		for (const request of model.getRequests()) {
			const { message, response: responseModel } = request;

			if (isSaveToPromptSlashCommand(message)) {
				continue;
			}

			if (responseModel === undefined) {
				logService.warn(
					`[${logPrefix}]: skipping request '${request.id}' with no response`,
				);

				continue;
			}

			const { response } = responseModel;

			const usedTools = new Set<string>();
			for (const record of response.value) {
				if (('toolId' in record) === false) {
					continue;
				}

				usedTools.add(record.toolId);
			}

			turns.push({
				request: message.text,
				response: response.getMarkdown(),
				tools: [...usedTools],
			});
		}

		const promptText = renderPrompt(turns);

		// TODO: @legomushroom - do we need to manage disposal of `editor`?
		const editor = editorService.create({
			initialValue: promptText,
			languageId: PROMPT_LANGUAGE_ID,
		}); // TODO: @legomushroom - save `/save` command in the chat history or remove copilots empty response for it

		// TODO: @legomushroom - focus the new untitled editor
		return editor;
	}
}

/**
 * TODO: @legomushroom
 */
const isSaveToPromptSlashCommand = (
	message: IParsedChatRequest,
): boolean => {
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
};

/**
 * TODO: @legomushroom
 */
export const SAVE_TO_PROMPT_SLASH_COMMAND_NAME = 'save';

/**
 * TODO: @legomushroom
 */
const renderTurn = (
	turn: ITurn,
): string => {
	return `${turn.request}\n> Copilot: ${turn.response}`;
};

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - re-running /save command does not find the correct tools
const renderTools = (
	tools: readonly string[],
): string => {
	const toolStrings = tools.map((tool) => {
		return `'${tool}'`;
	});

	return `tools: [${toolStrings.join(', ')}]`;
};

/**
 * TODO: @legomushroom
 */
const renderPrompt = (
	turns: readonly ITurn[],
): string => {
	const tools = new Set<string>();
	const turnStrings: string[] = [];

	for (const turn of turns) {
		turnStrings.push(
			'', // extra empty line between turns
			renderTurn(turn),
		);

		// collect all used tools into a set of strings
		for (const tool of turn.tools) {
			tools.add(tool);
		}
	}

	return [
		// TODO: @legomushroom - if tools are empty, don't render the header?
		// TODO: @legomushroom - pretty print the copilot responses
		'---',
		renderTools([...tools]),
		'---',
		...turnStrings,
	].join('\n');
};

/**
 * TODO: @legomushroom
 */
interface ITurn {
	request: string;
	response: string;
	tools: string[];
}

/**
 * TODO: @legomushroom
 */
export const runSaveToPromptAction = async (
	options: ISaveToPromptActionOptions,
	commandService: ICommandService,
) => {
	return await commandService.executeCommand(
		SAVE_TO_PROMPT_ACTION_ID,
		options,
	);
};

/**
 * Helper to register all the `Save Prompt` actions.
 */
export const registerSaveToPromptActions = () => {
	registerAction2(SaveToPromptAction);
};
