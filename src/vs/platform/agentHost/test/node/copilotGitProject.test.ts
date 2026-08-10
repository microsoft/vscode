/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PrimaryWorktreeResolutionPass, tryResolvePrimaryWorktreeRoot, type IAgentHostGitService, type IBranch, type IDefaultBranch } from '../../common/agentHostGitService.js';
import { projectFromCopilotContext, projectFromRepository, resolveGitProject } from '../../node/copilot/copilotGitProject.js';

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	repositoryRoot: URI | undefined;
	worktreeRoots: URI[] = [];
	worktreeRootCalls = 0;
	/** Canonical spelling per path; a path absent from the map does not exist. */
	canonicalPaths: Map<string, string> | undefined;

	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return undefined; }
	async getBranch(): Promise<IBranch | undefined> { return undefined; }
	async getRefs(): Promise<IBranch[]> { return []; }
	async getBranches(): Promise<IBranch[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> {
		this.worktreeRootCalls++;
		return this.worktreeRoots;
	}
	async canonicalizeExistingPath(path: URI): Promise<URI | undefined> {
		if (!this.canonicalPaths) {
			return path;
		}
		const canonical = this.canonicalPaths.get(path.fsPath);
		return canonical ? URI.file(canonical) : undefined;
	}
	async addWorktree(): Promise<void> { }
	async copyWorktreeIncludeFiles(): Promise<void> { }
	async addExistingWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
	async branchExists(): Promise<boolean> { return false; }
	async hasUncommittedChanges(): Promise<boolean> { return false; }
	async commitAll(): Promise<void> { }
	async restore(): Promise<void> { }
	async hasUpstream(): Promise<boolean> { return false; }
	async pull(): Promise<void> { }
	async push(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
	async captureWorkingTreeAsTree(): Promise<undefined> { return undefined; }
	async commitTree(): Promise<undefined> { return undefined; }
	async updateRef(): Promise<void> { }
	async deleteRefs(): Promise<void> { }
	async revParse(): Promise<undefined> { return undefined; }
	async resolveBranchBaselineCommit(): Promise<string | undefined> { return undefined; }
	async overlayPathIntoTree(): Promise<string | undefined> { return undefined; }
	async diffTreePaths(): Promise<string[] | undefined> { return undefined; }
	async computeFileDiffsBetweenRefs(): Promise<undefined> { return undefined; }
	async getFetchRemoteUrls(): Promise<undefined> { return undefined; }
	async getUntrackedPaths(): Promise<[]> { return []; }
	async getBranchDiffSafetyInfo(): Promise<undefined> { return undefined; }
	async getDiffPatchBetweenRefs(): Promise<undefined> { return undefined; }
}

suite('Copilot Git Project', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let gitService: TestAgentHostGitService;

	setup(() => {
		gitService = new TestAgentHostGitService();
	});

	test('resolves a repository project from a worktree working directory', async () => {
		gitService.repositoryRoot = URI.file('/workspace/worktree-checkout');
		gitService.worktreeRoots = [URI.file('/workspace/source-repo')];

		const project = await resolveGitProject(URI.file('/workspace/worktree-checkout'), gitService);

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file('/workspace/source-repo').toString(),
			displayName: 'source-repo',
		});
	});

	test('resolves the repository itself for a normal git working directory', async () => {
		gitService.repositoryRoot = URI.file('/workspace/normal-repo');

		const project = await resolveGitProject(URI.file('/workspace/normal-repo'), gitService);

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file('/workspace/normal-repo').toString(),
			displayName: 'normal-repo',
		});
	});

	test('deduplicates concurrent resolution across linked worktrees', async () => {
		const primaryRoot = URI.file('/workspace/source-repo');
		const checkoutA = URI.file('/workspace/source-repo.worktrees/a');
		const checkoutB = URI.file('/workspace/source-repo.worktrees/b');
		gitService.worktreeRoots = [primaryRoot, checkoutA, checkoutB];

		const pass = new PrimaryWorktreeResolutionPass();
		const roots = await Promise.all([
			tryResolvePrimaryWorktreeRoot(gitService, checkoutA, pass),
			tryResolvePrimaryWorktreeRoot(gitService, checkoutB, pass),
		]);

		assert.deepStrictEqual({
			worktreeRootCalls: gitService.worktreeRootCalls,
			roots: roots.map(root => root?.toString()),
		}, {
			worktreeRootCalls: 1,
			roots: [primaryRoot.toString(), primaryRoot.toString()],
		});
	});

	test('spends its budget on git launches, not on whatever ran before them', async () => {
		// Callers arrive together, so a budget started when the pass was built
		// would already be gone before the first launch. It starts at the first
		// launch, which also guarantees a pass always makes progress.
		const primaryRoot = URI.file('/workspace/source-repo');
		gitService.worktreeRoots = [primaryRoot];
		const pass = new PrimaryWorktreeResolutionPass(0);

		const first = await tryResolvePrimaryWorktreeRoot(gitService, URI.file('/workspace/a'), pass);
		await new Promise(resolve => setTimeout(resolve, 5));
		const second = await tryResolvePrimaryWorktreeRoot(gitService, URI.file('/workspace/b'), pass);
		// A caller outside the pass is unaffected, so a repair budget never
		// starves foreground resolution.
		const foreground = await tryResolvePrimaryWorktreeRoot(gitService, URI.file('/workspace/c'));

		assert.deepStrictEqual({
			first: first?.toString(),
			second,
			foreground: foreground?.toString(),
			worktreeRootCalls: gitService.worktreeRootCalls,
		}, {
			first: primaryRoot.toString(),
			second: undefined,
			foreground: primaryRoot.toString(),
			worktreeRootCalls: 2,
		});
	});

	test('answers an exhausted pass from what git already reported', async () => {
		const primaryRoot = URI.file('/workspace/source-repo');
		const checkoutA = URI.file('/workspace/source-repo.worktrees/a');
		const checkoutB = URI.file('/workspace/source-repo.worktrees/b');
		gitService.worktreeRoots = [primaryRoot, checkoutA, checkoutB];
		const pass = new PrimaryWorktreeResolutionPass(0);

		await tryResolvePrimaryWorktreeRoot(gitService, checkoutA, pass);
		const afterBudget = await tryResolvePrimaryWorktreeRoot(gitService, checkoutB, pass);

		assert.deepStrictEqual({
			afterBudget: afterBudget?.toString(),
			worktreeRootCalls: gitService.worktreeRootCalls,
		}, {
			afterBudget: primaryRoot.toString(),
			worktreeRootCalls: 1,
		});
	});

	test('returns undefined outside a git working tree', async () => {
		assert.strictEqual(await resolveGitProject(URI.file('/workspace/plain-folder'), gitService), undefined);
	});

	test('shares one resolution across the spellings of a worktree path', async () => {
		// Git reports resolved paths while a session persists the path it was
		// created with, so both must key the same cache entry.
		const primaryRoot = URI.file('/private/workspace/source-repo');
		const canonicalCheckout = URI.file('/private/workspace/source-repo.worktrees/a');
		gitService.worktreeRoots = [primaryRoot, canonicalCheckout];
		gitService.canonicalPaths = new Map([
			['/workspace/source-repo.worktrees/a', canonicalCheckout.fsPath],
			[canonicalCheckout.fsPath, canonicalCheckout.fsPath],
			[primaryRoot.fsPath, primaryRoot.fsPath],
		]);

		const pass = new PrimaryWorktreeResolutionPass();
		const viaSymlink = await tryResolvePrimaryWorktreeRoot(gitService, URI.file('/workspace/source-repo.worktrees/a'), pass);
		const viaCanonical = await tryResolvePrimaryWorktreeRoot(gitService, canonicalCheckout, pass);

		assert.deepStrictEqual({
			worktreeRootCalls: gitService.worktreeRootCalls,
			roots: [viaSymlink?.toString(), viaCanonical?.toString()],
		}, {
			worktreeRootCalls: 1,
			roots: [primaryRoot.toString(), primaryRoot.toString()],
		});
	});

	test('never launches git for a checkout that no longer exists', async () => {
		gitService.canonicalPaths = new Map();

		const root = await tryResolvePrimaryWorktreeRoot(gitService, URI.file('/workspace/deleted-repo'));

		assert.deepStrictEqual({ root, worktreeRootCalls: gitService.worktreeRootCalls }, { root: undefined, worktreeRootCalls: 0 });
	});

	test('probes a checkout git could not describe once per pass, and again in the next one', async () => {
		// Git reports "not a worktree" and "git could not run" identically, so a
		// failure must never outlive the pass that saw it -- otherwise a repo
		// repaired between listings stays mis-grouped with no way to retry.
		const orphaned = URI.file('/workspace/orphaned-worktree');
		gitService.worktreeRoots = [];
		const pass = new PrimaryWorktreeResolutionPass();

		const first = await tryResolvePrimaryWorktreeRoot(gitService, orphaned, pass);
		const again = await tryResolvePrimaryWorktreeRoot(gitService, orphaned, pass);
		const callsWithinPass = gitService.worktreeRootCalls;

		const primaryRoot = URI.file('/workspace/source-repo');
		gitService.worktreeRoots = [primaryRoot];
		const nextPass = await tryResolvePrimaryWorktreeRoot(gitService, orphaned, new PrimaryWorktreeResolutionPass());

		assert.deepStrictEqual({
			withinPass: [first, again],
			callsWithinPass,
			nextPass: nextPass?.toString(),
			totalCalls: gitService.worktreeRootCalls,
		}, {
			withinPass: [undefined, undefined],
			callsWithinPass: 1,
			nextPass: primaryRoot.toString(),
			totalCalls: 2,
		});
	});

	test('falls back to repository context when no git project is available', async () => {
		const project = await projectFromCopilotContext({ repository: 'microsoft/vscode' }, gitService);

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: 'https://github.com/microsoft/vscode',
			displayName: 'vscode',
		});
	});

	test('parses repository URLs', () => {
		const project = projectFromRepository('https://github.com/microsoft/vscode.git');

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: 'https://github.com/microsoft/vscode.git',
			displayName: 'vscode',
		});
	});
});
