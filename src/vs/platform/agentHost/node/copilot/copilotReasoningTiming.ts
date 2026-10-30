/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import type { ILogService } from '../../../log/common/log.js';
import type { StoredAssistantResponsePart } from '../../common/sessionDataService.js';
import { ActionType, type ChatReasoningAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, type MarkdownResponsePart, type ReasoningResponsePart, type ResponsePart } from '../../common/state/sessionState.js';

interface IRecordedMessage {
	readonly turnId: string;
	readonly responseId: string;
	readonly parts: StoredAssistantResponsePart[];
}

interface IReasoningScope {
	readonly turnId: string;
	parts: StoredAssistantResponsePart[];
	readonly tools: Set<string>;
	active?: {
		readonly partId: string;
		readonly startedAt: string;
		readonly clock: StopWatch;
		readonly messages: Set<IRecordedMessage>;
		persistable: boolean;
	};
}

export interface IRecordedResponseParts {
	readonly responseId: string;
	readonly original: readonly ResponsePart[];
	readonly recorded: readonly StoredAssistantResponsePart[];
}

/** Measures contiguous reasoning output independently of SDK block and message boundaries. */
export class CopilotReasoningTiming extends Disposable {
	private readonly _scopes = new Map<string | undefined, IReasoningScope>();

	constructor(
		private readonly _emit: (action: ChatReasoningAction, parentToolCallId: string | undefined) => void,
		private readonly _persist: (turnId: string, responseId: string, parts: readonly StoredAssistantResponsePart[]) => void,
	) {
		super();
	}

	activePartId(turnId: string, parentToolCallId: string | undefined): string | undefined {
		const scope = this._scopes.get(parentToolCallId);
		return scope?.turnId === turnId ? scope.active?.partId : undefined;
	}

	start(turnId: string, partId: string, parentToolCallId: string | undefined): string {
		const scope = this.getScope(turnId, parentToolCallId);
		const startedAt = new Date().toISOString();
		scope.active = { partId, startedAt, clock: StopWatch.create(), messages: new Set(), persistable: true };
		return startedAt;
	}

	append(content: string, parentToolCallId: string | undefined): void {
		const scope = this._scopes.get(parentToolCallId);
		if (!scope?.active) {
			throw new Error('Reasoning output has no active interval');
		}
		const last = scope.parts.at(-1);
		if (last?.kind === ResponsePartKind.Reasoning && last.id === scope.active.partId) {
			last.content += content;
		} else {
			scope.parts.push({ kind: ResponsePartKind.Reasoning, id: scope.active.partId, content, startedAt: scope.active.startedAt });
		}
	}

	markdown(turnId: string, partId: string, content: string, parentToolCallId: string | undefined): void {
		this.finish(parentToolCallId);
		const scope = this.getScope(turnId, parentToolCallId);
		const last = scope.parts.at(-1);
		if (last?.kind === ResponsePartKind.Markdown && last.id === partId) {
			last.content += content;
		} else {
			scope.parts.push({ kind: ResponsePartKind.Markdown, id: partId, content });
		}
	}

	toolCall(turnId: string, toolCallId: string, parentToolCallId: string | undefined): void {
		const scope = this.getScope(turnId, parentToolCallId);
		if (!scope.tools.has(toolCallId)) {
			scope.tools.add(toolCallId);
			this.finish(parentToolCallId);
			scope.parts.push({ kind: ResponsePartKind.ToolCall, toolCallId });
		}
	}

	hasMarkdown(parentToolCallId: string | undefined): boolean {
		return this._scopes.get(parentToolCallId)?.parts.some(part => part.kind === ResponsePartKind.Markdown) ?? false;
	}

	finish(parentToolCallId: string | undefined): void {
		const scope = this._scopes.get(parentToolCallId);
		const active = scope?.active;
		if (!scope || !active) {
			return;
		}
		const duration = Math.max(0, Math.round(active.clock.elapsed()));
		scope.active = undefined;
		const finishParts = (parts: StoredAssistantResponsePart[]) => {
			for (const part of parts) {
				if (part.kind === ResponsePartKind.Reasoning && part.id === active.partId && active.persistable) {
					part.duration = duration;
				}
			}
		};
		finishParts(scope.parts);
		for (const message of active.messages) {
			finishParts(message.parts);
			this.persist(message);
		}
		this._emit({ type: ActionType.ChatReasoning, turnId: scope.turnId, partId: active.partId, content: '', startedAt: active.startedAt, duration }, parentToolCallId);
	}

	completeMessage(responseId: string, reasoningText: string | undefined, content: string, parentToolCallId: string | undefined): boolean {
		const scope = this._scopes.get(parentToolCallId);
		if (!scope || (!reasoningText && !content)) {
			return false;
		}
		const parts = scope.parts;
		scope.parts = [];
		const matches = parts.filter(part => part.kind === ResponsePartKind.Reasoning).map(part => part.content).join('') === (reasoningText ?? '')
			&& parts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content).join('') === content;
		if (!matches) {
			if (scope.active && parts.some(part => part.kind === ResponsePartKind.Reasoning && part.id === scope.active?.partId)) {
				scope.active.persistable = false;
			}
			return false;
		}
		if (!parts.some(part => part.kind === ResponsePartKind.Reasoning)) {
			return false;
		}
		const message = { turnId: scope.turnId, responseId, parts };
		if (scope.active && parts.some(part => part.kind === ResponsePartKind.Reasoning && part.id === scope.active?.partId)) {
			scope.active.messages.add(message);
		}
		this.persist(message);
		return true;
	}

	clear(parentToolCallId: string | undefined): void {
		this._scopes.delete(parentToolCallId);
	}

	private getScope(turnId: string, parentToolCallId: string | undefined): IReasoningScope {
		let scope = this._scopes.get(parentToolCallId);
		if (scope?.turnId !== turnId) {
			scope = { turnId, parts: [], tools: new Set() };
			this._scopes.set(parentToolCallId, scope);
		}
		return scope;
	}

	private persist(message: IRecordedMessage): void {
		this._persist(message.turnId, message.responseId, message.parts.map(part => ({ ...part })));
	}

	override dispose(): void {
		this._scopes.clear();
		super.dispose();
	}
}

/** Reconstructs recorded stream order while retaining the provider's canonical tool results. */
export function restoreRecordedResponseParts(parts: readonly ResponsePart[], responses: readonly IRecordedResponseParts[], logService?: ILogService): ResponsePart[] {
	if (!responses.length) {
		return [...parts];
	}
	const tools = new Map(parts.flatMap((part, index) => part.kind === ResponsePartKind.ToolCall ? [[part.toolCall.toolCallId, { part, index }] as const] : []));
	const replacements = new Map<ResponsePart, ResponsePart[]>();
	const replaced = new Set<ResponsePart>();
	const movedTools = new Set<string>();
	for (const response of responses) {
		const anchor = response.original[0];
		const anchorIndex = parts.indexOf(anchor);
		if (anchorIndex < 0) {
			logService?.warn(`[Copilot] Recorded response ${response.responseId} has no history anchor`);
			continue;
		}
		let sawText = false;
		const replacement: ResponsePart[] = [];
		for (const part of response.recorded) {
			if (part.kind === ResponsePartKind.ToolCall) {
				const tool = tools.get(part.toolCallId);
				if (!tool) {
					logService?.warn(`[Copilot] Recorded response ${response.responseId} references an unavailable tool call ${part.toolCallId}`);
				} else if (!movedTools.has(part.toolCallId) && (sawText || tool.index > anchorIndex)) {
					movedTools.add(part.toolCallId);
					replacement.push(tool.part);
				}
			} else {
				sawText = true;
				replacement.push({ ...part });
			}
		}
		replacements.set(anchor, replacement);
		for (const original of response.original) {
			replaced.add(original);
		}
	}

	const result: ResponsePart[] = [];
	const textParts = new Map<string, MarkdownResponsePart | ReasoningResponsePart>();
	const append = (part: ResponsePart) => {
		if (part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning) {
			const key = `${part.kind}:${part.id}`;
			const existing = textParts.get(key);
			if (existing) {
				existing.content += part.content;
				if (existing.kind === ResponsePartKind.Reasoning && part.kind === ResponsePartKind.Reasoning) {
					existing.startedAt ??= part.startedAt;
					existing.duration = part.duration ?? existing.duration;
				}
				return;
			}
			part = { ...part };
			textParts.set(key, part);
		}
		result.push(part);
	};
	for (const part of parts) {
		const replacement = replacements.get(part);
		if (replacement) {
			replacement.forEach(append);
		} else if (!replaced.has(part) && !(part.kind === ResponsePartKind.ToolCall && movedTools.has(part.toolCall.toolCallId))) {
			append(part);
		}
	}
	return result;
}
