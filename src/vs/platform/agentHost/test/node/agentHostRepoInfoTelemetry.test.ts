/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostGitService } from '../../common/agentHostGitService.js';
import type { ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentHostRepoInfoTelemetry, measureRepoInfoDiffsJSON, resolveRepoInfoRemote } from '../../node/agentHostRepoInfoTelemetry.js';
import type { IAgentHostRepoInfoReport } from '../../node/agentHostTelemetryReporter.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

const restrictedContext = {
	restrictedTelemetryEnabled: true,
	trackingId: 'tracking-id',
	telemetryEndpoint: 'https://telemetry.example/telemetry',
	isInternal: true,
	userName: 'octocat',
	isVscodeTeamMember: true,
	copilotIgnoreEnabled: false,
};

suite('AgentHostRepoInfoTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves dotcom and configured Enterprise remotes', () => {
		assert.deepStrictEqual({
			https: resolveRepoInfoRemote('https://github.com/microsoft/vscode.git', undefined),
			ssh: resolveRepoInfoRemote('git@github.com:microsoft/vscode.git', undefined),
			enterprise: resolveRepoInfoRemote('ssh://git@ghe.example.com/octo/repo.git', 'ghe.example.com'),
			enterprisePort: resolveRepoInfoRemote('https://ghe.example.com:8443/octo/repo.git', 'ghe.example.com:8443'),
			adoHttps: resolveRepoInfoRemote('https://dev.azure.com/Org/Project/_git/Repo', undefined),
			adoSsh: resolveRepoInfoRemote('git@ssh.dev.azure.com:v3/Org/Project/Repo', undefined),
			wrongEnterprise: resolveRepoInfoRemote('https://other.example.com/octo/repo.git', 'ghe.example.com'),
		}, {
			https: { remoteUrl: 'https://github.com/microsoft/vscode.git', repoId: 'microsoft/vscode', repoType: 'github' },
			ssh: { remoteUrl: 'https://github.com/microsoft/vscode.git', repoId: 'microsoft/vscode', repoType: 'github' },
			enterprise: { remoteUrl: 'https://ghe.example.com/octo/repo.git', repoId: 'octo/repo', repoType: 'github' },
			enterprisePort: { remoteUrl: 'https://ghe.example.com:8443/octo/repo.git', repoId: 'octo/repo', repoType: 'github' },
			adoHttps: { remoteUrl: 'https://dev.azure.com/Org/Project/_git/Repo', repoId: 'org/project/repo', repoType: 'ado' },
			adoSsh: { remoteUrl: 'https://ssh.dev.azure.com/v3/Org/Project/Repo', repoId: 'org/project/repo', repoType: 'ado' },
			wrongEnterprise: undefined,
		});
	});

	test('applies the legacy byte and multiplex character limits', () => {
		assert.deepStrictEqual({
			atCharacterLimit: measureRepoInfoDiffsJSON('x'.repeat(50 * 8192)).tooLarge,
			overCharacterLimit: measureRepoInfoDiffsJSON('x'.repeat(50 * 8192 + 1)).tooLarge,
			overByteLimit: measureRepoInfoDiffsJSON('\u20ac'.repeat(307_201)).tooLarge,
		}, {
			atCharacterLimit: false,
			overCharacterLimit: true,
			overByteLimit: true,
		});
	});

	test('emits structured begin and end snapshots against the branch baseline', async () => {
		const root = URI.file('/repo');
		const snapshots = ['tree-begin', 'tree-begin', 'tree-end', 'tree-end'];
		const patches: string[] = [];
		const fileDiff: ISessionFileDiff = {
			before: { uri: URI.joinPath(root, 'src/a.ts').toString(), content: { uri: 'git-blob://before' } },
			after: { uri: URI.joinPath(root, 'src/a.ts').toString(), content: { uri: 'git-blob://after' } },
			diff: { added: 1, removed: 1 },
		};
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => root,
			getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
			getFetchRemoteUrls: async () => ['git@github.com:microsoft/vscode.git'],
			resolveBranchBaselineCommit: async () => 'base',
			getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
			captureWorkingTreeAsTree: async () => snapshots.shift(),
			computeFileDiffsBetweenRefs: async () => [fileDiff],
			getDiffPatchBetweenRefs: async (_workingDirectory, options) => {
				patches.push(options.toRef);
				return { patch: `patch-${options.toRef}`, tooLarge: false };
			},
		};
		const reports: IAgentHostRepoInfoReport[] = [];
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({
			reportRepoInfo: (_context, report) => reports.push(report),
		}, gitService, createTestGitHubEndpointService(), new NullLogService()));

		await collector.reportBegin(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);
		await collector.reportEnd(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);

		assert.deepStrictEqual({
			patches,
			reports: reports.map(report => ({
				telemetryMessageId: report.telemetryMessageId,
				location: report.location,
				result: report.result,
				remoteUrl: report.remoteUrl,
				repoId: report.repoId,
				headCommitHash: report.headCommitHash,
				headBranchName: report.headBranchName,
				fileRelativePaths: report.fileRelativePaths,
				diffs: report.diffsJSON ? JSON.parse(report.diffsJSON) : undefined,
				workspaceFileCount: report.workspaceFileCount,
				changedFileCount: report.changedFileCount,
			})),
		}, {
			patches: ['tree-begin', 'tree-end'],
			reports: [{
				telemetryMessageId: 'turn-1',
				location: 'begin',
				result: 'success',
				remoteUrl: 'https://github.com/microsoft/vscode.git',
				repoId: 'microsoft/vscode',
				headCommitHash: 'base',
				headBranchName: 'feature',
				fileRelativePaths: JSON.stringify(['src/a.ts']),
				diffs: [{
					uri: URI.joinPath(root, 'src/a.ts').toString(),
					originalUri: URI.joinPath(root, 'src/a.ts').toString(),
					status: 'MODIFIED',
					diff: 'patch-tree-begin',
				}],
				workspaceFileCount: 42,
				changedFileCount: 1,
			}, {
				telemetryMessageId: 'turn-1',
				location: 'end',
				result: 'success',
				remoteUrl: 'https://github.com/microsoft/vscode.git',
				repoId: 'microsoft/vscode',
				headCommitHash: 'base',
				headBranchName: 'feature',
				fileRelativePaths: JSON.stringify(['src/a.ts']),
				diffs: [{
					uri: URI.joinPath(root, 'src/a.ts').toString(),
					originalUri: URI.joinPath(root, 'src/a.ts').toString(),
					status: 'MODIFIED',
					diff: 'patch-tree-end',
				}],
				workspaceFileCount: 42,
				changedFileCount: 1,
			}],
		});
	});

	test('skips Git collection when restricted telemetry is unavailable', async () => {
		let gitCalls = 0;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getSessionGitState: async () => { gitCalls++; return undefined; },
		};
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: () => { } }, gitService, createTestGitHubEndpointService(), new NullLogService()));

		await collector.reportBegin({ ...restrictedContext, restrictedTelemetryEnabled: false, isInternal: false }, 'agent-session://copilot/s1', 'turn-1', URI.file('/repo'), undefined, () => true);

		assert.strictEqual(gitCalls, 0);
	});

	test('does not emit end after a begin result that legacy suppresses', async () => {
		const root = URI.file('/repo');
		const fileDiffs: ISessionFileDiff[] = Array.from({ length: 101 }, (_, index) => ({
			after: { uri: URI.joinPath(root, `file-${index}.txt`).toString(), content: { uri: `git-blob://after/${index}` } },
			diff: { added: 1, removed: 0 },
		}));
		let snapshots = 0;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => root,
			getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
			getFetchRemoteUrls: async () => ['https://github.com/microsoft/vscode'],
			resolveBranchBaselineCommit: async () => 'base',
			getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
			captureWorkingTreeAsTree: async () => { snapshots++; return 'tree'; },
			computeFileDiffsBetweenRefs: async () => fileDiffs,
		};
		const reports: IAgentHostRepoInfoReport[] = [];
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: (_context, report) => reports.push(report) }, gitService, createTestGitHubEndpointService(), new NullLogService()));

		await collector.reportBegin(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);
		await collector.reportEnd(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);

		assert.deepStrictEqual({ snapshots, results: reports.map(report => report.result) }, { snapshots: 1, results: ['tooManyChanges'] });
	});

	test('withholds diff content when content exclusion is enabled or unknown', async () => {
		const root = URI.file('/repo');
		let patchCalls = 0;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => root,
			getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
			getFetchRemoteUrls: async () => ['https://github.com/Microsoft/VSCode'],
			getUntrackedPaths: async () => ['new.txt'],
			resolveBranchBaselineCommit: async () => 'base',
			getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 2 }),
			captureWorkingTreeAsTree: async () => 'tree',
			computeFileDiffsBetweenRefs: async () => [{
				after: { uri: URI.joinPath(root, 'new.txt').toString(), content: { uri: 'git-blob://after' } },
				diff: { added: 1, removed: 0 },
			}],
			getDiffPatchBetweenRefs: async () => { patchCalls++; return { patch: 'secret', tooLarge: false }; },
		};
		const reports: IAgentHostRepoInfoReport[] = [];
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: (_context, report) => reports.push(report) }, gitService, createTestGitHubEndpointService(), new NullLogService()));

		for (const [index, copilotIgnoreEnabled] of [true, undefined].entries()) {
			await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled }, 'agent-session://copilot/s1', `turn-${index}`, root, undefined, () => true);
		}

		assert.deepStrictEqual({
			patchCalls,
			reports: reports.map(report => ({
				repoId: report.repoId,
				fileRelativePaths: report.fileRelativePaths,
				diffsJSON: report.diffsJSON,
				result: report.result,
			})),
		}, {
			patchCalls: 0,
			reports: [{
				repoId: 'microsoft/vscode',
				fileRelativePaths: JSON.stringify(['new.txt']),
				diffsJSON: undefined,
				result: 'success',
			}, {
				repoId: 'microsoft/vscode',
				fileRelativePaths: JSON.stringify(['new.txt']),
				diffsJSON: undefined,
				result: 'success',
			}],
		});
	});

	test('reports filesChanged when the working tree changes during collection', async () => {
		const root = URI.file('/repo');
		const trees = ['tree-before', 'tree-after'];
		const reports: IAgentHostRepoInfoReport[] = [];
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => root,
			getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
			getFetchRemoteUrls: async () => ['https://github.com/microsoft/vscode'],
			resolveBranchBaselineCommit: async () => 'base',
			getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
			captureWorkingTreeAsTree: async () => trees.shift(),
			computeFileDiffsBetweenRefs: async () => [{
				before: { uri: URI.joinPath(root, 'a.txt').toString(), content: { uri: 'git-blob://before' } },
				after: { uri: URI.joinPath(root, 'a.txt').toString(), content: { uri: 'git-blob://after' } },
				diff: { added: 1, removed: 1 },
			}],
			getDiffPatchBetweenRefs: async () => ({ patch: '-before\n+after', tooLarge: false }),
		};
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: (_context, report) => reports.push(report) }, gitService, createTestGitHubEndpointService(), new NullLogService()));

		await collector.reportBegin(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);

		assert.deepStrictEqual(reports.map(report => ({ result: report.result, diffsJSON: report.diffsJSON, fileRelativePaths: report.fileRelativePaths })), [{
			result: 'filesChanged',
			diffsJSON: undefined,
			fileRelativePaths: undefined,
		}]);
	});

	test('marks untracked files and truncates each diff at the legacy limit', async () => {
		const root = URI.file('/repo');
		const reports: IAgentHostRepoInfoReport[] = [];
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => root,
			getSessionGitState: async () => ({ branchName: 'feature', baseBranchName: 'main' }),
			getFetchRemoteUrls: async () => ['https://github.com/microsoft/vscode'],
			getUntrackedPaths: async () => ['new.txt'],
			resolveBranchBaselineCommit: async () => 'base',
			getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
			captureWorkingTreeAsTree: async () => 'tree',
			computeFileDiffsBetweenRefs: async () => [{
				after: { uri: URI.joinPath(root, 'new.txt').toString(), content: { uri: 'git-blob://after' } },
				diff: { added: 1, removed: 0 },
			}],
			getDiffPatchBetweenRefs: async () => ({ patch: 'x'.repeat(100_001), tooLarge: false }),
		};
		const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: (_context, report) => reports.push(report) }, gitService, createTestGitHubEndpointService(), new NullLogService()));

		await collector.reportBegin(restrictedContext, 'agent-session://copilot/s1', 'turn-1', root, undefined, () => true);

		const diffs = JSON.parse(reports[0].diffsJSON ?? '[]');
		assert.deepStrictEqual({
			status: diffs[0]?.status,
			diffLength: diffs[0]?.diff.length,
			truncated: diffs[0]?.diff.endsWith(`... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, 'new.txt').toString()}`),
		}, {
			status: 'UNTRACKED',
			diffLength: 100_001 + `... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, 'new.txt').toString()}`.length,
			truncated: true,
		});
	});
});