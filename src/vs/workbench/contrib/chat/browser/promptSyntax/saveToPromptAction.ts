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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { PROMPT_SAVE_ANALYZE_COMMAND, PROMPT_SAVE_CHECK_COMMAND, IAnalyzeConversationArgs, IPromptTaskSave } from '../../common/promptSaveContract.js';

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
		const commandService = accessor.get(ICommandService);
		const progressService = accessor.get(IProgressService);
		const quickInputService = accessor.get(IQuickInputService);
		const rewriter = accessor.get(IInstantiationService).createInstance(PromptFileRewriter);

		const logPrefix = 'save to prompt';
		const chatWidget = options.chat;
		const mode = chatWidget.input.currentModeObs.get();
		const model = chatWidget.input.selectedLanguageModel;

		// Try to get LLM-powered analysis
		let analysis: IPromptTaskSave | undefined;
		try {
			// Check if prompt analysis is available
			const isAvailable = await commandService.executeCommand<boolean>(PROMPT_SAVE_CHECK_COMMAND);

			if (isAvailable) {
				// Extract conversation turns
				const viewModel = chatWidget.viewModel;
				const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

				if (viewModel) {
					for (const request of viewModel.model.getRequests()) {
						const { message, response: responseModel } = request;

						if (isSaveToPromptSlashCommand(message)) {
							continue;
						}

						if (responseModel === undefined) {
							continue;
						}

						turns.push({
							role: 'user',
							content: request.message.text
						});

						turns.push({
							role: 'assistant',
							content: responseModel.response.getMarkdown()
						});
					}
				}

				// Only call analysis if we have conversation data
				if (turns.length > 0) {
					const args: IAnalyzeConversationArgs = { turns };

					analysis = await progressService.withProgress(
						{
							location: ProgressLocation.Notification,
							title: 'Analyzing conversation...'
						},
						async () => {
							return await commandService.executeCommand<IPromptTaskSave>(
								PROMPT_SAVE_ANALYZE_COMMAND,
								args
							);
						}
					);
				}
			}
		} catch (error) {
			// Silently fall back to default behavior
			logService.debug(`[${logPrefix}]: LLM analysis failed, using default behavior`, error);
		}

		const output = [];
		output.push('---');

		// Use LLM-suggested description if available
		if (analysis) {
			output.push(`description: ${analysis.description}`);
		} else {
			output.push(`description: New prompt created from chat session`);
		}

		output.push(`mode: ${mode.kind}`);
		if (mode.kind === ChatModeKind.Agent) {
			const toolAndToolsetMap = chatWidget.input.selectedToolsModel.entriesMap.get();
			output.push(`tools: ${rewriter.getNewValueString(toolAndToolsetMap)}`);
		}
		if (model) {
			output.push(`model: ${ILanguageModelChatMetadata.asQualifiedName(model.metadata)}`);
		}
		output.push('---');

		const viewModel = chatWidget.viewModel;
		if (viewModel) {

			// Use LLM-extracted prompt if available
			if (analysis) {
				output.push(analysis.prompt);
			} else {
				// Fallback to current behavior
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
			}

			const promptText = output.join('\n');

			// Get filename suggestion from user
			let filename = 'new.prompt.md';
			if (analysis) {
				const suggestedFilename = `${analysis.title}.prompt.md`;

				const userFilename = await quickInputService.input({
					prompt: 'Enter a filename for the prompt',
					value: suggestedFilename,
					validateInput: async (value) => {
						// Validate kebab-case format
						const basename = value.replace(/\.prompt\.md$/, '');
						if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(basename)) {
							return 'Filename must be in kebab-case format (e.g., "my-prompt-name")';
						}
						return null;
					}
				});

				if (userFilename) {
					filename = userFilename.endsWith('.prompt.md') ? userFilename : `${userFilename}.prompt.md`;
				} else {
					// User cancelled
					return;
				}
			}

			const untitledResource = URI.from({ scheme: Schemas.untitled, path: filename });

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
