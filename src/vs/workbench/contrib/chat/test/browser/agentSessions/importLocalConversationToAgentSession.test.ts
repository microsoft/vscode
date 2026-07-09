/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ResponsePartKind, ToolResultContentType, TurnState, type ResponsePart, type ToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatProgressResponseContent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { importedTurnsFromChatModel } from '../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js';

suite('importedTurnsFromChatModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function markdown(value: string): IChatProgressResponseContent {
		return { kind: 'markdownContent', content: new MarkdownString(value) } as IChatProgressResponseContent;
	}

	function thinking(value: string): IChatProgressResponseContent {
		return { kind: 'thinking', value } as IChatProgressResponseContent;
	}

	function inlineReference(uri: URI, name?: string): IChatProgressResponseContent {
		return { kind: 'inlineReference', inlineReference: uri, name } as IChatProgressResponseContent;
	}

	function subagentTool(toolCallId: string, agentName: string, description: string, result: string): IChatProgressResponseContent {
		return {
			kind: 'toolInvocationSerialized',
			toolId: 'delegate',
			toolCallId,
			invocationMessage: 'Delegating',
			pastTenseMessage: 'Delegated',
			resultDetails: undefined,
			toolSpecificData: { kind: 'subagent', agentName, description, prompt: 'go', result },
		} as unknown as IChatProgressResponseContent;
	}

	function response(parts: IChatProgressResponseContent[], opts?: { canceled?: boolean; error?: { message: string; code?: string } }): IChatResponseModel {
		return {
			entireResponse: { value: parts },
			isCanceled: !!opts?.canceled,
			result: opts?.error ? { errorDetails: opts.error } : undefined,
		} as unknown as IChatResponseModel;
	}

	function request(text: string, response?: IChatResponseModel, opts?: { systemInitiated?: boolean }): IChatRequestModel {
		return { message: { text }, response, isSystemInitiated: opts?.systemInitiated } as unknown as IChatRequestModel;
	}

	function model(requests: IChatRequestModel[]): IChatModel {
		return { getRequests: () => requests } as unknown as IChatModel;
	}

	function subagentOf(part: ResponsePart) {
		if (part.kind !== ResponsePartKind.ToolCall) {
			return undefined;
		}
		const sub = (part.toolCall as ToolCallCompletedState).content?.find(c => c.type === ToolResultContentType.Subagent);
		return sub && sub.type === ToolResultContentType.Subagent ? { agentName: sub.agentName, description: sub.description } : undefined;
	}

	function project(model: IChatModel) {
		return importedTurnsFromChatModel(model).map(turn => ({
			text: turn.message.text,
			state: turn.state,
			error: turn.error,
			parts: turn.responseParts.map(part =>
				part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning
					? { kind: part.kind, content: part.content }
					: { kind: part.kind, subagent: subagentOf(part) }),
		}));
	}

	test('maps markdown, reasoning and inline references in stream order', () => {
		const result = project(model([request('q', response([
			markdown('Found in '),
			inlineReference(URI.file('/repo/a.ts')),
			markdown(' — done'),
			thinking('let me check'),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Found in ' },
				{ kind: ResponsePartKind.Markdown, content: `[a.ts](${URI.file('/repo/a.ts').toString()})` },
				{ kind: ResponsePartKind.Markdown, content: ' — done' },
				{ kind: ResponsePartKind.Reasoning, content: 'let me check' },
			],
		}]);
	});

	test('maps a cancelled response to a cancelled turn', () => {
		const result = project(model([request('q', response([markdown('partial')], { canceled: true }))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Cancelled,
			error: undefined,
			parts: [{ kind: ResponsePartKind.Markdown, content: 'partial' }],
		}]);
	});

	test('maps an errored response to an error turn carrying the message and code', () => {
		const result = project(model([request('q', response([], { error: { message: 'boom', code: 'E1' } }))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Error,
			error: { errorType: 'E1', message: 'boom' },
			parts: [],
		}]);
	});

	test('folds a system-initiated continuation into the previous turn and supersedes its outcome', () => {
		const result = project(model([
			request('real question', response([markdown('working')])),
			request('[Terminal notification]', response([markdown('continued')], { canceled: true }), { systemInitiated: true }),
		]));

		assert.deepStrictEqual(result, [{
			text: 'real question',
			state: TurnState.Cancelled,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'working' },
				{ kind: ResponsePartKind.Markdown, content: 'continued' },
			],
		}]);
	});

	test('maps a sub-agent tool invocation preserving its identity as structured content', () => {
		const result = project(model([request('delegate', response([subagentTool('tc-1', 'explore', 'Explores the codebase', 'done')]))]));

		assert.deepStrictEqual(result, [{
			text: 'delegate',
			state: TurnState.Complete,
			error: undefined,
			parts: [{ kind: ResponsePartKind.ToolCall, subagent: { agentName: 'explore', description: 'Explores the codebase' } }],
		}]);
	});
});
