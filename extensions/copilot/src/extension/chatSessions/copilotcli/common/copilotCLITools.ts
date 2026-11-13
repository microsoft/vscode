/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, ToolExecutionStartEvent } from '@github/copilot/sdk';
import type { CancellationToken, ChatParticipantToolToken, ChatPromptReference, LanguageModelToolDefinition, LanguageModelToolInformation, LanguageModelToolInvocationOptions, LanguageModelToolResult2 } from 'vscode';
import { ILogger } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { isLocation } from '../../../../util/common/types';
import { findLast } from '../../../../util/vs/base/common/arraysFind';
import { decodeBase64 } from '../../../../util/vs/base/common/buffer';
import { Emitter } from '../../../../util/vs/base/common/event';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { constObservable, IObservable } from '../../../../util/vs/base/common/observable';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatReferenceBinaryData, ChatRequestTurn2, ChatResponseTurn2, LanguageModelTextPart, Location, Range, Uri } from '../../../../vscodeTypes';
import { ToolName } from '../../../tools/common/toolNames';
import { ICopilotTool } from '../../../tools/common/toolsRegistry';
import { IOnWillInvokeToolEvent, IToolsService, IToolValidationResult } from '../../../tools/common/toolsService';
import { StoredModeInstructions } from '../../common/chatSessionMetadataStore';
import { formatModelDetails, ModelDetailsInfo } from '../../../../platform/chat/common/chatModelDetails';
import { appendResponsePartsForEvent, createResponseEventRenderContext, flushPendingAssistantMessage, ResponseEventRenderContext } from '../../common/sessionEventRenderer';
import { extractChatPromptReferences, getFolderAttachmentPath } from './copilotCLIPrompt';
import { IChatDelegationSummaryService } from '../../common/delegationSummaryService';
import { CLI_TOOL_EVENT_HANDLERS, isCopilotCliEditToolCall, type ToolCall } from '../../common/copilotCLIToolInvocations';

// Tool-call rendering is shared with the cloud agent; re-exported for the legacy callers.
export { CLI_TOOL_EVENT_HANDLERS, createCopilotCLIToolInvocation, enrichToolInvocationWithSubagentMetadata, extractCdPrefix, getAffectedUrisForEditTool, getCdPresentationOverrides, isCopilotCliEditToolCall, parseTodoMarkdown, processToolExecutionComplete, processToolExecutionStart } from '../../common/copilotCLIToolInvocations';
export type { ToolCall, ToolInfo, UnknownToolCall } from '../../common/copilotCLIToolInvocations';

function isInstructionAttachmentPath(path: string): boolean {
	const normalizedPath = path.replace(/\\/g, '/');
	return normalizedPath.endsWith('/.github/copilot-instructions.md')
		|| (normalizedPath.includes('/.github/instructions/') && normalizedPath.endsWith('.md'));
}

export function isCopilotCLIToolThatCouldRequirePermissions(event: ToolExecutionStartEvent): boolean {
	const toolCall = event.data as unknown as ToolCall;
	if (isCopilotCliEditToolCall(toolCall)) {
		return true;
	}
	if (toolCall.mcpServerName) {
		return false;
	}
	if (toolCall.toolName === 'bash' || toolCall.toolName === 'powershell') {
		return true;
	}
	if (toolCall.toolName === 'view') {
		return true;
	}
	return false;
}

export function stripReminders(text: string): string {
	// Remove any <reminder> ... </reminder> blocks, including newlines
	// Also remove <current_datetime> ... </current_datetime> blocks
	// Also remove <pr_metadata .../> tags
	return text
		.replace(/<reminder>[\s\S]*?<\/reminder>\s*/g, '')
		.replace(/<attachments>[\s\S]*?<\/attachments>\s*/g, '')
		.replace(/<userRequest>[\s\S]*?<\/userRequest>\s*/g, '')
		.replace(/<user_query>[\s\S]*?<\/user_query>\s*/g, '')
		.replace(/<context>[\s\S]*?<\/context>\s*/g, '')
		.replace(/<current_datetime>[\s\S]*?<\/current_datetime>\s*/g, '')
		.replace(/<pr_metadata[^>]*\/?>\s*/g, '')
		.trim();
}

export interface RequestIdDetails {
	readonly requestId: string;
	readonly toolIdEditMap: Record<string, string>;
	readonly modeInstructions?: StoredModeInstructions;
	readonly responseModelId?: string;
	readonly creditsUsed?: number;
	readonly isUsingAutoModel?: boolean;
}

/**
 * Build chat history from SDK events for VS Code chat session
 * Converts SDKEvents into ChatRequestTurn2 and ChatResponseTurn2 objects
 */
export function buildChatHistoryFromEvents(sessionId: string, modelId: string | undefined, events: readonly SessionEvent[], getVSCodeRequestId: (sdkRequestId: string) => RequestIdDetails | undefined, delegationSummaryService: IChatDelegationSummaryService, logger: ILogger, workingDirectory?: URI, defaultModeInstructionsForLastRequest?: StoredModeInstructions, modelDetailsById?: ReadonlyMap<string, ModelDetailsInfo>): (ChatRequestTurn2 | ChatResponseTurn2)[] {
	const turns: (ChatRequestTurn2 | ChatResponseTurn2)[] = [];

	let details: RequestIdDetails | undefined;
	let isFirstUserMessage = true;
	let currentModelId = modelId;
	let currentResponseModelId: string | undefined;
	let currentCreditsUsed: number | undefined;
	let currentRequestTurnIndex: number | undefined;

	// `ctx` owns the in-flight tool invocations, streamed assistant text buffer,
	// processed message ids, and the response parts being accumulated for the
	// current response turn. The shared renderer reads/writes these in place;
	// `flushResponseParts` drains `currentResponseParts` between turns.
	const ctx: ResponseEventRenderContext<ToolCall> = createResponseEventRenderContext(
		logger,
		CLI_TOOL_EVENT_HANDLERS,
		workingDirectory,
		toolCallId => details?.toolIdEditMap?.[toolCallId],
	);

	function getModelInfo(modelId: string | undefined): ModelDetailsInfo | undefined {
		if (!modelId || !modelDetailsById) {
			return undefined;
		}
		return modelDetailsById.get(modelId.trim().toLowerCase());
	}

	function createResultForModel(modelId: string | undefined, creditsUsed: number | undefined) {
		const modelInfo = getModelInfo(modelId);
		if (modelInfo) {
			return { details: formatModelDetails(modelInfo.name, modelInfo.multiplier, creditsUsed) };
		}
		return {};
	}

	function flushResponseParts() {
		if (ctx.currentResponseParts.length > 0) {
			turns.push(new ChatResponseTurn2([...ctx.currentResponseParts], createResultForModel(currentResponseModelId ?? currentModelId, currentCreditsUsed), ''));
			ctx.currentResponseParts.length = 0;
		}
		currentResponseModelId = undefined;
		currentCreditsUsed = undefined;
		currentRequestTurnIndex = undefined;
	}

	function updateCurrentRequestModelId(modelId: string | undefined) {
		if (currentRequestTurnIndex === undefined || !modelId) {
			return;
		}
		const turn = turns[currentRequestTurnIndex];
		if (turn instanceof ChatRequestTurn2 && turn.modelId !== modelId) {
			turns[currentRequestTurnIndex] = new ChatRequestTurn2(turn.prompt, turn.command, turn.references, turn.participant, [...turn.toolReferences], turn.editedFileEvents, turn.id, modelId, turn.modeInstructions2);
		}
	}

	const lastUserMessageId = findLast(events, event => event.type === 'user.message' && !isSyntheticUserMessage(event))?.id;
	for (const event of events) {
		// Flush buffered `assistant.message_delta` chunks before any non-message
		// event runs so lifecycle guards like `ctx.currentResponseParts.length === 0`
		// (used by `session.model_change`) see the streamed text that has already
		// been produced. Mirrors the pre-extraction behavior in the CLI builder.
		if (event.type !== 'assistant.message') {
			flushPendingAssistantMessage(ctx);
		}

		switch (event.type) {
			case 'session.start':
			case 'session.resume': {
				currentModelId = event.data.selectedModel ?? currentModelId;
				continue;
			}
			case 'session.model_change': {
				currentModelId = event.data.newModel;
				if (currentRequestTurnIndex !== undefined && ctx.currentResponseParts.length === 0) {
					currentResponseModelId = currentModelId;
					updateCurrentRequestModelId(currentModelId);
				}
				continue;
			}
			case 'assistant.usage': {
				currentModelId = event.data.model ?? currentModelId;
				if (currentRequestTurnIndex !== undefined) {
					currentResponseModelId = currentModelId;
					updateCurrentRequestModelId(currentModelId);
				}
				continue;
			}
			case 'user.message': {
				if (isSyntheticUserMessage(event)) {
					continue;
				}
				details = getVSCodeRequestId(event.id);
				flushPendingAssistantMessage(ctx);
				flushResponseParts();
				// Filter out vscode instruction files from references when building session history
				// TODO@rebornix filter instructions should be rendered as "references" in chat response like normal chat.
				const references: ChatPromptReference[] = [];

				try {
					references.push(...extractChatPromptReferences(event.data.content || ''));
				} catch (ex) {
					// ignore errors from parsing references
				}
				const existingReferences = new ResourceMap<Range | undefined>();
				references.forEach(ref => {
					if (URI.isUri(ref.value)) {
						existingReferences.set(ref.value, undefined);
					} else if (isLocation(ref.value)) {
						existingReferences.set(ref.value.uri, ref.value.range);
					}
				});
				((event.data.attachments || []))
					.filter(attachment => attachment.type === 'selection' || attachment.type === 'github_reference' || attachment.type === 'blob' || attachment.type === 'github_actions_job' || attachment.type === 'github_url' || attachment.type === 'github_tree_comparison' || attachment.type === 'github_release' || attachment.type === 'github_repository' || attachment.type === 'github_file_diff' || attachment.type === 'github_commit' || attachment.type === 'github_file' || attachment.type === 'extension_context' ? true : !isInstructionAttachmentPath(attachment.path))
					.forEach(attachment => {
						if (attachment.type === 'github_reference') {
							return;
						}
						if (attachment.type === 'selection') {
							const range = attachment.displayName ? getRangeInPrompt(event.data.content || '', attachment.displayName) : undefined;
							const uri = Uri.file(attachment.filePath);
							if (existingReferences.has(uri) && !existingReferences.get(uri)) {
								return; // Skip duplicates
							}
							references.push({
								id: attachment.filePath,
								name: attachment.displayName,
								value: new Location(uri, new Range(attachment.selection.start.line - 1, attachment.selection.start.character - 1, attachment.selection.end.line - 1, attachment.selection.end.character - 1)),
								range
							});
						} else if (attachment.type === 'file' || attachment.type === 'directory') {
							const range = attachment.displayName ? getRangeInPrompt(event.data.content || '', attachment.displayName) : undefined;
							const attachmentPath = attachment.type === 'directory' ?
								getFolderAttachmentPath(attachment.path) :
								attachment.path;
							const uri = Uri.file(attachmentPath);
							if (existingReferences.has(uri)) {
								return; // Skip duplicates
							}
							references.push({
								id: attachment.path,
								name: attachment.displayName,
								value: uri,
								range
							});
						} else if (attachment.type === 'blob') {
							if (typeof attachment.data !== 'string') {
								return;
							}
							const data = attachment.data;
							const binaryDataSupplier = async () => {
								try {
									return decodeBase64(data).buffer;
								} catch (error) {
									logger.error(error, `Failed to decode blob attachment ${attachment.displayName || ''}`);
									throw error;
								}
							};
							references.push({
								id: `${attachment.displayName || ''}-${attachment.mimeType}-${attachment.type}`,
								name: attachment.displayName || '',
								value: new ChatReferenceBinaryData(attachment.mimeType, binaryDataSupplier),
							});
						}
					});

				let prompt = stripReminders(event.data.content || '');
				const info = isFirstUserMessage ? delegationSummaryService.extractPrompt(sessionId, prompt) : undefined;
				if (info) {
					prompt = info.prompt;
					references.push(info.reference);
				}
				isFirstUserMessage = false;
				let modeInstructions2 = details?.modeInstructions ? {
					uri: details.modeInstructions.uri ? Uri.parse(details.modeInstructions.uri) : undefined,
					name: details.modeInstructions.name,
					content: details.modeInstructions.content,
					metadata: details.modeInstructions.metadata,
					isBuiltin: details.modeInstructions.isBuiltin,
				} : undefined;

				if (lastUserMessageId && event.id === lastUserMessageId && defaultModeInstructionsForLastRequest && !modeInstructions2) {
					modeInstructions2 = modeInstructions2 ?? {
						uri: defaultModeInstructionsForLastRequest.uri ? Uri.parse(defaultModeInstructionsForLastRequest.uri) : undefined,
						name: defaultModeInstructionsForLastRequest.name,
						content: defaultModeInstructionsForLastRequest.content,
						metadata: defaultModeInstructionsForLastRequest.metadata,
						isBuiltin: defaultModeInstructionsForLastRequest.isBuiltin,
					};
				}
				let commandPrefix = '';
				switch (event.data.agentMode) {
					case 'autopilot': {
						commandPrefix = '/autopilot ';
						break;
					}
					case 'plan': {
						commandPrefix = '/plan ';
						break;
					}
				}

				// Prefer the persisted resolved model id (from `assistant.usage`) so that on reload
				// `auto` sessions show the actual model used to produce the response. Falls back to
				// the currently tracked model id (from `session.start`/`session.model_change`).
				const resolvedRequestModelId = details?.responseModelId ?? currentModelId;
				currentResponseModelId = resolvedRequestModelId;
				currentCreditsUsed = details?.creditsUsed;
				turns.push(new ChatRequestTurn2(`${commandPrefix}${prompt}`, undefined, references, '', [], undefined, details?.requestId ?? event.id, details?.isUsingAutoModel ? 'auto' : resolvedRequestModelId, modeInstructions2));
				currentRequestTurnIndex = turns.length - 1;
				continue;
			}
		}

		appendResponsePartsForEvent(event, ctx);
	}

	flushPendingAssistantMessage(ctx);
	flushResponseParts();

	return turns;
}

function getRangeInPrompt(prompt: string, referencedName: string): [number, number] | undefined {
	referencedName = `#${referencedName}`;
	const index = prompt.indexOf(referencedName);
	if (index >= 0) {
		return [index, index + referencedName.length];
	}
	return undefined;
}

/**
 * Check whether a SQL query writes to the `todos` or `todo_deps` table.
 * Pure reads (SELECT) are ignored to avoid unnecessary widget refreshes.
 */
export function isTodoRelatedSqlQuery(query: string): boolean {
	const normalized = query.replace(/\s+/g, ' ').toLowerCase();
	const targetsTodoTable = /\btodos\b/.test(normalized) || /\btodo_deps\b/.test(normalized);
	if (!targetsTodoTable) {
		return false;
	}
	return /\b(insert|update|delete|create|drop|alter)\b/.test(normalized);
}

interface SqlTodoItem {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly status: 'pending' | 'in_progress' | 'done' | 'blocked';
}

function mapSqlStatusToTodoStatus(status: string): 'not-started' | 'in-progress' | 'completed' {
	switch (status) {
		case 'done':
			return 'completed';
		case 'in_progress':
			return 'in-progress';
		case 'pending':
		case 'blocked':
		default:
			return 'not-started';
	}
}

/**
 * Update the todo list widget from SQL todo items queried from the session database.
 */
export async function updateTodoListFromSqlItems(
	items: readonly SqlTodoItem[],
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	token: CancellationToken
): Promise<void> {
	await toolsService.invokeTool(ToolName.CoreManageTodoList, {
		input: {
			operation: 'write',
			todoList: items.map((item, i) => ({
				id: i,
				title: item.title,
				description: item.description || '',
				status: mapSqlStatusToTodoStatus(item.status)
			} satisfies IManageTodoListToolInputParams['todoList'][number])),
		} satisfies IManageTodoListToolInputParams,
		toolInvocationToken,
	}, token);
}

export async function clearTodoList(toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	token: CancellationToken): Promise<void> {
	await toolsService.invokeTool(ToolName.CoreManageTodoList, {
		input: {
			operation: 'write',
			todoList: []
		} satisfies IManageTodoListToolInputParams,
		toolInvocationToken,
	}, token);
}

interface IManageTodoListToolInputParams {
	readonly operation?: 'write' | 'read'; // Optional in write-only mode
	readonly todoList: readonly {
		readonly id: number;
		readonly title: string;
		readonly description: string;
		readonly status: 'not-started' | 'in-progress' | 'completed';
	}[];
}

/**
 * Mock tools service that can be configured for different test scenarios
 */
export class FakeToolsService implements IToolsService {
	readonly _serviceBrand: undefined;

	private readonly _onWillInvokeTool = new Emitter<IOnWillInvokeToolEvent>();
	readonly onWillInvokeTool = this._onWillInvokeTool.event;

	readonly tools: ReadonlyArray<LanguageModelToolInformation> = [];
	readonly copilotTools = new Map<ToolName, ICopilotTool<unknown>>();

	private _confirmationResult: 'yes' | 'no' = 'yes';
	private _invokeToolCalls: Array<{ name: string; input: unknown }> = [];

	setConfirmationResult(result: 'yes' | 'no'): void {
		this._confirmationResult = result;
	}

	get invokeToolCalls(): ReadonlyArray<{ name: string; input: unknown }> {
		return this._invokeToolCalls;
	}

	clearCalls(): void {
		this._invokeToolCalls = [];
	}

	invokeToolWithEndpoint(name: string, options: LanguageModelToolInvocationOptions<unknown>, endpoint: IChatEndpoint | undefined, token: CancellationToken): Thenable<LanguageModelToolResult2> {
		return this.invokeTool(name, options);
	}

	modelSpecificTools: IObservable<{ definition: LanguageModelToolDefinition; tool: ICopilotTool<unknown> }[]> = constObservable([]);

	async invokeTool(
		name: string,
		options: LanguageModelToolInvocationOptions<unknown>
	): Promise<LanguageModelToolResult2> {
		this._invokeToolCalls.push({ name, input: options.input });

		if (name === ToolName.CoreConfirmationTool || name === ToolName.CoreTerminalConfirmationTool) {
			return {
				content: [new LanguageModelTextPart(this._confirmationResult)]
			};
		}

		if (name === 'vscode_reviewPlan') {
			if (this._confirmationResult === 'no') {
				return { content: [new LanguageModelTextPart(JSON.stringify({ rejected: true }))] };
			}
			const input = options.input as { actions?: Array<{ label: string }> } | undefined;
			const firstAction = input?.actions?.[0]?.label;
			return { content: [new LanguageModelTextPart(JSON.stringify({ action: firstAction, rejected: false }))] };
		}

		return { content: [] };
	}

	getCopilotTool(): ICopilotTool<unknown> | undefined {
		return undefined;
	}

	getTool(): LanguageModelToolInformation | undefined {
		return undefined;
	}

	getToolByToolReferenceName(): LanguageModelToolInformation | undefined {
		return undefined;
	}

	validateToolInput(): IToolValidationResult {
		return { inputObj: {} };
	}

	validateToolName(): string | undefined {
		return undefined;
	}

	getEnabledTools(): LanguageModelToolInformation[] {
		return [];
	}
}


/**
 * CLI sends 'synthetic' user messages for cases such as Skill invocations.
 * We need to ensure these user.messages are not treated as regular user messages in the UI, which could cause confusion as they may not be directly from the user.
 */
export function isSyntheticUserMessage(event: Extract<SessionEvent, { type: 'user.message' }>): boolean {
	return event.type === 'user.message' && !!event.data.source && (event.data.source ?? '').toLowerCase() !== 'user';
}
