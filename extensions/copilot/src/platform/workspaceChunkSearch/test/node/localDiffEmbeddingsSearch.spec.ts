/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { FileChunkWithEmbedding } from '../../../chunking/common/chunk';
import { ChunkableContent, IChunkingEndpointClient } from '../../../chunking/common/chunkingEndpointClient';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { ILogService } from '../../../log/common/logService';
import { LocalDiffEmbeddingsSearch } from '../../node/codeSearch/localDiffEmbeddingsSearch';
import { FileRepresentation, IWorkspaceFileIndex } from '../../node/workspaceFileIndex';

const embeddingType = EmbeddingType.text3small_512;

class TestFile extends FileRepresentation {
	constructor(uri: URI, public version: number, readonly score: number) {
		super(uri);
	}

	override isDirty(): boolean { return false; }
	override async getText(): Promise<string> { return ''; }
	protected override async getStats() { return { size: 0, mtime: this.version }; }
}

test('ranks changed files and only recomputes files whose content changed', async () => {
	const files = [
		new TestFile(URI.file('/workspace/a.ts'), 1, 0.2),
		new TestFile(URI.file('/workspace/b.ts'), 1, 0.9),
	];
	const computed: string[] = [];
	const search = new LocalDiffEmbeddingsSearch(
		embeddingType,
		new class extends mock<IAuthenticationService>() {
			override async getGitHubSession(): Promise<AuthenticationSession> {
				return { id: 'session', accessToken: 'token', account: { id: 'account', label: 'octocat' }, scopes: [] };
			}
		}(),
		new class extends mock<IChunkingEndpointClient>() {
			override async computeChunksAndEmbeddings(_authToken: string, _embeddingType: EmbeddingType, content: ChunkableContent): Promise<readonly FileChunkWithEmbedding[]> {
				computed.push(content.uri.path);
				const file = files.find(f => f.uri.toString() === content.uri.toString())!;
				return [{
					chunk: { file: file.uri, text: file.uri.path, rawText: undefined, range: new Range(1, 1, 1, 1) },
					embedding: { type: embeddingType, value: [file.score, 0] },
					chunkHash: undefined,
				}];
			}
		}(),
		new class extends mock<ILogService>() { override debug() { } }(),
		new class extends mock<IWorkspaceFileIndex>() {
			override async tryLoad(uri: URI) { return files.find(f => f.uri.toString() === uri.toString()); }
		}(),
	);

	const doSearch = async () => {
		const result = await search.search(files.map(f => f.uri), {
			queryText: 'query',
			resolveQueryEmbeddings: async () => ({ type: embeddingType, value: [1, 0] }),
		}, 10, {}, new TelemetryCorrelationId('test'), CancellationToken.None);
		return result?.map(x => x.chunk.file.path);
	};

	const first = await doSearch();
	const unchanged = await doSearch();
	files[0].version++;
	const afterEdit = await doSearch();

	expect({ first, unchanged, afterEdit, computed: computed.sort() }).toEqual({
		first: ['/workspace/b.ts', '/workspace/a.ts'],
		unchanged: ['/workspace/b.ts', '/workspace/a.ts'],
		afterEdit: ['/workspace/b.ts', '/workspace/a.ts'],
		computed: ['/workspace/a.ts', '/workspace/a.ts', '/workspace/b.ts'],
	});

	files.forEach(f => f.dispose());
});
