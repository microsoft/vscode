/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../chat.js';
import { CHAT_CATEGORY } from '../chatActions.js';
import { localize2 } from '../../../../../../nls.js';
import { IEditorPane } from '../../../../../common/editor.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/constants.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { chatSubcommandLeader, IParsedChatRequest } from '../../../common/chatParserTypes.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';

/**
 * Action ID for the `Save Prompt` action.
 */
const SAVE_TO_PROMPT_ACTION_ID = 'workbench.action.chat.save-to-prompt';

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
	): Promise<IEditorPane> {
		const logService = accessor.get(ILogService);
		const editorService = accessor.get(IEditorService);

		const logPrefix = 'save to prompt';
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

			const tools = new Set<string>();
			for (const record of response.value) {
				if (('toolId' in record) === false) {
					continue;
				}

				tools.add(record.toolId);
			}

			turns.push({
				request: message.text,
				response: response.getMarkdown(),
				tools,
			});
		}

		const promptText = renderPrompt(turns);

		const editor = await editorService.openEditor({
			resource: undefined,
			contents: promptText,
			languageId: PROMPT_LANGUAGE_ID,
		});

		assertDefined(
			editor,
			'Failed to open untitled editor for the prompt.',
		);

		editor.focus();

		return editor;
	}
}

/**
 * Check if provided message belongs to the `save to prompt` slash
 * command itself that was run in the chat to invoke this action.
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
 * Render the response part of a `request`/`response` turn pair.
 */
const renderResponse = (
	response: string,
): string => {
	// if response starts with a code block, add an extra new line
	// before it, to prevent full blockquote from being be broken
	const delimiter = (response.startsWith('```'))
		? '\n>'
		: ' ';

	// add `>` to the beginning of each line of the response
	// so it looks like a blockquote citing Copilot
	const quotedResponse = response.replaceAll('\n', '\n> ');

	return `> Copilot:${delimiter}${quotedResponse}`;
};

/**
 * Render a single `request`/`response` turn of the chat session.
 */
const renderTurn = (
	turn: ITurn,
): string => {
	const { request, response } = turn;

	return `\n${request}\n\n${renderResponse(response)}`;
};

/**
 * Render the entire chat session as a markdown prompt.
 */
const renderPrompt = (
	turns: readonly ITurn[],
): string => {
	const content: string[] = [];
	const allTools = new Set<string>();

	// render each turn and collect tool names
	// that were used in the each turn
	for (const turn of turns) {
		content.push(renderTurn(turn));

		// collect all used tools into a set of strings
		for (const tool of turn.tools) {
			allTools.add(tool);
		}
	}

	const result = [];

	// add prompt header
	if (allTools.size !== 0) {
		result.push(renderHeader(allTools));
	}

	// add chat request/response turns
	result.push(
		content.join('\n'),
	);

	// add trailing empty line
	result.push('');

	return result.join('\n');
};


/**
 * Render the `tools` metadata inside prompt header.
 */
const renderTools = (
	tools: Set<string>,
): string => {
	const toolStrings = [...tools].map((tool) => {
		return `'${tool}'`;
	});

	return `tools: [${toolStrings.join(', ')}]`;
};

/**
 * Render prompt header.
 */
const renderHeader = (
	tools: Set<string>,
): string => {
	// skip rendering the header if no tools provided
	if (tools.size === 0) {
		return '';
	}

	return [
		'---',
		renderTools(tools),
		'---',
	].join('\n');
};

/**
 * Interface for a single `request`/`response` turn
 * of a chat session.
 */
interface ITurn {
	request: string;
	response: string;
	tools: Set<string>;
}

/**
 * Runs the `Save To Prompt` action with provided options. We export this
 * function instead of {@link SAVE_TO_PROMPT_ACTION_ID} directly to
 * encapsulate/enforce the correct options to be passed to the action.
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
