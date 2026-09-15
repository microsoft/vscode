/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { SEMANTIC_DIFF_FILE_BYTE_LIMIT, SemanticDiffSourceRequest } from '../../common/semanticDiffSource.js';
import { readSemanticDiffSource } from '../../node/semanticDiffSource.js';

suite('Semantic diff source reader', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.file('/repo');
	const otherRoot = URI.file('/other');
	const request: Extract<SemanticDiffSourceRequest, { kind: 'file' }> = {
		kind: 'file', sessionUri: 'copilot:/session', repositoryUri: root.toString(),
		baseRevision: 'a'.repeat(40), targetRevision: 'b'.repeat(40),
		file: { id: 'f', path: 'src/[name].ts', oldPath: null, status: 'modified', contentKind: 'text' },
	};

	class Git extends mock<IAgentHostGitService>() {
		readonly reads: { repository: string; revision: string; path: string }[] = [];
		readonly diffs: Parameters<IAgentHostGitService['getDiffPatchBetweenRefs']>[] = [];
		original: VSBuffer | undefined = VSBuffer.fromString('before\n');
		modified: VSBuffer | undefined = VSBuffer.fromString('after\n');
		revisionAvailable = true;
		patch = { patch: 'patch', tooLarge: false };
		override async getRepositoryRoot(directory: URI) { return directory; }
		override async revParse(_root: URI, expression: string) { return this.revisionAvailable ? expression.replace(/\^\{commit\}$/, '') : undefined; }
		override async showBlob(repository: URI, revision: string, path: string) {
			this.reads.push({ repository: repository.toString(), revision, path });
			return revision === request.baseRevision ? this.original : this.modified;
		}
		override async getDiffPatchBetweenRefs(...args: Parameters<IAgentHostGitService['getDiffPatchBetweenRefs']>) {
			this.diffs.push(args);
			return this.patch;
		}
	}

	test('lists only repositories resolved from session-owned directories', async () => {
		assert.deepStrictEqual(await readSemanticDiffSource({ kind: 'repositories', sessionUri: request.sessionUri }, [root, otherRoot, root], new Git()), {
			kind: 'repositories', repositories: [root.toString(), otherRoot.toString()],
		});
	});

	test('reads a selected session root using pinned revisions and literal canonical pathspecs', async () => {
		const git = new Git();
		const result = await readSemanticDiffSource({ ...request, repositoryUri: otherRoot.toString() }, [root, otherRoot], git);
		assert.deepStrictEqual({
			result,
			repositories: git.reads.map(read => read.repository),
			options: git.diffs[0][1],
		}, {
			result: { kind: 'file', original: 'before\n', modified: 'after\n', patch: 'patch' },
			repositories: [otherRoot.toString(), otherRoot.toString()],
			options: { fromRef: request.baseRevision, toRef: request.targetRevision, paths: [':(literal)src/[name].ts'], maxBuffer: SEMANTIC_DIFF_FILE_BYTE_LIMIT, canonical: true, allowLazyFetch: false },
		});
	});

	test('never selects a repository outside the owning session', async () => {
		const git = new Git();
		await assert.rejects(readSemanticDiffSource({ ...request, repositoryUri: otherRoot.toString() }, [root], git), /does not belong/);
		assert.deepStrictEqual(git.reads, []);
	});

	test('missing revisions fail before reading file content', async () => {
		const git = new Git();
		git.revisionAvailable = false;
		await assert.rejects(readSemanticDiffSource(request, [root], git), /classified commits could not be resolved locally/);
		assert.deepStrictEqual(git.reads, []);
	});

	test('preserves empty file content and does not read absent added/deleted sides', async () => {
		const results = [];
		for (const status of ['added', 'deleted'] as const) {
			const git = new Git();
			git.original = VSBuffer.fromString('');
			git.modified = VSBuffer.fromString('');
			const result = await readSemanticDiffSource({ ...request, file: { ...request.file, status } }, [root], git);
			results.push({ result, reads: git.reads.map(read => read.revision) });
		}
		assert.deepStrictEqual(results, [
			{ result: { kind: 'file', original: undefined, modified: '', patch: 'patch' }, reads: [request.targetRevision] },
			{ result: { kind: 'file', original: '', modified: undefined, patch: 'patch' }, reads: [request.baseRevision] },
		]);
	});

	test('renames read the original path from the baseline', async () => {
		const git = new Git();
		await readSemanticDiffSource({ ...request, file: { ...request.file, status: 'renamed', oldPath: 'old.ts' } }, [root], git);
		assert.deepStrictEqual(git.reads.map(read => read.path), ['old.ts', request.file.path]);
	});

	test('missing required file versions are errors, not empty content', async () => {
		const git = new Git();
		git.original = undefined;
		await assert.rejects(readSemanticDiffSource(request, [root], git), /could not be read/);
	});

	test('rejects oversized, binary and invalid UTF-8 content', async () => {
		for (const content of [VSBuffer.alloc(SEMANTIC_DIFF_FILE_BYTE_LIMIT + 1), VSBuffer.fromString('binary\0'), VSBuffer.wrap(new Uint8Array([0xff]))]) {
			const git = new Git();
			git.modified = content;
			await assert.rejects(readSemanticDiffSource(request, [root], git));
		}
	});

	test('preserves a UTF-8 BOM and CRLF bytes for source verification', async () => {
		const git = new Git();
		git.original = VSBuffer.fromString('\uFEFFbefore\r\n');
		assert.deepStrictEqual(await readSemanticDiffSource(request, [root], git), { kind: 'file', original: '\uFEFFbefore\r\n', modified: 'after\n', patch: 'patch' });
	});
});
