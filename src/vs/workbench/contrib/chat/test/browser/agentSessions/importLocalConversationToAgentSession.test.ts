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
import { createImportedConversationStats, importedTurnsFromChatModel, resolveImportedCopilotModel } from '../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js';
import { rewriteAgentHostLinkTarget } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

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

	function response(parts: IChatProgressResponseContent[], opts?: { canceled?: boolean; error?: { message: string; code?: string }; completionTimestamp?: number; elapsedMs?: number; usage?: { promptTokens: number; completionTokens: number; copilotCredits?: number; modelTotals?: unknown[] }; lastCallKnown?: boolean }): IChatResponseModel {
		return {
			entireResponse: { value: parts },
			isCanceled: !!opts?.canceled,
			result: opts?.error ? { errorDetails: opts.error } : undefined,
			completionTimestamp: opts?.completionTimestamp,
			elapsedMs: opts?.elapsedMs,
			usage: opts?.usage,
			lastCallCompletionTokensKnown: opts?.lastCallKnown ?? true,
		} as unknown as IChatResponseModel;
	}

	function request(text: string, response?: IChatResponseModel, opts?: { systemInitiated?: boolean; variables?: unknown[]; modelId?: string; timestamp?: number; modeInfo?: unknown }): IChatRequestModel {
		return { message: { text }, response, isSystemInitiated: opts?.systemInitiated, variableData: { variables: opts?.variables ?? [] }, modelId: opts?.modelId, timestamp: opts?.timestamp, modeInfo: opts?.modeInfo } as unknown as IChatRequestModel;
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

	test('summarizes each run of file edits as links to the edited files, in stream order', () => {
		const a = URI.file('/repo/a.ts');
		const b = URI.file('/repo/b.ipynb');
		const c = URI.file('/repo/c.ts');
		const textEdits = (uri: URI) => ({ kind: 'textEditGroup', uri, edits: [], done: true }) as unknown as IChatProgressResponseContent;
		const notebookEdits = (uri: URI) => ({ kind: 'notebookEditGroup', uri, edits: [], done: true }) as unknown as IChatProgressResponseContent;
		const control = (kind: string) => ({ kind }) as unknown as IChatProgressResponseContent;
		const turns = importedTurnsFromChatModel(model([request('edit', response([
			markdown('```ts\ncode\n```'),
			textEdits(a),
			control('undoStop'),
			notebookEdits(b),
			control('codeblockUri'),
			textEdits(a),
			markdown('Then:'),
			textEdits(c),
		]))]));

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind), [
			'```ts\ncode\n```',
			// Control markers between the edits do not split the run, and a file is listed once.
			// Each summary is its own paragraph, so it cannot join a closing code fence when
			// adjacent markdown is concatenated.
			`\n\nEdited [a.ts](${a.toString()}), [b.ipynb](${b.toString()})\n\n`,
			'Then:',
			`\n\nEdited [c.ts](${c.toString()})\n\n`,
		]);
	});

	test('links to edited and referenced files of a remote window resolve back to them, whatever their names', () => {
		// An SSH window's client resources are `vscode-remote:`; the host sees them as `file:`.
		const remote = (path: string) => URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+box', path });
		const resourceUris = {
			toAgentHost: (uri: URI) => uri.scheme === 'vscode-remote' ? uri.with({ scheme: 'file', authority: '' }) : uri,
			fromAgentHost: (uri: URI) => uri.scheme === 'file' ? remote(uri.path) : uri,
		};
		const edited = remote('/repo/a]b\\c.ts');
		const referenced = remote('/repo/ref.ts');
		const turns = importedTurnsFromChatModel(model([request('edit', response([
			{ kind: 'textEditGroup', uri: edited, edits: [], done: true } as unknown as IChatProgressResponseContent,
			inlineReference(referenced, 'x]y'),
		]))]), { resourceUris });

		const links = turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown
			? [...part.content.matchAll(/\[(?<label>(?:\\.|[^\]\\])*)\]\((?<target>[^)]*)\)/g)].map(match => ({
				label: match.groups!.label,
				// How the restored transcript resolves a link target to a client resource.
				resource: rewriteAgentHostLinkTarget(match.groups!.target, 'box', resourceUris),
			}))
			: []);
		assert.deepStrictEqual(links, [
			{ label: 'a\\]b\\\\c.ts', resource: edited.toString() },
			{ label: 'x\\]y', resource: referenced.toString() },
		]);
	});

	test('reports what the import summarized or left out', () => {
		const stats = createImportedConversationStats();
		const tool = (output: unknown[]) => ({
			kind: 'toolInvocationSerialized', toolId: 'run', toolCallId: 'call', invocationMessage: 'Running', pastTenseMessage: 'Ran',
			resultDetails: { input: '{}', output }, toolSpecificData: undefined,
		}) as unknown as IChatProgressResponseContent;
		const editA = { kind: 'textEditGroup', uri: URI.file('/repo/a.ts'), edits: [], done: true } as unknown as IChatProgressResponseContent;
		importedTurnsFromChatModel(model([
			request('first', response([
				markdown('A'),
				editA,
				{ kind: 'warning', content: new MarkdownString('careful') } as unknown as IChatProgressResponseContent,
				{ kind: 'progressMessage', content: new MarkdownString('working') } as unknown as IChatProgressResponseContent,
				tool([{ type: 'embed', isText: true, value: 'text' }, { type: 'embed', mimeType: 'image/png', value: 'AAEC' }, { type: 'ref', uri: URI.file('/repo/out.bin') }]),
				{
					kind: 'toolInvocationSerialized', toolId: 'screenshot', toolCallId: 'image', invocationMessage: 'Capturing', pastTenseMessage: 'Captured',
					resultDetails: { output: { type: 'data', mimeType: 'image/png', base64Data: 'AAEC' } }, toolSpecificData: undefined,
				} as unknown as IChatProgressResponseContent,
				editA,
			]), { variables: [{ kind: 'file', id: 'f', name: 'a.ts', value: URI.file('/repo/a.ts') }, { kind: 'tool', id: 't', name: 'runTests', value: undefined }] }),
			request('', response([{ kind: 'warning', content: new MarkdownString('again') } as unknown as IChatProgressResponseContent, editA]), { systemInitiated: true }),
			request('second', response([markdown('B'), editA]), { variables: [{ kind: 'toolset', id: 's', name: 'search', value: [] }] }),
		]), { stats });

		assert.deepStrictEqual({ ...stats, skippedResponsePartKinds: [...stats.skippedResponsePartKinds].sort(), skippedAttachmentKinds: [...stats.skippedAttachmentKinds].sort() }, {
			turns: 2,
			// a.ts edited in three runs of the first turn (one in its continuation) counts once, then once more for the second turn.
			editedFiles: 2,
			skippedResponseParts: 3,
			skippedResponsePartKinds: ['progressMessage', 'warning'],
			skippedAttachments: 2,
			skippedAttachmentKinds: ['tool', 'toolset'],
			droppedToolOutputs: 3,
		});
	});

	test('carries latest-call counters and whole-response consumption separately', () => {
		const total = (model: string, inputTokens: number, outputTokens: number) => ({ model, inputTokens, cachedTokens: 0, outputTokens });
		const turns = importedTurnsFromChatModel(model([
			// The latest call wrote 20 tokens; the whole response wrote 250 across two models.
			request('per-model totals', response([markdown('A')], { usage: { promptTokens: 330, completionTokens: 20, copilotCredits: 1.5, modelTotals: [total('gpt-5', 900, 200), total('claude-haiku-5.5', 100, 50)] } })),
			request('tokens only', response([markdown('B')], { usage: { promptTokens: 10, completionTokens: 2 } })),
			request('no usage', response([markdown('C')])),
			request('continued', response([markdown('D')], { usage: { promptTokens: 100, completionTokens: 20, copilotCredits: 0.25, modelTotals: [total('gpt-5', 300, 40)] } })),
			// The continuation ran last, so its latest call is the context the turn ended on.
			request('', response([markdown('E')], { usage: { promptTokens: 330, completionTokens: 5, copilotCredits: 0.5, modelTotals: [total('gpt-5', 200, 10), total('claude-haiku-5.5', 50, 5)] } }), { systemInitiated: true }),
			request('partly reported', response([markdown('F')], { usage: { promptTokens: 40, completionTokens: 4, copilotCredits: 0.1, modelTotals: [total('gpt-5', 40, 4)] } })),
			// No credits or totals reported: the turn's whole-turn figures can no longer be known.
			request('', response([markdown('G')], { usage: { promptTokens: 60, completionTokens: 6 } }), { systemInitiated: true }),
			// The continuation reported nothing: its context is unknown and the turn's totals are incomplete.
			request('silent continuation', response([markdown('H')], { usage: { promptTokens: 70, completionTokens: 7, copilotCredits: 0.2, modelTotals: [total('gpt-5', 70, 7)] } })),
			request('', response([markdown('I')]), { systemInitiated: true }),
			// The turn itself reported nothing: the continuation's totals do not cover the turn.
			request('silent turn', response([markdown('J')])),
			request('', response([markdown('K')], { usage: { promptTokens: 80, completionTokens: 8, copilotCredits: 0.3, modelTotals: [total('gpt-5', 80, 8)] } }), { systemInitiated: true }),
			// A gap in the middle of several continuations keeps the totals incomplete.
			request('gap between continuations', response([markdown('L')], { usage: { promptTokens: 90, completionTokens: 9, copilotCredits: 0.4, modelTotals: [total('gpt-5', 90, 9)] } })),
			request('', response([markdown('M')]), { systemInitiated: true }),
			request('', response([markdown('N')], { usage: { promptTokens: 95, completionTokens: 2, copilotCredits: 0.1, modelTotals: [total('gpt-5', 95, 2)] } }), { systemInitiated: true }),
			// Restored from an older save that kept only the whole-response output total.
			request('older save', response([markdown('O')], { usage: { promptTokens: 300, completionTokens: 250 }, lastCallKnown: false })),
		]));

		assert.deepStrictEqual(turns.map(turn => ({ text: turn.message.text, usage: turn.usage })), [
			{ text: 'per-model totals', usage: { inputTokens: 330, outputTokens: 20, _meta: { copilotUsage: { totalNanoAiu: 1_500_000_000 }, turnTokenTotals: [total('gpt-5', 900, 200), total('claude-haiku-5.5', 100, 50)] } } },
			{ text: 'tokens only', usage: { inputTokens: 10, outputTokens: 2 } },
			{ text: 'no usage', usage: undefined },
			{ text: 'continued', usage: { inputTokens: 330, outputTokens: 5, _meta: { copilotUsage: { totalNanoAiu: 750_000_000 }, turnTokenTotals: [total('gpt-5', 500, 50), total('claude-haiku-5.5', 50, 5)] } } },
			{ text: 'partly reported', usage: { inputTokens: 60, outputTokens: 6 } },
			{ text: 'silent continuation', usage: undefined },
			{ text: 'silent turn', usage: { inputTokens: 80, outputTokens: 8 } },
			{ text: 'gap between continuations', usage: { inputTokens: 95, outputTokens: 2 } },
			{ text: 'older save', usage: { inputTokens: 300 } },
		]);
	});

	test('carries when each request was sent and how long its response took', () => {
		const t0 = Date.parse('2026-01-05T10:00:00Z');
		const turns = importedTurnsFromChatModel(model([
			request('generation time', response([markdown('A')], { completionTimestamp: t0 + 60_000, elapsedMs: 20_000 }), { timestamp: t0 }),
			request('completion only', response([markdown('B')], { completionTimestamp: t0 + 125_000 }), { timestamp: t0 + 120_000 }),
			// A legacy response's completion time is synthesized on restore, so it yields no duration.
			request('legacy', response([markdown('C')]), { timestamp: t0 + 200_000 }),
			request('continued', response([markdown('D')], { completionTimestamp: t0 + 310_000, elapsedMs: 10_000 }), { timestamp: t0 + 300_000 }),
			request('', response([markdown('E')], { completionTimestamp: t0 + 400_000 }), { timestamp: t0 + 390_000, systemInitiated: true }),
			// Two one-second responses an hour apart: the idle hour is not generation time.
			request('idle between', response([markdown('F')], { completionTimestamp: t0 + 501_000, elapsedMs: 1_000 }), { timestamp: t0 + 500_000 }),
			request('', response([markdown('G')], { completionTimestamp: t0 + 4_101_000, elapsedMs: 1_000 }), { timestamp: t0 + 4_100_000, systemInitiated: true }),
			// A continuation without a known generation time leaves the turn's unknown.
			request('unknown continuation', response([markdown('H')], { completionTimestamp: t0 + 5_001_000, elapsedMs: 1_000 }), { timestamp: t0 + 5_000_000 }),
			request('', response([markdown('I')]), { timestamp: t0 + 5_100_000, systemInitiated: true }),
			request('no timestamp', response([markdown('J')], { completionTimestamp: t0 + 6_000_000 })),
		]));

		assert.deepStrictEqual(turns.map(turn => ({ text: turn.message.text, startedAt: turn.startedAt, duration: turn.duration })), [
			{ text: 'generation time', startedAt: '2026-01-05T10:00:00.000Z', duration: 20_000 },
			{ text: 'completion only', startedAt: '2026-01-05T10:02:00.000Z', duration: 5_000 },
			{ text: 'legacy', startedAt: '2026-01-05T10:03:20.000Z', duration: undefined },
			// The folded continuation adds its own generation time.
			{ text: 'continued', startedAt: '2026-01-05T10:05:00.000Z', duration: 20_000 },
			{ text: 'idle between', startedAt: '2026-01-05T10:08:20.000Z', duration: 2_000 },
			{ text: 'unknown continuation', startedAt: '2026-01-05T11:23:20.000Z', duration: undefined },
			{ text: 'no timestamp', startedAt: undefined, duration: undefined },
		]);
	});

	test('carries the custom agent each request was sent with, mapped to the host', () => {
		const hostUris = {
			toAgentHost: (uri: URI) => uri.with({ path: `/host${uri.path}` }),
			fromAgentHost: (uri: URI) => uri,
		};
		const agentFile = URI.file('/repo/.github/agents/reviewer.agent.md');
		const turns = importedTurnsFromChatModel(model([
			request('custom', response([markdown('A')]), { modeInfo: { kind: 'agent', isBuiltin: false, modeInstructions: { uri: agentFile, name: 'reviewer', content: '', toolReferences: [] } } }),
			request('builtin plan', response([markdown('B')]), { modeInfo: { kind: 'agent', isBuiltin: true, modeInstructions: { uri: URI.file('/builtin/plan.agent.md'), name: 'Plan', content: '', toolReferences: [] } } }),
			request('ask', response([markdown('C')]), { modeInfo: { kind: 'ask', isBuiltin: true, modeInstructions: undefined } }),
			request('none', response([markdown('D')])),
		]), { resourceUris: hostUris });

		assert.deepStrictEqual(turns.map(turn => turn.message.agent), [
			{ uri: URI.file('/host/repo/.github/agents/reviewer.agent.md').toString() },
			undefined,
			undefined,
			undefined,
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
