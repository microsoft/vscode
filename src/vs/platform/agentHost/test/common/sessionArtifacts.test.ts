/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseSessionArtifactInput, SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { isGitHubArtifactLink, parseSessionArtifacts, readSessionArtifacts, SessionArtifactType, stringifySessionArtifacts, withSessionArtifacts } from '../../common/sessionArtifacts.js';

suite('Session Artifacts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let nextId = 0;
	const createId = () => `id-${++nextId}`;

	setup(() => { nextId = 0; });

	test('adds typed artifacts and stamps isGitHub for pull requests and issues', () => {
		const collection = new SessionArtifactCollection();
		const pullRequest = collection.add(parseSessionArtifactInput({ type: 'pullRequest', label: 'Fix login', link: 'https://github.com/microsoft/vscode/pull/1', createdByThisSession: true }, 'add_artifact'), createId);
		const issue = new SessionArtifactCollection(pullRequest.artifacts).add(parseSessionArtifactInput({ type: 'issue', label: 'Crash', link: 'https://example.com/issues/2' }, 'add_artifact'), createId);
		const commit = new SessionArtifactCollection(issue.artifacts).add(parseSessionArtifactInput({ type: 'commit', label: 'Refactor', link: 'https://github.com/microsoft/vscode/commit/abc', commitHash: 'abc123' }, 'add_artifact'), createId);

		assert.deepStrictEqual(commit.artifacts, [
			{ id: 'id-1', type: SessionArtifactType.PullRequest, label: 'Fix login', link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true, createdByThisSession: true },
			{ id: 'id-2', type: SessionArtifactType.Issue, label: 'Crash', link: 'https://example.com/issues/2', isGitHub: false },
			{ id: 'id-3', type: SessionArtifactType.Commit, label: 'Refactor', link: 'https://github.com/microsoft/vscode/commit/abc', commitHash: 'abc123' },
		]);
	});

	test('rejects a duplicate value and returns the existing artifact', () => {
		const first = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'file', label: 'Plan', uri: 'file:///repo/plan.md' }, 'add_artifact'), createId);
		const duplicate = new SessionArtifactCollection(first.artifacts).add(parseSessionArtifactInput({ type: 'file', label: 'Plan again', uri: 'file:///repo/plan.md' }, 'add_artifact'), createId);

		assert.deepStrictEqual({
			added: duplicate.added,
			id: duplicate.artifact.id,
			count: duplicate.artifacts.length,
		}, {
			added: false,
			id: 'id-1',
			count: 1,
		});
	});

	test('removes by id and reports unknown ids', () => {
		const added = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'website', label: 'Docs', link: 'https://example.com' }, 'add_artifact'), createId);
		const collection = new SessionArtifactCollection(added.artifacts);

		assert.deepStrictEqual({
			removed: collection.remove('id-1').artifacts.length,
			unknown: collection.remove('missing').removed,
		}, {
			removed: 0,
			unknown: undefined,
		});
	});

	test('validates required fields per type', () => {
		assert.throws(() => parseSessionArtifactInput({ type: 'pullRequest', label: 'No link' }, 'add_artifact'), /link/);
		assert.throws(() => parseSessionArtifactInput({ type: 'pullRequest', label: 'No flag', link: 'https://github.com/microsoft/vscode/pull/1' }, 'add_artifact'), /createdByThisSession/);
		assert.throws(() => parseSessionArtifactInput({ type: 'file', label: 'No uri' }, 'add_artifact'), /uri/);
		assert.throws(() => parseSessionArtifactInput({ type: 'commit', label: 'No hash', link: 'https://example.com' }, 'add_artifact'), /commitHash/);
		assert.throws(() => parseSessionArtifactInput({ type: 'unknown', label: 'Bad' }, 'add_artifact'), /type/);
	});

	test('rejects links that are not http(s), since a link is opened externally', () => {
		const parse = (link: string) => () => parseSessionArtifactInput({ type: 'website', label: 'Link', link }, 'add_artifact');

		assert.throws(parse('file:///etc/passwd'), /http\(s\)/);
		assert.throws(parse('vscode://extension/evil'), /http\(s\)/);
		assert.throws(parse('javascript:alert(1)'), /http\(s\)/);
		assert.throws(parse('/not/absolute'), /absolute http\(s\) URL/);
		assert.strictEqual(parseSessionArtifactInput({ type: 'website', label: 'Docs', link: 'https://example.com/x' }, 'add_artifact').link, 'https://example.com/x');
	});

	test('round-trips artifacts through the meta bag and the session database', () => {
		const added = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'resource', label: 'Dashboard', uri: 'https://example.com/dash' }, 'add_artifact'), createId);
		const meta = withSessionArtifacts({ other: 'kept' }, added.artifacts);

		assert.deepStrictEqual({
			meta,
			fromMeta: readSessionArtifacts(meta),
			fromStorage: parseSessionArtifacts(stringifySessionArtifacts(added.artifacts)),
			cleared: withSessionArtifacts(meta, []),
			corrupted: parseSessionArtifacts('not json'),
		}, {
			meta: { other: 'kept', 'agentHost/sessionArtifacts': added.artifacts },
			fromMeta: added.artifacts,
			fromStorage: added.artifacts,
			cleared: { other: 'kept' },
			corrupted: [],
		});
	});

	test('detects GitHub links', () => {
		assert.deepStrictEqual([
			isGitHubArtifactLink('https://github.com/microsoft/vscode/pull/1'),
			isGitHubArtifactLink('https://github.contoso.com/org/repo/issues/2'),
			isGitHubArtifactLink('https://gitlab.com/org/repo/-/merge_requests/3'),
			isGitHubArtifactLink('not a url'),
		], [true, true, false, false]);
	});
});
