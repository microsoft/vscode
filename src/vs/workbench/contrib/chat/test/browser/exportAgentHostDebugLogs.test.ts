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
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { collectRotatedLogFiles, createHostArtifactStream } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

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

suite('collectRotatedLogFiles', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('collects the current and numbered rotated logs', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const logs = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
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
			contents: hasKey(file, { contents: true }) ? file.contents : undefined,
		})).sort((a, b) => a.path.localeCompare(b.path)), [
			{ path: 'vscode-logs/Window/renderer.1.log', contents: 'previous' },
			{ path: 'vscode-logs/Window/renderer.5.log', contents: 'oldest' },
			{ path: 'vscode-logs/Window/renderer.log', contents: 'current' },
		]);
	});
});
