/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseSemanticDiffFileSourceResult, parseSemanticDiffRepositoryResult, parseSemanticDiffSourceRequest, SEMANTIC_DIFF_SOURCE_SCHEME, semanticDiffSourceUri, SemanticDiffSourceRequest } from '../../common/semanticDiffSource.js';

suite('Semantic diff source transport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const request: Extract<SemanticDiffSourceRequest, { kind: 'file' }> = {
		kind: 'file', sessionUri: 'copilot:/session', repositoryUri: 'file:///repo',
		baseRevision: 'a'.repeat(40), targetRevision: 'b'.repeat(40),
		file: { id: 'f', path: 'src/test.ts', oldPath: null, status: 'modified', contentKind: 'text' },
	};

	test('round-trips repository and pinned-file requests', () => {
		const requests: SemanticDiffSourceRequest[] = [{ kind: 'repositories', sessionUri: request.sessionUri }, request];
		assert.deepStrictEqual(requests.map(value => parseSemanticDiffSourceRequest(semanticDiffSourceUri(value))), requests);
	});

	for (const path of ['/absolute', '../outside', 'src/../outside', 'C:/outside', 'src\\file', 'src//file', 'src/', '.', 'src/\0file', 'src/\nfile']) {
		test(`rejects unsafe source path ${JSON.stringify(path)}`, () => {
			assert.throws(() => parseSemanticDiffSourceRequest(semanticDiffSourceUri({ ...request, file: { ...request.file, path } })), /Invalid semantic diff source request/);
		});
	}

	for (const revision of ['HEAD', '--help', `${'a'.repeat(40)}\n`, 'a'.repeat(39)]) {
		test(`requires pinned revision ${JSON.stringify(revision)}`, () => {
			assert.throws(() => parseSemanticDiffSourceRequest(semanticDiffSourceUri({ ...request, baseRevision: revision })), /Invalid semantic diff source request/);
		});
	}

	test('retains literal filename characters and rename source paths', () => {
		const renamed = { ...request, file: { ...request.file, path: 'src/[name] #1.ts', oldPath: 'src/old.ts', status: 'renamed' as const } };
		assert.deepStrictEqual(parseSemanticDiffSourceRequest(semanticDiffSourceUri(renamed)), renamed);
	});

	test('rejects malformed, oversized, or mismatched resource requests', () => {
		for (const uri of [
			URI.from({ scheme: SEMANTIC_DIFF_SOURCE_SCHEME, path: '/file', query: '{' }),
			URI.from({ scheme: SEMANTIC_DIFF_SOURCE_SCHEME, path: '/file', query: ' '.repeat(65537) }),
			semanticDiffSourceUri(request).with({ path: '/repositories' }),
			URI.file('/file'),
		]) {
			assert.throws(() => parseSemanticDiffSourceRequest(uri), /Invalid semantic diff source request/);
		}
	});

	test('validates source response shapes without manufacturing missing sides', () => {
		assert.deepStrictEqual({
			repositories: parseSemanticDiffRepositoryResult({ kind: 'repositories', repositories: ['file:///repo'] }),
			added: parseSemanticDiffFileSourceResult({ kind: 'file', modified: '', patch: 'patch' }),
		}, {
			repositories: { kind: 'repositories', repositories: ['file:///repo'] },
			added: { kind: 'file', original: undefined, modified: '', patch: 'patch' },
		});
		assert.throws(() => parseSemanticDiffRepositoryResult({ kind: 'repositories', repositories: [null] }));
		assert.throws(() => parseSemanticDiffFileSourceResult({ kind: 'file', original: 123, patch: '' }));
	});
});
