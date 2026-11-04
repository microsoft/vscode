/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getTurnError, MessageAttachmentKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type ResponsePart, type ToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import type { ILanguageModelsService } from '../../../common/languageModels.js';
import type { IChatProgressResponseContent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { importedTurnsFromChatModel, resolveImportedCopilotModel } from '../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js';

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

	/** Builds an inline reference from a non-URI shape (a `Location` or `IWorkspaceSymbol`). */
	function inlineRef(reference: unknown, name?: string): IChatProgressResponseContent {
		return { kind: 'inlineReference', inlineReference: reference, name } as IChatProgressResponseContent;
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

	function request(text: string, response?: IChatResponseModel, opts?: { systemInitiated?: boolean; variables?: unknown[]; modelId?: string }): IChatRequestModel {
		return { message: { text }, response, isSystemInitiated: opts?.systemInitiated, variableData: { variables: opts?.variables ?? [] }, modelId: opts?.modelId } as unknown as IChatRequestModel;
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
			error: getTurnError(turn),
			parts: turn.responseParts.map(part => {
				if (part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning) {
					return { kind: part.kind, content: part.content };
				}
				if (part.kind === ResponsePartKind.Error) {
					return { kind: part.kind, error: part.error };
				}
				return { kind: part.kind, subagent: subagentOf(part) };
			}),
		}));
	}

	test('carries request attachments mapped to the host and the model each request used', () => {
		const range = { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 };
		const textRange = { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } };
		const hostUris = {
			toAgentHost: (uri: URI) => uri.with({ path: `/host${uri.path}` }),
			fromAgentHost: (uri: URI) => uri,
		};
		const host = (path: string) => URI.file(`/host${path}`).toString();
		const languageModels = {
			lookupLanguageModel: (identifier: string) => identifier === 'copilot/gpt-5' ? { id: 'gpt-5', vendor: 'copilot' } : identifier === 'byok/llama' ? { id: 'llama', vendor: 'byok' } : undefined,
		} as unknown as ILanguageModelsService;
		const variables = [
			{ kind: 'file', id: 'f', name: 'a.ts', value: URI.file('/repo/a.ts') },
			{ kind: 'file', id: 's', name: 'b.ts:2-4', value: { uri: URI.file('/repo/b.ts'), range } },
			{ kind: 'implicit', id: 'i', name: 'c.ts', isFile: true, isSelection: false, value: { uri: URI.file('/repo/c.ts'), range } },
			{ kind: 'directory', id: 'd', name: 'src', value: URI.file('/repo/src') },
			{ kind: 'symbol', id: 'y', name: 'foo', value: { uri: URI.file('/repo/d.ts'), range } },
			{ kind: 'promptFile', id: 'p', name: 'review.prompt.md', value: URI.file('/repo/review.prompt.md') },
			{ kind: 'paste', id: 'x', name: 'Pasted', code: 'pasted text', language: 'text', pastedLines: '1', fileName: '', copiedFrom: undefined },
			{ kind: 'workspace', id: 'w', name: 'Workspace', value: 'repo info' },
			{ kind: 'image', id: 'm', name: 'shot.png', value: new Uint8Array([0, 1, 2]), mimeType: 'image/png' },
			{ kind: 'tool', id: 't', name: 'runTests', value: undefined },
		];

		const turns = importedTurnsFromChatModel(model([
			request('first', response([markdown('A')]), { variables, modelId: 'copilot/gpt-5' }),
			request('second', response([markdown('B')]), { modelId: 'copilot/claude-sonnet-5' }),
			request('third', response([markdown('C')]), { modelId: 'byok/llama' }),
		]), { resourceUris: hostUris, resolveModel: identifier => resolveImportedCopilotModel(languageModels, identifier) });

		assert.deepStrictEqual(turns.map(turn => ({ model: turn.message.model, attachments: turn.message.attachments })), [
			{
				model: { id: 'gpt-5' },
				attachments: [
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/a.ts'), label: 'a.ts', displayKind: 'document' },
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/b.ts'), label: 'b.ts:2-4', displayKind: 'selection', selection: { range: textRange } },
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/c.ts'), label: 'c.ts', displayKind: 'document' },
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/src'), label: 'src', displayKind: 'directory' },
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/d.ts'), label: 'foo', displayKind: 'symbol', selection: { range: textRange } },
					{ type: MessageAttachmentKind.Resource, uri: host('/repo/review.prompt.md'), label: 'review.prompt.md', displayKind: 'document' },
					{ type: MessageAttachmentKind.Simple, label: 'Pasted', modelRepresentation: 'pasted text' },
					{ type: MessageAttachmentKind.Simple, label: 'Workspace', modelRepresentation: 'repo info', displayKind: 'workspace' },
					{ type: MessageAttachmentKind.EmbeddedResource, label: 'shot.png', displayKind: 'image', data: 'AAEC', contentType: 'image/png' },
				],
			},
			{ model: { id: 'claude-sonnet-5' }, attachments: undefined },
			{ model: undefined, attachments: undefined },
		]);
	});

	test('labels a migrated image by its bytes when the entry has no MIME type', () => {
		const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
		const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
		const unknown = new Uint8Array([0, 1, 2]);
		const turns = importedTurnsFromChatModel(model([request('q', response([markdown('A')]), {
			variables: [
				{ kind: 'image', id: 'j', name: 'photo.jpg', value: jpeg },
				{ kind: 'image', id: 'p', name: 'mislabeled.png', value: png, mimeType: 'image/jpeg' },
				{ kind: 'image', id: 'u', name: 'unknown', value: unknown },
			],
		})]));

		assert.deepStrictEqual(turns[0].message.attachments?.map(a => a.type === MessageAttachmentKind.EmbeddedResource ? { label: a.label, contentType: a.contentType } : a.type), [
			{ label: 'photo.jpg', contentType: 'image/jpeg' },
			{ label: 'mislabeled.png', contentType: 'image/png' },
			{ label: 'unknown', contentType: 'image/png' },
		]);
	});

	test('preserves local reasoning timing when importing into an agent session', () => {
		const turns = importedTurnsFromChatModel(model([request('q', response([
			{ kind: 'thinking', value: 'Measured', reasoningStartedAt: 1000, reasoningDurationMs: 45_000 },
			{ kind: 'thinking', value: 'Immediate', reasoningDurationMs: 0 },
			{ kind: 'thinking', value: 'Older history' },
		]))]));

		assert.deepStrictEqual(turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.Reasoning
			? [{ content: part.content, startedAt: part.startedAt, duration: part.duration }] : []), [
			{ content: 'Measured', startedAt: '1970-01-01T00:00:01.000Z', duration: 45_000 },
			{ content: 'Immediate', startedAt: undefined, duration: 0 },
			{ content: 'Older history', startedAt: undefined, duration: undefined },
		]);
	});

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

	test('collapses a path-like inline reference label to the file basename', () => {
		const uri = URI.file('/repo/src/common/appInsightsClientFactory.ts');
		const result = project(model([request('q', response([
			inlineReference(uri, 'src/common/appInsightsClientFactory.ts'),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: `[appInsightsClientFactory.ts](${uri.toString()})` },
			],
		}]);
	});

	test('keeps a short inline reference label (e.g. a symbol name) as-is', () => {
		const uri = URI.file('/repo/src/common/appInsightsClientFactory.ts');
		const result = project(model([request('q', response([
			inlineReference(uri, 'logEvent'),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` },
			],
		}]);
	});

	test('maps a Location-shaped inline reference to its file basename', () => {
		const uri = URI.file('/repo/src/common/baseTelemetrySender.ts');
		const result = project(model([request('q', response([
			inlineRef({ uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } }),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: `[baseTelemetrySender.ts](${uri.toString()})` },
			],
		}]);
	});

	test('maps a workspace-symbol inline reference using its symbol name', () => {
		const uri = URI.file('/repo/src/common/baseTelemetrySender.ts');
		const result = project(model([request('q', response([
			inlineRef({ name: 'logEvent', location: { uri } }),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` },
			],
		}]);
	});

	test('falls back to the plain label when an inline reference has no resolvable URI', () => {
		const result = project(model([request('q', response([
			inlineRef({ name: 'orphan' }, 'orphan'),
		]))]));

		assert.deepStrictEqual(result, [{
			text: 'q',
			state: TurnState.Complete,
			error: undefined,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'orphan' },
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
			parts: [{ kind: ResponsePartKind.Error, error: { errorType: 'E1', message: 'boom' } }],
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

	test('imports phase summaries and terminal outcomes without inventing child subagents', () => {
		const phase: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			presentation: undefined,
			toolId: 'hydrafusion_phase',
			toolCallId: 'fusion:phase-1',
			invocationMessage: 'Main pass',
			originMessage: undefined,
			pastTenseMessage: 'Main pass completed',
			isConfirmed: undefined,
			isComplete: true,
			source: undefined,
			toolSpecificData: {
				kind: 'subagent',
				presentation: 'phase',
				phaseStatus: 'succeeded',
				description: 'Main pass',
				result: 'Main pass completed',
				isChatAvailable: false,
			},
		};
		assert.deepStrictEqual((['succeeded', 'failed', 'cancelled'] as const).map(phaseStatus => {
			const toolSpecificData: IChatToolInvocationSerialized['toolSpecificData'] = {
				kind: 'subagent', presentation: 'phase',
				phaseStatus,
				description: 'Main pass', result: `Main pass ${phaseStatus}`,
			};
			const turns = importedTurnsFromChatModel(model([request('q', response([{ ...phase, toolSpecificData }]))]));
			const part = turns[0].responseParts[0];
			return part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
				success: part.toolCall.success, error: part.toolCall.error, content: part.toolCall.content,
			} : undefined;
		}), [
			{ success: true, error: undefined, content: [{ type: ToolResultContentType.Text, text: 'Main pass succeeded' }] },
			{ success: false, error: { message: 'Main pass failed' }, content: [{ type: ToolResultContentType.Text, text: 'Main pass failed' }] },
			{ success: false, error: { message: 'Main pass cancelled', code: 'cancelled' }, content: [{ type: ToolResultContentType.Text, text: 'Main pass cancelled' }] },
		]);
	});
});
