/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatDraft, remapChatDraftResources, reviveChatDraft, serializeChatDraft, UnsupportedChatDraftAttachmentError } from '../../../common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData, isExplicitFileOrImageVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IAgentsWindowDraft, isAgentsWindowDraft } from '../../../../../../platform/window/common/window.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { SymbolKind } from '../../../../../../editor/common/languages.js';

suite('Chat draft handoff serialization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips prompt, URI ranges, pasted context and image bytes without changing the source', () => {
		const attachments: IChatRequestVariableEntry[] = [
			toFileVariableEntry(URI.file('/workspace/file.ts')),
			{ kind: 'symbol', id: 'symbol', name: 'symbol', symbolKind: 11, value: { uri: URI.file('/workspace/symbol.ts'), range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 5 } } },
			toPasteVariableEntry('Pasted code', 'const answer = 42;', { id: 'paste', language: 'typescript' }),
			{ kind: 'image', id: 'image', name: 'Screenshot', value: new Uint8Array([1, 2, 255]), mimeType: 'image/png', isPasted: true },
			{ kind: 'element', id: 'element', name: 'Element', value: '<button>Run</button>', imageData: new Uint8Array([4, 5, 6]), imageMimeType: 'image/png' },
		];
		const original: IChatDraft = { inputText: 'Fix this\nwith "context".', attachments };
		const serialized = serializeChatDraft(original);
		const transferred: IAgentsWindowDraft = JSON.parse(JSON.stringify(serialized));
		const revived = reviveChatDraft(transferred);
		const image = revived.attachments[3].value;
		const element = revived.attachments[4];
		assert.deepStrictEqual({
			valid: isAgentsWindowDraft(transferred),
			roundTrip: serializeChatDraft(revived),
			file: isEqual(IChatRequestVariableEntry.toUri(revived.attachments[0]), URI.file('/workspace/file.ts')),
			symbol: isEqual(IChatRequestVariableEntry.toUri(revived.attachments[1]), URI.file('/workspace/symbol.ts')),
			image: image instanceof Uint8Array ? [...image] : undefined,
			elementImage: element.kind === 'element' && element.imageData instanceof Uint8Array ? [...element.imageData] : undefined,
			sourceImage: attachments[3].value,
			payloadFields: Object.keys(transferred).sort(),
		}, {
			valid: true,
			roundTrip: serialized,
			file: true,
			symbol: true,
			image: [1, 2, 255],
			elementImage: [4, 5, 6],
			sourceImage: new Uint8Array([1, 2, 255]),
			payloadFields: ['attachments', 'inputText'],
		});
	});

	test('remaps the resources of attachments and inline references that the mapper maps, along with their ids, and leaves others as they are', () => {
		const wsl = (path: string) => URI.from({ scheme: 'vscode-agent-host', authority: 'wsl', path: `/file/-/project${path}` });
		const mapResource = (resource: URI) => resource.scheme === 'vscode-agent-host' && resource.authority === 'wsl' ? resource.with({ authority: 'env' }) : undefined;
		const range = new Range(1, 1, 2, 1);
		const file = toFileVariableEntry(wsl('/a.ts'));
		const selection = toFileVariableEntry(wsl('/b.ts'), range);
		const local = toFileVariableEntry(URI.file('/workspace/c.ts'));
		const draft: IChatDraft = {
			inputText: '#a.ts #file:d.ts #file:e.ts',
			attachments: [
				file,
				selection,
				{ kind: 'directory', id: `sessions-additional-folder:${wsl('')}`, name: 'project', value: wsl('') },
				local,
			],
			references: [
				{ id: file.id, range, isFile: true, isAttachmentReference: true, data: undefined },
				{ id: 'vscode.file', range, isFile: true, data: wsl('/d.ts') },
				{ id: 'vscode.file', range, isFile: true, data: URI.file('/workspace/e.ts') },
			],
		};
		const remapped = remapChatDraftResources(draft, mapResource);
		assert.deepStrictEqual({
			inputText: remapped.inputText,
			attachments: remapped.attachments.map(attachment => [attachment.id, IChatRequestVariableEntry.toUri(attachment)?.toString()]),
			references: remapped.references?.map(reference => [reference.id, URI.isUri(reference.data) ? reference.data.toString() : reference.data]),
			unchangedLocal: remapped.attachments[3] === local && remapped.references?.[2] === draft.references?.[2],
			unchangedWithoutMatch: remapChatDraftResources(remapped, mapResource) === remapped,
		}, {
			inputText: draft.inputText,
			attachments: [
				['vscode-agent-host://env/file/-/project/a.ts', 'vscode-agent-host://env/file/-/project/a.ts'],
				[`vscode-agent-host://env/file/-/project/b.ts${range}`, 'vscode-agent-host://env/file/-/project/b.ts'],
				['sessions-additional-folder:vscode-agent-host://env/file/-/project', 'vscode-agent-host://env/file/-/project'],
				[local.id, 'file:///workspace/c.ts'],
			],
			references: [
				['vscode-agent-host://env/file/-/project/a.ts', undefined],
				['vscode.file', 'vscode-agent-host://env/file/-/project/d.ts'],
				['vscode.file', 'file:///workspace/e.ts'],
			],
			unchangedLocal: true,
			unchangedWithoutMatch: true,
		});
	});

	test('remaps the source of an image attachment kept as bytes, along with its id and the mentions of it, and keeps its bytes', () => {
		const wsl = URI.from({ scheme: 'vscode-agent-host', authority: 'wsl', path: '/file/-/project/shot.png' });
		const range = new Range(1, 1, 1, 10);
		const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
		const draft: IChatDraft = {
			inputText: '#shot.png',
			attachments: [{ kind: 'image', id: wsl.toString(), name: 'shot.png', value: bytes, references: [{ kind: 'reference', reference: wsl }] }],
			references: [{ id: wsl.toString(), range, isAttachmentReference: true, data: undefined }],
		};
		const remapped = remapChatDraftResources(draft, resource => resource.authority === 'wsl' ? resource.with({ authority: 'env' }) : undefined);
		const [image] = remapped.attachments;
		assert.deepStrictEqual({
			id: image.id,
			references: image.references?.map(entry => URI.isUri(entry.reference) ? entry.reference.toString() : entry.reference),
			mentions: remapped.references?.map(reference => reference.id),
			keptBytes: image.value === bytes,
		}, {
			id: 'vscode-agent-host://env/file/-/project/shot.png',
			references: ['vscode-agent-host://env/file/-/project/shot.png'],
			mentions: ['vscode-agent-host://env/file/-/project/shot.png'],
			keptBytes: true,
		});
	});

	test('remaps the resources that pasted code, a diagnostic and extension context keep beside their value, along with the ids and mentions derived from them', () => {
		const wsl = (path: string) => URI.from({ scheme: 'vscode-agent-host', authority: 'wsl', path: `/file/-/project${path}` });
		const range = new Range(2, 1, 3, 5);
		const diagnostic = IDiagnosticVariableEntryFilterData.toEntry({ filterUri: wsl('/b.ts'), owner: 'typescript', problemMessage: 'Oops', filterRange: range });
		const draft: IChatDraft = {
			inputText: '#Oops',
			attachments: [
				{ kind: 'paste', id: 'a.ts2315', name: 'a.ts 2 lines', value: 'const a = 1;', code: 'const a = 1;', language: 'typescript', pastedLines: '2 lines', fileName: wsl('/a.ts').toString(), copiedFrom: { uri: wsl('/a.ts'), range }, references: [{ kind: 'reference', reference: wsl('/a.ts') }] },
				diagnostic,
				{ kind: 'string', id: 'context', name: 'Context', value: 'Resolved text', uri: URI.parse('context:/item'), resourceUri: wsl('/c.ts'), handle: 1 },
			],
			references: [{ id: diagnostic.id, range, isAttachmentReference: true, data: undefined }],
		};
		const remapped = remapChatDraftResources(draft, resource => resource.authority === 'wsl' ? resource.with({ authority: 'env' }) : undefined);
		const [pasted, problem, context] = remapped.attachments;
		const toString = (resource: unknown) => URI.isUri(resource) ? resource.toString() : resource;
		assert.deepStrictEqual({
			pasted: pasted.kind === 'paste' && [pasted.id, toString(pasted.copiedFrom?.uri), pasted.copiedFrom?.range, pasted.fileName, pasted.references?.map(entry => toString(entry.reference))],
			problem: problem.kind === 'diagnostic' && [problem.id, toString(problem.filterUri), toString((problem.value as IDiagnosticVariableEntryFilterData).filterUri)],
			context: context.kind === 'string' && [context.id, toString(context.uri), toString(context.resourceUri)],
			mentions: remapped.references?.map(reference => reference.id),
		}, {
			pasted: ['a.ts2315', 'vscode-agent-host://env/file/-/project/a.ts', range, 'vscode-agent-host://env/file/-/project/a.ts', ['vscode-agent-host://env/file/-/project/a.ts']],
			problem: ['vscode-agent-host://env/file/-/project/b.ts:typescript::2:1', 'vscode-agent-host://env/file/-/project/b.ts', 'vscode-agent-host://env/file/-/project/b.ts'],
			context: ['context', 'context:/item', 'vscode-agent-host://env/file/-/project/c.ts'],
			mentions: ['vscode-agent-host://env/file/-/project/b.ts:typescript::2:1'],
		});
	});

	test('snapshots resolved extension context instead of transferring a window-local handle', () => {
		const draft = reviveChatDraft(serializeChatDraft({
			inputText: '',
			attachments: [{ kind: 'string', id: 'context', name: 'Context', value: 'Resolved text', uri: URI.parse('context:/item'), handle: 42 }],
		}));
		assert.deepStrictEqual(draft.attachments.map(attachment => ({
			kind: attachment.kind, name: attachment.name, value: attachment.value,
			hasHandle: Object.hasOwn(attachment, 'handle'),
		})), [{ kind: 'paste', name: 'Context', value: 'Resolved text', hasHandle: false }]);
	});

	test('rejects unresolved extension context instead of silently dropping it', () => {
		const draft: IChatDraft = {
			inputText: 'Retain me',
			attachments: [{ kind: 'string', id: 'context', name: 'Context', value: undefined, uri: URI.parse('context:/item'), handle: 42 }],
		};
		assert.throws(() => serializeChatDraft(draft), UnsupportedChatDraftAttachmentError);
		assert.deepStrictEqual({ text: draft.inputText, count: draft.attachments.length }, { text: 'Retain me', count: 1 });
	});

	test('snapshots untitled documents, selections and symbols without retaining a window-local resource', () => {
		const resource = URI.from({ scheme: Schemas.untitled, path: '/Untitled-1' });
		const model = disposables.add(createTextModel('first line\nselected text\nlast line', 'typescript', undefined, resource));
		const location = { uri: resource, range: new Range(2, 1, 2, 14) };
		const promptRange = { start: 4, endExclusive: 9 };
		const attachments: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'document', name: 'Untitled-1', value: resource },
			{ kind: 'file', id: 'selection', name: 'Untitled-1:2', value: location, range: promptRange, _meta: { context: 'selection' } },
			{ kind: 'implicit', id: 'visible', name: 'Untitled-1', isFile: true, isSelection: false, enabled: true, uri: resource, value: location },
			{ kind: 'implicit', id: 'implicit-selection', name: 'Untitled-1:2', isFile: true, isSelection: true, enabled: true, uri: resource, value: location },
			{ kind: 'symbol', id: 'symbol', name: 'selected', value: location, symbolKind: SymbolKind.Variable },
		];
		const source = { inputText: 'use #file', attachments };
		const transferred = serializeChatDraft(source, uri => isEqual(uri, resource) ? model : null);
		model.setValue('Changed after handoff');
		const restored = reviveChatDraft(transferred);
		assert.deepStrictEqual({
			prompt: restored.inputText,
			attachments: restored.attachments.map(entry => ({
				id: entry.id, kind: entry.kind, text: entry.value, language: entry.kind === 'paste' ? entry.language : undefined,
				resource: IChatRequestVariableEntry.toUri(entry),
			})),
			promptRange: restored.attachments[1].range,
			sendableFileSnapshots: restored.attachments.map(isExplicitFileOrImageVariableEntry),
			metadata: restored.attachments[1]._meta?.context,
			sourceUriKept: isEqual(IChatRequestVariableEntry.toUri(source.attachments[0]), resource),
			sourceTextKept: model.getValue(),
		}, {
			prompt: 'use #file',
			attachments: [
				{ id: 'document', kind: 'paste', text: 'first line\nselected text\nlast line', language: 'typescript', resource: undefined },
				{ id: 'selection', kind: 'paste', text: 'selected text', language: 'typescript', resource: undefined },
				{ id: 'visible', kind: 'paste', text: 'first line\nselected text\nlast line', language: 'typescript', resource: undefined },
				{ id: 'implicit-selection', kind: 'paste', text: 'selected text', language: 'typescript', resource: undefined },
				{ id: 'symbol', kind: 'paste', text: 'selected text', language: 'typescript', resource: undefined },
			],
			promptRange, sendableFileSnapshots: [true, true, false, false, false], metadata: 'selection', sourceUriKept: true, sourceTextKept: 'Changed after handoff',
		});
	});

	test('rejects an untitled attachment whose source text model is unavailable', () => {
		const draft = { inputText: 'Keep the draft', attachments: [toFileVariableEntry(URI.from({ scheme: Schemas.untitled, path: '/Untitled-1' }))] };
		assert.throws(() => serializeChatDraft(draft, () => null), UnsupportedChatDraftAttachmentError);
	});

	test('rejects a window-local image URI instead of pretending it is portable text', () => {
		const resource = URI.from({ scheme: Schemas.untitled, path: '/image' });
		const model = disposables.add(createTextModel('not image bytes', null, undefined, resource));
		const draft: IChatDraft = { inputText: '', attachments: [{ kind: 'image', id: 'image', name: 'Image', value: resource }] };
		assert.throws(() => serializeChatDraft(draft, () => model), UnsupportedChatDraftAttachmentError);
	});

	test('rejects malformed attachment payloads', () => {
		for (const attachments of ['null', '{}', '[{"kind":"file"}]']) {
			assert.throws(() => reviveChatDraft({ inputText: 'Keep the destination', attachments }), /Invalid chat draft attachments/);
		}
	});
});
