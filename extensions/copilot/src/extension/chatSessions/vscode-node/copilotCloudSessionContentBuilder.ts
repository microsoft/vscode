/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pathLib from 'path';
import * as vscode from 'vscode';
import { ChatRequestTurn, ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseMultiDiffPart, ChatResponseProgressPart, ChatResponseThinkingProgressPart, ChatResponseTurn2, ChatResult, ChatToolInvocationPart, MarkdownString, Uri } from 'vscode';
import { IGitService } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { getAuthorDisplayName } from '../vscode/copilotCodingAgentUtils';

export interface SessionResponseLogChunk {
	choices: Array<{
		finish_reason?: 'tool_calls' | 'null' | (string & {});
		delta: {
			content?: string;
			role: 'assistant' | (string & {});
			tool_calls?: Array<{
				function: {
					arguments: string;
					name: string;
				};
				id: string;
				type: string;
				index: number;
			}>;
		};
	}>;
	created: number;
	id: string;
	usage: {
		completion_tokens: number;
		prompt_tokens: number;
		prompt_tokens_details: {
			cached_tokens: number;
		};
		total_tokens: number;
	};
	model: string;
	object: string;
}

export interface ToolCall {
	function: {
		arguments: string;
		name: 'bash' | 'reply_to_comment' | (string & {});
	};
	id: string;
	type: string;
	index: number;
}

export interface AssistantDelta {
	content?: string;
	role: 'assistant' | (string & {});
	tool_calls?: ToolCall[];
}

export interface Choice {
	finish_reason?: 'tool_calls' | (string & {});
	delta: {
		content?: string;
		role: 'assistant' | (string & {});
		tool_calls?: ToolCall[];
	};
}

export interface StrReplaceEditorToolData {
	command: 'view' | 'edit' | string;
	filePath?: string;
	fileLabel?: string;
	parsedContent?: { content: string; fileA: string | undefined; fileB: string | undefined };
	viewRange?: { start: number; end: number };
}

export namespace StrReplaceEditorToolData {
	export function is(value: any): value is StrReplaceEditorToolData {
		return value && (typeof value.command === 'string');
	}
}

export interface BashToolData {
	commandLine: {
		original: string;
	};
	language: 'bash';
}

export interface ParsedToolCallDetails {
	toolName: string;
	invocationMessage: string;
	pastTenseMessage?: string;
	originMessage?: string;
	toolSpecificData?: StrReplaceEditorToolData | BashToolData;
}

export class ChatSessionContentBuilder {
	constructor(
		private type: string,
		@IGitService private readonly _gitService: IGitService
	) {
	}

	public async buildSessionHistory(
		problemStatementPromise: Promise<string | undefined>,
		sessions: SessionInfo[],
		pullRequest: PullRequestSearchItem,
		getLogsForSession: (id: string) => Promise<string>,
		initialReferences: Promise<vscode.ChatPromptReference[]>,
	): Promise<Array<ChatRequestTurn | ChatResponseTurn2>> {
		const history: Array<ChatRequestTurn | ChatResponseTurn2> = [];

		// Process all sessions concurrently and assemble results in order
		const sessionResults = await Promise.all(
			sessions.map(async (session, sessionIndex) => {
				const [logs, problemStatement] = await Promise.all([getLogsForSession(session.id), sessionIndex === 0 ? problemStatementPromise : Promise.resolve(undefined)]);

				const turns: Array<ChatRequestTurn | ChatResponseTurn2> = [];

				// Create request turn with references for the first session
				const references = sessionIndex === 0 ? Array.from(await initialReferences) : [];
				turns.push(new ChatRequestTurn2(
					problemStatement || session.name,
					undefined, // command
					references, // references
					this.type,
					[], // toolReferences
					[],
					undefined,
					undefined,
					undefined
				));

				// Create the PR card right after problem statement for first session
				if (sessionIndex === 0 && pullRequest.author && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
					const plaintextBody = pullRequest.body;

					const card = new vscode.ChatResponsePullRequestPart({ command: 'github.copilot.chat.openPullRequestReroute', title: vscode.l10n.t('View Pull Request {0}', `#${pullRequest.number}`), arguments: [pullRequest.number] }, pullRequest.title, plaintextBody, getAuthorDisplayName(pullRequest.author), `#${pullRequest.number}`);
					const cardTurn = new vscode.ChatResponseTurn2([card], {}, this.type);
					turns.push(cardTurn);
				}

				const response = await this.createResponseTurn(pullRequest, logs, session);
				if (response) {
					turns.push(response);
				}

				return { sessionIndex, turns };
			})
		);

		// Assemble results in correct order
		sessionResults
			.sort((a, b) => a.sessionIndex - b.sessionIndex)
			.forEach(result => history.push(...result.turns));

		return history;
	}

	private async createResponseTurn(pullRequest: PullRequestSearchItem, logs: string, session: SessionInfo): Promise<ChatResponseTurn2 | undefined> {
		if (logs.trim().length > 0) {
			return await this.parseSessionLogsIntoResponseTurn(pullRequest, logs, session);
		} else if (session.state === 'in_progress' || session.state === 'queued') {
			// For in-progress sessions without logs, create a placeholder response
			const placeholderParts = [new ChatResponseProgressPart('Session is initializing...')];
			const responseResult: ChatResult = {};
			return new ChatResponseTurn2(placeholderParts, responseResult, this.type);
		} else {
			// For completed sessions without logs, add an empty response to maintain pairing
			const emptyParts = [new ChatResponseMarkdownPart('_No logs available for this session_')];
			const responseResult: ChatResult = {};
			return new ChatResponseTurn2(emptyParts, responseResult, this.type);
		}
	}

	private async parseSessionLogsIntoResponseTurn(pullRequest: PullRequestSearchItem, logs: string, session: SessionInfo): Promise<ChatResponseTurn2 | undefined> {
		try {
			const logChunks = this.parseSessionLogs(logs);
			const responseParts: Array<ChatResponseMarkdownPart | ChatToolInvocationPart | ChatResponseMultiDiffPart> = [];

			for (const chunk of logChunks) {
				if (!chunk.choices || !Array.isArray(chunk.choices)) {
					continue;
				}

				for (const choice of chunk.choices) {
					const delta = choice.delta;
					if (delta.role === 'assistant') {
						this.processAssistantDelta(delta, choice, pullRequest, responseParts);
					}

				}
			}

			if (responseParts.length > 0) {
				const responseResult: ChatResult = {};
				return new ChatResponseTurn2(responseParts, responseResult, this.type);
			}

			return undefined;
		} catch (error) {
			return undefined;
		}
	}

	public parseSessionLogs(rawText: string): SessionResponseLogChunk[] {
		const parts = rawText
			.split(/\r?\n/)
			.filter(part => part.startsWith('data: '))
			.map(part => part.slice('data: '.length).trim())
			.map(part => JSON.parse(part));

		return parts as SessionResponseLogChunk[];
	}

	private processAssistantDelta(
		delta: AssistantDelta,
		choice: Choice,
		pullRequest: PullRequestSearchItem,
		responseParts: Array<ChatResponseMarkdownPart | ChatToolInvocationPart | ChatResponseMultiDiffPart | ChatResponseThinkingProgressPart>,
	): string {
		let currentResponseContent = '';
		if (delta.role === 'assistant') {
			const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : undefined;
			// Handle special case for run_custom_setup_step
			if (
				choice.finish_reason === 'tool_calls' &&
				toolCalls?.length &&
				(toolCalls[0].function.name === 'run_custom_setup_step' || toolCalls[0].function.name === 'run_setup')
			) {
				const toolCall = toolCalls[0];
				let args: { name?: string } = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// fallback to empty args
				}

				if (delta.content && delta.content.trim()) {
					const toolPart = this.createToolInvocationPart(pullRequest, toolCall, args.name || delta.content);
					if (toolPart) {
						responseParts.push(toolPart);
						if (toolPart instanceof ChatResponseThinkingProgressPart) {
							responseParts.push(new ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
						}
					}
				}
				// Skip if content is empty (running state)
			} else {
				if (delta.content) {
					if (!delta.content.startsWith('<pr_title>') && !delta.content.startsWith('<error>')) {
						currentResponseContent += delta.content;
					}
				}

				const isError = delta.content?.startsWith('<error>');
				if (toolCalls) {
					// Add any accumulated content as markdown first
					if (currentResponseContent.trim()) {
						responseParts.push(new ChatResponseMarkdownPart(currentResponseContent.trim()));
						currentResponseContent = '';
					}

					for (const toolCall of toolCalls) {
						const toolPart = this.createToolInvocationPart(pullRequest, toolCall, delta.content || '');
						if (toolPart) {
							responseParts.push(toolPart);
							if (toolPart instanceof ChatResponseThinkingProgressPart) {
								responseParts.push(new ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
							}
						}
					}

					if (isError) {
						const toolPart = new ChatToolInvocationPart('Command', 'command');
						// Remove <error> at the start and </error> at the end
						const cleaned = (delta.content ?? '').replace(/^\s*<error>\s*/i, '').replace(/\s*<\/error>\s*$/i, '');
						toolPart.invocationMessage = cleaned;
						toolPart.isError = true;
						responseParts.push(toolPart);
					}
				} else {
					const trimmedContent = currentResponseContent.trim();
					if (trimmedContent) {
						// TODO@rebornix @osortega validate if this is the only finish_reason for session end.
						if (choice.finish_reason === 'stop') {
							responseParts.push(new ChatResponseMarkdownPart(trimmedContent));
						} else {
							responseParts.push(new ChatResponseThinkingProgressPart(trimmedContent, '', { vscodeReasoningDone: true }));
						}
						currentResponseContent = '';
					}
				}
			}
		}
		return currentResponseContent;
	}

	public createToolInvocationPart(pullRequest: PullRequestSearchItem, toolCall: ToolCall, deltaContent: string = ''): ChatToolInvocationPart | ChatResponseThinkingProgressPart | undefined {
		if (!toolCall.function?.name || !toolCall.id) {
			return undefined;
		}

		// Hide reply_to_comment tool
		if (toolCall.function.name === 'reply_to_comment') {
			return undefined;
		}

		const toolPart = new ChatToolInvocationPart(toolCall.function.name, toolCall.id);
		toolPart.isComplete = true;
		toolPart.isError = false;
		toolPart.isConfirmed = true;

		try {
			const toolDetails = this.parseToolCallDetails(toolCall, deltaContent);
			toolPart.toolName = toolDetails.toolName;

			if (toolPart.toolName === 'think') {
				return new ChatResponseThinkingProgressPart(toolDetails.invocationMessage);
			}

			if (toolCall.function.name === 'bash') {
				toolPart.invocationMessage = new MarkdownString(`\`\`\`bash\n${toolDetails.invocationMessage}\n\`\`\``);
			} else {
				toolPart.invocationMessage = new MarkdownString(toolDetails.invocationMessage);
			}

			if (toolDetails.pastTenseMessage) {
				toolPart.pastTenseMessage = new MarkdownString(toolDetails.pastTenseMessage);
			}
			if (toolDetails.originMessage) {
				toolPart.originMessage = new MarkdownString(toolDetails.originMessage);
			}
			if (toolDetails.toolSpecificData) {
				if (StrReplaceEditorToolData.is(toolDetails.toolSpecificData)) {
					if ((toolDetails.toolSpecificData.command === 'view' || toolDetails.toolSpecificData.command === 'edit') && toolDetails.toolSpecificData.fileLabel) {
						const currentRepository = this._gitService.activeRepository.get();
						const uri = currentRepository?.rootUri ? Uri.file(pathLib.join(currentRepository.rootUri.fsPath, toolDetails.toolSpecificData.fileLabel)) : Uri.file(toolDetails.toolSpecificData.fileLabel);
						toolPart.invocationMessage = new MarkdownString(`${toolPart.toolName} [](${uri.toString()})` + (toolDetails.toolSpecificData?.viewRange ? `, lines ${toolDetails.toolSpecificData.viewRange?.start} to ${toolDetails.toolSpecificData.viewRange?.end}` : ''));
						toolPart.invocationMessage.supportHtml = true;
						toolPart.pastTenseMessage = new MarkdownString(`${toolPart.toolName} [](${uri.toString()})` + (toolDetails.toolSpecificData?.viewRange ? `, lines ${toolDetails.toolSpecificData.viewRange?.start} to ${toolDetails.toolSpecificData.viewRange?.end}` : ''));
					}
				} else {
					toolPart.toolSpecificData = toolDetails.toolSpecificData;
				}
			}
		} catch (error) {
			toolPart.toolName = toolCall.function.name || 'unknown';
			toolPart.invocationMessage = new MarkdownString(`Tool: ${toolCall.function.name}`);
			toolPart.isError = true;
		}

		return toolPart;
	}

	/**
	 * Convert absolute file path to relative file label
	 * File paths are absolute and look like: `/home/runner/work/repo/repo/<path>`
	 */
	private toFileLabel(file: string): string {
		const parts = file.split('/');
		return parts.slice(6).join('/');
	}

	private parseRange(view_range: unknown): { start: number; end: number } | undefined {
		if (!view_range) {
			return undefined;
		}

		if (!Array.isArray(view_range)) {
			return undefined;
		}

		if (view_range.length !== 2) {
			return undefined;
		}

		const start = view_range[0];
		const end = view_range[1];

		if (typeof start !== 'number' || typeof end !== 'number') {
			return undefined;
		}

		return {
			start,
			end
		};
	}

	/**
	 * Parse diff content and extract file information
	 */
	private parseDiff(content: string): { content: string; fileA: string | undefined; fileB: string | undefined } | undefined {
		const lines = content.split(/\r?\n/g);
		let fileA: string | undefined;
		let fileB: string | undefined;

		let startDiffLineIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith('diff --git')) {
				const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
				if (match) {
					fileA = match[1];
					fileB = match[2];
				}
			} else if (line.startsWith('@@ ')) {
				startDiffLineIndex = i + 1;
				break;
			}
		}
		if (startDiffLineIndex < 0) {
			return undefined;
		}

		return {
			content: lines.slice(startDiffLineIndex).join('\n'),
			fileA: typeof fileA === 'string' ? '/' + fileA : undefined,
			fileB: typeof fileB === 'string' ? '/' + fileB : undefined
		};
	}

	/**
	  * Parse tool call arguments and return normalized tool details
	  */
	private parseToolCallDetails(
		toolCall: {
			function: { name: string; arguments: string };
			id: string;
			type: string;
			index: number;
		},
		content: string
	): ParsedToolCallDetails {
		// Parse arguments once with graceful fallback
		let args: { command?: string; path?: string; prDescription?: string; commitMessage?: string; view_range?: unknown } = {};
		try { args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}; } catch { /* ignore */ }

		const name = toolCall.function.name;

		// Small focused helpers to remove duplication while preserving behavior
		const buildReadDetails = (filePath: string | undefined, parsedRange: { start: number; end: number } | undefined, opts?: { parsedContent?: { content: string; fileA: string | undefined; fileB: string | undefined } }): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			if (fileLabel === undefined || fileLabel === '') {
				return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
			}
			const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
			// Default helper returns bracket variant (used for generic view). Plain variant handled separately for str_replace_editor non-diff.
			return {
				toolName: 'Read',
				invocationMessage: `Read [](${fileLabel})${rangeSuffix}`,
				pastTenseMessage: `Read [](${fileLabel})${rangeSuffix}`,
				toolSpecificData: {
					command: 'view',
					filePath: filePath,
					fileLabel: fileLabel,
					parsedContent: opts?.parsedContent,
					viewRange: parsedRange
				}
			};
		};

		const buildEditDetails = (filePath: string | undefined, command: string = 'edit', parsedRange: { start: number; end: number } | undefined, opts?: { defaultName?: string }): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
			let invocationMessage: string;
			let pastTenseMessage: string;
			if (fileLabel) {
				invocationMessage = `Edit [](${fileLabel})${rangeSuffix}`;
				pastTenseMessage = `Edit [](${fileLabel})${rangeSuffix}`;
			} else {
				if (opts?.defaultName === 'Create') {
					invocationMessage = pastTenseMessage = `Create File ${filePath}`;
				} else {
					invocationMessage = pastTenseMessage = (opts?.defaultName || 'Edit');
				}
				invocationMessage += rangeSuffix;
				pastTenseMessage += rangeSuffix;
			}

			return {
				toolName: opts?.defaultName || 'Edit',
				invocationMessage,
				pastTenseMessage,
				toolSpecificData: fileLabel ? {
					command: command || (opts?.defaultName === 'Create' ? 'create' : (command || 'edit')),
					filePath: filePath,
					fileLabel: fileLabel,
					viewRange: parsedRange
				} : undefined
			};
		};

		const buildStrReplaceDetails = (filePath: string | undefined): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const message = fileLabel ? `Edit [](${fileLabel})` : `Edit ${filePath}`;
			return {
				toolName: 'Edit',
				invocationMessage: message,
				pastTenseMessage: message,
				toolSpecificData: fileLabel ? { command: 'str_replace', filePath, fileLabel } : undefined
			};
		};

		const buildCreateDetails = (filePath: string | undefined): ParsedToolCallDetails => {
			const fileLabel = filePath && this.toFileLabel(filePath);
			const message = fileLabel ? `Create [](${fileLabel})` : `Create File ${filePath}`;
			return {
				toolName: 'Create',
				invocationMessage: message,
				pastTenseMessage: message,
				toolSpecificData: fileLabel ? { command: 'create', filePath, fileLabel } : undefined
			};
		};

		const buildBashDetails = (bashArgs: typeof args, contentStr: string): ParsedToolCallDetails => {
			const command = bashArgs.command ? `$ ${bashArgs.command}` : undefined;
			const bashContent = [command, contentStr].filter(Boolean).join('\n');

			const MAX_CONTENT_LENGTH = 200;
			let displayContent = bashContent;
			if (bashContent && bashContent.length > MAX_CONTENT_LENGTH) {
				// Check if content contains EOF marker (heredoc pattern)
				const hasEOF = (bashContent && /<<\s*['"]?EOF['"]?/.test(bashContent));
				if (hasEOF) {
					// show the command line up to EOL
					const firstLineEnd = bashContent.indexOf('\n');
					if (firstLineEnd > 0) {
						const firstLine = bashContent.substring(0, firstLineEnd);
						const remainingChars = bashContent.length - firstLineEnd - 1;
						displayContent = firstLine + `\n... [${remainingChars} characters of heredoc content]`;
					} else {
						displayContent = bashContent;
					}
				} else {
					displayContent = bashContent.substring(0, MAX_CONTENT_LENGTH) + `\n... [${bashContent.length - MAX_CONTENT_LENGTH} more characters]`;
				}
			}

			const details: ParsedToolCallDetails = { toolName: 'Run Bash command', invocationMessage: bashContent || 'Run Bash command' };
			if (bashArgs.command) { details.toolSpecificData = { commandLine: { original: displayContent ?? '' }, language: 'bash' }; }
			return details;
		};

		switch (name) {
			case 'str_replace_editor': {
				if (args.command === 'view') {
					const parsedContent = this.parseDiff(content);
					const parsedRange = this.parseRange(args.view_range);
					if (parsedContent) {
						const file = parsedContent.fileA ?? parsedContent.fileB;
						const fileLabel = file && this.toFileLabel(file);
						if (fileLabel === '') {
							return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
						} else if (fileLabel === undefined) {
							return { toolName: 'Read', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
						} else {
							const rangeSuffix = parsedRange ? `, lines ${parsedRange.start} to ${parsedRange.end}` : '';
							return {
								toolName: 'Read',
								invocationMessage: `Read [](${fileLabel})${rangeSuffix}`,
								pastTenseMessage: `Read [](${fileLabel})${rangeSuffix}`,
								toolSpecificData: { command: 'view', filePath: file, fileLabel, parsedContent, viewRange: parsedRange }
							};
						}
					}
					// No diff parsed: use PLAIN (non-bracket) variant for str_replace_editor views
					const plainRange = this.parseRange(args.view_range);
					const fp = args.path; const fl = fp && this.toFileLabel(fp);
					if (fl === undefined || fl === '') {
						return { toolName: 'Read repository', invocationMessage: 'Read repository', pastTenseMessage: 'Read repository' };
					}
					const suffix = plainRange ? `, lines ${plainRange.start} to ${plainRange.end}` : '';
					return {
						toolName: 'Read',
						invocationMessage: `Read ${fl}${suffix}`,
						pastTenseMessage: `Read ${fl}${suffix}`,
						toolSpecificData: { command: 'view', filePath: fp, fileLabel: fl, viewRange: plainRange }
					};
				}
				return buildEditDetails(args.path, args.command, this.parseRange(args.view_range));
			}
			case 'str_replace':
				return buildStrReplaceDetails(args.path);
			case 'create':
				return buildCreateDetails(args.path);
			case 'view':
				return buildReadDetails(args.path, this.parseRange(args.view_range)); // generic view always bracket variant
			case 'think': {
				const thought = (args as unknown as { thought?: string }).thought || content || 'Thought';
				return { toolName: 'think', invocationMessage: thought };
			}
			case 'report_progress': {
				const details: ParsedToolCallDetails = { toolName: 'Progress Update', invocationMessage: `${args.prDescription}` || content || 'Progress Update' };
				if (args.commitMessage) { details.originMessage = `Commit: ${args.commitMessage}`; }
				return details;
			}
			case 'bash':
				return buildBashDetails(args, content);
			case 'read_bash':
				return { toolName: 'read_bash', invocationMessage: 'Read logs from Bash session' };
			case 'stop_bash':
				return { toolName: 'stop_bash', invocationMessage: 'Stop Bash session' };
			case 'edit':
				return buildEditDetails(args.path, args.command, undefined);
			default:
				return { toolName: name || 'unknown', invocationMessage: content || name || 'unknown' };
		}
	}
}
