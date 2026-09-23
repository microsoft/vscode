/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { consumeStream } from '../../../../../../base/common/stream.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileOperationResult, FileSystemProviderCapabilities, FileSystemProviderErrorCode, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { TerminalClaimKind, TerminalLifecycleStatus, type TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
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
		const completeOutput = `BEGIN\r\n${'x'.repeat(4096)}\nMIDDLE \u03bb\n${'y'.repeat(4096)}\r\nEND`;

		function terminalState(output = completeOutput): TerminalState {
			return {
				title: 'build',
				content: [{ type: 'unclassified', value: output }],
				lifecycle: { status: TerminalLifecycleStatus.Exited, exitCode: 0 },
				claim: {
					kind: TerminalClaimKind.Session,
					session: 'copilotcli:/session',
					chat: sessionResource.toString(),
					toolCallId: 'command-a',
				},
				isPty: false,
			};
		}

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
					terminalCommandUri: terminal,
					terminalCommandOutput: { text: 'preview', truncated: true },
				},
			};
		}

		for (const authority of ['local', 'remote-host']) {
			test(`reads complete exited terminal output lazily through ${authority}`, async () => {
				const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), authority, async () => terminalState());
				const stat = await fixture.provider.stat(fixture.resource);
				const subscriptionsBeforeOpen = fixture.subscriptions.length;
				const actual = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
				assert.deepStrictEqual({
					statSize: stat.size,
					subscriptionsBeforeOpen,
					actual,
					subscriptions: fixture.subscriptions.map(uri => uri.toString()),
					subscriptionReleases: fixture.subscriptionReleases,
					readonly: fixture.fileService.hasCapability(fixture.resource, FileSystemProviderCapabilities.Readonly),
				}, {
					statSize: 0,
					subscriptionsBeforeOpen: 0,
					actual: completeOutput,
					subscriptions: [terminalResource.toString()],
					subscriptionReleases: 1,
					readonly: true,
				});
			});
		}

		test('streams full output and does not subscribe during stat', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => terminalState());
			const stat = await fixture.provider.stat(fixture.resource);
			const subscriptionsBeforeOpen = fixture.subscriptions.length;
			const content = await consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString());
			assert.deepStrictEqual({ size: stat.size, subscriptionsBeforeOpen, content, subscriptions: fixture.subscriptions.length }, {
				size: 0, subscriptionsBeforeOpen: 0, content: completeOutput, subscriptions: 1,
			});
		});

		test('preserves the ordered text of rich terminal content parts', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => ({
				...terminalState(),
				content: [
					{ type: 'unclassified', value: 'before\n' },
					{ type: 'command', commandId: 'command-1', commandLine: 'npm test', output: 'test output\n', timestamp: 1, isComplete: true, exitCode: 0 },
					{ type: 'unclassified', value: 'after\n' },
				],
				isPty: true,
				supportsCommandDetection: true,
			}));

			const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
			assert.deepStrictEqual({
				content,
				subscriptions: fixture.subscriptions.map(uri => uri.toString()),
				releases: fixture.subscriptionReleases,
			}, {
				content: 'before\ntest output\nafter\n',
				subscriptions: [terminalResource.toString()],
				releases: 1,
			});
		});

		test('loads and releases the owning chat while restoring an output editor', async () => {
			const fixture = createTerminalOutputTestFixture(
				store,
				sessionResource,
				createInvocation(),
				'local',
				async () => terminalState(),
				{ loadSessionOnDemand: true },
			);

			const stat = await fixture.provider.stat(fixture.resource);
			const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();

			assert.deepStrictEqual({
				statSize: stat.size,
				content,
				acquisitions: fixture.acquisitions,
				releases: fixture.releases,
				subscriptions: fixture.subscriptions.length,
				subscriptionReleases: fixture.subscriptionReleases,
			}, {
				statSize: 0,
				content: completeOutput,
				acquisitions: 2,
				releases: 2,
				subscriptions: 1,
				subscriptionReleases: 1,
			});
		});

		for (const [code, result] of [
			[AhpErrorCodes.NotFound, FileOperationResult.FILE_NOT_FOUND],
			[AhpErrorCodes.PermissionDenied, FileOperationResult.FILE_PERMISSION_DENIED],
		] as const) {
			for (const stream of [false, true]) {
				test(`propagates ${code} from a ${stream ? 'streamed' : 'buffered'} subscription and allows retry`, async () => {
					let fail = true;
					const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'remote-host', async () => {
						if (fail) {
							throw new ProtocolError(code, 'Output cannot be read');
						}
						return terminalState();
					});
					const read = () => stream
						? consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).toString())
						: fixture.provider.readFile(fixture.resource);
					await assert.rejects(read, error => error instanceof Error && toFileOperationResult(error) === result);
					fail = false;
					const content = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
					assert.deepStrictEqual({ content, subscriptions: fixture.subscriptions.length, releases: fixture.subscriptionReleases }, { content: completeOutput, subscriptions: 2, releases: 2 });
				});
			}
		}

		test('rejects mutations without subscribing to the terminal', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
				throw new Error('Must not subscribe');
			});
			for (const mutate of [
				() => fixture.provider.writeFile(),
				() => fixture.provider.rename(),
				() => fixture.provider.delete(),
				() => fixture.provider.mkdir(),
			]) {
				await assert.rejects(async () => mutate(), { code: FileSystemProviderErrorCode.NoPermissions });
			}
			assert.deepStrictEqual(fixture.subscriptions, []);
		});

		test('rejects stale URI identity instead of reopening cached or unrelated output', async () => {
			const invocation = createInvocation();
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => terminalState());
			const updated = URI.parse('agenthost-terminal://shell/session/replacement');
			invocation.toolSpecificData = createInvocation(updated).toolSpecificData;
			await assert.rejects(() => fixture.provider.readFile(fixture.resource), { code: FileSystemProviderErrorCode.FileNotFound });
			const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, updated, 'replacement.txt');
			const content = VSBuffer.wrap(await fixture.provider.readFile(resource)).toString();
			const forged = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, URI.parse('agenthost-terminal://shell/session/unrelated'), 'unrelated.txt');
			await assert.rejects(() => fixture.provider.readFile(forged), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual({ content, subscriptions: fixture.subscriptions.map(uri => uri.toString()) }, { content: completeOutput, subscriptions: [updated.toString()] });
		});

		test('rejects a terminal resource after its terminal identity is removed', async () => {
			const invocation = createInvocation();
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => {
				throw new Error('Must not subscribe');
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
			assert.deepStrictEqual(fixture.subscriptions, []);
		});

		test('existing indexed tool output remains separate from full terminal output', async () => {
			const invocation = createInvocation();
			invocation.resultDetails = {
				input: 'build',
				output: [{ type: 'embed', value: 'legacy tool output', isText: true, mimeType: 'text/plain' }],
			};
			const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, 'local', async () => terminalState());
			const legacyResource = ChatResponseResource.createUri(sessionResource, invocation.toolCallId, 0, 'output.txt');
			const legacy = VSBuffer.wrap(await fixture.provider.readFile(legacyResource)).toString();
			const complete = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
			assert.deepStrictEqual({ legacy, complete, subscriptions: fixture.subscriptions.length }, { legacy: 'legacy tool output', complete: completeOutput, subscriptions: 1 });
		});

		test('missing session lookup terminates a stream instead of hanging', async () => {
			const fixture = createTerminalOutputTestFixture(store, sessionResource, createInvocation(), 'local', async () => {
				throw new Error('Must not subscribe after session disposal');
			});
			fixture.model.dispose();
			await assert.rejects(() => consumeStream(fixture.provider.readFileStream(fixture.resource), chunks => chunks), { code: FileSystemProviderErrorCode.FileNotFound });
			assert.deepStrictEqual(fixture.subscriptions, []);
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
