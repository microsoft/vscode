/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as path from 'path';
import type * as vscode from 'vscode';
import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { getCurrentCapturingToken } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseNotebookEditPart, ChatResponseTextEditPart, ChatToolInvocationPart, ExtendedLanguageModelToolResult, LanguageModelTextPart, MarkdownString, Range } from '../../../vscodeTypes';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { SearchSubagentToolCallingLoop } from '../../prompt/node/searchSubagentToolCallingLoop';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface ISearchSubagentParams {

	/** Natural language query describing what to search for */
	query: string;
	/** User-visible description shown while invoking */
	description: string;
	/** Detailed instructions regarding the search subagent's objective */
	details: string;
	/**
	 * Optional thoroughness level that controls how many tool-call turns the subagent is allowed.
	 * - 'normal' → base limit × 1    (quick & balanced; sufficient for most cases)
	 * - 'deep'   → base limit × 2    (broader exploration; only use when normal is not enough)
	 * Only active when config.github.copilot.chat.searchSubagent.thoroughnessEnabled is true.
	 */
	thoroughness?: 'normal' | 'deep';
}

const THOROUGHNESS_MULTIPLIERS: Record<NonNullable<ISearchSubagentParams['thoroughness']>, number> = {
	normal: 1,
	deep: 2,
};

function computeToolCallLimitForThoroughness(baseLimit: number, thoroughness: NonNullable<ISearchSubagentParams['thoroughness']>): number {
	return Math.max(1, Math.round(baseLimit * THOROUGHNESS_MULTIPLIERS[thoroughness]));
}

class SearchSubagentTool implements ICopilotTool<ISearchSubagentParams> {
	public static readonly toolName = ToolName.SearchSubagent;
	public static readonly nonDeferred = true;
	private _inputContext: IBuildPromptContext | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService
	) { }

	alternativeDefinition(tool: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation {
		const thoroughnessEnabled = this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentThoroughnessEnabled, this.experimentationService);
		if (!thoroughnessEnabled) {
			return tool;
		}

		return {
			...tool,
			description: tool.description
				+ '\n- thoroughness (optional): Search thoroughness — \'normal\' (balanced and quick, sufficient for most cases) or \'deep\' (more turns, broader exploration; only use when normal is clearly not enough).',
			inputSchema: {
				...tool.inputSchema as Record<string, unknown>,
				properties: {
					...(tool.inputSchema as { properties: Record<string, unknown> }).properties,
					thoroughness: {
						type: 'string',
						enum: ['normal', 'deep'],
						description: 'Controls the search thoroughness and turn limit. \'normal\' is balanced and quick, sufficient for most searches. Only use \'deep\' when the task clearly requires broader exploration across many files.',
					},
				},
			},
		};
	}
	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISearchSubagentParams>, token: vscode.CancellationToken) {
		// Get the current working directory from workspace folders
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		const cwd = workspaceFolders.length > 0 ? workspaceFolders[0].fsPath : undefined;

		const searchInstruction = [
			`Find relevant code snippets for: ${options.input.query}`,
			'',
			...(cwd ? [`Current working directory: ${cwd}`, ''] : []),
			'More detailed instructions: ',
			`${options.input.details}`,
			'',
		].join('\n');

		const request = this._inputContext!.request!;
		const parentSessionId = this._inputContext?.conversation?.sessionId ?? generateUuid();
		// Generate a stable session ID for this subagent invocation that will be used:
		// 1. As subAgentInvocationId in the subagent's tool context
		// 2. As subAgentInvocationId in toolMetadata for parent trajectory linking
		// 3. As the session_id in the subagent's own trajectory
		const subAgentInvocationId = generateUuid();

		const toolCallLimit = this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentToolCallLimit, this.experimentationService);
		const thoroughnessEnabled = this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentThoroughnessEnabled, this.experimentationService);

		const effectiveToolCallLimit = thoroughnessEnabled && options.input.thoroughness
			? computeToolCallLimitForThoroughness(toolCallLimit, options.input.thoroughness)
			: toolCallLimit;

		const loop = this.instantiationService.createInstance(SearchSubagentToolCallingLoop, {
			toolCallLimit: effectiveToolCallLimit,
			conversation: new Conversation(parentSessionId, [new Turn(generateUuid(), { type: 'user', message: searchInstruction })]),
			request: request,
			location: request.location,
			promptText: options.input.query,
			subAgentInvocationId: subAgentInvocationId,
			parentToolCallId: options.chatStreamToolCallId,
			parentHeaderRequestId: this._inputContext?.parentHeaderRequestId,
			thoroughness: thoroughnessEnabled ? options.input.thoroughness : undefined,
		});

		const stream = this._inputContext?.stream && ChatResponseStreamImpl.filter(
			this._inputContext.stream,
			part => part instanceof ChatToolInvocationPart || part instanceof ChatResponseTextEditPart || part instanceof ChatResponseNotebookEditPart
		);

		// Create a new capturing token to group this search subagent and all its nested tool calls
		// Similar to how DefaultIntentRequestHandler does it
		// Pass the subAgentInvocationId so the trajectory uses this ID for explicit linking
		const parentChatSessionId = getCurrentCapturingToken()?.chatSessionId;
		const searchSubagentToken = new CapturingToken(
			`Search: ${options.input.query.substring(0, 50)}${options.input.query.length > 50 ? '...' : ''}`,
			'search',
			subAgentInvocationId,
			'search',  // subAgentName for trajectory tracking
			// Use invocation ID as chatSessionId so spans get their own log file
			subAgentInvocationId,
			// Link back to the parent session for debug log grouping
			parentChatSessionId,
			'searchSubagent',
		);

		// Wrap the loop execution in captureInvocation with the new token
		// All nested tool calls will now be logged under this same CapturingToken
		const loopResult = await this.requestLogger.captureInvocation(searchSubagentToken, () => loop.run(stream, token));

		// Build subagent trajectory metadata that will be logged via toolMetadata
		// All nested tool calls are already logged by ToolCallingLoop.logToolResult()
		const toolMetadata = {
			query: options.input.query,
			description: options.input.description,
			// The subAgentInvocationId links this tool call to the subagent's trajectory
			subAgentInvocationId: subAgentInvocationId,
			agentName: 'search'
		};

		let subagentResponse = '';
		if (loopResult.response.type === ChatFetchResponseType.Success) {
			subagentResponse = loopResult.toolCallRounds.at(-1)?.response ?? loopResult.round.response ?? '';
		} else {
			subagentResponse = `The search subagent request failed with this message:\n${loopResult.response.type}: ${loopResult.response.reason}`;
		}
		// Parse and hydrate code snippets from <final_answer> tags
		const hydratedResponse = await this.parseFinalAnswerAndHydrate(subagentResponse, cwd, token);

		// toolMetadata will be automatically included in exportAllPromptLogsAsJsonCommand
		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(hydratedResponse)]);
		result.toolMetadata = toolMetadata;
		result.toolResultMessage = new MarkdownString(l10n.t`Search complete: ${options.input.description}`);
		return result;
	}

	/**
	 * Parse the path and line range subagent response and hydrate code snippets
	 * @param response The subagent response containing paths and line ranges
	 * @param cwd The current working directory to prepend to relative paths
	 * @param token Cancellation token
	 * @returns The response with actual code snippets appended to file paths
	 */
	private async parseFinalAnswerAndHydrate(response: string, cwd: string | undefined, token: vscode.CancellationToken): Promise<string> {
		const lines = response.split('\n');

		// Parse file:line-line format
		const fileRangePattern = /^(.+):(\d+)-(\d+)$/;
		const processedLines: string[] = [];

		for (const line of lines) {
			const trimmedLine = line.trim();

			const match = trimmedLine.match(fileRangePattern);
			if (!match) {
				// I decided to keep non-matching lines as-is, since models sometimes return added info
				processedLines.push(line);
				continue;
			}

			const [, filePath, startLineStr, endLineStr] = match;
			const startLine = parseInt(startLineStr, 10);
			const endLine = parseInt(endLineStr, 10);

			try {
				// For relative paths, immediately resolve against cwd.
				// For absolute paths, use as-is and let openTextDocument throw if not found.
				const uri = (!path.isAbsolute(filePath) && cwd)
					? URI.joinPath(URI.file(cwd), filePath)
					: URI.file(filePath);
				const document = await this.workspaceService.openTextDocument(uri);

				const snapshot = TextDocumentSnapshot.create(document);

				const clampedStartLine = Math.max(1, Math.min(startLine, snapshot.lineCount));
				const clampedEndLine = Math.max(1, Math.min(endLine, snapshot.lineCount));

				const range = new Range(
					clampedStartLine - 1, 0,
					clampedEndLine - 1, Number.MAX_SAFE_INTEGER
				);

				const code = snapshot.getText(range);
				processedLines.push(`File: \`${uri.fsPath}\`, lines ${clampedStartLine}-${clampedEndLine}:\n\`\`\`\n${code}\n\`\`\``);
			} catch (err) {
				// If we can't read the file, keep the original line
				processedLines.push(`${trimmedLine} (unable to read file: ${err})`);
			}

			if (token.isCancellationRequested) {
				break;
			}
		}

		return processedLines.join('\n');
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISearchSubagentParams>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: options.input.description,
		};
	}

	async resolveInput(input: ISearchSubagentParams, promptContext: IBuildPromptContext, _mode: CopilotToolMode): Promise<ISearchSubagentParams> {
		this._inputContext = promptContext;
		return input;
	}
}

ToolRegistry.registerTool(SearchSubagentTool);
