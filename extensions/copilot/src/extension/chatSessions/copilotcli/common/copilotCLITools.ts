/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, ToolExecutionCompleteEvent, ToolExecutionStartEvent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import type { CancellationToken, ChatParticipantToolToken, ChatPromptReference, ChatSimpleToolResultData, ChatTerminalToolInvocationData, ExtendedChatResponsePart, LanguageModelToolDefinition, LanguageModelToolInformation, LanguageModelToolInvocationOptions, LanguageModelToolResult2 } from 'vscode';
import { ILogger } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { isLocation } from '../../../../util/common/types';
import { findLast } from '../../../../util/vs/base/common/arraysFind';
import { decodeBase64 } from '../../../../util/vs/base/common/buffer';
import { Emitter } from '../../../../util/vs/base/common/event';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { constObservable, IObservable } from '../../../../util/vs/base/common/observable';
import { isAbsolutePath, isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatMcpToolInvocationData, ChatReferenceBinaryData, ChatRequestTurn2, ChatResponseCodeblockUriPart, ChatResponseMarkdownPart, ChatResponsePullRequestPart, ChatResponseTextEditPart, ChatResponseThinkingProgressPart, ChatResponseTurn2, ChatSubagentToolInvocationData, ChatToolInvocationPart, LanguageModelTextPart, Location, MarkdownString, McpToolInvocationContentData, Range, Uri } from '../../../../vscodeTypes';
import type { MCP } from '../../../common/modelContextProtocol';
import { ToolName } from '../../../tools/common/toolNames';
import { ICopilotTool } from '../../../tools/common/toolsRegistry';
import { IOnWillInvokeToolEvent, IToolsService, IToolValidationResult } from '../../../tools/common/toolsService';
import { formatUriForFileWidget } from '../../../tools/common/toolUtils';
import { StoredModeInstructions } from '../../common/chatSessionMetadataStore';
import { extractChatPromptReferences, getFolderAttachmentPath } from './copilotCLIPrompt';
import { IChatDelegationSummaryService } from './delegationSummaryService';


interface CreateTool {
	toolName: 'create';
	arguments: {
		path: string;
		file_text?: string;
	};
}

interface ViewTool {
	toolName: 'view';
	arguments: {
		path: string;
		view_range?: [number, number];
		forceReadLargeFiles?: boolean;
	};
}

interface EditTool {
	toolName: 'edit' | 'str_replace';
	arguments: {
		path: string;
		old_str?: string;
		new_str?: string;
	};
}

interface StrReplaceTool {
	toolName: 'str_replace';
	arguments: {
		path: string;
		old_str?: string;
		new_str?: string;
	};
}

interface InsertTool {
	toolName: 'insert';
	arguments: {
		path: string;
		insert_line?: number;
		new_str: string;
	};
}

interface ShellTool {
	toolName: 'bash' | 'powershell';
	arguments: {
		command: string;
		description: string;
		shellId?: string;
		mode?: 'sync' | 'async';
		detach?: boolean;
		initial_wait?: number;
	};
}

interface WriteShellTool {
	toolName: 'write_bash' | 'write_powershell';
	arguments: {
		shellId: string;
		input?: string;
		delay: number;
	};
}

interface ReadShellTool {
	toolName: 'read_bash' | 'read_powershell';
	arguments: {
		shellId: string;
		delay: number;
	};
}

interface StopShellTool {
	toolName: 'stop_bash' | 'stop_powershell';
	arguments: {
		shellId: string;
	};
}

interface ListShellTool {
	toolName: 'list_bash' | 'list_powershell';
	arguments: Record<string, never>;
}

interface GrepTool {
	toolName: 'grep' | 'rg';
	arguments: {
		pattern: string;
		path?: string;
		output_mode?: 'content' | 'files_with_matches' | 'count';
		glob?: string;
		type?: string;
		'-i'?: boolean;
		'-A'?: number;
		'-B'?: number;
		'-C'?: number;
		'-n'?: boolean;
		head_limit?: number;
		multiline?: boolean;
	};
}

interface GLobTool {
	toolName: 'glob';
	arguments: {
		pattern: string;
		path?: string;
	};
}

type ReportIntentTool = {
	toolName: 'report_intent';
	arguments: {
		intent: string;
	};
};
type ThinkTool = {
	toolName: 'think';
	arguments: {
		thought: string;
	};
};

type UpdateTodoTool = {
	toolName: 'update_todo';
	arguments: {
		todos: string;
	};
};

type ReportProgressTool = {
	toolName: 'report_progress';
	arguments: {
		commitMessage: string;
		prDescription: string;
	};
};

type WebFetchTool = {
	toolName: 'web_fetch';
	arguments: {
		url: string;
		max_length?: number;
		start_index?: number;
		raw?: boolean;
	};
};

type WebSearchTool = {
	toolName: 'web_search';
	arguments: {
		query: string;
	};
};

type SearchCodeSubagentTool = {
	toolName: 'search_code_subagent';
	arguments: {
		query: string;
	};
};

type ReplyToCommentTool = {
	toolName: 'reply_to_comment';
	arguments: {
		reply: string;
		comment_id: string;
	};
};

type CodeReviewTool = {
	toolName: 'code_review';
	arguments: {
		prTitle: string;
		prDescription: string;
	};
};

type ShowFileTool = {
	toolName: 'show_file';
	arguments: {
		path: string;
		view_range?: number[];
		diff?: boolean;
	};
};

type FetchCopilotCliDocumentationTool = {
	toolName: 'fetch_copilot_cli_documentation';
	arguments: Record<string, never>;
};

type ProposeWorkTool = {
	toolName: 'propose_work';
	arguments: {
		workType: 'code_change' | 'task';
		workTitle: string;
		workDescription: string;
	};
};

type TaskCompleteTool = {
	toolName: 'task_complete';
	arguments: {
		summary?: string;
	};
};

type AskUserTool = {
	toolName: 'ask_user';
	arguments:
	| {
		question: string;
		choices?: string[];
		allow_freeform?: boolean;
	}
	| {
		message: string;
		requestedSchema: {
			properties: Record<string, unknown>;
			required?: string[];
		};
	};
};

type SkillTool = {
	toolName: 'skill';
	arguments: {
		skill: string;
	};
};

type TaskTool = {
	toolName: 'task';
	arguments: {
		description: string;
		prompt: string;
		agent_type: string;
		model?: string;
		mode?: 'sync' | 'background';
	};
};

type ListAgentsTool = {
	toolName: 'list_agents';
	arguments: {
		include_completed?: boolean;
	};
};

type ReadAgentTool = {
	toolName: 'read_agent';
	arguments: {
		agent_id: string;
		wait?: boolean;
		timeout?: number;
	};
};

type ExitPlanModeTool = {
	toolName: 'exit_plan_mode';
	arguments: {
		summary: string;
		actions?: string[];
		recommendedAction?: string;
	};
};

type SqlTool = {
	toolName: 'sql';
	arguments: {
		description: string;
		query: string;
		database?: 'session' | 'session_store';
	};
};

type LspTool = {
	toolName: 'lsp';
	arguments: {
		operation: string;
		file?: string;
		line?: number;
		character?: number;
		newName?: string;
		includeDeclaration?: boolean;
		query?: string;
		language?: string;
	};
};

type CreatePullRequestTool = {
	toolName: 'create_pull_request';
	arguments: {
		title: string;
		description?: string;
		draft?: boolean;
	};
};

type DependencyCheckerTool = {
	toolName: 'gh-advisory-database';
	arguments: {
		dependencies: { version: string; name: string; ecosystem: string }[];
	};
};

type StoreMemoryTool = {
	toolName: 'store_memory';
	arguments: {
		subject: string;
		fact: string;
		citations: string;
		reason: string;
		category: string;
	};
};

type ParallelValidationTool = {
	toolName: 'parallel_validation';
	arguments: Record<string, never>;
};

type ApplyPatchTool = {
	toolName: 'apply_patch';
	arguments: {
		input?: string;
		patch?: string;
	};
};

type WriteAgentTool = {
	toolName: 'write_agent';
	arguments: {
		agent_id: string;
		message: string;
	};
};

type McpReloadTool = {
	toolName: 'mcp_reload';
	arguments: Record<string, never>;
};

type McpValidateTool = {
	toolName: 'mcp_validate';
	arguments: {
		path: string;
	};
};

type ToolSearchTool = {
	toolName: 'tool_search_tool_regex';
	arguments: {
		pattern: string;
		limit?: number;
	};
};

type CodeQLCheckerTool = {
	toolName: 'codeql_checker';
	arguments: Record<string, never>;
};


type StringReplaceArgumentTypes = CreateTool | ViewTool | StrReplaceTool | EditTool | InsertTool;
type ToStringReplaceEditorArguments<T extends StringReplaceArgumentTypes> = {
	command: T['toolName'];
} & T['arguments'];
type StringReplaceEditorTool = {
	toolName: 'str_replace_editor';
	arguments: ToStringReplaceEditorArguments<CreateTool> | ToStringReplaceEditorArguments<ViewTool> | ToStringReplaceEditorArguments<EditTool> | ToStringReplaceEditorArguments<StrReplaceTool> |
	ToStringReplaceEditorArguments<InsertTool>;
};
export type ToolInfo = StringReplaceEditorTool | EditTool | CreateTool | ViewTool | InsertTool |
	ShellTool | WriteShellTool | ReadShellTool | StopShellTool | ListShellTool |
	GrepTool | GLobTool |
	ReportIntentTool | ThinkTool | ReportProgressTool |
	SearchCodeSubagentTool |
	ReplyToCommentTool | CodeReviewTool | WebFetchTool | UpdateTodoTool | WebSearchTool |
	ShowFileTool | FetchCopilotCliDocumentationTool | ProposeWorkTool | TaskCompleteTool |
	AskUserTool | SkillTool | TaskTool | ListAgentsTool | ReadAgentTool | WriteAgentTool |
	ExitPlanModeTool | SqlTool | LspTool | CreatePullRequestTool | DependencyCheckerTool | StoreMemoryTool | ParallelValidationTool |
	ApplyPatchTool | McpReloadTool | McpValidateTool | ToolSearchTool | CodeQLCheckerTool;

export type ToolCall = ToolInfo & {
	toolCallId: string;
	mcpServerName?: string | undefined;
	mcpToolName?: string | undefined;
};
export type UnknownToolCall = { toolName: string; arguments: unknown; toolCallId: string };

function isInstructionAttachmentPath(path: string): boolean {
	const normalizedPath = path.replace(/\\/g, '/');
	return normalizedPath.endsWith('/.github/copilot-instructions.md')
		|| (normalizedPath.includes('/.github/instructions/') && normalizedPath.endsWith('.md'));
}

export function isCopilotCliEditToolCall(data: { toolName: string; arguments?: unknown }): boolean {
	const toolCall = data as ToolCall;
	if (toolCall.toolName === 'str_replace_editor') {
		return toolCall.arguments.command !== 'view';
	}
	return toolCall.toolName === 'create' || toolCall.toolName === 'edit';
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

export function getAffectedUrisForEditTool(data: { toolName: string; arguments?: unknown }): URI[] {
	const toolCall = data as ToolCall;
	// Old versions used str_replace_editor
	// This should be removed eventually
	// TODO @DonJayamanne verify with SDK & Padawan folk.
	if (toolCall.toolName === 'str_replace_editor' && toolCall.arguments.command !== 'view' && typeof toolCall.arguments.path === 'string') {
		return [URI.file(toolCall.arguments.path)];
	}

	if ((toolCall.toolName === 'create' || toolCall.toolName === 'edit') && typeof toolCall.arguments.path === 'string') {
		return [URI.file(toolCall.arguments.path)];
	}

	return [];
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

/**
 * Extract PR metadata from assistant message content
 */
function extractPRMetadata(content: string): { cleanedContent: string; prPart?: ChatResponsePullRequestPart } {
	const prMetadataRegex = /<pr_metadata\s+uri="(?<uri>[^"]+)"\s+title="(?<title>[^"]+)"\s+description="(?<description>[^"]+)"\s+author="(?<author>[^"]+)"\s+linkTag="(?<linkTag>[^"]+)"\s*\/?>/;
	const match = content.match(prMetadataRegex);

	if (match?.groups) {
		const { title, description, author, linkTag } = match.groups;
		// Unescape XML entities
		const unescapeXml = (text: string) => text
			.replace(/&apos;/g, `'`)
			.replace(/&quot;/g, '"')
			.replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<')
			.replace(/&amp;/g, '&');

		const prPart = new ChatResponsePullRequestPart(
			{ command: 'github.copilot.chat.openPullRequestReroute', title: l10n.t('View Pull Request {0}', linkTag), arguments: [Number(linkTag.substring(1))] },
			unescapeXml(title),
			unescapeXml(description),
			unescapeXml(author),
			unescapeXml(linkTag)
		);

		const cleanedContent = content.replace(match[0], '').trim();
		return { cleanedContent, prPart };
	}

	return { cleanedContent: content };
}

export interface RequestIdDetails {
	readonly requestId: string;
	readonly toolIdEditMap: Record<string, string>;
	readonly modeInstructions?: StoredModeInstructions;
	readonly responseModelId?: string;
}

/**
 * Build chat history from SDK events for VS Code chat session
 * Converts SDKEvents into ChatRequestTurn2 and ChatResponseTurn2 objects
 */
export function buildChatHistoryFromEvents(sessionId: string, modelId: string | undefined, events: readonly SessionEvent[], getVSCodeRequestId: (sdkRequestId: string) => RequestIdDetails | undefined, delegationSummaryService: IChatDelegationSummaryService, logger: ILogger, workingDirectory?: URI, defaultModeInstructionsForLastRequest?: StoredModeInstructions, modelDetailsById?: ReadonlyMap<string, string>): (ChatRequestTurn2 | ChatResponseTurn2)[] {
	const turns: (ChatRequestTurn2 | ChatResponseTurn2)[] = [];
	let currentResponseParts: ExtendedChatResponsePart[] = [];
	const pendingToolInvocations = new Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>();

	let details: RequestIdDetails | undefined;
	let isFirstUserMessage = true;
	let currentModelId = modelId;
	let currentResponseModelId: string | undefined;
	let currentRequestTurnIndex: number | undefined;
	const currentAssistantMessage: { chunks: string[] } = { chunks: [] };
	const processedMessages = new Set<string>();

	function getModelDetails(modelId: string | undefined): string | undefined {
		if (!modelId || !modelDetailsById) {
			return undefined;
		}
		return modelDetailsById.get(modelId.trim().toLowerCase());
	}

	function createResultForModel(modelId: string | undefined) {
		const details = getModelDetails(modelId);
		return details ? { details } : {};
	}

	function flushResponseParts() {
		if (currentResponseParts.length > 0) {
			turns.push(new ChatResponseTurn2(currentResponseParts, createResultForModel(currentResponseModelId ?? currentModelId), ''));
			currentResponseParts = [];
		}
		currentResponseModelId = undefined;
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

	function processAssistantMessage(content: string) {
		// Extract PR metadata if present
		const { cleanedContent, prPart } = extractPRMetadata(content);
		// Add PR part first if it exists
		if (prPart) {
			currentResponseParts.push(prPart);
		}
		if (cleanedContent) {
			currentResponseParts.push(
				new ChatResponseMarkdownPart(new MarkdownString(cleanedContent))
			);
		}
	}

	function flushPendingAssistantMessage() {
		if (currentAssistantMessage.chunks.length > 0) {
			const content = currentAssistantMessage.chunks.join('');
			currentAssistantMessage.chunks = [];
			processAssistantMessage(content);
		}
	}
	const lastUserMessageId = findLast(events, event => event.type === 'user.message' && !isSyntheticUserMessage(event))?.id;
	for (const event of events) {
		if (event.type !== 'assistant.message') {
			flushPendingAssistantMessage();
		}

		switch (event.type) {
			case 'session.start':
			case 'session.resume': {
				currentModelId = event.data.selectedModel ?? currentModelId;
				break;
			}
			case 'session.model_change': {
				currentModelId = event.data.newModel;
				if (currentRequestTurnIndex !== undefined && currentResponseParts.length === 0) {
					currentResponseModelId = currentModelId;
					updateCurrentRequestModelId(currentModelId);
				}
				break;
			}
			case 'assistant.usage': {
				currentModelId = event.data.model ?? currentModelId;
				if (currentRequestTurnIndex !== undefined) {
					currentResponseModelId = currentModelId;
					updateCurrentRequestModelId(currentModelId);
				}
				break;
			}
			case 'user.message': {
				if (isSyntheticUserMessage(event)) {
					continue;
				}
				details = getVSCodeRequestId(event.id);
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
					.filter(attachment => attachment.type === 'selection' || attachment.type === 'github_reference' || attachment.type === 'blob' ? true : !isInstructionAttachmentPath(attachment.path))
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
							const binaryDataSupplier = async () => {
								try {
									return decodeBase64(attachment.data).buffer;
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
				turns.push(new ChatRequestTurn2(`${commandPrefix}${prompt}`, undefined, references, '', [], undefined, details?.requestId ?? event.id, resolvedRequestModelId, modeInstructions2));
				currentRequestTurnIndex = turns.length - 1;
				break;
			}
			case 'assistant.message_delta': {
				if (typeof event.data.deltaContent === 'string') {
					// Skip sub-agent markdown — it will be captured in the subagent tool's result
					if (!event.data.parentToolCallId) {
						processedMessages.add(event.data.messageId);
						currentAssistantMessage.chunks.push(event.data.deltaContent);
					}
				}
				break;
			}
			case 'session.error': {
				currentResponseParts.push(new ChatResponseMarkdownPart(`\n\n❌ Error: (${event.data.errorType}) ${event.data.message}`));
				break;
			}
			case 'assistant.message': {
				// Skip sub-agent markdown — it will be captured in the subagent tool's result
				if (event.data.content && !processedMessages.has(event.data.messageId) && !event.data.parentToolCallId) {
					processAssistantMessage(event.data.content);
				}
				break;
			}
			case 'tool.execution_start': {
				const responsePart = processToolExecutionStart(event, pendingToolInvocations, workingDirectory);
				if (responsePart instanceof ChatResponseThinkingProgressPart) {
					currentResponseParts.push(responsePart);
				}
				break;
			}
			case 'subagent.started': {
				enrichToolInvocationWithSubagentMetadata(
					event.data.toolCallId,
					event.data.agentDisplayName,
					event.data.agentDescription,
					pendingToolInvocations
				);
				break;
			}
			case 'subagent.completed':
			case 'subagent.failed': {
				// Completion is already handled by tool.execution_complete for the task tool
				break;
			}
			case 'tool.execution_complete': {
				const [responsePart, toolCall] = processToolExecutionComplete(event, pendingToolInvocations, logger, workingDirectory) ?? [undefined, undefined];
				if (responsePart && toolCall && !(responsePart instanceof ChatResponseThinkingProgressPart)) {
					const editId = details?.toolIdEditMap ? details.toolIdEditMap[toolCall.toolCallId] : undefined;
					const editedUris = getAffectedUrisForEditTool(toolCall);
					if (!(responsePart instanceof ChatResponseMarkdownPart) && isCopilotCliEditToolCall(toolCall) && editId && editedUris.length > 0) {
						responsePart.presentation = 'hidden';
						currentResponseParts.push(responsePart);
						for (const uri of editedUris) {
							currentResponseParts.push(new ChatResponseMarkdownPart('\n````\n'));
							currentResponseParts.push(new ChatResponseCodeblockUriPart(uri, true, editId));
							currentResponseParts.push(new ChatResponseTextEditPart(uri, []));
							currentResponseParts.push(new ChatResponseTextEditPart(uri, true));
							currentResponseParts.push(new ChatResponseMarkdownPart('\n````\n'));
						}
					} else {
						currentResponseParts.push(responsePart);
					}
				}
				break;
			}
		}
	}

	flushPendingAssistantMessage();
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
 * Converts MCP {@link MCP.ContentBlock}[] values produced by MCP tool execution into
 * VS Code {@link McpToolInvocationContentData}[] objects for rendering in the chat UI.
 *
 * MCP ContentBlocks represent heterogeneous pieces of tool output such as text, images,
 * audio, embedded resources, or resource links. This helper normalizes those different
 * content shapes into a common binary+MIME-type representation that the VS Code chat
 * tool invocation renderer understands, so that MCP tool results can be displayed
 * consistently alongside other chat responses.
 */
function convertMcpContentToToolInvocationData(result: ToolExecutionCompleteEvent['data']['result'], logger: ILogger): McpToolInvocationContentData[] {
	const output: McpToolInvocationContentData[] = [];
	const encoder = new TextEncoder();

	if (!Array.isArray(result?.contents) || result.contents.length === 0) {
		return output;
	}

	for (const block of result.contents) {
		try {
			switch (block.type) {
				case 'text':
					// Convert text to UTF-8 bytes with text/plain mime type
					output.push(new McpToolInvocationContentData(
						encoder.encode(block.text),
						'text/plain'
					));
					break;

				case 'image':
					// Decode base64 image data and preserve mime type
					output.push(new McpToolInvocationContentData(
						decodeBase64(block.data).buffer,
						block.mimeType
					));
					break;

				case 'audio':
					// Decode base64 audio data and preserve mime type
					output.push(new McpToolInvocationContentData(
						decodeBase64(block.data).buffer,
						block.mimeType
					));
					break;

				case 'resource': {
					// Handle embedded resource (text or blob)
					const resource = block.resource;
					if ('text' in resource) {
						// TextResourceContents
						const mimeType = resource.mimeType || 'text/plain';
						output.push(new McpToolInvocationContentData(
							encoder.encode(resource.text),
							mimeType
						));
					} else if ('blob' in resource) {
						// BlobResourceContents
						const mimeType = resource.mimeType || 'application/octet-stream';
						output.push(new McpToolInvocationContentData(
							decodeBase64(resource.blob).buffer,
							mimeType
						));
					}
					break;
				}

				case 'resource_link': {
					// Format resource link as readable text with name and URI
					const displayName = block.title || block.name;
					const linkText = displayName ? `Resource: ${displayName}\nURI: ${block.uri}` : block.uri;
					output.push(new McpToolInvocationContentData(
						encoder.encode(linkText),
						'text/plain'
					));
					break;
				}
			}
		} catch (error) {
			// Log conversion errors but continue processing other blocks
			logger.error(error, `Failed to convert MCP content block of type ${block.type}:`);
		}
	}

	return output;
}

/**
 * Enriches an existing pending tool invocation with subagent metadata from a `subagent.started` event.
 * The `subagent.started` event carries richer metadata (display name, description) than the `task`
 * tool's arguments, so we use it to update the `ChatSubagentToolInvocationData` on the tool invocation.
 */
export function enrichToolInvocationWithSubagentMetadata(
	toolCallId: string,
	agentDisplayName: string,
	agentDescription: string | undefined,
	pendingToolInvocations: Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>
): void {
	const invocation = pendingToolInvocations.get(toolCallId);
	if (!invocation) {
		return;
	}
	const [part] = invocation;
	if (!(part instanceof ChatToolInvocationPart)) {
		return;
	}

	if (part.toolSpecificData instanceof ChatSubagentToolInvocationData) {
		part.toolSpecificData.agentName = agentDisplayName;
		if (agentDescription) {
			part.toolSpecificData.description = agentDescription;
		}
	}
}

export function processToolExecutionStart(event: ToolExecutionStartEvent, pendingToolInvocations: Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>, workingDirectory?: URI): ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart | undefined {
	const toolInvocation = createCopilotCLIToolInvocation(event.data as ToolCall, undefined, workingDirectory);
	if (toolInvocation) {
		if (toolInvocation instanceof ChatToolInvocationPart && event.data.parentToolCallId) {
			// Resolve to the root ancestor so all descendants are grouped under the
			// top-level subagent container instead of creating intermediate containers.
			toolInvocation.subAgentInvocationId = resolveRootSubagentId(event.data.parentToolCallId, pendingToolInvocations);

			// Nested task tools should not create their own subagent container —
			// clear ChatSubagentToolInvocationData so the widget treats them as
			// regular child tool invocations within the parent container.
			if (toolInvocation.toolSpecificData instanceof ChatSubagentToolInvocationData) {
				toolInvocation.toolSpecificData = undefined;
			}
		}
		// Store pending invocation to update with result later
		pendingToolInvocations.set(event.data.toolCallId, [toolInvocation, event.data as ToolCall, event.data.parentToolCallId]);
	}
	return toolInvocation;
}

/**
 * Walks the parentToolCallId chain to find the root (top-level) subagent toolCallId.
 * This ensures all nested tools are grouped under the outermost subagent container.
 */
function resolveRootSubagentId(
	parentToolCallId: string,
	pendingToolInvocations: Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>
): string {
	let currentId = parentToolCallId;
	const visited = new Set<string>();
	while (true) {
		if (visited.has(currentId)) {
			break; // Prevent infinite loops
		}
		visited.add(currentId);
		const parent = pendingToolInvocations.get(currentId);
		if (!parent || !parent[2]) {
			break; // No further parent — currentId is the root
		}
		currentId = parent[2];
	}
	return currentId;
}

export function processToolExecutionComplete(event: ToolExecutionCompleteEvent, pendingToolInvocations: Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>, logger: ILogger, workingDirectory?: URI): [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined] | undefined {
	const invocation = pendingToolInvocations.get(event.data.toolCallId);
	pendingToolInvocations.delete(event.data.toolCallId);

	if (invocation && invocation[0] instanceof ChatToolInvocationPart) {
		invocation[0].isComplete = true;
		invocation[0].isError = !!event.data.error;
		invocation[0].invocationMessage = event.data.error?.message || invocation[0].invocationMessage;
		if (!event.data.success && (event.data.error?.code === 'rejected' || event.data.error?.code === 'denied')) {
			invocation[0].isConfirmed = false;
		} else {
			invocation[0].isConfirmed = true;
		}
		const toolCall = invocation[1];
		if (Object.hasOwn(ToolFriendlyNameAndHandlers, toolCall.toolName)) {
			const [, , postFormatter] = ToolFriendlyNameAndHandlers[toolCall.toolName];
			try {
				(postFormatter as PostInvocationFormatter)(invocation[0], toolCall, event.data, workingDirectory);
			} catch (err) {
				logger.error(err, `Failed to format tool invocation completion for tool: ${toolCall.toolName}`);
				try {
					genericToolInvocationCompleted(invocation[0], toolCall, event.data);
				} catch {
					// ignore
				}
			}
		} else if (toolCall.mcpServerName && toolCall.mcpToolName) {
			// Use tool arguments as input, formatted as JSON
			const input = toolCall.arguments ? JSON.stringify(toolCall.arguments, null, 2) : '';
			const output = convertMcpContentToToolInvocationData(event.data.result, logger);
			if (output.length) {
				invocation[0].toolSpecificData = {
					input,
					output
				} satisfies ChatMcpToolInvocationData;
			} else {
				// If we don't have any structured output, at least include the raw text of the result for visibility in the chat UI.
				genericToolInvocationCompleted(invocation[0], toolCall, event.data);
			}
		} else {
			if (!!event.data.error && event.data.error?.message) {
				invocation[0] = new ChatToolInvocationPart(invocation[0].toolName, invocation[0].toolCallId, event.data.error.message);
				invocation[0].isComplete = true;
				invocation[0].isError = true;
				invocation[0].invocationMessage = event.data.error?.message || invocation[0].invocationMessage;
				invocation[0].pastTenseMessage = `Used tool: ${invocation[0].toolName}`;
			} else {
				genericToolInvocationCompleted(invocation[0], toolCall, event.data);
			}
		}
	}

	return invocation;
}

/**
 * Creates a formatted tool invocation part for CopilotCLI tools
 */
export function createCopilotCLIToolInvocation(data: {
	toolCallId: string; toolName: string; arguments?: unknown; mcpServerName?: string | undefined;
	mcpToolName?: string | undefined;
}, editId?: string, workingDirectory?: URI, logger?: ILogger): ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart | undefined {
	if (!Object.hasOwn(ToolFriendlyNameAndHandlers, data.toolName)) {
		const mcpServer = l10n.t('MCP Server');
		const toolName = data.mcpServerName && data.mcpToolName ? `${data.mcpServerName}, ${data.mcpToolName} (${mcpServer})` : data.toolName;
		const invocation = new ChatToolInvocationPart(toolName ?? 'unknown', data.toolCallId ?? '');
		invocation.isConfirmed = false;
		invocation.isComplete = false;
		invocation.invocationMessage = l10n.t("Using tool: {0}", toolName ?? 'unknown');
		invocation.pastTenseMessage = l10n.t("Used tool: {0}", toolName ?? 'unknown');
		return invocation;
	}

	const toolCall = data as ToolCall;
	// Ensures arguments is at least an empty object
	toolCall.arguments = toolCall.arguments ?? {};
	if (toolCall.toolName === 'report_intent') {
		return undefined; // Ignore these for now
	}
	if (toolCall.toolName === 'think') {
		if (toolCall.arguments && typeof toolCall.arguments.thought === 'string') {
			return new ChatResponseThinkingProgressPart(toolCall.arguments.thought);
		}
		return undefined;
	}
	if (toolCall.toolName === 'show_file') {
		// Currently there's no good way to render this to the user.
		// Its a way to draw users attention to a file/code block.
		// Generally models render the codeblock in the response, but here we have a tool call.
		// Its a WIP, no clear way to render in CLI either, hence decided to hide in VS Code.
		return undefined;
	}
	if (toolCall.toolName === 'task_complete') {
		if (toolCall.arguments.summary) {
			const markdownContent = new MarkdownString();
			markdownContent.appendMarkdown(toolCall.arguments.summary);
			return new ChatResponseMarkdownPart(markdownContent);
		}
		return undefined;
	}

	const [friendlyToolName, formatter] = ToolFriendlyNameAndHandlers[toolCall.toolName];
	const invocation = new ChatToolInvocationPart(friendlyToolName ?? toolCall.toolName ?? 'unknown', toolCall.toolCallId ?? '');
	invocation.isConfirmed = false;
	invocation.isComplete = false;

	try {
		(formatter as Formatter)(invocation, toolCall, editId, workingDirectory);
	} catch (err) {
		logger?.error(err, `Failed to format tool invocation for tool: ${toolCall.toolName}`);
	}
	return invocation;
}

type Formatter = (invocation: ChatToolInvocationPart, toolCall: ToolCall, editId?: string, workingDirectory?: URI) => void;
type PostInvocationFormatter = (invocation: ChatToolInvocationPart, toolCall: ToolCall, result: ToolCallResult, workingDirectory?: URI) => void;
type ToolCallFor<T extends ToolCall['toolName']> = Extract<ToolCall, { toolName: T }>;
type ToolCallResult = ToolExecutionCompleteEvent['data'];

const ToolFriendlyNameAndHandlers: { [K in ToolCall['toolName']]: [title: string, pre: (invocation: ChatToolInvocationPart, toolCall: ToolCallFor<K>, editId?: string, workingDirectory?: URI) => void, post: (invocation: ChatToolInvocationPart, toolCall: ToolCallFor<K>, result: ToolCallResult, workingDirectory?: URI) => void] } = {
	'str_replace_editor': [l10n.t('Edit File'), formatStrReplaceEditorInvocation, genericToolInvocationCompleted],
	'edit': [l10n.t('Edit File'), formatEditToolInvocation, emptyToolInvocationCompleted],
	'str_replace': [l10n.t('Edit File'), formatEditToolInvocation, emptyToolInvocationCompleted],
	'create': [l10n.t('Create File'), formatCreateToolInvocation, emptyToolInvocationCompleted],
	'insert': [l10n.t('Edit File'), formatInsertToolInvocation, emptyToolInvocationCompleted],
	'view': [l10n.t('Read'), formatViewToolInvocation, emptyToolInvocationCompleted],
	'bash': [l10n.t('Run Shell Command'), formatShellInvocation, formatShellInvocationCompleted],
	'powershell': [l10n.t('Run Shell Command'), formatShellInvocation, formatShellInvocationCompleted],
	'write_bash': [l10n.t('Write to Bash'), emptyInvocation, genericToolInvocationCompleted],
	'write_powershell': [l10n.t('Write to PowerShell'), emptyInvocation, genericToolInvocationCompleted],
	'read_bash': [l10n.t('Read Terminal'), emptyInvocation, genericToolInvocationCompleted],
	'read_powershell': [l10n.t('Read Terminal'), emptyInvocation, genericToolInvocationCompleted],
	'stop_bash': [l10n.t('Stop Terminal Session'), emptyInvocation, genericToolInvocationCompleted],
	'stop_powershell': [l10n.t('Stop Terminal Session'), emptyInvocation, genericToolInvocationCompleted],
	'grep': [l10n.t('Search'), formatSearchToolInvocation, formatSearchToolInvocationCompleted],
	'rg': [l10n.t('Search'), formatSearchToolInvocation, formatSearchToolInvocationCompleted],
	'glob': [l10n.t('Search'), formatSearchToolInvocation, formatSearchToolInvocationCompleted],
	'search_code_subagent': [l10n.t('Search Code'), formatSearchToolInvocation, emptyToolInvocationCompleted],
	'reply_to_comment': [l10n.t('Reply to Comment'), formatReplyToCommentInvocation, genericToolInvocationCompleted],
	'code_review': [l10n.t('Code Review'), formatCodeReviewInvocation, genericToolInvocationCompleted],
	'report_intent': [l10n.t('Report Intent'), emptyInvocation, genericToolInvocationCompleted],
	'think': [l10n.t('Thinking'), emptyInvocation, genericToolInvocationCompleted],
	'report_progress': [l10n.t('Progress update'), formatProgressToolInvocation, genericToolInvocationCompleted],
	'web_fetch': [l10n.t('Fetch Web Content'), emptyInvocation, genericToolInvocationCompleted],
	'web_search': [l10n.t('Web Search'), emptyInvocation, genericToolInvocationCompleted],
	'update_todo': [l10n.t('Update Todo'), formatUpdateTodoInvocation, formatUpdateTodoInvocationCompleted],
	'show_file': [l10n.t('Show File'), formatShowFileInvocation, genericToolInvocationCompleted],
	'fetch_copilot_cli_documentation': [l10n.t('Fetch Documentation'), emptyInvocation, genericToolInvocationCompleted],
	'propose_work': [l10n.t('Propose Work'), formatProposeWorkInvocation, genericToolInvocationCompleted],
	'task_complete': [l10n.t('Task Complete'), formatTaskCompleteInvocation, genericToolInvocationCompleted],
	'ask_user': [l10n.t('Ask User'), formatAskUserInvocation, genericToolInvocationCompleted],
	'skill': [l10n.t('Invoke Skill'), formatSkillInvocation, genericToolInvocationCompleted],
	'task': [l10n.t('Delegate Task'), formatTaskInvocation, formatTaskInvocationCompleted],
	'list_agents': [l10n.t('List Agents'), emptyInvocation, genericToolInvocationCompleted],
	'read_agent': [l10n.t('Read Agent'), formatReadAgentInvocation, genericToolInvocationCompleted],
	'exit_plan_mode': [l10n.t('Exit Plan Mode'), formatExitPlanModeInvocation, genericToolInvocationCompleted],
	'sql': [l10n.t('Execute SQL'), formatSqlInvocation, genericToolInvocationCompleted],
	'lsp': [l10n.t('Language Server'), formatLspInvocation, genericToolInvocationCompleted],
	'create_pull_request': [l10n.t('Create Pull Request'), formatCreatePullRequestInvocation, genericToolInvocationCompleted],
	'gh-advisory-database': [l10n.t('Check Dependencies'), emptyInvocation, genericToolInvocationCompleted],
	'store_memory': [l10n.t('Store Memory'), formatStoreMemoryInvocation, genericToolInvocationCompleted],
	'list_bash': [l10n.t('List Shell Sessions'), emptyInvocation, genericToolInvocationCompleted],
	'list_powershell': [l10n.t('List Shell Sessions'), emptyInvocation, genericToolInvocationCompleted],
	'parallel_validation': [l10n.t('Validate Changes'), emptyInvocation, genericToolInvocationCompleted],
	'apply_patch': [l10n.t('Apply Patch'), formatApplyPatchInvocation, genericToolInvocationCompleted],
	'write_agent': [l10n.t('Write to Agent'), formatWriteAgentInvocation, genericToolInvocationCompleted],
	'mcp_reload': [l10n.t('Reload MCP Config'), emptyInvocation, genericToolInvocationCompleted],
	'mcp_validate': [l10n.t('Validate MCP Config'), formatMcpValidateInvocation, genericToolInvocationCompleted],
	'tool_search_tool_regex': [l10n.t('Search Tools'), formatToolSearchInvocation, genericToolInvocationCompleted],
	'codeql_checker': [l10n.t('CodeQL Security Scan'), emptyInvocation, genericToolInvocationCompleted],
};


function formatProgressToolInvocation(invocation: ChatToolInvocationPart, toolCall: ReportProgressTool): void {
	const args = toolCall.arguments;
	invocation.invocationMessage = args.prDescription?.trim() || 'Progress Update';
	if (args.commitMessage) {
		invocation.originMessage = `Commit: ${args.commitMessage}`;
	}
}



function formatViewToolInvocation(invocation: ChatToolInvocationPart, toolCall: ViewTool): void {
	const args = toolCall.arguments;

	if (!args.path) {
		return;
	} else if (args.view_range && args.view_range.length === 2 && args.view_range[1] >= args.view_range[0] && args.view_range[0] >= 0) {
		const [start, end] = args.view_range;
		const location = new Location(Uri.file(args.path), new Range(start === 0 ? start : start - 1, 0, end, 0));
		const display = formatUriForFileWidget(location);
		const localizedMessage = start === end
			? l10n.t("Reading {0}, line {1}", display, start)
			: l10n.t("Reading {0}, lines {1} to {2}", display, start, end);
		const localizedPastTenseMessage = start === end
			? l10n.t("Read {0}, line {1}", display, start)
			: l10n.t("Read {0}, lines {1} to {2}", display, start, end);
		invocation.invocationMessage = new MarkdownString(localizedMessage);
		invocation.pastTenseMessage = new MarkdownString(localizedPastTenseMessage);
	} else {
		const display = formatUriForFileWidget(Uri.file(args.path));
		invocation.invocationMessage = new MarkdownString(l10n.t("Read {0}", display));
	}
}

function formatStrReplaceEditorInvocation(invocation: ChatToolInvocationPart, toolCall: StringReplaceEditorTool, editId?: string): void {
	if (!toolCall.arguments.path) {
		return;
	}
	const args = toolCall.arguments;
	const display = formatUriForFileWidget(Uri.file(args.path));
	switch (args.command) {
		case 'view':
			formatViewToolInvocation(invocation, { toolName: 'view', arguments: args } as ViewTool);
			break;
		case 'edit':
			formatEditToolInvocation(invocation, { toolName: 'edit', arguments: args } as EditTool);
			break;
		case 'insert':
			formatInsertToolInvocation(invocation, { toolName: 'insert', arguments: args } as InsertTool);
			break;
		case 'create':
			formatCreateToolInvocation(invocation, { toolName: 'create', arguments: args } as CreateTool);
			break;
		default:
			invocation.invocationMessage = new MarkdownString(l10n.t("Modified {0}", display));
	}
}

function formatInsertToolInvocation(invocation: ChatToolInvocationPart, toolCall: InsertTool): void {
	const args = toolCall.arguments;
	if (args.path) {
		invocation.invocationMessage = new MarkdownString(l10n.t("Inserted text in {0}", formatUriForFileWidget(Uri.file(args.path))));
	}
}

function formatEditToolInvocation(invocation: ChatToolInvocationPart, toolCall: EditTool, editId?: string): void {
	const args = toolCall.arguments;
	const display = args.path ? formatUriForFileWidget(Uri.file(args.path)) : '';

	invocation.invocationMessage = display
		? new MarkdownString(l10n.t("Editing {0}", display))
		: new MarkdownString(l10n.t("Editing file"));
	invocation.pastTenseMessage = display
		? new MarkdownString(l10n.t("Edited {0}", display))
		: new MarkdownString(l10n.t("Edited file"));
}


function formatCreateToolInvocation(invocation: ChatToolInvocationPart, toolCall: CreateTool, editId?: string): void {
	const args = toolCall.arguments;
	const display = args.path ? formatUriForFileWidget(Uri.file(args.path)) : '';

	if (display) {
		invocation.invocationMessage = new MarkdownString(l10n.t("Creating {0}", display));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Created {0}", display));
	} else {
		invocation.invocationMessage = new MarkdownString(l10n.t("Creating file"));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Created file"));
	}
}

/**
 * Extracts a `cd <dir> &&` (or PowerShell equivalent) prefix from a command line,
 * returning the directory and remaining command.
 */
export function extractCdPrefix(commandLine: string, isPowershell: boolean): { directory: string; command: string } | undefined {
	const cdPrefixMatch = commandLine.match(
		isPowershell
			? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>"[^"]*"|[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
			: /^cd (?<dir>"[^"]*"|[^\s]+) &&\s+(?<suffix>.+)$/
	);
	const cdDir = cdPrefixMatch?.groups?.dir;
	const cdSuffix = cdPrefixMatch?.groups?.suffix;
	if (cdDir && cdSuffix) {
		let cdDirPath = cdDir;
		if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
			cdDirPath = cdDirPath.slice(1, -1);
		}
		return { directory: cdDirPath, command: cdSuffix };
	}
	return undefined;
}

/**
 * Returns presentationOverrides only when the cd prefix directory matches the working directory.
 */
export function getCdPresentationOverrides(commandLine: string, isPowershell: boolean, workingDirectory?: URI): { commandLine: string } | undefined {
	const cdPrefix = extractCdPrefix(commandLine, isPowershell);
	if (!cdPrefix || !workingDirectory) {
		return undefined;
	}
	const cdUri = URI.file(cdPrefix.directory);
	if (isEqual(cdUri, workingDirectory)) {
		return { commandLine: cdPrefix.command };
	}
	return undefined;
}

function formatShellInvocation(invocation: ChatToolInvocationPart, toolCall: ShellTool, _editId?: string, workingDirectory?: URI): void {
	const args = toolCall.arguments;
	const command = args.command ?? '';
	const isPowershell = toolCall.toolName === 'powershell';
	const presentationOverrides = getCdPresentationOverrides(command, isPowershell, workingDirectory);
	invocation.invocationMessage = args.description ? new MarkdownString(args.description) : '';
	invocation.toolSpecificData = {
		commandLine: {
			original: presentationOverrides?.commandLine ?? command
		},
		language: isPowershell ? 'powershell' : 'bash',
		presentationOverrides
	} as ChatTerminalToolInvocationData;
}
function formatShellInvocationCompleted(invocation: ChatToolInvocationPart, toolCall: ShellTool, result: ToolCallResult, workingDirectory?: URI): void {
	const resultContent = result.result?.content || '';
	// Exit code will be at the end of the result in the last line in the form of `<exited with exit code ${output.exitCode}>`,
	const exitCodeStr = resultContent ? /<exited with exit code (\d+)>$/.exec(resultContent)?.[1] : undefined;
	const exitCode = exitCodeStr ? parseInt(exitCodeStr, 10) : undefined;
	// Lets remove the last line containing the exit code from the output.
	const text = (exitCode !== undefined ? resultContent.replace(/<exited with exit code \d+>$/, '').trimEnd() : resultContent).replace(/\n/g, '\r\n');
	const isPowershell = toolCall.toolName === 'powershell';
	const presentationOverrides = getCdPresentationOverrides(toolCall.arguments.command, isPowershell, workingDirectory);
	const toolSpecificData: ChatTerminalToolInvocationData = {
		commandLine: {
			original: presentationOverrides?.commandLine ?? toolCall.arguments.command
		},
		language: isPowershell ? 'powershell' : 'bash',
		presentationOverrides,
		state: {
			exitCode
		},
		output: {
			text
		}
	};
	invocation.toolSpecificData = toolSpecificData;
}
function formatSearchToolInvocation(invocation: ChatToolInvocationPart, toolCall: SearchCodeSubagentTool | GLobTool | GrepTool): void {
	if (toolCall.toolName === 'glob') {
		const searchInPath = toolCall.arguments.path ? ` in \`${toolCall.arguments.path}\`` : '';
		invocation.invocationMessage = `Search for files matching \`${toolCall.arguments.pattern}\`${searchInPath}`;
		invocation.pastTenseMessage = `Searched for files matching \`${toolCall.arguments.pattern}\`${searchInPath}`;
	} else if (toolCall.toolName === 'grep' || toolCall.toolName === 'rg') {
		const searchInPath = toolCall.arguments.path ? ` in \`${toolCall.arguments.path}\`` : '';
		invocation.invocationMessage = `Search for files matching \`${toolCall.arguments.pattern}\`${searchInPath}`;
		invocation.pastTenseMessage = `Searched for files matching \`${toolCall.arguments.pattern}\`${searchInPath}`;
	} else if (toolCall.toolName === 'search_code_subagent') {
		invocation.invocationMessage = `Criteria: ${toolCall.arguments.query}`;
		invocation.pastTenseMessage = `Searched code for: ${toolCall.arguments.query}`;
	}
}

function formatSearchToolInvocationCompleted(invocation: ChatToolInvocationPart, toolCall: SearchCodeSubagentTool | GLobTool | GrepTool, result: ToolCallResult, workingDirectory?: URI): void {
	if (toolCall.toolName === 'glob' || toolCall.toolName === 'grep' || toolCall.toolName === 'rg') {
		const messagesIndicatingNoMatches = ['Pattern matched but no output generated', 'Pattern matched but no files found', 'No matches found', 'no files matched the pattern'].map(msg => msg.toLowerCase());

		let searchPath = toolCall.arguments.path ? Uri.file(toolCall.arguments.path) : workingDirectory;
		if (toolCall.arguments.path && workingDirectory && searchPath && !isAbsolutePath(searchPath)) {
			searchPath = Uri.joinPath(workingDirectory, toolCall.arguments.path);
		}
		const searchInPath = toolCall.arguments.path ? ` in \`${toolCall.arguments.path}\`` : '';
		let files: string[] = [];
		if (Array.isArray(result.result?.contents) && result.result.contents.length > 0 && result.result.contents[0].type === 'terminal' && typeof result.result.contents[0].text === 'string') {
			const matches = result.result.contents[0].text.trim();
			const noMatches = matches.length === 0;
			files = !noMatches && result.success ? matches.split('\n') : [];
		} else {
			const noMatches = messagesIndicatingNoMatches.some(msg => (result.result?.content || '').toLowerCase().includes(msg));
			files = !noMatches && result.success && typeof result.result?.content === 'string' ? result.result.content.split('\n') : [];
		}

		const successMessage = files.length ? `, ${files.length} result${files.length > 1 ? 's' : ''}` : '.';
		invocation.pastTenseMessage = `Searched for files matching \`${toolCall.arguments.pattern}\`${searchInPath}${successMessage}`;
		invocation.toolSpecificData = {
			values: files.map(file => {
				if (!file.startsWith('./') || !searchPath) {
					return Uri.file(file);
				}
				return Uri.joinPath(searchPath, file.substring(2));
			})
		};
	}
}

function formatCodeReviewInvocation(invocation: ChatToolInvocationPart, toolCall: CodeReviewTool): void {
	invocation.invocationMessage = toolCall.arguments.prTitle;
	invocation.originMessage = toolCall.arguments.prDescription;
}

function formatReplyToCommentInvocation(invocation: ChatToolInvocationPart, toolCall: ReplyToCommentTool): void {
	invocation.invocationMessage = `Replying to comment_id ${toolCall.arguments.comment_id}`;
	invocation.pastTenseMessage = `Replied to comment_id ${toolCall.arguments.comment_id}`;
	invocation.originMessage = toolCall.arguments.reply;
}

function formatShowFileInvocation(invocation: ChatToolInvocationPart, toolCall: ShowFileTool): void {
	const args = toolCall.arguments;
	if (!args.path) {
		return;
	}
	const display = formatUriForFileWidget(Uri.file(args.path));
	if (args.diff) {
		invocation.invocationMessage = new MarkdownString(l10n.t("Showing diff of {0}", display));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Showed diff of {0}", display));
	} else if (args.view_range && args.view_range.length >= 2) {
		const [start, end] = args.view_range;
		invocation.invocationMessage = new MarkdownString(l10n.t("Showing {0}, lines {1} to {2}", display, start, end));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Showed {0}, lines {1} to {2}", display, start, end));
	} else if (args.view_range && args.view_range.length === 1) {
		const [line] = args.view_range;
		invocation.invocationMessage = new MarkdownString(l10n.t("Showing {0}, line {1}", display, line));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Showed {0}, line {1}", display, line));
	} else {
		invocation.invocationMessage = new MarkdownString(l10n.t("Showing {0}", display));
		invocation.pastTenseMessage = new MarkdownString(l10n.t("Showed {0}", display));
	}
}

function formatProposeWorkInvocation(invocation: ChatToolInvocationPart, toolCall: ProposeWorkTool): void {
	invocation.invocationMessage = toolCall.arguments.workTitle || 'Proposing work';
	invocation.pastTenseMessage = toolCall.arguments.workTitle || 'Proposed work';
}

function formatTaskCompleteInvocation(invocation: ChatToolInvocationPart, toolCall: TaskCompleteTool): void {
	invocation.invocationMessage = toolCall.arguments.summary || l10n.t('Marking task as complete');
	invocation.pastTenseMessage = toolCall.arguments.summary || l10n.t('Task completed');
}

function formatAskUserInvocation(invocation: ChatToolInvocationPart, toolCall: AskUserTool): void {
	if ('question' in toolCall.arguments) {
		invocation.invocationMessage = toolCall.arguments.question || l10n.t('Asking user a question');
		invocation.pastTenseMessage = toolCall.arguments.question || l10n.t('Asked user a question');
		return;
	}

	invocation.invocationMessage = toolCall.arguments.message || l10n.t('Asking user for input');
	invocation.pastTenseMessage = toolCall.arguments.message || l10n.t('Asked user for input');
}

function formatSkillInvocation(invocation: ChatToolInvocationPart, toolCall: SkillTool): void {
	invocation.invocationMessage = l10n.t("Invoking skill: {0}", toolCall.arguments.skill);
	invocation.pastTenseMessage = l10n.t("Invoked skill: {0}", toolCall.arguments.skill);
}

function formatTaskInvocation(invocation: ChatToolInvocationPart, toolCall: TaskTool): void {
	invocation.invocationMessage = toolCall.arguments.description || l10n.t('Delegating task');
	invocation.pastTenseMessage = toolCall.arguments.description || l10n.t('Delegated task');
	invocation.toolSpecificData = new ChatSubagentToolInvocationData(
		toolCall.arguments.description,
		toolCall.arguments.agent_type,
		toolCall.arguments.prompt);
}

function formatTaskInvocationCompleted(invocation: ChatToolInvocationPart, _toolCall: TaskTool, result: ToolCallResult): void {
	if (invocation.toolSpecificData instanceof ChatSubagentToolInvocationData && result.success && result.result?.content) {
		const content = typeof result.result.content === 'string' ? result.result.content : JSON.stringify(result.result.content, null, 2);
		invocation.toolSpecificData.result = content;
	}
}

function formatReadAgentInvocation(invocation: ChatToolInvocationPart, toolCall: ReadAgentTool): void {
	invocation.invocationMessage = l10n.t("Reading agent {0}", toolCall.arguments.agent_id);
	invocation.pastTenseMessage = l10n.t("Read agent {0}", toolCall.arguments.agent_id);
}

function formatExitPlanModeInvocation(invocation: ChatToolInvocationPart, toolCall: ExitPlanModeTool): void {
	invocation.invocationMessage = toolCall.arguments.summary ? l10n.t('Presenting plan') : l10n.t('Exiting plan mode');
	invocation.pastTenseMessage = l10n.t('Exited plan mode');
}

function formatSqlInvocation(invocation: ChatToolInvocationPart, toolCall: SqlTool): void {
	invocation.invocationMessage = toolCall.arguments.description || l10n.t('Executing SQL query');
	invocation.pastTenseMessage = toolCall.arguments.description || l10n.t('Executed SQL query');
}

function formatLspInvocation(invocation: ChatToolInvocationPart, toolCall: LspTool): void {
	const op = toolCall.arguments.operation;
	const file = toolCall.arguments.file;
	if (file) {
		const display = formatUriForFileWidget(Uri.file(file));
		invocation.invocationMessage = new MarkdownString(l10n.t("LSP {0} on {1}", op, display));
	} else {
		invocation.invocationMessage = l10n.t("LSP {0}", op);
	}
}

function formatCreatePullRequestInvocation(invocation: ChatToolInvocationPart, toolCall: CreatePullRequestTool): void {
	invocation.invocationMessage = toolCall.arguments.title || l10n.t('Creating pull request');
	invocation.pastTenseMessage = toolCall.arguments.title || l10n.t('Created pull request');
	if (toolCall.arguments.description) {
		invocation.originMessage = toolCall.arguments.description;
	}
}

function formatStoreMemoryInvocation(invocation: ChatToolInvocationPart, toolCall: StoreMemoryTool): void {
	invocation.invocationMessage = l10n.t("Storing memory: {0}", toolCall.arguments.subject);
	invocation.pastTenseMessage = l10n.t("Stored memory: {0}", toolCall.arguments.subject);
}

function formatApplyPatchInvocation(invocation: ChatToolInvocationPart, _toolCall: ApplyPatchTool): void {
	invocation.invocationMessage = l10n.t('Applying patch to files');
	invocation.pastTenseMessage = l10n.t('Applied patch to files');
}

function formatWriteAgentInvocation(invocation: ChatToolInvocationPart, toolCall: WriteAgentTool): void {
	invocation.invocationMessage = l10n.t("Writing to agent {0}", toolCall.arguments.agent_id);
	invocation.pastTenseMessage = l10n.t("Wrote to agent {0}", toolCall.arguments.agent_id);
}

function formatMcpValidateInvocation(invocation: ChatToolInvocationPart, toolCall: McpValidateTool): void {
	const display = toolCall.arguments.path ? formatUriForFileWidget(Uri.file(toolCall.arguments.path)) : '';
	invocation.invocationMessage = display
		? new MarkdownString(l10n.t("Validating MCP config {0}", display))
		: l10n.t('Validating MCP config');
	invocation.pastTenseMessage = display
		? new MarkdownString(l10n.t("Validated MCP config {0}", display))
		: l10n.t('Validated MCP config');
}

function formatToolSearchInvocation(invocation: ChatToolInvocationPart, toolCall: ToolSearchTool): void {
	invocation.invocationMessage = l10n.t("Searching tools matching: {0}", toolCall.arguments.pattern);
	invocation.pastTenseMessage = l10n.t("Searched tools matching: {0}", toolCall.arguments.pattern);
}


export function parseTodoMarkdown(markdown: string): { title: string; todoList: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }> } {
	const lines = markdown.split('\n');
	const todoList: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }> = [];
	let title = 'Updated todo list';
	let inCodeBlock = false;
	let currentItem: { title: string; status: 'not-started' | 'in-progress' | 'completed' } | null = null;

	for (const line of lines) {
		// Track code fences
		if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}

		// Skip lines inside code blocks
		if (inCodeBlock) {
			continue;
		}

		// Extract title from first non-empty line
		if (title === 'Updated todo list' && line.trim()) {
			const trimmed = line.trim();
			// Check if it's not a list item
			if (!trimmed.match(/^[-*+]\s+\[.\]/) && !trimmed.match(/^\d+[.)]\s+\[.\]/)) {
				// Strip leading # for headings
				title = trimmed.replace(/^#+\s*/, '');
			}
		}

		// Parse checklist items (unordered and ordered lists)
		const unorderedMatch = line.match(/^\s*[-*+]\s+\[(.?)\]\s*(.*)$/);
		const orderedMatch = line.match(/^\s*\d+[.)]\s+\[(.?)\]\s*(.*)$/);
		const match = unorderedMatch || orderedMatch;

		if (match) {
			// Save previous item if exists
			if (currentItem && currentItem.title.trim()) {
				todoList.push({
					id: todoList.length + 1,
					title: currentItem.title.trim(),
					status: currentItem.status
				});
			}

			const checkboxChar = match[1];
			const itemTitle = match[2];

			// Map checkbox character to status
			let status: 'not-started' | 'in-progress' | 'completed';
			if (checkboxChar === 'x' || checkboxChar === 'X') {
				status = 'completed';
			} else if (checkboxChar === '>' || checkboxChar === '~') {
				status = 'in-progress';
			} else {
				status = 'not-started';
			}

			currentItem = { title: itemTitle, status };
		} else if (currentItem && line.trim() && (line.startsWith('  ') || line.startsWith('\t'))) {
			// Continuation line - append to current item
			currentItem.title += ' ' + line.trim();
		}
	}

	// Add the last item
	if (currentItem && currentItem.title.trim()) {
		todoList.push({
			id: todoList.length + 1,
			title: currentItem.title.trim(),
			status: currentItem.status
		});
	}

	return { title, todoList };
}

function formatUpdateTodoInvocation(invocation: ChatToolInvocationPart, toolCall: UpdateTodoTool): void {
	const args = toolCall.arguments;
	const parsed = args.todos ? parseTodoMarkdown(args.todos) : { title: '', todoList: [] };
	if (!args.todos || !parsed) {
		invocation.invocationMessage = 'Updating todo list';
		invocation.pastTenseMessage = 'Updated todo list';
		return;
	}

	invocation.invocationMessage = parsed.title;
	invocation.toolSpecificData = {
		output: '',
		input: [`# ${parsed.title}`, ...parsed.todoList.map(item => `- [${item.status === 'completed' ? 'x' : item.status === 'in-progress' ? '>' : ' '}] ${item.title}`)].join('\n')
	};
}

function formatUpdateTodoInvocationCompleted(invocation: ChatToolInvocationPart, toolCall: UpdateTodoTool, result: ToolCallResult): void {
	const input = (invocation.toolSpecificData ? (invocation.toolSpecificData as ChatSimpleToolResultData).input : '') || '';
	invocation.toolSpecificData = {
		output: typeof result.result?.content === 'string' ? result.result.content : JSON.stringify(result.result?.content || '', null, 2),
		input
	};
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
 * No-op formatter for tool invocations that do not require custom formatting.
 * The `toolCall` parameter is unused and present for interface consistency.
 */
function emptyInvocation(_invocation: ChatToolInvocationPart, _toolCall: UnknownToolCall): void {
	// No custom formatting needed
}

/**
 * No-op post-invocation formatter for tools whose completion requires no custom display.
 */
function emptyToolInvocationCompleted(_invocation: ChatToolInvocationPart, _toolCall: UnknownToolCall, _result: ToolCallResult): void {
	// No custom post-invocation formatting needed
}


function genericToolInvocationCompleted(invocation: ChatToolInvocationPart, toolCall: UnknownToolCall, result: ToolCallResult): void {
	if (result.success && result.result?.content) {
		invocation.toolSpecificData = {
			output: typeof result.result.content === 'string' ? result.result.content : JSON.stringify(result.result.content, null, 2),
			input: toolCall.arguments ? JSON.stringify(toolCall.arguments, null, 2) : ''
		};
	}

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
