/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH,
	AgentHostBuildSourceKind,
	describeUnusableBuild,
	isBuildCacheUsable,
	planAgentHostBuild,
	serializeBuildCacheMarker,
	type IAgentHostBuildDescriptor,
} from './agentHostBuildPlan.js';
import {
	CrossVersionAgentHostTarget,
	resolvePreparedBuild,
	type IBuildFileSystem,
} from './crossVersionAgentHostTarget.js';
import { agentHostLiveCompatBuild, agentHostLiveCompatBuilds, agentHostLiveCompatPlanContext } from './agentHostLiveCompatBuilds.js';

const COMMIT = '97ed7b57c6d9becb4fe386c59157eda016050d6a';
const REPO_ROOT = join('/', 'repo');
const CACHE_ROOT = join('/', 'cache');

function fileSystem(files: Readonly<Record<string, string | true>>): IBuildFileSystem {
	return {
		exists: path => files[path] !== undefined,
		readText: path => (typeof files[path] === 'string' ? files[path] as string : undefined),
	};
}

suite('Agent Host live-compat build planning', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const refBuild: IAgentHostBuildDescriptor = { id: 'legacy', source: AgentHostBuildSourceKind.Ref, ref: COMMIT };
	const workingTreeBuild: IAgentHostBuildDescriptor = { id: 'current', source: AgentHostBuildSourceKind.WorkingTree };
	const context = { repoRoot: REPO_ROOT, cacheRoot: CACHE_ROOT, resolvedCommit: COMMIT, recipeVersion: '1' };

	test('a ref build is planned into the cache, a working-tree build into the repo', () => {
		assert.deepStrictEqual(
			[planAgentHostBuild(refBuild, context), planAgentHostBuild(workingTreeBuild, { ...context, resolvedCommit: undefined })],
			[
				{
					id: 'legacy',
					source: AgentHostBuildSourceKind.Ref,
					ref: COMMIT,
					resolvedCommit: COMMIT,
					description: undefined,
					sourceRoot: join(CACHE_ROOT, 'builds', 'legacy'),
					serverEntry: join(CACHE_ROOT, 'builds', 'legacy', AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH),
					cacheKey: `commit:${COMMIT}|recipe:1`,
					cacheMarkerPath: join(CACHE_ROOT, 'builds', 'legacy', '.agent-host-live-compat-build.json'),
					requiresWorktree: true,
				},
				{
					id: 'current',
					source: AgentHostBuildSourceKind.WorkingTree,
					description: undefined,
					sourceRoot: REPO_ROOT,
					serverEntry: join(REPO_ROOT, AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH),
					cacheKey: undefined,
					cacheMarkerPath: undefined,
					requiresWorktree: false,
				},
			],
		);
	});

	test('inconsistent descriptors are rejected', () => {
		assert.throws(() => planAgentHostBuild({ id: 'Legacy Build', source: AgentHostBuildSourceKind.Ref, ref: COMMIT }, context), /invalid build id/);
		assert.throws(() => planAgentHostBuild({ id: 'legacy', source: AgentHostBuildSourceKind.Ref }, context), /declares none/);
		assert.throws(() => planAgentHostBuild({ id: 'current', source: AgentHostBuildSourceKind.WorkingTree, ref: COMMIT }, context), /must not declare a ref/);
		assert.throws(() => planAgentHostBuild(refBuild, { ...context, resolvedCommit: 'HEAD' }), /not a full commit sha/);
	});

	test('cached output is reused only for a matching commit and recipe', () => {
		const plan = planAgentHostBuild(refBuild, context);
		const matching = serializeBuildCacheMarker(plan.cacheKey!, '2026-01-01T00:00:00.000Z');
		assert.deepStrictEqual(
			[
				isBuildCacheUsable(plan, matching),
				isBuildCacheUsable(plan, serializeBuildCacheMarker(`commit:${COMMIT}|recipe:2`, 'x')),
				isBuildCacheUsable(plan, 'not json'),
				isBuildCacheUsable(plan, undefined),
				isBuildCacheUsable(planAgentHostBuild(workingTreeBuild, { ...context, resolvedCommit: undefined }), matching),
			],
			[true, false, false, false, false],
		);
	});

	test('an unusable build explains what to do about it', () => {
		const plan = planAgentHostBuild(refBuild, context);
		assert.strictEqual(describeUnusableBuild(plan, { serverEntryExists: true, cacheUsable: true }), undefined);
		assert.match(describeUnusableBuild(plan, { serverEntryExists: false, cacheUsable: false })!, /Missing compiled entry[\s\S]*--prepare legacy/);
		assert.match(describeUnusableBuild(plan, { serverEntryExists: true, cacheUsable: false })!, /stale/);
		const current = planAgentHostBuild(workingTreeBuild, { ...context, resolvedCommit: undefined });
		assert.match(describeUnusableBuild(current, { serverEntryExists: false, cacheUsable: false })!, /transpile-client/);
	});

	test('checkpoints are declared for the whole matrix and resolve to plans', () => {
		assert.deepStrictEqual(agentHostLiveCompatBuilds.map(build => build.id), ['legacy', 'predecessor', 'intermediate', 'current']);
		const descriptor = agentHostLiveCompatBuild('intermediate');
		const plan = planAgentHostBuild(descriptor, agentHostLiveCompatPlanContext(descriptor, { repoRoot: REPO_ROOT, cacheRoot: CACHE_ROOT, resolveCommit: () => COMMIT }));
		assert.deepStrictEqual(
			{ sourceRoot: plan.sourceRoot, cacheKey: plan.cacheKey },
			{ sourceRoot: join(CACHE_ROOT, 'builds', 'intermediate'), cacheKey: `commit:${COMMIT}|recipe:1` },
		);
		assert.throws(() => agentHostLiveCompatBuild('nope'), /unknown build checkpoint/);
	});
});

suite('Agent Host cross-version target', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const plan = planAgentHostBuild(
		{ id: 'legacy', source: AgentHostBuildSourceKind.Ref, ref: COMMIT },
		{ repoRoot: REPO_ROOT, cacheRoot: CACHE_ROOT, resolvedCommit: COMMIT, recipeVersion: '1' },
	);

	test('a prepared build resolves only when compiled output matches the checkpoint', () => {
		const prepared = resolvePreparedBuild(plan, fileSystem({
			[plan.serverEntry]: true,
			[plan.cacheMarkerPath!]: serializeBuildCacheMarker(plan.cacheKey!, 'x'),
		}));
		assert.deepStrictEqual(prepared, { id: 'legacy', serverEntry: plan.serverEntry, description: COMMIT });
		assert.throws(() => resolvePreparedBuild(plan, fileSystem({})), /not ready to launch/);
		assert.throws(() => resolvePreparedBuild(plan, fileSystem({ [plan.serverEntry]: true })), /stale/);
	});

	test('the target switches build selection and reports launch history', () => {
		const target = new CrossVersionAgentHostTarget([
			{ id: 'legacy', serverEntry: join(CACHE_ROOT, 'builds', 'legacy', 'entry.js') },
			{ id: 'current', serverEntry: join(REPO_ROOT, 'entry.js') },
		]);
		assert.deepStrictEqual(
			{ initial: target.currentBuildId, id: target.id, launched: target.launchedBuildIds },
			{ initial: 'legacy', id: 'agent-host-live-compat:legacy', launched: [] },
		);
		target.useBuild('current');
		assert.strictEqual(target.currentBuildId, 'current');
		assert.throws(() => target.useBuild('missing'), /unknown build 'missing'/);
	});

	test('the target rejects an empty or ambiguous build set', () => {
		assert.throws(() => new CrossVersionAgentHostTarget([]), /at least one build/);
		assert.throws(() => new CrossVersionAgentHostTarget([{ id: 'a', serverEntry: '/a' }, { id: 'a', serverEntry: '/b' }]), /duplicate build id/);
		assert.throws(() => new CrossVersionAgentHostTarget([{ id: 'a', serverEntry: '/a' }], 'b'), /unknown build 'b'/);
	});

	test('stopping with nothing launched is a no-op', async () => {
		const target = new CrossVersionAgentHostTarget([{ id: 'a', serverEntry: '/a' }]);
		await target.stopCurrentProcess();
		await target.stopCurrentProcess();
		assert.deepStrictEqual(target.launchedBuildIds, []);
	});
});
