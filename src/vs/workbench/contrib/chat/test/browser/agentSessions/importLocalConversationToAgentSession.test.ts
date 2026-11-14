/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString, resolveWithBaseUri } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getTurnError, MessageAttachmentKind, ResponsePartKind, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ResponsePart, type ToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ElicitationState, IChatToolInvocation, ToolConfirmKind, type IChatCodeCitation, type IChatContentReference, type IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { LanguageModelPartAudience, type ILanguageModelsService } from '../../../common/languageModels.js';
import type { IChatProgressResponseContent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { createImportedConversationStats, importedConversationPrimaryFolder, importedTurnsFromChatModel, resolveImportedCopilotModel } from '../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js';
import type { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { completedToolCallToSerialized, rewriteAgentHostLinkTarget } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

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

	function response(parts: IChatProgressResponseContent[], opts?: { canceled?: boolean; error?: { message: string; code?: string }; completionTimestamp?: number; elapsedMs?: number; usage?: { promptTokens: number; completionTokens: number; copilotCredits?: number; modelTotals?: unknown[] }; lastCallKnown?: boolean; references?: IChatContentReference[]; citations?: IChatCodeCitation[] }): IChatResponseModel {
		return {
			entireResponse: { value: parts },
			contentReferences: opts?.references ?? [],
			codeCitations: opts?.citations ?? [],
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

	test('maps the links in response text of a remote window to the host, leaving code and web links alone', () => {
		const remote = (path: string) => URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+box', path });
		const resourceUris = {
			toAgentHost: (uri: URI) => uri.scheme === 'vscode-remote' ? uri.with({ scheme: 'file', authority: '' }) : uri,
			fromAgentHost: (uri: URI) => uri.scheme === 'file' ? remote(uri.path) : uri,
		};
		const turns = importedTurnsFromChatModel(model([request('q', response([
			markdown(`See [b.ts](${remote('/repo/b.ts').toString()} "the file") and \`[c](${remote('/repo/c.ts').toString()})\`, or [docs](https://example.com/docs).`),
			// The label is kept as written, escapes and markup included.
			markdown(`Read [a\\]b *now*](${remote('/repo/a.ts').toString()}) ![shot](${remote('/repo/shot.png').toString()})`),
			// A code span may hold a `]`, and a title literal backslashes and quotes.
			markdown(`Code [\`a]b\`](${remote('/repo/x.ts').toString()} "a\\\\*b \\"q\\"")`),
			// A relative link resolves against the part's base URI, which the imported text does not keep.
			{ kind: 'markdownContent', content: Object.assign(new MarkdownString('Open [d.ts](d.ts)'), { baseUri: remote('/repo/') }) } as IChatProgressResponseContent,
		]))]), { resourceUris });

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind), [
			`See [b.ts](file:///repo/b.ts "the file") and \`[c](${remote('/repo/c.ts').toString()})\`, or [docs](https://example.com/docs).`,
			'Read [a\\]b *now*](file:///repo/a.ts) ![shot](file:///repo/shot.png)',
			'Code [`a]b`](file:///repo/x.ts "a\\\\*b \\"q\\"")',
			'Open [d.ts](file:///repo/d.ts)',
		]);
	});

	test('carries warnings and info messages, and folds multi-file diffs into the edits summary', () => {
		const file = (name: string) => URI.file(`/repo/${name}`);
		const link = (name: string) => `[${name}](${file(name).toString()})`;
		const diff = (resources: object[]) => ({ title: 'Changes', resources });
		const turns = importedTurnsFromChatModel(model([request('q', response([
			markdown('Done.'),
			{ kind: 'warning', content: new MarkdownString('Tests were skipped\non CI') } as IChatProgressResponseContent,
			{ kind: 'info', content: new MarkdownString(`Opened ${link('a.ts')}`) } as IChatProgressResponseContent,
			{ kind: 'textEditGroup', uri: file('a.ts'), edits: [], done: true } as unknown as IChatProgressResponseContent,
			// A saved diff, then a live one; a file is listed by the workspace file it opens (not a virtual
			// `git:` version, which would list a.ts twice), and a deleted file by its original.
			{ kind: 'multiDiffData', multiDiffData: diff([{ modifiedUri: URI.from({ scheme: 'git', path: '/repo/a.ts', query: 'new' }), goToFileUri: file('a.ts') }, { modifiedUri: file('b.ts') }, { originalUri: file('c.ts') }]) } as unknown as IChatProgressResponseContent,
			{ kind: 'multiDiffData', multiDiffData: constObservable(diff([{ goToFileUri: file('d.ts') }])) } as unknown as IChatProgressResponseContent,
		]))]));

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind), [
			'Done.',
			'\n\n> Warning: Tests were skipped\n> on CI\n\n',
			`\n\n> Opened ${link('a.ts')}\n\n`,
			`\n\nEdited ${link('a.ts')}, ${link('b.ts')}, ${link('c.ts')}, ${link('d.ts')}\n\n`,
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
			request('second', response([markdown('B'), editA, { kind: 'multiDiffData', multiDiffData: { title: 'Changes', resources: [{ modifiedUri: URI.from({ scheme: 'git', path: '/repo/a.ts', query: 'new' }), goToFileUri: URI.file('/repo/a.ts') }, { modifiedUri: URI.file('/repo/b.ts') }] } } as unknown as IChatProgressResponseContent]), { variables: [{ kind: 'toolset', id: 's', name: 'search', value: [] }] }),
		]), { stats });

		assert.deepStrictEqual({ ...stats, skippedResponsePartKinds: [...stats.skippedResponsePartKinds].sort(), skippedAttachmentKinds: [...stats.skippedAttachmentKinds].sort() }, {
			turns: 2,
			// a.ts edited in three runs of the first turn (one in its continuation) counts once, then a.ts and the
			// b.ts of a multi-file diff once each for the second turn.
			editedFiles: 3,
			// Warnings are carried; progress messages are not.
			skippedResponseParts: 1,
			skippedResponsePartKinds: ['progressMessage'],
			skippedAttachments: 2,
			skippedAttachmentKinds: ['tool', 'toolset'],
			// Tool outputs that are not text are carried rather than dropped.
			droppedToolOutputs: 0,
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

	test('carries tool outputs that are not text, each call\'s own messages, and how it was let run', () => {
		// Client resources become the host's: here the host sees each file under /host.
		const resourceUris = {
			toAgentHost: (uri: URI) => uri.scheme === 'file' ? uri.with({ path: `/host${uri.path}` }) : uri,
			fromAgentHost: (uri: URI) => uri,
		};
		const call = (toolCallId: string, fields: object) => ({
			kind: 'toolInvocationSerialized', toolId: 'run', toolCallId, invocationMessage: 'Running', pastTenseMessage: 'Ran',
			isComplete: true, toolSpecificData: undefined, ...fields,
		}) as unknown as IChatProgressResponseContent;
		const turns = importedTurnsFromChatModel(model([request('q', response([
			call('outputs', {
				invocationMessage: new MarkdownString('Reading [](file:///repo/a.ts)'),
				// A relative link resolves against the message's base URI, which the imported message does not keep.
				pastTenseMessage: Object.assign(new MarkdownString('Read [a.ts](a.ts)'), { baseUri: URI.file('/repo/') }),
				isConfirmed: { type: ToolConfirmKind.UserAction },
				resultDetails: {
					input: '{}', output: [
						{ type: 'embed', isText: true, value: 'ok' },
						{ type: 'embed', mimeType: 'image/png', value: 'AAEC' },
						{ type: 'ref', uri: URI.file('/repo/out.log'), mimeType: 'text/plain' },
						// Left out: output Local only showed the user, and a resource only Local's MCP connection can read.
						{ type: 'embed', mimeType: 'image/png', value: 'USER', audience: [LanguageModelPartAudience.User] },
						{ type: 'ref', uri: URI.from({ scheme: 'mcp-resource', authority: 'server', path: '/doc' }) },
					]
				},
			}),
			call('data', { isConfirmed: { type: ToolConfirmKind.Setting, id: 'chat.tools.autoApprove' }, resultDetails: { output: { type: 'data', mimeType: 'image/jpeg', base64Data: '/9j/' } } }),
			call('denied', { isConfirmed: { type: ToolConfirmKind.Denied, source: 'hook' } }),
			call('skipped', { isConfirmed: { type: ToolConfirmKind.Skipped, source: 'user' } }),
			// Denied without a recorded source: no one is named.
			call('denied-unattributed', { isConfirmed: false }),
			// Saved before the confirmation was recorded.
			call('unrecorded', { isConfirmed: undefined }),
		]))]), { resourceUris });

		assert.deepStrictEqual(turns[0].responseParts.map(part => {
			if (part.kind !== ResponsePartKind.ToolCall) {
				return part.kind;
			}
			const toolCall = part.toolCall;
			return toolCall.status === ToolCallStatus.Completed
				? { id: toolCall.toolCallId, invocationMessage: toolCall.invocationMessage, pastTenseMessage: toolCall.pastTenseMessage, confirmed: toolCall.confirmed, content: toolCall.content }
				: { id: toolCall.toolCallId, status: toolCall.status, reason: toolCall.status === ToolCallStatus.Cancelled ? toolCall.reason : undefined, reasonMessage: toolCall.status === ToolCallStatus.Cancelled ? toolCall.reasonMessage : undefined };
		}), [
			{
				id: 'outputs',
				invocationMessage: { markdown: 'Reading [](file:///host/repo/a.ts)' },
				pastTenseMessage: { markdown: `Read [a.ts](${resourceUris.toAgentHost(URI.parse(resolveWithBaseUri(URI.file('/repo/'), 'a.ts'))).toString()})` },
				confirmed: ToolCallConfirmationReason.UserAction,
				content: [
					{ type: ToolResultContentType.Text, text: 'ok' },
					{ type: ToolResultContentType.EmbeddedResource, data: 'AAEC', contentType: 'image/png' },
					{ type: ToolResultContentType.Resource, uri: 'file:///host/repo/out.log', contentType: 'text/plain' },
				],
			},
			{
				id: 'data', invocationMessage: 'Running', pastTenseMessage: 'Ran', confirmed: ToolCallConfirmationReason.Setting,
				content: [{ type: ToolResultContentType.EmbeddedResource, data: '/9j/', contentType: 'image/jpeg' }],
			},
			// A call that was denied or skipped never ran; who did so is kept when it was recorded.
			{ id: 'denied', status: ToolCallStatus.Cancelled, reason: ToolCallCancellationReason.Denied, reasonMessage: 'Denied by a hook.' },
			{ id: 'skipped', status: ToolCallStatus.Cancelled, reason: ToolCallCancellationReason.Skipped, reasonMessage: 'Skipped by the user.' },
			{ id: 'denied-unattributed', status: ToolCallStatus.Cancelled, reason: ToolCallCancellationReason.Denied, reasonMessage: undefined },
			{ id: 'unrecorded', invocationMessage: 'Running', pastTenseMessage: 'Ran', confirmed: ToolCallConfirmationReason.NotNeeded, content: undefined },
		]);
	});

	test('a data result with no input still shows its output once restored to the chat', () => {
		const turns = importedTurnsFromChatModel(model([request('q', response([{
			kind: 'toolInvocationSerialized', toolId: 'screenshot', toolCallId: 'data', invocationMessage: 'Capturing', pastTenseMessage: 'Captured',
			isComplete: true, isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded }, toolSpecificData: undefined,
			resultDetails: { output: { type: 'data', mimeType: 'image/png', base64Data: 'AAEC' } },
		} as unknown as IChatProgressResponseContent]))]));
		const toolCall = turns[0].responseParts[0].kind === ResponsePartKind.ToolCall ? turns[0].responseParts[0].toolCall : undefined;
		assert.ok(toolCall?.status === ToolCallStatus.Completed);

		const restored = completedToolCallToSerialized(toolCall, undefined, URI.parse('agent-host-copilot:/session'), 'local');
		assert.deepStrictEqual(restored.resultDetails, {
			input: '{}',
			inputLanguage: 'json',
			output: [{ type: 'embed', value: 'AAEC', mimeType: 'image/png' }],
			isError: false,
			mcpOutput: undefined,
		});
	});

	test('shows the agent\'s questions with their answers, requests for input and confirmations', () => {
		const turns = importedTurnsFromChatModel(model([request('q', response([
			{
				kind: 'questionCarousel', allowSkip: true, isUsed: true,
				questions: [
					// The question itself is its message; its title is only a short header.
					{ id: 'db', type: 'singleSelect', title: 'Database', message: new MarkdownString('Which **database**\nshould we use?'), options: [{ id: 'pg', label: 'PostgreSQL', value: 'pg' }] },
					{ id: 'features', type: 'multiSelect', title: 'Features', options: [{ id: 'auth', label: 'Auth', value: 'auth' }, { id: 'billing', label: 'Billing', value: 'billing' }] },
					{ id: 'name', type: 'text', title: 'Project name' },
				],
				data: { db: { selectedValue: 'pg' }, features: { selectedValues: ['auth', 'billing'], freeformValue: 'Search' } },
			} as unknown as IChatProgressResponseContent,
			{ kind: 'elicitationSerialized', title: 'Allow access to the issue tracker', message: 'Needed to file the bug', subtitle: undefined, source: undefined, state: ElicitationState.Accepted, isHidden: false } as unknown as IChatProgressResponseContent,
			// Answered without a saved answer: by voice, then automatically.
			{ kind: 'questionCarousel', allowSkip: true, isUsed: true, answeredExternally: true, questions: [{ id: 'spoken', type: 'text', title: 'Branch name' }] } as unknown as IChatProgressResponseContent,
			{ kind: 'questionCarousel', allowSkip: true, isUsed: true, answeredExternally: true, autoReply: true, questions: [{ id: 'auto', type: 'text', title: 'Retry' }] } as unknown as IChatProgressResponseContent,
			{ kind: 'elicitationSerialized', title: new MarkdownString('Share *location*'), message: '', subtitle: undefined, source: undefined, state: ElicitationState.Rejected, isHidden: false } as unknown as IChatProgressResponseContent,
			{ kind: 'confirmation', title: 'Run the tests?', message: 'This takes a while.', data: undefined, isUsed: true } as unknown as IChatProgressResponseContent,
		]))]));

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind), [
			'\n\nQuestions:\n- Which database should we use?: PostgreSQL\n- Features: Auth, Billing, Search\n- Project name: Skipped\n\n',
			'\n\nAllow access to the issue tracker: Accepted\n\n',
			'\n\nQuestions:\n- Branch name: Answered outside the chat\n\n',
			'\n\nQuestions:\n- Retry: Answered automatically\n\n',
			'\n\nShare \\*location\\*: Declined\n\n',
			'\n\n**Run the tests?**\n\nThis takes a while.\n\n',
		]);
	});

	test('lists the references a response used first and its code citations last', () => {
		const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 };
		const turns = importedTurnsFromChatModel(model([request('q', response([markdown('Answer')], {
			references: [
				{ kind: 'reference', reference: URI.file('/repo/a.ts') },
				{ kind: 'reference', reference: { uri: URI.file('/repo/b.ts'), range } },
				// Listed once even when referenced again.
				{ kind: 'reference', reference: URI.file('/repo/a.ts') },
				{ kind: 'reference', reference: { variableName: 'codebase' } },
			],
			citations: [{ kind: 'codeCitation', value: URI.parse('https://github.com/owner/repo/blob/main/x.ts'), license: 'MIT', snippet: 'x' }],
		}))]));

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind), [
			`\n\nUsed 3 references: [a.ts](${URI.file('/repo/a.ts').toString()}), [b.ts](${URI.file('/repo/b.ts').toString()}), \\#codebase\n\n`,
			'Answer',
			// A web link is written as-is.
			'\n\nSimilar code found with 1 license type: [x.ts](https://github.com/owner/repo/blob/main/x.ts) (MIT)\n\n',
		]);
	});

	test('continues a conversation in the workspace folder its last terminal command ran in, else the last active one', () => {
		const folders = [URI.file('/a'), URI.file('/b')];
		const workspace = {
			getWorkspaceFolder: (uri: URI) => {
				const folder = folders.find(candidate => uri.path === candidate.path || uri.path.startsWith(`${candidate.path}/`));
				return folder ? { uri: folder } : null;
			},
		} as unknown as Pick<IWorkspaceContextService, 'getWorkspaceFolder'>;
		const terminal = (cwd: URI, fields?: object) => ({
			kind: 'toolInvocationSerialized', toolId: 'run_in_terminal', toolCallId: 'terminal', invocationMessage: 'Running', pastTenseMessage: 'Ran',
			isComplete: true, ...fields, toolSpecificData: { kind: 'terminal', commandLine: { original: 'ls' }, language: 'sh', cwd, ...(fields as { data?: object } | undefined)?.data },
		}) as unknown as IChatProgressResponseContent;
		// A call still in the chat, denied before its command ran.
		const liveDenied = (cwd: URI) => ({
			kind: 'toolInvocation', toolId: 'run_in_terminal', toolCallId: 'live', invocationMessage: 'Running',
			toolSpecificData: { kind: 'terminal', commandLine: { original: 'ls' }, language: 'sh', cwd },
			state: constObservable({ type: IChatToolInvocation.StateKind.Cancelled, reason: ToolConfirmKind.Denied }),
		}) as unknown as IChatProgressResponseContent;
		const choose = (requests: IChatRequestModel[], lastActive?: URI) => importedConversationPrimaryFolder(model(requests), workspace, lastActive)?.path;
		const ranInA = terminal(URI.file('/a'), { isConfirmed: { type: ToolConfirmKind.UserAction }, data: { terminalCommandState: { exitCode: 0 } } });

		assert.deepStrictEqual({
			lastTerminal: choose([request('1', response([terminal(URI.file('/a/src'))])), request('2', response([terminal(URI.file('/b'))]))], URI.file('/a/index.ts')),
			// A directory outside the workspace folders is passed over.
			outsideWorkspace: choose([request('1', response([terminal(URI.file('/a')), terminal(URI.file('/tmp'))]))]),
			// A command denied or skipped before it ran is passed over, whether saved or still in the chat.
			deniedBeforeRunning: choose([request('1', response([ranInA, terminal(URI.file('/b'), { isConfirmed: { type: ToolConfirmKind.Denied, source: 'user' } })]))]),
			skippedBeforeRunning: choose([request('1', response([ranInA, terminal(URI.file('/b'), { isConfirmed: { type: ToolConfirmKind.Skipped } })]))]),
			liveDeniedBeforeRunning: choose([request('1', response([ranInA, liveDenied(URI.file('/b'))]))]),
			// A command whose output was rejected after it ran still counts.
			rejectedAfterRunning: choose([request('1', response([ranInA, terminal(URI.file('/b'), { isConfirmed: { type: ToolConfirmKind.Denied }, data: { terminalCommandOutput: { text: 'out' } } })]))]),
			lastActive: choose([request('1', response([markdown('No terminal')]))], URI.file('/b/src/index.ts')),
			nothing: choose([request('1', response([markdown('No terminal')]))]),
		}, {
			lastTerminal: '/b', outsideWorkspace: '/a',
			deniedBeforeRunning: '/a', skippedBeforeRunning: '/a', liveDeniedBeforeRunning: '/a', rejectedAfterRunning: '/b',
			lastActive: '/b', nothing: undefined,
		});
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
