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
	const TOOL = 'add_artifact_or_reference';

	setup(() => { nextId = 0; });

	test('adds typed artifacts and references and stamps isGitHub for pull requests and issues', () => {
		const collection = new SessionArtifactCollection();
		const pullRequest = collection.add(parseSessionArtifactInput({ type: 'pullRequest', label: 'Fix login', link: 'https://github.com/microsoft/vscode/pull/1', isArtifact: true }, TOOL), createId);
		const issue = new SessionArtifactCollection(pullRequest.artifacts).add(parseSessionArtifactInput({ type: 'issue', label: 'Crash', link: 'https://example.com/issues/2', isArtifact: false }, TOOL), createId);
		const commit = new SessionArtifactCollection(issue.artifacts).add(parseSessionArtifactInput({ type: 'commit', label: 'Refactor', link: 'https://github.com/microsoft/vscode/commit/abc', commitHash: 'abc123', isArtifact: false }, TOOL), createId);

		assert.deepStrictEqual(commit.artifacts, [
			{ id: 'id-1', type: SessionArtifactType.PullRequest, label: 'Fix login', isArtifact: true, link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true },
			{ id: 'id-2', type: SessionArtifactType.Issue, label: 'Crash', isArtifact: false, link: 'https://example.com/issues/2', isGitHub: false },
			{ id: 'id-3', type: SessionArtifactType.Commit, label: 'Refactor', isArtifact: false, link: 'https://github.com/microsoft/vscode/commit/abc', commitHash: 'abc123' },
		]);
	});

	test('rejects a duplicate value and returns the existing artifact', () => {
		const first = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'file', label: 'Plan', uri: 'file:///repo/plan.md', isArtifact: true }, TOOL), createId);
		const duplicate = new SessionArtifactCollection(first.artifacts).add(parseSessionArtifactInput({ type: 'file', label: 'Plan again', uri: 'file:///repo/plan.md', isArtifact: true }, TOOL), createId);

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
		const added = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'website', label: 'Docs', link: 'https://example.com', isArtifact: false }, TOOL), createId);
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
		assert.throws(() => parseSessionArtifactInput({ type: 'pullRequest', label: 'No link', isArtifact: true }, TOOL), /link/);
		assert.throws(() => parseSessionArtifactInput({ type: 'pullRequest', label: 'No flag', link: 'https://github.com/microsoft/vscode/pull/1' }, TOOL), /isArtifact/);
		assert.throws(() => parseSessionArtifactInput({ type: 'file', label: 'No uri', isArtifact: true }, TOOL), /uri/);
		assert.throws(() => parseSessionArtifactInput({ type: 'commit', label: 'No hash', link: 'https://example.com', isArtifact: false }, TOOL), /commitHash/);
		assert.throws(() => parseSessionArtifactInput({ type: 'unknown', label: 'Bad', isArtifact: true }, TOOL), /type/);
	});

	test('rejects a uri the client could not open, which would vanish from every pill', () => {
		const parse = (uri: string) => () => parseSessionArtifactInput({ type: 'file', label: 'Plan', uri, isArtifact: true }, TOOL);

		assert.throws(parse('plan.md'), /absolute URI/);
		assert.throws(parse('/repo/plan.md'), /absolute URI/);
		assert.throws(parse('C:\\repo\\plan.md'), /absolute URI/);
		// A scheme the URI grammar rejects: the client fails to parse it too.
		assert.throws(parse('foo/bar:baz'), /absolute URI/);
		assert.strictEqual(parseSessionArtifactInput({ type: 'file', label: 'Plan', uri: 'file:///repo/plan.md', isArtifact: true }, TOOL).uri, 'file:///repo/plan.md');
		// Validation is the client's own parse, so anything it opens is accepted —
		// a leading digit is legal for `URI`, whose scheme grammar is the contract.
		assert.strictEqual(parseSessionArtifactInput({ type: 'resource', label: 'Custom', uri: '1scheme:/x', isArtifact: true }, TOOL).uri, '1scheme:/x');
	});

	test('rejects links that are not http(s), since a link is opened externally', () => {
		const parse = (link: string) => () => parseSessionArtifactInput({ type: 'website', label: 'Link', link, isArtifact: false }, TOOL);

		assert.throws(parse('file:///etc/passwd'), /http\(s\)/);
		assert.throws(parse('vscode://extension/evil'), /http\(s\)/);
		assert.throws(parse('javascript:alert(1)'), /http\(s\)/);
		assert.throws(parse('/not/absolute'), /absolute http\(s\) URL/);
		assert.strictEqual(parseSessionArtifactInput({ type: 'website', label: 'Docs', link: 'https://example.com/x', isArtifact: false }, TOOL).link, 'https://example.com/x');
	});

	test('round-trips artifacts through the meta bag and the session database', () => {
		const added = new SessionArtifactCollection().add(parseSessionArtifactInput({ type: 'resource', label: 'Dashboard', uri: 'https://example.com/dash', isArtifact: true }, TOOL), createId);
		const meta = withSessionArtifacts({ other: 'kept' }, added.artifacts);

		assert.deepStrictEqual({
			meta,
			fromMeta: readSessionArtifacts(meta),
			fromStorage: parseSessionArtifacts(stringifySessionArtifacts(added.artifacts)).artifacts,
			cleared: withSessionArtifacts(meta, []),
		}, {
			meta: { other: 'kept', 'agentHost/sessionArtifacts': added.artifacts },
			fromMeta: added.artifacts,
			fromStorage: added.artifacts,
			cleared: { other: 'kept' },
		});
	});

	test('reports what persisted state could not be read, rather than silently losing it', () => {
		const valid = { id: 'id-1', type: SessionArtifactType.Website, label: 'Docs', isArtifact: true, link: 'https://example.com' };

		assert.deepStrictEqual({
			corrupt: parseSessionArtifacts('not json').error !== undefined,
			notAnArray: parseSessionArtifacts('{}').error !== undefined,
			partial: parseSessionArtifacts(JSON.stringify([valid, { id: 'id-2' }, 'nonsense'])),
			absent: parseSessionArtifacts(undefined),
		}, {
			corrupt: true,
			notAnArray: true,
			partial: { artifacts: [valid], dropped: 2 },
			absent: { artifacts: [], dropped: 0 },
		});
	});

	test('reads entries recorded before references existed as artifacts', () => {
		const legacy = [{ id: 'id-1', type: SessionArtifactType.PullRequest, label: 'Legacy', link: 'https://github.com/microsoft/vscode/pull/1', createdByThisSession: false }];

		assert.deepStrictEqual(readSessionArtifacts({ 'agentHost/sessionArtifacts': legacy }), [
			{ id: 'id-1', type: SessionArtifactType.PullRequest, label: 'Legacy', isArtifact: true, link: 'https://github.com/microsoft/vscode/pull/1' },
		]);
	});

	test('rejects a malformed isArtifact rather than reading it as an artifact', () => {
		const entry = (isArtifact: unknown) => ({ id: 'id-1', type: SessionArtifactType.Website, label: 'Docs', link: 'https://example.com', isArtifact });
		const read = (isArtifact: unknown) => readSessionArtifacts({ 'agentHost/sessionArtifacts': [entry(isArtifact)] }).map(artifact => artifact.isArtifact);

		assert.deepStrictEqual({
			trueFlag: read(true),
			falseFlag: read(false),
			stringFalse: read('false'),
			nullFlag: read(null),
			numberFlag: read(0),
		}, {
			trueFlag: [true],
			falseFlag: [false],
			// Only a boolean or an absent field is accepted, so these are dropped
			// and counted as malformed rather than silently becoming artifacts.
			stringFalse: [],
			nullFlag: [],
			numberFlag: [],
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
