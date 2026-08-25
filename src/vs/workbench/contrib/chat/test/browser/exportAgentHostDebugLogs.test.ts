/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, streamToBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IAgentHostDebugLogsArtifact, IAgentHostDebugLogsChunk } from '../../../../../platform/agentHost/common/agentService.js';
import { buildChatUri, buildDefaultChatUri, getSessionChatResource } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { collectRotatedLogFiles, createHostArtifactStream, getAgentHostDebugLogsExportName, toActiveAgentHostSession } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

function artifactOfSize(size: number): IAgentHostDebugLogsArtifact {
	return {
		kind: 'archive',
		resource: URI.parse('vscode-agent-host://remote/tmp/logs.zip'),
		providerLogsIncluded: true,
		size,
		uncompressedSize: size,
		entries: [{ path: 'agenthost.log', size }],
	};
}

/** Serves `contents` in fixed-size slices, like a remote host would. */
function chunkedReader(contents: VSBuffer, chunkSize: number): (position: number) => Promise<IAgentHostDebugLogsChunk> {
	return async position => {
		const data = contents.slice(position, Math.min(position + chunkSize, contents.byteLength));
		return { data, eof: position + data.byteLength >= contents.byteLength };
	};
}

suite('createHostArtifactStream', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reassembles an artifact delivered over several chunks', async () => {
		const contents = VSBuffer.fromString('abcdefghij');
		const stream = createHostArtifactStream(artifactOfSize(contents.byteLength), chunkedReader(contents, 3));

		assert.strictEqual((await streamToBuffer(stream)).toString(), 'abcdefghij');
	});

	test('fails when the host delivers fewer bytes than it declared', async () => {
		const contents = VSBuffer.fromString('abc');
		const stream = createHostArtifactStream(artifactOfSize(10), chunkedReader(contents, 3));

		await assert.rejects(streamToBuffer(stream), /ended after 3 bytes, expected 10/);
	});

	test('fails when the host delivers more bytes than it declared', async () => {
		const contents = VSBuffer.fromString('abcdefghij');
		const stream = createHostArtifactStream(artifactOfSize(4), chunkedReader(contents, 3));

		await assert.rejects(streamToBuffer(stream), /exceeded its declared size of 4 bytes/);
	});

	test('fails when the host never reaches the end of the artifact', async () => {
		const stream = createHostArtifactStream(artifactOfSize(10), async () => ({ data: VSBuffer.alloc(0), eof: false }));

		await assert.rejects(streamToBuffer(stream), /empty debug log chunk/);
	});
});

suite('toActiveAgentHostSession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('separates the selected chat from its owning session', () => {
		const local = toActiveAgentHostSession(URI.parse('agent-host-copilotcli:/session-1#side-chat'), 'Side chat', 'Session one');
		const remote = toActiveAgentHostSession(URI.parse('remote-test-copilotcli:/session-2'), 'Main chat', 'Session two');

		assert.deepStrictEqual({
			local: local && { resource: local.resource.toString(), sessionTitle: local.sessionTitle, chatTitle: local.chatTitle, chatId: local.chatId, backendChatResource: local.backendChatResource, isLocal: local.isLocal },
			remote: remote && { resource: remote.resource.toString(), sessionTitle: remote.sessionTitle, chatTitle: remote.chatTitle, chatId: remote.chatId, backendChatResource: remote.backendChatResource, isLocal: remote.isLocal },
		}, {
			local: { resource: 'agent-host-copilotcli:/session-1', sessionTitle: 'Session one', chatTitle: 'Side chat', chatId: 'side-chat', backendChatResource: undefined, isLocal: true },
			remote: { resource: 'remote-test-copilotcli:/session-2', sessionTitle: 'Session two', chatTitle: 'Main chat', chatId: 'default', backendChatResource: undefined, isLocal: false },
		});
	});

	test('namespaces non-primary chat exports under the session title', () => {
		assert.deepStrictEqual({
			primary: getAgentHostDebugLogsExportName('Investigate session', 'Main chat', true),
			sideChat: getAgentHostDebugLogsExportName('Investigate session', 'Review / side chat', false),
			truncated: getAgentHostDebugLogsExportName('A'.repeat(50), 'B'.repeat(50), false),
			unnamed: getAgentHostDebugLogsExportName(undefined, undefined, false),
		}, {
			primary: 'ah-logs-Investigate-session',
			sideChat: 'ah-logs-Investigate-session--Review-side-chat',
			truncated: `ah-logs-${'A'.repeat(40)}--${'B'.repeat(40)}`,
			unnamed: 'ah-logs',
		});
	});

	test('selects exact host-published backend chat URIs', () => {
		const session = URI.parse('copilotcli:/session-1');
		const defaultChat = URI.parse(buildDefaultChatUri(session)).with({ query: 'host=default' }).toString();
		const sideChat = URI.parse(buildChatUri(session, 'side-chat')).with({ query: 'host=side' }).toString();
		const state = {
			defaultChat,
			chats: [
				{ resource: defaultChat },
				{ resource: sideChat },
			],
		};

		assert.deepStrictEqual({
			defaultChat: getSessionChatResource(state, 'default'),
			sideChat: getSessionChatResource(state, 'side-chat'),
			missing: getSessionChatResource(state, 'missing'),
		}, {
			defaultChat,
			sideChat,
			missing: undefined,
		});
	});
});

suite('collectRotatedLogFiles', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('collects local rotated logs as resources', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.file('/logs');
		await fileService.createFolder(logs);
		await Promise.all([
			fileService.writeFile(URI.joinPath(logs, 'renderer.log'), VSBuffer.fromString('current')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.1.log'), VSBuffer.fromString('previous')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.5.log'), VSBuffer.fromString('oldest')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.old.log'), VSBuffer.fromString('not rotated')),
			fileService.writeFile(URI.joinPath(logs, 'network.log'), VSBuffer.fromString('different log')),
		]);

		const files = await collectRotatedLogFiles('vscode-logs/Window', URI.joinPath(logs, 'renderer.log'), fileService);

		assert.deepStrictEqual(files.map(file => ({
			path: file.path,
			resource: hasKey(file, { resource: true }) ? file.resource.toString() : undefined,
			size: file.size,
		})).sort((a, b) => a.path.localeCompare(b.path)), [
			{ path: 'vscode-logs/Window/renderer.1.log', resource: 'file:///logs/renderer.1.log', size: 8 },
			{ path: 'vscode-logs/Window/renderer.5.log', resource: 'file:///logs/renderer.5.log', size: 6 },
			{ path: 'vscode-logs/Window/renderer.log', resource: 'file:///logs/renderer.log', size: 7 },
		]);
	});

	test('bounds inline content for non-local rotated logs', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
		await fileService.createFolder(logs);
		await Promise.all([
			fileService.writeFile(URI.joinPath(logs, 'renderer.log'), VSBuffer.fromString('abcd')),
			fileService.writeFile(URI.joinPath(logs, 'renderer.1.log'), VSBuffer.fromString('efgh')),
		]);

		const files = await collectRotatedLogFiles('vscode-logs/Window', URI.joinPath(logs, 'renderer.log'), fileService, 6);

		assert.deepStrictEqual({
			count: files.length,
			allInline: files.every(file => hasKey(file, { contents: true })),
			totalSize: files.reduce((total, file) => total + file.size, 0),
		}, {
			count: 2,
			allInline: true,
			totalSize: 6,
		});
	});

	test('collects local user data logs as resources', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.from({ scheme: Schemas.vscodeUserData, path: '/logs' });
		await fileService.createFolder(logs);
		await fileService.writeFile(URI.joinPath(logs, 'usage.jsonl'), VSBuffer.fromString('usage'));

		const files = await collectRotatedLogFiles('sidecars', URI.joinPath(logs, 'usage.jsonl'), fileService);

		assert.deepStrictEqual(files.map(file => ({
			path: file.path,
			resource: hasKey(file, { resource: true }) ? file.resource.toString() : undefined,
			size: file.size,
		})), [
			{ path: 'sidecars/usage.jsonl', resource: 'vscode-userdata:/logs/usage.jsonl', size: 5 },
		]);
	});
});
