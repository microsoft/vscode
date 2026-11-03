/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub, useFakeTimers } from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, streamToBuffer, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { hashAsync } from '../../../../../../base/common/hash.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileService, IFileWriteOptions } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IDidEnterWorkspaceEvent, IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { TestContextService, TestLifecycleService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatRequestQueueKind, IChatService, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ChatModel, ISerializableChatData3, parseChatImport } from '../../../common/model/chatModel.js';
import { ChatSessionOperationLog } from '../../../common/model/chatSessionOperationLog.js';
import { ChatBinaryUnavailableError, ChatSessionResources, cloneChatData, exportChatBinaryData, getChatBinaryReference, markStoredChatBinaryResourcesUnavailable, resolveChatBinaryData, retainChatBinaryReferences } from '../../../common/model/chatSessionResources.js';
import { ChatSessionStore, ChatStorageOwner, IChatSessionStore } from '../../../common/model/chatSessionStore.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { CHAT_PROVIDER_ID } from '../../../common/participants/chatParticipantContribTypes.js';
import { MockChatService } from '../chatService/mockChatService.js';
import { createTestChatSessionResourceLocks, createTestChatSessionResources } from './chatSessionResourceLocks.js';
import { IChatSessionResourceLocks } from '../../../common/model/chatSessionResourceLocks.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { ChatWidgetHistoryService } from '../../../common/widget/chatWidgetHistoryService.js';
import { ChatInputStorage } from '../../../common/model/chatInputStorage.js';

async function exportData(value: unknown): Promise<VSBuffer> {
	const exported = exportChatBinaryData(value);
	try {
		return await streamToBuffer(exported.object);
	} finally {
		exported.dispose();
	}
}

class RecordingFileSystemProvider extends InMemoryFileSystemProvider {
	readonly reads: string[] = [];
	readonly writes: string[] = [];
	failWrite: ((uri: URI) => boolean) | undefined;
	failRead: ((uri: URI) => boolean) | undefined;
	beforeRead: ((uri: URI) => Promise<void>) | undefined;
	beforeWrite: ((uri: URI) => Promise<void>) | undefined;

	override get capabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileAtomicWrite;
	}

	override async readFile(uri: URI): Promise<Uint8Array> {
		this.reads.push(uri.path);
		await this.beforeRead?.(uri);
		if (this.failRead?.(uri)) {
			throw new Error('injected read failure');
		}
		return super.readFile(uri);
	}

	override async writeFile(uri: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		await this.beforeWrite?.(uri);
		if (this.failWrite?.(uri)) {
			throw new Error('injected write failure');
		}
		this.writes.push(uri.path);
		return super.writeFile(uri, content, options);
	}
}

suite('ChatSessionResources', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const directory = URI.file('/session.resources');
	const bytes = new Uint8Array([0, 1, 2, 128, 254, 255]);
	const base64 = encodeBase64(VSBuffer.wrap(bytes));
	let files: FileService;
	let provider: RecordingFileSystemProvider;
	let resources: ChatSessionResources;

	setup(() => {
		files = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new RecordingFileSystemProvider());
		disposables.add(files.registerProvider('file', provider));
		resources = disposables.add(createTestChatSessionResources(files));
	});

	test('migration recovers a verified staged blob after its source disappears', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		resources.confirmWrite(directory, prepared.hashes);
		const info = getChatBinaryReference(resources.restore(prepared.value, directory).value)!.descriptor;
		const destination = URI.file('/destination.resources');
		const target = joinPath(destination, info.sha256);
		const temporary = target.with({ path: `${target.path}.tmp` });
		await files.writeFile(temporary, VSBuffer.wrap(bytes));
		await files.del(joinPath(directory, info.sha256));
		assert.deepStrictEqual({
			unavailable: await resources.copyStoredBlob(info, directory, destination),
			bytes: new Uint8Array((await files.readFile(target)).value.buffer),
			temporary: await files.exists(temporary),
		}, { unavailable: undefined, bytes, temporary: false });
	});

	test('unavailable migration markers retain descriptor provenance and other fields', () => {
		const descriptor = { version: 1, sha256: 'a'.repeat(64), size: 3, representation: 'uri', mimeType: 'image/png', sourceUri: 'mcp://server/image', query: 'q=1', fragment: 'fragment', extra: 'preserved' };
		const value = { attachment: { $chatBinary: descriptor }, audience: ['user'] };
		markStoredChatBinaryResourcesUnavailable(value, new Map([[descriptor.sha256, 'missing']]));
		assert.deepStrictEqual(value, { attachment: { $chatBinary: { ...descriptor, unavailable: 'missing' } }, audience: ['user'] });
	});

	test('deduplicates attachment, tool, generated image and metadata bytes without eager reads', async () => {
		const source = {
			draft: { kind: 'image', value: bytes, mimeType: 'image/png' },
			output: { type: 'embed', mimeType: 'image/png', value: base64 },
			singleOutput: { type: 'data', mimeType: 'image/png', base64Data: base64 },
			metadata: { toolCallResults: [{ mimeType: 'image/png', data: base64 }] },
			mcpOutput: { resource: { mimeType: 'image/png', blob: base64 } },
		};
		const prepared = await resources.prepare(source, directory);
		provider.reads.length = 0;
		const restored = resources.restore(prepared.value, directory);
		const readsAtHydration = provider.reads.length;
		const resolved = await resolveChatBinaryData(restored, 'request');
		assert.deepStrictEqual({
			blobs: (await files.resolve(directory)).children?.length,
			hashes: prepared.hashes.size,
			inline: JSON.stringify(prepared.value).includes(base64),
			readsAtHydration,
			resolved,
		}, { blobs: 1, hashes: 1, inline: false, readsAtHydration: 0, resolved: source });
	});

	test('metadata size depends on references rather than payload size', async () => {
		const small = await resources.prepare({ value: new Uint8Array(32) }, directory);
		const large = await resources.prepare({ value: new Uint8Array(4096) }, directory);
		assert.ok(Math.abs(JSON.stringify(small.value).length - JSON.stringify(large.value).length) <= 4);
	});

	test('repeated unchanged preparation writes no further bytes', async () => {
		const value = { value: bytes, metadata: { mimeType: 'image/png', data: base64 } };
		const first = await resources.prepare(value, directory);
		resources.confirmWrite(directory, first.hashes);
		provider.writes.length = 0;
		for (let save = 0; save < 10; save++) {
			assert.deepStrictEqual((await resources.prepare(value, directory)).value, first.value);
		}
		assert.deepStrictEqual(provider.writes, []);
	});

	test('missing and corrupt blobs fail explicitly and cancellation does not delete content', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		const reference = getChatBinaryReference(resources.restore(prepared.value, directory).value)!;
		const cts = disposables.add(new CancellationTokenSource());
		cts.cancel();
		await assert.rejects(reference.read(cts.token), /Cancel/);
		assert.deepStrictEqual(new Uint8Array((await reference.read()).buffer), bytes);
		const blob = joinPath(directory, [...prepared.hashes][0]);
		await files.writeFile(blob, VSBuffer.wrap(new Uint8Array(bytes.length)));
		await assert.rejects(reference.read(), /corrupt/);
		await files.del(blob);
		await assert.rejects(reference.read());
	});

	test('fork leases survive deletion and persisted forks own independent copies', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		resources.confirmWrite(directory, prepared.hashes);
		const original = resources.restore(prepared.value, directory);
		const fork = cloneChatData(original);
		const lease = disposables.add(retainChatBinaryReferences(fork));
		await resources.delete(directory);
		const reference = getChatBinaryReference(fork.value)!;
		assert.deepStrictEqual(new Uint8Array((await reference.read()).buffer), bytes);
		const forkDirectory = URI.file('/fork.resources');
		const savedFork = await resources.prepare(fork, forkDirectory);
		resources.confirmWrite(forkDirectory, savedFork.hashes);
		lease.dispose();
		await resources.delete(directory);
		const reopened = resources.restore(savedFork.value, forkDirectory);
		assert.deepStrictEqual({
			sourceExists: await files.exists(directory),
			bytes: new Uint8Array((await getChatBinaryReference(reopened.value)!.read()).buffer),
		}, { sourceExists: false, bytes });
	});

	test('collection retains live undo/draft references, then reclaims them', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		resources.confirmWrite(directory, prepared.hashes);
		const restored = resources.restore(prepared.value, directory);
		const lease = disposables.add(retainChatBinaryReferences(restored));
		await resources.collect(directory, new Set());
		assert.deepStrictEqual(new Uint8Array((await getChatBinaryReference(restored.value)!.read()).buffer), bytes);
		lease.dispose();
		await resources.collect(directory, new Set());
		assert.strictEqual(await files.exists(directory), false);
	});

	test('keeps source file and URL references without copying or reading them', async () => {
		const value = { references: [URI.file('/excluded/secret.png'), URI.parse('https://example.com/image.png')] };
		const prepared = await resources.prepare(value, directory);
		assert.deepStrictEqual({
			prepared: prepared.value,
			resolved: await resolveChatBinaryData(value, 'request'),
			reads: provider.reads,
			writes: provider.writes,
		}, {
			prepared: { references: value.references.map(uri => uri.toJSON()) },
			resolved: value,
			reads: [],
			writes: [],
		});
	});

	test('portable streaming export preserves data URLs and binary bytes', async () => {
		const source = {
			draft: { value: bytes },
			markdown: { value: `![screenshot](data:image/png;base64,${base64})` },
			uri: URI.parse(`data:image/png;base64,${base64}`).with({ query: 'q=1', fragment: 'fragment' }),
		};
		const prepared = await resources.prepare(source, directory);
		const restored = resources.restore(prepared.value, directory);
		assert.strictEqual(JSON.stringify(prepared.value).includes(base64), false);
		const exported = JSON.parse((await exportData(restored)).toString());
		assert.deepStrictEqual(exported, {
			draft: { value: { $base64: base64 } },
			markdown: source.markdown,
			uri: source.uri.toJSON(),
		});
	});

	test('preserves literal code, prompts, tool inputs and stale capability-looking text', async () => {
		const image = `data:image/png;base64,${base64}`;
		const literal = 'vscode-chat-binary:/00000000-0000-0000-0000-000000000000.png';
		const source = {
			message: `explain ${image} and ${literal}`,
			input: `echo '${image}'`,
			markdown: { value: `\`${image}\`\n\n\`\`\`sh\nprintf '${image}'\n\`\`\`\n\n![actual](${image})` },
		};
		const prepared = await resources.prepare(source, directory);
		const restored = resources.restore(prepared.value, directory);
		assert.deepStrictEqual({
			message: restored.message,
			input: restored.input,
			exported: JSON.parse((await exportData(restored)).toString()),
			request: await resolveChatBinaryData(restored, 'request'),
		}, { message: source.message, input: source.input, exported: source, request: source });
		const imported = parseChatImport(JSON.stringify({ responderUsername: 'test', requests: [{ message: literal, variableData: { variables: [] } }] }));
		assert.strictEqual(imported.requests[0].message, literal);
	});

	test('bounds extension Markdown URI-map keys and preserves semantic source URIs', async () => {
		const image = `data:image/png;base64,${base64}`;
		const originalUri = URI.parse('mcp-resource://server/result.png');
		const source = {
			response: [{ value: `![actual](${image})`, uris: { [image]: URI.parse(image) } }],
			output: { type: 'embed', mimeType: 'image/png', uri: originalUri, asResource: true, audience: [1], value: base64 },
		};
		const prepared = await resources.prepare(source, directory);
		const restored = resources.restore(prepared.value, directory);
		const portable = JSON.parse((await exportData(restored)).toString());
		assert.deepStrictEqual({
			inline: JSON.stringify(prepared.value).includes(base64),
			markdown: portable.response,
			output: { ...portable.output, uri: URI.revive(portable.output.uri).toString() },
		}, {
			inline: false,
			markdown: [{ value: source.response[0].value, uris: {} }],
			output: { ...source.output, uri: originalUri.toString() },
		});
	});

	test('repairs an interrupted blob write using valid available bytes', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		resources.confirmWrite(directory, prepared.hashes);
		await files.writeFile(joinPath(directory, [...prepared.hashes][0]), VSBuffer.fromString('partial'));
		const repaired = await resources.prepare({ value: bytes }, directory);
		assert.deepStrictEqual(await resolveChatBinaryData(resources.restore(repaired.value, directory), 'request'), { value: bytes });
	});

	test('MCP results become structured-cloneable payloads at delivery', async () => {
		const source = { content: [{ type: 'image', data: base64, mimeType: 'image/png' }], isError: false };
		const prepared = await resources.prepare(source, directory);
		const restored = resources.restore(prepared.value, directory);
		assert.deepStrictEqual(structuredClone(await resolveChatBinaryData(restored, 'request')), source);
	});

	test('imported drafts cannot install permissions, model choices or file references', () => {
		const imported = parseChatImport(JSON.stringify({
			responderUsername: 'test', requests: [],
			inputState: {
				inputText: 'keep my draft', permissionLevel: 'autopilot', mode: { id: 'foreign', kind: 'agent' },
				selectedModel: { identifier: 'foreign' }, contrib: { remoteCommand: 'execute' },
				attachments: [
					{ kind: 'file', id: 'secret', name: 'secret', value: URI.file('/secret') },
					{ kind: 'image', id: 'original', name: 'image.png', mimeType: 'image/png', value: { $base64: base64 }, references: [{ reference: URI.file('/secret') }], _meta: { permission: 'allow' } },
				],
			},
		}));
		const state = imported.inputState!;
		assert.deepStrictEqual({
			text: state.inputText, permission: state.permissionLevel, mode: state.mode, selectedModel: state.selectedModel,
			contrib: state.contrib, attachments: state.attachments.map(({ id, ...rest }) => ({ newIdentity: id !== 'original', ...rest })),
		}, {
			text: 'keep my draft', permission: undefined, mode: { id: 'agent', kind: 'agent' }, selectedModel: undefined,
			contrib: {}, attachments: [{ newIdentity: true, kind: 'image', name: 'image.png', mimeType: 'image/png', value: { $base64: base64 }, isPasted: true }],
		});
	});

	test('rejects forged descriptors and path traversal', async () => {
		await assert.rejects(resources.prepare({ $chatBinary: {} }, directory), /Untrusted/);
		assert.throws(() => resources.restore({ $chatBinary: { version: 1, sha256: '../secret', size: 1, representation: 'bytes' } }, directory), /Invalid/);
		assert.throws(() => parseChatImport(JSON.stringify({
			responderUsername: 'test', requests: [], inputState: { attachments: [{ value: { $chatBinary: {} } }] },
		})), /portable/);
	});

	test('preserves non-binary data and own prototype-named properties', async () => {
		const source = JSON.parse('{"__proto__":{"safe":true},"mimeType":"text/plain","data":"ordinary text, not base64"}');
		const prepared = await resources.prepare(source, directory);
		assert.deepStrictEqual(await resolveChatBinaryData(resources.restore(prepared.value, directory), 'export'), source);
	});

	test('supports JSON hooks returning their receiver without recursive serialization', async () => {
		const source = { value: bytes, toJSON() { return this; } };
		const cloned = cloneChatData(source);
		const prepared = await resources.prepare(source, directory);
		const resolved = await resolveChatBinaryData(resources.restore(prepared.value, directory), 'request');
		assert.deepStrictEqual({
			cloned: { value: cloned.value, hasHook: Object.hasOwn(cloned, 'toJSON') },
			resolved,
			exported: JSON.parse((await exportData(source)).toString()),
		}, { cloned: { value: bytes, hasHook: false }, resolved: { value: bytes }, exported: { value: Object.fromEntries([...bytes].map((value, index) => [index, value])) } });
	});

	test('streaming export reports a missing resource instead of producing empty bytes', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		const restored = resources.restore(prepared.value, directory);
		await files.del(joinPath(directory, [...prepared.hashes][0]));
		await assert.rejects(exportData(restored));
	});

	test('disposing an unconsumed export releases its resource leases', async () => {
		const prepared = await resources.prepare({ value: bytes }, directory);
		resources.confirmWrite(directory, prepared.hashes);
		const restored = resources.restore(prepared.value, directory);
		const exported = disposables.add(exportChatBinaryData(Array.from({ length: 30 }, () => restored)));
		await resources.delete(directory);
		exported.dispose();
		await resources.delete(directory);
		assert.strictEqual(await files.exists(directory), false);
	});

	test('streams binary-heavy Markdown in bounded chunks without joining the expanded string', async () => {
		const data = encodeBase64(VSBuffer.wrap(new Uint8Array(512 * 1024)));
		const source = { value: `![one](data:image/png;base64,${data})\n![two](data:image/png;base64,${data})` };
		const prepared = await resources.prepare(source, directory);
		const exported = disposables.add(exportChatBinaryData(resources.restore(prepared.value, directory)));
		const chunks: VSBuffer[] = [];
		await new Promise<void>((resolve, reject) => {
			exported.object.on('error', reject);
			exported.object.on('end', resolve);
			exported.object.on('data', chunk => chunks.push(chunk));
		});
		assert.deepStrictEqual({
			value: JSON.parse(VSBuffer.concat(chunks).toString()),
			boundedChunks: chunks.every(chunk => chunk.byteLength <= 64 * 1024),
		}, { value: source, boundedChunks: true });
	});
});

suite('ChatSessionStore binary lifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const data = encodeBase64(VSBuffer.wrap(new Uint8Array([11, 12, 13, 14])));
	let instantiation: TestInstantiationService;
	let files: FileService;
	let provider: RecordingFileSystemProvider;
	let config: TestConfigurationService;
	let sessions: ChatSessionStore;
	teardown(() => restore());

	async function readSession(sessionId: string, store = sessions) {
		const result = await store.readSession(sessionId);
		if (result?.resources) {
			disposables.add(result.resources);
		}
		return result;
	}

	function fixture(id = 'binary-session'): ISerializableChatData3 {
		const attachment = { kind: 'image' as const, id: 'screenshot', name: 'screenshot.png', mimeType: 'image/png', value: { $base64: data } };
		return {
			version: 3, sessionId: id, responderUsername: 'test', initialLocation: ChatAgentLocation.Chat, creationDate: 1, customTitle: undefined,
			inputState: { inputText: 'draft', mode: { id: 'agent', kind: ChatModeKind.Agent }, attachments: [attachment], selections: [], selectedModel: undefined, contrib: {} },
			requests: [{
				message: 'image', requestId: 'request', variableData: { variables: [attachment] },
				response: [{
					kind: 'toolInvocationSerialized', toolId: 'view_image', toolCallId: 'tool', invocationMessage: 'Image',
					presentation: undefined, source: undefined, originMessage: undefined, pastTenseMessage: undefined, isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					toolSpecificData: { kind: 'generatedImage' },
					resultDetails: { input: '{}', output: [{ type: 'embed', mimeType: 'image/png', value: data }] },
				}],
				result: { metadata: { content: [{ mimeType: 'image/png', data }] } },
			}],
		};
	}

	function model(value = fixture()): ChatModel {
		return disposables.add(instantiation.createInstance(ChatModel, { value, serializer: new ChatSessionOperationLog() }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
	}

	function createWorkspaceMigration() {
		const previous = instantiation.get(IWorkspaceContextService).getWorkspace();
		const transitions = disposables.add(new Emitter<IDidEnterWorkspaceEvent>());
		instantiation.stub(IWorkspaceEditingService, { onDidEnterWorkspace: transitions.event });
		const source = disposables.add(instantiation.createInstance(ChatSessionStore));
		return {
			source,
			async enter() {
				const target = new Workspace('migration-target', [toWorkspaceFolder(URI.file('/target'))]);
				instantiation.stub(IWorkspaceContextService, new TestContextService(target));
				const migrations: Promise<void>[] = [];
				transitions.fire({ oldWorkspace: { id: previous.id, uri: previous.folders[0].uri }, newWorkspace: { id: target.id, uri: target.folders[0].uri }, join: promise => migrations.push(promise) });
				await Promise.all(migrations);
			},
			reopen() {
				const reopened = disposables.add(instantiation.createInstance(ChatSessionStore));
				instantiation.stub(IChatSessionStore, reopened);
				return reopened;
			},
		};
	}

	async function damageBlob(resource: URI, reason: 'missing' | 'corrupt'): Promise<void> {
		if (reason === 'missing') {
			await files.del(resource);
		} else {
			await files.writeFile(resource, VSBuffer.wrap(new Uint8Array(3).fill(99)));
		}
	}

	setup(() => {
		instantiation = disposables.add(new TestInstantiationService());
		files = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new RecordingFileSystemProvider());
		disposables.add(files.registerProvider('file', provider));
		instantiation.stub(IFileService, files);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiation.stub(IEnvironmentService, { workspaceStorageHome: URI.file('/workspaces') });
		instantiation.stub(IWorkspaceContextService, new TestContextService());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
		instantiation.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile('default', 'Default', URI.file('/userdata'), URI.file('/cache')) });
		config = new TestConfigurationService();
		instantiation.stub(IConfigurationService, config);
		instantiation.stub(IWorkspaceEditingService, { onDidEnterWorkspace: Event.None });
		instantiation.stub(IChatAgentService, { getDefaultAgent: () => undefined });
		instantiation.stub(IChatService, new MockChatService());
		instantiation.stub(IChatSessionResourceLocks, createTestChatSessionResourceLocks());
		sessions = disposables.add(instantiation.createInstance(ChatSessionStore));
		instantiation.stub(IChatSessionStore, sessions);
	});

	test('new saves write blobs before metadata and reopen without binary reads', async () => {
		const source = model();
		await sessions.storeSessions([source]);
		const initialWrites = [...provider.writes];
		provider.writes.length = 0;
		await sessions.storeSessions([source]);
		assert.deepStrictEqual(provider.writes, []);
		provider.reads.length = 0;
		const loaded = await readSession(source.sessionId);
		assert.ok(loaded);
		const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const lazyReads = provider.reads.filter(path => path.includes('.resources/'));
		const exported = JSON.parse((await exportData(restored.toExport())).toString());
		assert.deepStrictEqual({
			blobBeforeMetadata: initialWrites.findIndex(path => path.includes('.resources/')) < initialWrites.findIndex(path => path.endsWith('.jsonl')),
			lazyReads,
			request: exported.requests[0].variableData.variables[0].value,
			draft: exported.inputState.attachments[0].value,
			tool: exported.requests[0].response[0].resultDetails.output[0].value,
		}, { blobBeforeMetadata: true, lazyReads: [], request: { $base64: data }, draft: { $base64: data }, tool: data });
	});

	test('input history deduplicates all forty image copies and collects them on clear', async () => {
		const clock = useFakeTimers();
		const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await history.whenReady;
		const image = new Uint8Array(32 * 1024).fill(42);
		for (let i = 0; i < 40; i++) {
			history.append(ChatAgentLocation.Chat, {
				inputText: `describe ${i}`, attachments: [{ kind: 'image', id: 'image', name: 'image.png', value: image, isPasted: true }],
				contrib: {}, mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [],
			});
		}
		await history.save();
		const inputRoot = joinPath(sessions.getChatStorageFolder(), '.input');
		const metadata = (await files.readFile(joinPath(inputRoot, 'inputHistory.json'))).value;
		const blobs = (await files.resolve(joinPath(inputRoot, 'inputHistory.resources'))).children!;
		const reopened = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await reopened.whenReady;
		const restored = await resolveChatBinaryData(reopened.getHistory(ChatAgentLocation.Chat)[0], 'request');
		assert.ok(restored.attachments[0].value instanceof Uint8Array);
		assert.deepStrictEqual({
			entries: reopened.getHistory(ChatAgentLocation.Chat).length,
			blobCount: blobs.length,
			boundedMetadata: metadata.byteLength < image.byteLength,
			imageBytes: restored.attachments[0].value.byteLength,
			inlineCopies: metadata.toString().includes('$base64'),
		}, { entries: 40, blobCount: 1, boundedMetadata: true, imageBytes: image.byteLength, inlineCopies: false });
		reopened.dispose();
		history.clearHistory();
		await history.save();
		await clock.tickAsync(5000);
		assert.strictEqual(await files.exists(joinPath(inputRoot, 'inputHistory.resources')), false);
	});

	test('owned empty drafts survive source deletion and do not overwrite newer edits on load', async () => {
		await sessions.storeSessions([model()]);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		const attachments = loaded.value.inputState!.attachments;
		const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.EmptyDraftAttachments>, ChatStorageOwner.EmptyDraftAttachments, [], () => { }));
		await cache.whenReady;
		cache.set(attachments);
		await cache.save();
		loaded.resources!.dispose();
		await sessions.deleteSession('binary-session');
		const reopened = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.EmptyDraftAttachments>, ChatStorageOwner.EmptyDraftAttachments, [], () => { }));
		await reopened.whenReady;
		assert.deepStrictEqual((await resolveChatBinaryData(reopened.value, 'export'))[0].value, { $base64: data });
		const edited = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.EmptyDraftAttachments>, ChatStorageOwner.EmptyDraftAttachments, [], () => { }));
		edited.set([{ kind: 'image', id: 'new', name: 'new.png', value: new Uint8Array([99]) }]);
		await edited.whenReady;
		await edited.save();
		assert.strictEqual(edited.value[0].id, 'new');
	});

	test('a late composer flush cannot retain resources on a disposed input model', async () => {
		await sessions.storeSessions([model()]);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		const closed = model({ ...fixture('closed-input'), requests: [], inputState: undefined });
		closed.dispose();
		closed.inputModel.setState({ attachments: loaded.value.inputState!.attachments });
		loaded.resources!.dispose();
		await sessions.deleteSession('binary-session');
		assert.strictEqual(await files.exists(joinPath(sessions.getChatStorageFolder(), 'binary-session.resources')), false);
	});

	test('unchanged owned drafts compare normalized fields and binary identities without writes', async () => {
		const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.NewSessionDraft>, ChatStorageOwner.NewSessionDraft, { inputText: '', attachments: [] }, () => { }));
		await cache.whenReady;
		const draft = { inputText: 'keep', attachments: [{ kind: 'image' as const, id: 'image', name: 'image.png', value: new Uint8Array(64 * 1024).fill(42) }], references: undefined };
		cache.set(draft);
		await cache.save();
		provider.writes.length = 0;
		for (let i = 0; i < 10; i++) {
			cache.set({ ...draft, attachments: [...draft.attachments] });
			await cache.save();
		}
		cache.set({ ...cache.value, references: undefined });
		await cache.save();
		assert.deepStrictEqual(provider.writes, []);
	});

	test('ordinary data: code bypasses binary preparation on normal session saves', async () => {
		const prepare = stub(ChatSessionResources.prototype, 'prepare').callThrough();
		const value = fixture();
		const markdown = '```typescript\nfunction parse(data: string) { return { data: JSON.parse(data) }; }\n```';
		value.inputState = undefined;
		value.requests = [{ requestId: 'code', message: 'code', variableData: { variables: [] }, response: [{ value: markdown }] }];
		const source = model(value);
		for (let i = 0; i < 3; i++) {
			await sessions.storeSessions([source]);
		}
		const restored = await readSession(source.sessionId);
		assert.ok(restored);
		assert.deepStrictEqual({ preparations: prepare.callCount, response: restored.value.requests[0].response }, { preparations: 0, response: [{ value: markdown }] });
	});

	for (const failure of ['corrupt', 'invalid-shape', 'null', 'transient'] as const) {
		test(`owned drafts recover from a ${failure} initial read without overwriting unread state`, async () => {
			const clock = useFakeTimers();
			const errors = stub(instantiation.get(ILogService), 'error');
			const original = { inputText: 'stored', attachments: [{ kind: 'image' as const, id: 'original', name: 'original.png', value: new Uint8Array([1, 2, 3]) }] };
			disposables.add(await sessions.writeOwnedData(ChatStorageOwner.NewSessionDraft, original));
			const metadata = joinPath(sessions.getChatStorageFolder(), '.input', 'newSessionDraft.json');
			if (failure === 'corrupt') {
				await files.writeFile(metadata, VSBuffer.fromString('{'));
			} else if (failure === 'invalid-shape' || failure === 'null') {
				await files.writeFile(metadata, VSBuffer.fromString(JSON.stringify({ version: 1, value: failure === 'null' ? null : { inputText: 'stored', attachments: {} } })));
			} else {
				let failed = false;
				provider.failRead = uri => uri.path === metadata.path && !failed && (failed = true);
			}
			provider.writes.length = 0;
			const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.NewSessionDraft>, ChatStorageOwner.NewSessionDraft, { inputText: '', attachments: [] }, () => { }));
			await cache.whenReady;
			assert.deepStrictEqual({ ready: cache.isReady, writes: provider.writes, reported: errors.called }, { ready: false, writes: [], reported: true });
			if (failure === 'transient') {
				await clock.tickAsync(200);
				assert.strictEqual(cache.isReady, true);
				assert.deepStrictEqual(await resolveChatBinaryData(cache.value, 'request'), original);
			}
			const edited = { inputText: 'edited', attachments: [{ kind: 'image' as const, id: 'edited', name: 'edited.png', value: new Uint8Array([4, 5, 6]) }] };
			cache.set(edited);
			await cache.save();
			const restored = await sessions.readOwnedData(ChatStorageOwner.NewSessionDraft);
			assert.ok(restored);
			disposables.add(restored);
			assert.deepStrictEqual({ ready: cache.isReady, value: await resolveChatBinaryData(restored.object, 'request') }, { ready: true, value: edited });
		});

		test(`input history recovers from a ${failure} initial read and retains new entries`, async () => {
			useFakeTimers();
			const errors = stub(instantiation.get(ILogService), 'error');
			const original = { inputText: 'stored', attachments: [], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [], contrib: {} };
			disposables.add(await sessions.writeOwnedData(ChatStorageOwner.InputHistory, { history: { [CHAT_PROVIDER_ID]: [original] } }));
			const metadata = joinPath(sessions.getChatStorageFolder(), '.input', 'inputHistory.json');
			if (failure === 'corrupt') {
				await files.writeFile(metadata, VSBuffer.fromString('{'));
			} else if (failure === 'invalid-shape' || failure === 'null') {
				await files.writeFile(metadata, VSBuffer.fromString(JSON.stringify({ version: 1, value: failure === 'null' ? null : { history: { [CHAT_PROVIDER_ID]: [null] } } })));
			} else {
				let failed = false;
				provider.failRead = uri => uri.path === metadata.path && !failed && (failed = true);
			}
			provider.writes.length = 0;
			const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
			await history.whenReady;
			assert.deepStrictEqual({ writes: provider.writes, reported: errors.called }, { writes: [], reported: true });
			history.append(ChatAgentLocation.Chat, { ...original, inputText: 'new' });
			await history.save();
			const reopened = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
			await reopened.whenReady;
			assert.deepStrictEqual(reopened.getHistory(ChatAgentLocation.Chat).map(entry => entry.inputText), failure === 'transient' ? ['stored', 'new'] : ['new']);
		});
	}

	test('unread owned drafts stay unready, retry with backoff and stop retrying on disposal', async () => {
		const clock = useFakeTimers();
		const errors = stub(instantiation.get(ILogService), 'error');
		disposables.add(await sessions.writeOwnedData(ChatStorageOwner.NewSessionDraft, { inputText: 'saved', attachments: [] }));
		provider.failRead = uri => uri.path.endsWith('/newSessionDraft.json');
		provider.writes.length = 0;
		const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.NewSessionDraft>, ChatStorageOwner.NewSessionDraft, { inputText: '', attachments: [] }, () => { }));
		await cache.whenReady;
		await clock.tickAsync(30000);
		assert.deepStrictEqual({ ready: cache.isReady, attempts: errors.callCount, writes: provider.writes }, { ready: false, attempts: 8, writes: [] });
		cache.dispose();
		await clock.tickAsync(60000);
		assert.strictEqual(errors.callCount, 8);
	});

	test('repeated history read failures preserve saved entries and image blobs until mutations can merge', async () => {
		useFakeTimers();
		const original = { inputText: 'old with image', attachments: [{ kind: 'image' as const, id: 'old', name: 'old.png', value: new Uint8Array([1, 2, 3]) }], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [], contrib: {} };
		const initial = disposables.add(await sessions.writeOwnedData(ChatStorageOwner.InputHistory, { history: { [CHAT_PROVIDER_ID]: [original, { ...original, inputText: 'old text', attachments: [] }] } }));
		initial.dispose();
		const root = joinPath(sessions.getChatStorageFolder(), '.input');
		const metadata = joinPath(root, 'inputHistory.json');
		const before = (await files.readFile(metadata)).value.toString();
		let failures = 2;
		provider.failRead = uri => uri.path === metadata.path && failures-- > 0;
		provider.writes.length = 0;
		const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await history.whenReady;
		history.append(ChatAgentLocation.Chat, { ...original, inputText: 'new message', attachments: [] });
		await assert.rejects(history.save(), /injected read failure/);
		assert.deepStrictEqual({
			metadata: (await files.readFile(metadata)).value.toString(),
			blobs: (await files.resolve(joinPath(root, 'inputHistory.resources'))).children?.length,
			writes: provider.writes,
		}, { metadata: before, blobs: 1, writes: [] });
		await history.save();
		const reopened = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await reopened.whenReady;
		assert.deepStrictEqual({
			messages: reopened.getHistory(ChatAgentLocation.Chat).map(entry => entry.inputText),
			image: (await resolveChatBinaryData(reopened.getHistory(ChatAgentLocation.Chat)[0], 'request')).attachments[0].value,
		}, { messages: ['old with image', 'old text', 'new message'], image: original.attachments[0].value });
	});

	test('unsupported history versions are not treated as corrupt data that an append can replace', async () => {
		useFakeTimers();
		const entry = { inputText: 'old', attachments: [], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [], contrib: {} };
		const metadata = joinPath(sessions.getChatStorageFolder(), '.input', 'inputHistory.json');
		const future = JSON.stringify({ version: 2, value: { history: { [CHAT_PROVIDER_ID]: [entry] } } });
		await files.writeFile(metadata, VSBuffer.fromString(future));
		const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await history.whenReady;
		history.append(ChatAgentLocation.Chat, { ...entry, inputText: 'new' });
		await assert.rejects(history.save(), /Unsupported owned chat input version/);
		assert.strictEqual((await files.readFile(metadata)).value.toString(), future);
		history.clearHistory();
		await history.save();
		assert.deepStrictEqual(JSON.parse((await files.readFile(metadata)).value.toString()).value, { history: {} });
	});

	test('history moves made during an unreadable load are replayed after recovery', async () => {
		useFakeTimers();
		const entry = { inputText: 'old', attachments: [], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [], contrib: {} };
		disposables.add(await sessions.writeOwnedData(ChatStorageOwner.InputHistory, { history: { [`${CHAT_PROVIDER_ID}:source`]: [entry] } }));
		let failures = 2;
		provider.failRead = uri => uri.path.endsWith('/inputHistory.json') && failures-- > 0;
		const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
		await history.whenReady;
		history.moveHistory(ChatAgentLocation.Chat, 'source', 'target');
		await assert.rejects(history.save(), /injected read failure/);
		await history.save();
		assert.deepStrictEqual({
			source: history.getHistory(ChatAgentLocation.Chat, 'source').map(entry => entry.inputText),
			target: history.getHistory(ChatAgentLocation.Chat, 'target').map(entry => entry.inputText),
		}, { source: [], target: ['old'] });
	});

	test('a draft save admitted before initial hydration survives composer disposal', async () => {
		disposables.add(await sessions.writeOwnedData(ChatStorageOwner.NewSessionDraft, { inputText: 'old', attachments: [] }));
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		provider.beforeRead = async uri => {
			if (uri.path.endsWith('/newSessionDraft.json')) {
				await entered.complete();
				await release.p;
			}
		};
		const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.NewSessionDraft>, ChatStorageOwner.NewSessionDraft, { inputText: '', attachments: [] }, () => { }));
		await entered.p;
		const edited = { inputText: 'new', attachments: [{ kind: 'image' as const, id: 'new', name: 'new.png', value: new Uint8Array([5, 6, 7]) }] };
		cache.set(edited);
		const saving = cache.save();
		cache.dispose();
		cache.set({ inputText: 'ignored late update', attachments: [] });
		await release.complete();
		await saving;
		provider.beforeRead = undefined;
		const stored = await sessions.readOwnedData(ChatStorageOwner.NewSessionDraft);
		assert.ok(stored);
		disposables.add(stored);
		assert.deepStrictEqual(await resolveChatBinaryData(stored.object, 'request'), edited);
	});

	test('workspace migration merges blobs without deleting a leased destination version', async () => {
		const clock = useFakeTimers();
		const workspace = instantiation.get(IWorkspaceContextService).getWorkspace();
		const transitions = disposables.add(new Emitter<IDidEnterWorkspaceEvent>());
		instantiation.stub(IWorkspaceEditingService, { onDidEnterWorkspace: transitions.event });
		const destination = disposables.add(instantiation.createInstance(ChatSessionStore));
		const original = model();
		await destination.storeSessions([original]);
		const held = await readSession(original.sessionId, destination);
		assert.ok(held);
		const reference = getChatBinaryReference(held.value.requests[0].variableData.variables[0].value)!;
		await reference.read();
		await destination.deleteSession(original.sessionId);
		instantiation.stub(IWorkspaceContextService, new TestContextService(new Workspace('migration-source', [])));
		const source = disposables.add(instantiation.createInstance(ChatSessionStore));
		const value = fixture();
		const replacement = new Uint8Array([22, 23, 24]);
		value.inputState = undefined;
		value.requests = [{ requestId: 'replacement', message: 'replacement', variableData: { variables: [{ kind: 'image', id: 'replacement', name: 'replacement.png', value: replacement }] }, response: [] }];
		await source.storeSessions([model(value)]);
		const migrations: Promise<void>[] = [];
		transitions.fire({ oldWorkspace: { id: 'migration-source' }, newWorkspace: { id: workspace.id, uri: URI.file('/target') }, join: promise => migrations.push(promise) });
		await Promise.all(migrations);
		const migrated = await readSession(original.sessionId, destination);
		assert.ok(migrated);
		assert.deepStrictEqual({
			held: encodeBase64(await reference.read()),
			migrated: (await resolveChatBinaryData(migrated.value, 'export')).requests[0].variableData.variables[0].value,
		}, { held: data, migrated: { $base64: encodeBase64(VSBuffer.wrap(replacement)) } });
		held.resources!.dispose();
		await clock.tickAsync(5000);
		await assert.rejects(() => reference.read());
		assert.deepStrictEqual((await resolveChatBinaryData(migrated.value, 'export')).requests[0].variableData.variables[0].value, { $base64: encodeBase64(VSBuffer.wrap(replacement)) });
	});

	for (const reason of ['missing', 'corrupt'] as const) {
		for (const format of ['flat', 'log'] as const) {
			test(`${format} workspace migration preserves text and healthy images when a source blob is ${reason}`, async () => {
				useFakeTimers();
				await config.setUserConfiguration('chat.useLogSessionStorage', format === 'log');
				const migration = createWorkspaceMigration();
				const healthy = new Uint8Array([4, 5, 6]);
				const value = fixture('migration-images');
				value.inputState = undefined;
				value.requests = [
					{ requestId: 'bad', message: 'text with unavailable image', variableData: { variables: [{ kind: 'image', id: 'bad', name: 'bad.png', value: new Uint8Array([1, 2, 3]) }] }, response: [{ value: 'first answer' }] },
					{ requestId: 'good', message: 'text with healthy image', variableData: { variables: [{ kind: 'image', id: 'good', name: 'good.png', value: healthy }] }, response: [{ value: 'second answer' }] },
				];
				const original = model(value);
				await migration.source.storeSessions([original]);
				const saved = await readSession(original.sessionId, migration.source);
				assert.ok(saved);
				const info = getChatBinaryReference(saved.value.requests[0].variableData.variables[0].value)!.descriptor;
				saved.resources!.dispose();
				original.dispose();
				await damageBlob(joinPath(migration.source.getChatStorageFolder(), `${value.sessionId}.resources`, info.sha256), reason);
				await migration.enter();
				const loaded = await readSession(value.sessionId, migration.reopen());
				assert.ok(loaded);
				const bad = getChatBinaryReference(loaded.value.requests[0].variableData.variables[0].value)!;
				const good = getChatBinaryReference(loaded.value.requests[1].variableData.variables[0].value)!;
				assert.deepStrictEqual({
					messages: loaded.value.requests.map(request => typeof request.message === 'string' ? request.message : request.message.text),
					unavailable: bad.descriptor.unavailable,
					healthy: new Uint8Array((await good.read()).buffer),
				}, { messages: ['text with unavailable image', 'text with healthy image'], unavailable: reason, healthy });
				await assert.rejects(bad.read(), ChatBinaryUnavailableError);
			});
		}

		test(`unloaded input history migrates a ${reason} source image without losing old or new entries`, async () => {
			useFakeTimers();
			const migration = createWorkspaceMigration();
			const healthy = new Uint8Array([4, 5, 6]);
			const entry = { inputText: 'old unavailable', attachments: [{ kind: 'image' as const, id: 'bad', name: 'bad.png', value: new Uint8Array([1, 2, 3]) }], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined, selections: [], contrib: {} };
			const saved = disposables.add(await migration.source.writeOwnedData(ChatStorageOwner.InputHistory, { history: { [CHAT_PROVIDER_ID]: [entry, { ...entry, inputText: 'old healthy', attachments: [{ kind: 'image', id: 'good', name: 'good.png', value: healthy }] }] } }));
			const info = getChatBinaryReference(saved.object.history![CHAT_PROVIDER_ID][0].attachments[0].value)!.descriptor;
			saved.dispose();
			await damageBlob(joinPath(migration.source.getChatStorageFolder(), '.input', 'inputHistory.resources', info.sha256), reason);
			await migration.enter();
			migration.reopen();
			const history = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
			await history.whenReady;
			const entries = history.getHistory(ChatAgentLocation.Chat);
			assert.deepStrictEqual({
				messages: entries.map(entry => entry.inputText),
				unavailable: getChatBinaryReference(entries[0].attachments[0].value)!.descriptor.unavailable,
				healthy: new Uint8Array((await getChatBinaryReference(entries[1].attachments[0].value)!.read()).buffer),
			}, { messages: ['old unavailable', 'old healthy'], unavailable: reason, healthy });
			history.append(ChatAgentLocation.Chat, { ...entry, inputText: 'new prompt', attachments: [] });
			await history.save();
			migration.reopen();
			const restarted = disposables.add(instantiation.createInstance(ChatWidgetHistoryService));
			await restarted.whenReady;
			assert.deepStrictEqual(restarted.getHistory(ChatAgentLocation.Chat).map(entry => entry.inputText), ['old unavailable', 'old healthy', 'new prompt']);
		});

		test(`unloaded draft migration keeps its text and attachment markers when the source image is ${reason}`, async () => {
			useFakeTimers();
			const migration = createWorkspaceMigration();
			const saved = disposables.add(await migration.source.writeOwnedData(ChatStorageOwner.NewSessionDraft, {
				inputText: 'draft text survives', attachments: [{ kind: 'image', id: 'bad', name: 'bad.png', value: new Uint8Array([1, 2, 3]) }],
			}));
			const info = getChatBinaryReference(saved.object.attachments[0].value)!.descriptor;
			saved.dispose();
			await damageBlob(joinPath(migration.source.getChatStorageFolder(), '.input', 'newSessionDraft.resources', info.sha256), reason);
			await migration.enter();
			const stored = await migration.reopen().readOwnedData(ChatStorageOwner.NewSessionDraft);
			assert.ok(stored);
			disposables.add(stored);
			assert.deepStrictEqual({
				text: stored.object.inputText,
				unavailable: getChatBinaryReference(stored.object.attachments[0].value)!.descriptor.unavailable,
			}, { text: 'draft text survives', unavailable: reason });
		});
	}

	test('source blob I/O failures still block migration and retry rather than marking data unavailable', async () => {
		useFakeTimers();
		const migration = createWorkspaceMigration();
		const original = { inputText: 'retry source I/O', attachments: [{ kind: 'image' as const, id: 'image', name: 'image.png', value: new Uint8Array([1, 2, 3]) }] };
		const saved = disposables.add(await migration.source.writeOwnedData(ChatStorageOwner.NewSessionDraft, original));
		const info = getChatBinaryReference(saved.object.attachments[0].value)!.descriptor;
		saved.dispose();
		const sourceBlob = joinPath(migration.source.getChatStorageFolder(), '.input', 'newSessionDraft.resources', info.sha256);
		provider.failRead = uri => uri.path === sourceBlob.path;
		await migration.enter();
		assert.strictEqual(await files.exists(joinPath(migration.source.getChatStorageFolder(), '.input', 'newSessionDraft.json')), false);
		provider.failRead = undefined;
		const stored = await migration.source.readOwnedData(ChatStorageOwner.NewSessionDraft);
		assert.ok(stored);
		disposables.add(stored);
		assert.deepStrictEqual(await resolveChatBinaryData(stored.object, 'request'), original);
	});

	for (const recoveredFrom of ['destination', 'staging'] as const) {
		for (const reason of ['missing', 'corrupt'] as const) {
			test(`mounted drafts retain ${recoveredFrom} recovery after a ${reason} source, text save and collection`, async () => {
				const clock = useFakeTimers();
				const migration = createWorkspaceMigration();
				instantiation.stub(IChatSessionStore, migration.source);
				const bytes = new Uint8Array([1, 2, 3]);
				const initial = disposables.add(await migration.source.writeOwnedData(ChatStorageOwner.NewSessionDraft, {
					inputText: 'before migration', attachments: [{ kind: 'image', id: 'image', name: 'image.png', value: bytes }],
				}));
				initial.dispose();
				const cache = disposables.add(instantiation.createInstance(ChatInputStorage<ChatStorageOwner.NewSessionDraft>, ChatStorageOwner.NewSessionDraft, { inputText: '', attachments: [] }, () => { }));
				await cache.whenReady;
				const info = getChatBinaryReference(cache.value.attachments[0].value)!.descriptor;
				const destination = joinPath(instantiation.get(IEnvironmentService).workspaceStorageHome, 'migration-target', 'chatSessions', '.input', 'newSessionDraft.resources');
				const target = joinPath(destination, info.sha256);
				const recovered = recoveredFrom === 'staging' ? target.with({ path: `${target.path}.tmp` }) : target;
				await files.writeFile(recovered, VSBuffer.wrap(bytes));
				await damageBlob(joinPath(migration.source.getChatStorageFolder(), '.input', 'newSessionDraft.resources', info.sha256), reason);
				await migration.enter();
				cache.set({ ...cache.value, inputText: 'after migration' });
				await cache.save();
				cache.dispose();
				await clock.tickAsync(5000);
				const loaded = await migration.reopen().readOwnedData(ChatStorageOwner.NewSessionDraft);
				assert.ok(loaded);
				disposables.add(loaded);
				const reference = getChatBinaryReference(loaded.object.attachments[0].value)!;
				assert.deepStrictEqual({
					text: loaded.object.inputText,
					unavailable: reference.descriptor.unavailable,
					exists: await files.exists(target),
				}, { text: 'after migration', unavailable: undefined, exists: true });
				assert.deepStrictEqual(new Uint8Array((await reference.read()).buffer), bytes);
			});
		}
	}

	for (const format of ['flat', 'log'] as const) {
		test(`migrates supported numeric-object image bytes from legacy ${format} storage`, async () => {
			const source = fixture();
			source.inputState!.attachments = [{ kind: 'image', id: 'legacy', name: 'legacy.png', value: { 0: 0, 1: 128, 2: 255 } }];
			const path = joinPath(sessions.getChatStorageFolder(), `binary-session.${format === 'flat' ? 'json' : 'jsonl'}`);
			await files.writeFile(path, format === 'flat' ? VSBuffer.fromString(JSON.stringify(source)) : new ChatSessionOperationLog().createInitialFromSerialized(source));
			const loaded = await readSession('binary-session');
			assert.ok(loaded);
			const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			await sessions.storeSessions([restored]);
			const reopened = await readSession('binary-session');
			assert.ok(reopened);
			assert.deepStrictEqual((await resolveChatBinaryData(reopened.value, 'request')).inputState!.attachments[0].value, new Uint8Array([0, 128, 255]));
			assert.ok(getChatBinaryReference(reopened.value.inputState!.attachments[0].value));
		});
	}

	for (const corrupt of [false, true]) {
		test(`an existing ${corrupt ? 'corrupt' : 'missing'} resource does not prevent saving new text`, async () => {
			await sessions.storeSessions([model()]);
			const loaded = await readSession('binary-session');
			assert.ok(loaded);
			const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const attachment = restored.getRequests()[0].variableData.variables[0];
			const reference = getChatBinaryReference(attachment.value)!;
			const blob = joinPath(reference.directory, reference.descriptor.sha256);
			if (corrupt) {
				await files.writeFile(blob, VSBuffer.fromString('corrupt'));
			} else {
				await files.del(blob);
			}
			restored.addRequest({ text: 'keep this new turn', parts: [] }, { variables: [] }, 0);
			await sessions.storeSessions([restored]);
			await sessions.storeSessions([restored]);
			const reopened = await readSession('binary-session');
			assert.ok(reopened);
			assert.strictEqual(reopened.value.requests.length, 2);
			const resolved = await resolveChatBinaryData(reopened.value.requests, 'history');
			assert.match(String(resolved[0].variableData.variables[0].value), /unavailable/);
			await assert.rejects(exportData(reopened.value), /unavailable|corrupt/i);
		});
	}

	test('unchanged saves after hydration do not rewrite metadata or blobs', async () => {
		const source = model();
		await sessions.storeSessions([source]);
		source.dispose();
		const loaded = await readSession(source.sessionId);
		assert.ok(loaded);
		const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		provider.writes.length = 0;
		await sessions.storeSessions([restored]);
		await sessions.storeSessions([restored]);
		assert.deepStrictEqual(provider.writes, []);
	});

	test('a second window retains superseded blobs until its read ownership is released', async () => {
		const clock = useFakeTimers();
		const draft = fixture();
		draft.requests = [];
		const source = model(draft);
		await sessions.storeSessions([source]);
		const otherFiles = disposables.add(new FileService(new NullLogService()));
		disposables.add(otherFiles.registerProvider('file', provider));
		instantiation.stub(IFileService, otherFiles);
		const other = disposables.add(instantiation.createInstance(ChatSessionStore));
		instantiation.stub(IFileService, files);
		const loaded = await readSession(source.sessionId, other);
		assert.ok(loaded);
		const reference = getChatBinaryReference(loaded.value.inputState!.attachments[0].value)!;
		source.inputModel.setState({ attachments: [{ kind: 'image', id: 'replacement', name: 'replacement.png', value: new Uint8Array([99]) }] });
		await sessions.storeSessions([source]);
		assert.deepStrictEqual(new Uint8Array((await reference.read()).buffer), new Uint8Array(decodeBase64(data).buffer));
		const oldBlob = joinPath(reference.directory, reference.descriptor.sha256);
		loaded.resources!.dispose();
		await clock.tickAsync(5000);
		assert.strictEqual(await files.exists(oldBlob), false);
	});

	test('lease release cannot collect prepared blobs before metadata commits', async () => {
		const clock = useFakeTimers();
		const draft = fixture();
		draft.requests = [];
		const source = model(draft);
		await sessions.storeSessions([source]);
		const loaded = await readSession(source.sessionId);
		assert.ok(loaded);
		const metadataEntered = new DeferredPromise<void>();
		const commitMetadata = new DeferredPromise<void>();
		provider.beforeWrite = async uri => {
			if (uri.path.endsWith('.jsonl')) {
				metadataEntered.complete();
				await commitMetadata.p;
			}
		};
		source.inputModel.setState({ attachments: [{ kind: 'image', id: 'new', name: 'new.png', value: new Uint8Array([42]) }] });
		const saving = sessions.storeSessions([source]);
		try {
			await metadataEntered.p;
			loaded.resources!.dispose();
			await clock.tickAsync(0);
			const preparedCount = (await files.resolve(joinPath(sessions.getChatStorageFolder(), `${source.sessionId}.resources`))).children?.length;
			assert.strictEqual(preparedCount, 2);
		} finally {
			commitMetadata.complete();
			await saving;
			provider.beforeWrite = undefined;
		}
		const reopened = await readSession(source.sessionId);
		assert.ok(reopened);
		assert.deepStrictEqual((await resolveChatBinaryData(reopened.value, 'request')).inputState!.attachments[0].value, new Uint8Array([42]));
	});

	test('drafts and adopted requests retain references acquired after construction', async () => {
		await sessions.storeSessions([model()]);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		const parent = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const forkData = fixture('fork');
		forkData.requests = [];
		forkData.inputState = undefined;
		const fork = model(forkData);
		fork.inputModel.setState({ attachments: parent.inputModel.state.get()!.attachments });
		fork.adoptRequest(parent.getRequests()[0]);
		parent.dispose();
		await sessions.deleteSession('binary-session');
		const exported = JSON.parse((await exportData(fork.toExport())).toString());
		await sessions.storeSessions([fork]);
		fork.dispose();
		const reopened = await readSession('fork');
		assert.ok(reopened);
		assert.deepStrictEqual({
			draft: exported.inputState.attachments[0].value,
			request: exported.requests[0].variableData.variables[0].value,
			persisted: (await resolveChatBinaryData(reopened.value, 'export')).requests[0].variableData.variables[0].value,
		}, { draft: { $base64: data }, request: { $base64: data }, persisted: { $base64: data } });
	});

	test('exports a completed live tool without traversing its observable graph', async () => {
		const source = model({ ...fixture(), requests: [] });
		const request = source.addRequest({ text: 'image', parts: [] }, { variables: [] }, 0);
		const tool = new ChatToolInvocation({ invocationMessage: 'Read image' }, { id: 'image', displayName: 'Image', modelDescription: 'Image', source: ToolDataSource.Internal }, 'image-call', undefined, {});
		await tool.didExecuteTool({ content: [], toolResultDetails: { input: '{}', output: [{ type: 'embed', mimeType: 'image/png', value: data }] } });
		source.acceptResponseProgress(request, tool);
		const portable = JSON.parse((await exportData(source.toExport())).toString());
		assert.strictEqual(portable.requests[0].response[0].resultDetails.output[0].value, data);
	});

	test('automatic index trimming keeps both loaded and lazily restorable session files', async () => {
		const open = model(fixture('open'));
		const closed = model(fixture('closed'));
		await sessions.storeSessions([open, closed]);
		open.dispose();
		closed.dispose();
		const held = await readSession('open');
		assert.ok(held);
		const index = await sessions.getIndex();
		index.open.lastMessageDate = 0;
		index.closed.lastMessageDate = 1;
		for (let i = 0; i < 399; i++) {
			index[`recent-${i}`] = { ...index.open, sessionId: `recent-${i}`, lastMessageDate: i + 100 };
		}
		const newest = fixture('newest');
		newest.creationDate = 9999;
		newest.requests[0].timestamp = 9999;
		await sessions.storeSessions([model(newest)]);
		assert.deepStrictEqual({
			open: await files.exists(joinPath(sessions.getChatStorageFolder(), 'open.jsonl')),
			closed: await files.exists(joinPath(sessions.getChatStorageFolder(), 'closed.jsonl')),
			held: (await resolveChatBinaryData(held.value, 'export')).requests[0].variableData.variables[0].value,
			indexed: ['open', 'closed'].filter(id => !!index[id]),
		}, { open: true, closed: true, held: { $base64: data }, indexed: [] });
		await sessions.deleteSession('closed');
		assert.strictEqual(await files.exists(joinPath(sessions.getChatStorageFolder(), 'closed.resources')), false);
	});

	for (const format of ['flat', 'log'] as const) {
		test(`migrates legacy ${format} data atomically, retaining bytes through error and retry`, async () => {
			const original = fixture();
			const file = joinPath(sessions.getChatStorageFolder(), `binary-session.${format === 'flat' ? 'json' : 'jsonl'}`);
			const legacy = format === 'flat' ? VSBuffer.fromString(JSON.stringify(original)) : new ChatSessionOperationLog().createInitialFromSerialized(original);
			await files.writeFile(file, legacy);
			const loaded = await readSession(original.sessionId);
			assert.ok(loaded);
			const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			provider.failWrite = uri => uri.path.endsWith('.jsonl');
			await sessions.storeSessions([restored]);
			assert.deepStrictEqual((await files.readFile(file)).value, legacy);
			provider.failWrite = undefined;
			await sessions.storeSessions([restored]);
			const saved = (await files.readFile(joinPath(sessions.getChatStorageFolder(), 'binary-session.jsonl'))).value.toString();
			const reopened = await readSession(original.sessionId);
			assert.ok(reopened);
			const portable = await resolveChatBinaryData(reopened.value, 'export');
			assert.deepStrictEqual({ inline: saved.includes('$base64'), value: portable.requests[0].variableData.variables[0].value }, { inline: false, value: { $base64: data } });
		});
	}

	test('a failed blob write never commits metadata or an index entry', async () => {
		provider.failWrite = uri => uri.path.includes('.resources/');
		await sessions.storeSessions([model()]);
		assert.deepStrictEqual({
			index: await sessions.getIndex(),
			metadata: await files.exists(joinPath(sessions.getChatStorageFolder(), 'binary-session.jsonl')),
		}, { index: {}, metadata: false });
	});

	test('flat storage and portable import retain draft attachments', async () => {
		await config.setUserConfiguration('chat.useLogSessionStorage', false);
		await sessions.storeSessions([model()]);
		const restored = await readSession('binary-session');
		assert.ok(restored);
		const loaded = disposables.add(instantiation.createInstance(ChatModel, restored, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const imported = parseChatImport((await exportData(loaded.toExport())).toString());
		const importedModel = disposables.add(instantiation.createInstance(ChatModel, { value: imported, serializer: new ChatSessionOperationLog() }, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		assert.deepStrictEqual(importedModel.inputModel.state.get()?.attachments[0].value, decodeBase64(data).buffer);
	});

	test('persisted forks survive source deletion and clear-all reclaims their blobs', async () => {
		await sessions.storeSessions([model()]);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		const parent = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const forkData = cloneChatData(parent.toJSON());
		forkData.sessionId = 'fork';
		const fork = model(forkData);
		parent.dispose();
		await sessions.deleteSession('binary-session');
		await sessions.storeSessions([fork]);
		fork.dispose();
		const reopened = await readSession('fork');
		assert.ok(reopened);
		assert.deepStrictEqual((await resolveChatBinaryData(reopened.value, 'export')).requests[0].variableData.variables[0].value, { $base64: data });
		reopened.resources?.dispose();
		await sessions.clearAllSessions();
		assert.strictEqual(await files.exists(joinPath(sessions.getChatStorageFolder(), 'fork.resources')), false);
	});

	test('replacing a draft reclaims superseded blobs after an atomic snapshot', async () => {
		const draft = fixture();
		draft.requests = [];
		const source = model(draft);
		await sessions.storeSessions([source]);
		source.inputModel.setState({ attachments: [{ kind: 'image', id: 'new', name: 'new.png', value: new Uint8Array([99, 100]) }] });
		await sessions.storeSessions([source]);
		const metadata = (await files.readFile(joinPath(sessions.getChatStorageFolder(), 'binary-session.jsonl'))).value.toString();
		const blobs = (await files.resolve(joinPath(sessions.getChatStorageFolder(), 'binary-session.resources'))).children!;
		assert.deepStrictEqual({ snapshots: metadata.trim().split('\n').length, blobs: blobs.length, bytes: (await files.readFile(blobs[0].resource)).value.byteLength }, { snapshots: 1, blobs: 1, bytes: 2 });
	});

	test('startup defers resource recovery instead of parsing stored histories', async () => {
		await sessions.storeSessions([model()]);
		provider.reads.length = 0;
		await sessions.migrateDataIfNeeded(() => undefined);
		assert.deepStrictEqual(provider.reads.filter(path => path.startsWith(sessions.getChatStorageFolder().path)), []);
	});

	test('rejects cleanup tickets outside managed storage roots', async () => {
		const clock = useFakeTimers();
		const directory = URI.file('/unrelated.resources');
		const blob = joinPath(directory, 'a'.repeat(64));
		await files.writeFile(blob, VSBuffer.fromString('keep'));
		const cleanupRoot = joinPath(instantiation.get(IUserDataProfilesService).defaultProfile.globalStorageHome, 'chatResourceCleanup');
		await files.writeFile(joinPath(cleanupRoot, `${await hashAsync(directory.toString())}.json`), VSBuffer.fromString(JSON.stringify(directory)));
		await sessions.migrateDataIfNeeded(() => undefined);
		await clock.tickAsync(5000);
		assert.strictEqual((await files.readFile(blob)).value.toString(), 'keep');
	});

	test('recovers abandoned blobs without deleting committed session resources', async () => {
		const clock = useFakeTimers();
		await sessions.storeSessions([model()]);
		const root = sessions.getChatStorageFolder();
		const orphan = joinPath(root, 'orphan.resources', 'a'.repeat(64));
		const abandoned = joinPath(root, 'binary-session.resources', 'b'.repeat(64));
		await files.writeFile(orphan, VSBuffer.fromString('uncommitted'));
		await files.writeFile(abandoned, VSBuffer.fromString('uncommitted'));
		const cleanupRoot = joinPath(instantiation.get(IUserDataProfilesService).defaultProfile.globalStorageHome, 'chatResourceCleanup');
		for (const directory of [joinPath(root, 'orphan.resources'), joinPath(root, 'binary-session.resources')]) {
			await files.writeFile(joinPath(cleanupRoot, `${await hashAsync(directory.toString())}.json`), VSBuffer.fromString(JSON.stringify(directory)));
		}
		await sessions.migrateDataIfNeeded(() => undefined);
		await clock.tickAsync(5000);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		assert.deepStrictEqual({
			orphan: await files.exists(orphan),
			abandoned: await files.exists(abandoned),
			value: (await resolveChatBinaryData(loaded.value, 'export')).requests[0].variableData.variables[0].value,
		}, { orphan: false, abandoned: false, value: { $base64: data } });
	});

	test('transfers own their bytes after source deletion and destination hydration', async () => {
		const source = model();
		await sessions.storeSessions([source]);
		const workspace = instantiation.get(IWorkspaceContextService).getWorkspace();
		await sessions.storeTransferSession({ toWorkspace: workspace.folders[0].uri, sessionResource: source.sessionResource, timestampInMilliseconds: Date.now() }, source);
		await sessions.deleteSession(source.sessionId);
		const transferred = await sessions.readTransferredSession(source.sessionResource);
		assert.ok(transferred);
		disposables.add(transferred.resources!);
		assert.deepStrictEqual((await resolveChatBinaryData(transferred.value, 'export')).requests[0].variableData.variables[0].value, { $base64: data });
	});

	test('transfer-index publication failures preserve source data and can be retried', async () => {
		const source = model();
		await sessions.storeSessions([source]);
		const workspace = instantiation.get(IWorkspaceContextService).getWorkspace();
		const transfer = { toWorkspace: workspace.folders[0].uri, sessionResource: source.sessionResource, timestampInMilliseconds: Date.now() };
		provider.failWrite = uri => uri.path.endsWith('/transferredChatSessions/index.json');
		await assert.rejects(sessions.storeTransferSession(transfer, source), /injected write failure/);
		assert.strictEqual(sessions.getTransferredSessionData(), undefined);
		provider.failWrite = undefined;
		await sessions.storeTransferSession(transfer, source);
		const restored = await sessions.readTransferredSession(source.sessionResource);
		assert.ok(restored);
		disposables.add(restored.resources!);
		assert.deepStrictEqual((await resolveChatBinaryData(restored.value, 'export')).requests[0].variableData.variables[0].value, { $base64: data });
	});

	test('queued requests retain their image bytes through hydration', async () => {
		const queued = fixture();
		queued.pendingRequests = [{ id: 'queued', kind: ChatRequestQueueKind.Queued, request: { message: 'queued image', requestId: 'queued-request', variableData: queued.requests[0].variableData, response: undefined }, sendOptions: {} }];
		await sessions.storeSessions([model(queued)]);
		const loaded = await readSession('binary-session');
		assert.ok(loaded);
		const restored = disposables.add(instantiation.createInstance(ChatModel, loaded, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const request = await resolveChatBinaryData(restored.getPendingRequests()[0].request.variableData, 'request');
		assert.deepStrictEqual(request.variables[0].value, new Uint8Array(decodeBase64(data).buffer));
	});
});
