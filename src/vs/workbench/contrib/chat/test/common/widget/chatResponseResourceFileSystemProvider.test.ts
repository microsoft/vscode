/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { consumeStream } from '../../../../../../base/common/stream.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileOperationResult, FileSystemProviderCapabilities, FileSystemProviderErrorCode, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { toAgentHostContentUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ContentEncoding } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IChatService, IChatTerminalOutputReference, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../../common/model/chatModel.js';
import { ChatResponseResourceFileSystemProvider } from '../../../common/widget/chatResponseResourceFileSystemProvider.js';
import { createTerminalOutputTestFixture } from './terminalFullOutputTestUtils.js';

suite('ChatResponseResourceFileSystemProvider', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-chat-session://test/session');

	let onDidDisposeSession: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;
	let provider: ChatResponseResourceFileSystemProvider;

	setup(() => {
		onDidDisposeSession = testDisposables.add(new Emitter());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
		};
		provider = testDisposables.add(new ChatResponseResourceFileSystemProvider(chatService, new class extends mock<IFileService>() { }));
	});

	suite('terminal full output', () => {
		const store = testDisposables;
		const backingResource = URI.parse('shell-output:/command-a?version=1#output');
		const completeOutput = `BEGIN\r\n${'x'.repeat(4096)}\nMIDDLE \u03bb\n${'y'.repeat(4096)}\r\nEND`;

		function createInvocation(fullOutput: IChatTerminalOutputReference): IChatToolInvocationSerialized {
			return {
				kind: 'toolInvocationSerialized',
				toolCallId: 'command-a',
				toolId: 'bash',
				presentation: undefined,
				invocationMessage: 'Running command',
				originMessage: undefined,
				pastTenseMessage: 'Ran command',
				isConfirmed: undefined,
				isComplete: true,
				source: undefined,
				toolSpecificData: {
					kind: 'terminal',
					language: 'shellscript',
					commandLine: { original: 'build' },
					terminalCommandOutput: { text: 'preview', truncated: true, fullOutput },
				},
			};
		}

		for (const authority of ['local', 'remote-host']) {
			for (const encoding of [ContentEncoding.Utf8, ContentEncoding.Base64]) {
				test(`reads complete ${encoding} full output lazily through ${authority}`, async () => {
					const reference = {
						uri: toAgentHostContentUri(backingResource, authority, { alwaysWrap: true }),
						sizeHint: VSBuffer.fromString(completeOutput).byteLength,
						nonce: 'one',
					};
					const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(reference), authority, async () => ({
						encoding,
						data: encoding === ContentEncoding.Base64 ? encodeBase64(VSBuffer.fromString(completeOutput)) : completeOutput,
					}));
					const stat = await fixture.provider.stat(fixture.resource);
					const readsBeforeOpen = fixture.reads.length;
					const actual = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
					assert.deepStrictEqual({
						statSize: stat.size,
						readsBeforeOpen,
						actual,
						reads: fixture.reads.map(uri => uri.toString()),
						readonly: fixture.fileService.hasCapability(fixture.resource, FileSystemProviderCapabilities.Readonly),
					}, {
						statSize: reference.sizeHint,
						readsBeforeOpen: 0,
						actual: completeOutput,
						reads: [backingResource.toString()],
						readonly: true,
					});
				});
			}
		}

		test('streams full output and does not fetch unknown size during stat', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }) };
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(reference), 'local', async () => ({
				encoding: ContentEncoding.Utf8, data: completeOutput,
			}));
			const stat = await fixture.provider.stat(fixture.resource);
			const readsBeforeOpen = fixture.reads.length;
			const content = await consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString());
			assert.deepStrictEqual({ size: stat.size, readsBeforeOpen, content, reads: fixture.reads.length }, {
				size: 0, readsBeforeOpen: 0, content: completeOutput, reads: 1,
			});
		});

		for (const [code, result] of [
			[AhpErrorCodes.NotFound, FileOperationResult.FILE_NOT_FOUND],
			[AhpErrorCodes.PermissionDenied, FileOperationResult.FILE_PERMISSION_DENIED],
		] as const) {
			for (const stream of [false, true]) {
				test(`propagates ${code} from a ${stream ? 'streamed' : 'buffered'} read and allows retry`, async () => {
					let fail = true;
					const reference = { uri: toAgentHostContentUri(backingResource, 'remote-host') };
					const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(reference), 'remote-host', async () => {
						if (fail) {
							throw new ProtocolError(code, 'Output cannot be read');
						}
						return { encoding: ContentEncoding.Utf8, data: completeOutput };
					});
					const read = () => stream
						? consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString())
						: fixture.provider.readFile(fixture.resource);
					await assert.rejects(read, error => error instanceof Error && toFileOperationResult(error) === result);
					fail = false;
					const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
					assert.deepStrictEqual({ content, reads: fixture.reads.length }, { content: completeOutput, reads: 2 });
				});
			}
		}

		test('rejects mutations without reading or writing the backing artifact', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }) };
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(reference), 'local', async () => {
				throw new Error('Must not read');
			});
			for (const mutate of [
				() => fixture.provider.writeFile(),
				() => fixture.provider.rename(),
				() => fixture.provider.delete(),
				() => fixture.provider.mkdir(),
			]) {
				await assert.rejects(async () => mutate(), { code: FileSystemProviderErrorCode.NoPermissions });
			}
			assert.deepStrictEqual(fixture.reads, []);
		});

		test('rejects stale identity or nonce instead of reopening cached or unrelated output', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }), nonce: 'one' };
			const invocation = createInvocation(reference);
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => ({
				encoding: ContentEncoding.Utf8, data: completeOutput,
			}));
			const updated = { ...reference, nonce: 'two' };
			invocation.toolSpecificData = createInvocation(updated).toolSpecificData;
			await assert.rejects(() => fixture.provider.readFile(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
			const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, updated);
			const content = VSBuffer.wrap(await fixture.provider.readFile(resource)).toString();
			const forged = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, { uri: URI.file('/tmp/unrelated.txt') });
			await assert.rejects(() => fixture.provider.readFile(forged), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual({ content, reads: fixture.reads.length }, { content: completeOutput, reads: 1 });
		});

		test('rejects a terminal resource after its reference is removed', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }) };
			const invocation = createInvocation(reference);
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => {
				throw new Error('Must not fall back to another output');
			});
			invocation.toolSpecificData = {
				kind: 'terminal',
				language: 'shellscript',
				commandLine: { original: 'build' },
				terminalCommandOutput: { text: 'Saved to: /tmp/unrelated.txt', truncated: true },
			};
			await assert.rejects(() => fixture.provider.readFile(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
			invocation.toolSpecificData = undefined;
			await assert.rejects(() => fixture.provider.stat(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual(fixture.reads, []);
		});

		test('existing indexed tool output remains separate from full terminal output', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }) };
			const invocation = createInvocation(reference);
			invocation.resultDetails = {
				input: 'build',
				output: [{ type: 'embed', value: 'legacy tool output', isText: true, mimeType: 'text/plain' }],
			};
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => ({
				encoding: ContentEncoding.Utf8, data: completeOutput,
			}));
			const legacyResource = ChatResponseResource.createUri(sessionResource, invocation.toolCallId, 0, 'output.txt');
			const legacy = VSBuffer.wrap(await fixture.provider.readFile(legacyResource)).toString();
			const complete = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
			assert.deepStrictEqual({ legacy, complete, reads: fixture.reads.length }, { legacy: 'legacy tool output', complete: completeOutput, reads: 1 });
		});

		test('missing session lookup terminates a stream instead of hanging', async () => {
			const reference = { uri: toAgentHostContentUri(backingResource, 'local', { alwaysWrap: true }) };
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(reference), 'local', async () => {
				throw new Error('Must not read after session disposal');
			});
			fixture.model.dispose();
			await assert.rejects(() => consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => chunks), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual(fixture.reads, []);
		});
	});

	/** Reads the associated data, or `undefined` once it has been released. */
	async function read(resource: URI): Promise<string | undefined> {
		try {
			return new TextDecoder().decode(await provider.readFile(resource));
		} catch {
			return undefined;
		}
	}

	test('a stable id shares data until every association is disposed', async () => {
		const first = provider.associate(VSBuffer.fromString('artifact').buffer, { id: 'paste-1' });
		const second = provider.associate(VSBuffer.fromString('artifact').buffer, { id: 'paste-1' });

		first.dispose();
		first.dispose(); // a repeated dispose must not release the reference held by `second`
		const afterFirstDisposed = await read(second.resource);

		second.dispose();
		const afterSecondDisposed = await read(second.resource);

		assert.deepStrictEqual({
			sharesResource: first.resource.toString() === second.resource.toString(),
			afterFirstDisposed,
			afterSecondDisposed,
		}, {
			sharesResource: true,
			afterFirstDisposed: 'artifact',
			afterSecondDisposed: undefined,
		});
	});

	test('session-scoped data is released with the session', async () => {
		const association = provider.associate(VSBuffer.fromString('artifact').buffer, { sessionResource });

		onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: 'cleared' });
		const afterSessionDisposed = await read(association.resource);

		association.dispose(); // disposing an already released association must be a no-op
		const afterAssociationDisposed = await read(association.resource);

		assert.deepStrictEqual({ afterSessionDisposed, afterAssociationDisposed }, { afterSessionDisposed: undefined, afterAssociationDisposed: undefined });
	});
});
