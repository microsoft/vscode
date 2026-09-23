/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { buildTerminalOutputDbUri } from '../../../../../../platform/agentHost/common/sessionDbUri.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { consumeStream } from '../../../../../../base/common/stream.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileOperationResult, FileSystemProviderCapabilities, FileSystemProviderErrorCode, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ContentEncoding, ResourceType } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IChatService, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
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
		provider = testDisposables.add(new ChatResponseResourceFileSystemProvider(
			chatService,
			new class extends mock<IFileService>() { },
			new class extends mock<IAgentHostConnectionsService>() { },
		));
	});

	suite('terminal full output', () => {
		const store = testDisposables;
		const terminalResource = URI.parse('agenthost-terminal://shell/session/command-a');
		const outputResource = buildTerminalOutputDbUri(sessionResource.toString(), 'command-a');
		const completeOutput = `BEGIN\r\n${'x'.repeat(4096)}\nMIDDLE \u03bb\n${'y'.repeat(4096)}\r\nEND`;

		function createInvocation(terminal = terminalResource): IChatToolInvocationSerialized {
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
					isPty: false,
					terminalCommandUri: terminal,
					terminalCommandOutput: { text: 'preview', truncated: true, fullOutputResource: outputResource },
				},
			};
		}

		for (const authority of ['local', 'remote-host']) {
			test(`resolves metadata and reads authoritative output through ${authority}`, async () => {
				const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), authority, async () => completeOutput, {
					size: VSBuffer.fromString(completeOutput).byteLength,
				});
				const stat = await fixture.provider.stat(fixture.resource);
				const readsBeforeOpen = fixture.reads.length;
				const actual = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
				assert.deepStrictEqual({
					statSize: stat.size,
					readsBeforeOpen,
					actual,
					resolves: fixture.resolves.map(uri => uri.toString()),
					reads: fixture.reads.map(uri => uri.toString()),
					readonly: fixture.fileService.hasCapability(fixture.resource, FileSystemProviderCapabilities.Readonly),
				}, {
					statSize: VSBuffer.fromString(completeOutput).byteLength,
					readsBeforeOpen: 0,
					actual: completeOutput,
					resolves: [outputResource.toString()],
					reads: [outputResource.toString()],
					readonly: true,
				});
			});
		}

		test('stat is a metadata-only availability probe', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
				throw new Error('stat must not read content');
			}, { size: 123 });
			const stat = await fixture.provider.stat(fixture.resource);
			assert.deepStrictEqual({ size: stat.size, resolves: fixture.resolves.length, reads: fixture.reads.length }, { size: 123, resolves: 1, reads: 0 });
		});

		test('stat rejects missing and invalid artifact byte sizes', async () => {
			for (const size of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
				const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
					throw new Error('stat must not read content');
				}, {
					resolve: async uri => ({
						uri: uri.toString(),
						type: ResourceType.File,
						...(size === undefined ? {} : { size }),
					}),
				});
				await assert.rejects(
					() => fixture.provider.stat(fixture.resource),
					error => error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND,
				);
				assert.strictEqual(fixture.reads.length, 0);
			}
		});

		test('decodes a base64 resourceRead fallback', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => completeOutput, {
				encoding: ContentEncoding.Base64,
			});
			const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
			assert.deepStrictEqual({ content, reads: fixture.reads.length }, { content: completeOutput, reads: 1 });
		});

		test('loads and releases the owning chat while restoring an output editor', async () => {
			const fixture = createTerminalOutputTestFixture(
				store,
				sessionResource,
				createInvocation(),
				'local',
				async () => completeOutput,
				{ loadSessionOnDemand: true, size: VSBuffer.fromString(completeOutput).byteLength },
			);

			const stat = await fixture.provider.stat(fixture.resource);
			const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();

			assert.deepStrictEqual({
				statSize: stat.size,
				content,
				acquisitions: fixture.acquisitions,
				releases: fixture.releases,
				resolves: fixture.resolves.length,
				reads: fixture.reads.length,
			}, {
				statSize: VSBuffer.fromString(completeOutput).byteLength,
				content: completeOutput,
				acquisitions: 2,
				releases: 2,
				resolves: 1,
				reads: 1,
			});
		});

		for (const [code, result] of [
			[AhpErrorCodes.NotFound, FileOperationResult.FILE_NOT_FOUND],
			[AhpErrorCodes.PermissionDenied, FileOperationResult.FILE_PERMISSION_DENIED],
		] as const) {
			for (const stream of [false, true]) {
				test(`propagates ${code} from a ${stream ? 'streamed' : 'buffered'} resource read and allows retry`, async () => {
					let fail = true;
					const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'remote-host', async () => {
						if (fail) {
							throw new ProtocolError(code, 'Output cannot be read');
						}
						return completeOutput;
					});
					const read = () => stream
						? consumeStream(fixture.provider.readFileStream(fixture.resource, {}, CancellationToken.None), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString())
						: fixture.provider.readFile(fixture.resource);
					await assert.rejects(read, error => error instanceof Error && toFileOperationResult(error) === result);
					fail = false;
					const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
					assert.deepStrictEqual({ content, reads: fixture.reads.length }, { content: completeOutput, reads: 2 });
				});
			}
		}

		test('maps typed resolve errors without reading artifact content', async () => {
			for (const [code, result] of [
				[AhpErrorCodes.NotFound, FileOperationResult.FILE_NOT_FOUND],
				[AhpErrorCodes.PermissionDenied, FileOperationResult.FILE_PERMISSION_DENIED],
			] as const) {
				const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'remote-host', async () => {
					throw new Error('stat must not read content');
				}, {
					resolve: async () => { throw new ProtocolError(code, 'Output cannot be resolved'); },
				});
				await assert.rejects(() => fixture.provider.stat(fixture.resource), error => error instanceof Error && toFileOperationResult(error) === result);
				assert.strictEqual(fixture.reads.length, 0);
			}
		});

		test('does not suppress unexpected resolve or read errors', async () => {
			const resolveError = new Error('unexpected resolve failure');
			const resolveFixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => completeOutput, {
				resolve: async () => { throw resolveError; },
			});
			await assert.rejects(() => resolveFixture.provider.stat(resolveFixture.resource), resolveError);

			const readError = new Error('unexpected read failure');
			const readFixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => { throw readError; });
			await assert.rejects(() => readFixture.provider.readFile(readFixture.resource), readError);
		});

		test('honors stream byte limits, byte ranges, and cancellation', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => 'éx');
			await assert.rejects(
				() => consumeStream(fixture.provider.readFileStream(fixture.resource, { limits: { size: 1 } }, CancellationToken.None), chunks => chunks),
				error => error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_TOO_LARGE,
			);
			const ranged = await consumeStream(
				fixture.provider.readFileStream(fixture.resource, { position: 2, length: 1 }, CancellationToken.None),
				chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString(),
			);
			const pending = new DeferredPromise<string>();
			const pendingFixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => pending.p);
			const cancellation = testDisposables.add(new CancellationTokenSource());
			const cancelledRead = consumeStream(
				pendingFixture.provider.readFileStream(pendingFixture.resource, {}, cancellation.token),
				chunks => chunks,
			);
			cancellation.cancel();
			await assert.rejects(cancelledRead);
			assert.strictEqual(pendingFixture.reads.length, 0);
			pending.complete('unused');

			const alreadyCancelledFixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
				throw new Error('cancelled stream must not read content');
			});
			const alreadyCancelled = testDisposables.add(new CancellationTokenSource());
			alreadyCancelled.cancel();
			await assert.rejects(() => consumeStream(
				alreadyCancelledFixture.provider.readFileStream(alreadyCancelledFixture.resource, {}, alreadyCancelled.token),
				chunks => chunks,
			));
			assert.strictEqual(alreadyCancelledFixture.reads.length, 0);
			assert.strictEqual(ranged, 'x');
		});

		test('rejects mutations without reading or resolving the terminal', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
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
			assert.deepStrictEqual({ resolves: fixture.resolves, reads: fixture.reads }, { resolves: [], reads: [] });
		});

		test('rejects stale URI identity instead of reopening cached or unrelated output', async () => {
			const invocation = createInvocation();
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => completeOutput);
			const updated = URI.parse('agenthost-terminal://shell/session/replacement');
			invocation.toolSpecificData = createInvocation(updated).toolSpecificData;
			await assert.rejects(() => fixture.provider.readFile(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
			const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, updated, 'replacement.txt');
			const content = VSBuffer.wrap(await fixture.provider.readFile(resource)).toString();
			const forged = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, URI.parse('agenthost-terminal://shell/session/unrelated'), 'unrelated.txt');
			await assert.rejects(() => fixture.provider.readFile(forged), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual({ content, reads: fixture.reads.map(uri => uri.toString()) }, { content: completeOutput, reads: [outputResource.toString()] });
		});

		test('rejects a terminal resource after its terminal identity is removed', async () => {
			const invocation = createInvocation();
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => {
				throw new Error('Must not read');
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
			assert.deepStrictEqual({ resolves: fixture.resolves, reads: fixture.reads }, { resolves: [], reads: [] });
		});

		test('rejects PTY and non-truncated terminal resources before host access', async () => {
			for (const terminalCommandOutput of [{ text: 'preview', truncated: false }, { text: 'preview', truncated: true }]) {
				const invocation = createInvocation();
				assert.ok(invocation.toolSpecificData?.kind === 'terminal');
				invocation.toolSpecificData.isPty = terminalCommandOutput.truncated ? true : false;
				invocation.toolSpecificData.terminalCommandOutput = terminalCommandOutput;
				const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => {
					throw new Error('Must not read');
				});
				await assert.rejects(() => fixture.provider.readFile(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
				assert.deepStrictEqual({ resolves: fixture.resolves, reads: fixture.reads }, { resolves: [], reads: [] });
			}
		});

		test('existing indexed tool output remains separate from full terminal output', async () => {
			const invocation = createInvocation();
			invocation.resultDetails = {
				input: 'build',
				output: [{ type: 'embed', value: 'legacy tool output', isText: true, mimeType: 'text/plain' }],
			};
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => completeOutput);
			const legacyResource = ChatResponseResource.createUri(sessionResource, invocation.toolCallId, 0, 'output.txt');
			const legacy = VSBuffer.wrap(await fixture.provider.readFile(legacyResource)).toString();
			const complete = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
			assert.deepStrictEqual({ legacy, complete, reads: fixture.reads.length }, { legacy: 'legacy tool output', complete: completeOutput, reads: 1 });
		});

		test('missing session lookup terminates a stream instead of hanging', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
				throw new Error('Must not read after session disposal');
			});
			fixture.model.dispose();
			await assert.rejects(() => consumeStream(fixture.provider.readFileStream(fixture.resource, {}, CancellationToken.None), chunks => chunks), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual({ resolves: fixture.resolves, reads: fixture.reads }, { resolves: [], reads: [] });
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

	test('tool I/O resources only resolve from chats that are already loaded', async () => {
		let loadRequests = 0;
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
			override getSession() {
				return undefined;
			}
			override async acquireOrLoadSession() {
				loadRequests++;
				return undefined;
			}
		};
		const toolProvider = testDisposables.add(new ChatResponseResourceFileSystemProvider(
			chatService,
			new class extends mock<IFileService>() { },
			new class extends mock<IAgentHostConnectionsService>() { },
		));

		await assert.rejects(() => toolProvider.readFile(ChatResponseResource.createUri(sessionResource, 'tool-1', 0)), { code: FileSystemProviderErrorCode.FileNotFound });
		assert.strictEqual(loadRequests, 0);
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
