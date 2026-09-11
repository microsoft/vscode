/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import type { IGitService, RepoContext } from '../../../git/common/gitService';
import { CopilotChatAttr, GitHubCopilotAttr } from '../genAiAttributes';
import { resolveWorkspaceOTelMetadata, workspaceMetadataToOTelAttributes } from '../workspaceOTelMetadata';

function createMockGitService(repoContext?: Partial<RepoContext>): IGitService {
	return {
		activeRepository: {
			get: () => repoContext ? {
				rootUri: URI.file('/workspace/repo'),
				kind: 'github',
				headBranchName: 'main',
				headCommitHash: 'abc123',
				upstreamBranchName: undefined,
				upstreamRemote: undefined,
				isRebasing: false,
				remoteFetchUrls: ['https://github.com/microsoft/vscode.git'],
				remotes: ['origin'],
				worktrees: [],
				changes: undefined,
				...repoContext,
			} as RepoContext : undefined,
		},
	} as unknown as IGitService;
}

describe('resolveWorkspaceOTelMetadata', () => {
	it('returns empty object when no active repository', () => {
		const gitService = createMockGitService();
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result).toEqual({});
	});

	it('resolves branch and commit from active repository', () => {
		const gitService = createMockGitService({
			headBranchName: 'feature/test',
			headCommitHash: 'deadbeef',
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.headBranchName).toBe('feature/test');
		expect(result.headCommitHash).toBe('deadbeef');
	});

	it('resolves normalized remote URL', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['https://github.com/microsoft/vscode.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://github.com/microsoft/vscode.git');
	});

	it('resolves remote URL for self-hosted GitHub Enterprise Server on a custom domain', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['https://git.mycompany.com/owner/repo.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://git.mycompany.com/owner/repo.git');
	});

	it('normalizes an scp-style remote on a custom domain', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['git@git.mycompany.com:owner/repo.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://git.mycompany.com/owner/repo.git');
	});

	it('resolves remote URL for GitLab', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['https://gitlab.com/org/repo.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://gitlab.com/org/repo.git');
	});

	it('resolves remote URL for Bitbucket Server, stripping the /scm/ prefix', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['https://bitbucket.mycorp.com/scm/proj/repo.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://bitbucket.mycorp.com/proj/repo.git');
	});

	it('resolves remote URL for Azure DevOps', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['https://dev.azure.com/org/project/_git/repo'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://dev.azure.com/org/project/_git/repo');
	});

	it('ignores local remotes so filesystem paths never reach telemetry', () => {
		for (const localRemote of ['file:///Users/someone/dev/repo', '/Users/someone/dev/repo', '../sibling-repo']) {
			const gitService = createMockGitService({
				remoteFetchUrls: [localRemote],
				remotes: ['origin'],
			});
			expect(resolveWorkspaceOTelMetadata(gitService).remoteUrl).toBeUndefined();
		}
	});

	it('ignores loopback remotes that smuggle a filesystem path through scp syntax', () => {
		const loopbackRemotes = [
			'git@localhost:/Users/alice/dev/repo.git',
			'ssh://git@localhost/Users/alice/dev/repo.git',
			'git@127.0.0.1:/Users/alice/dev/repo.git',
			'git@dev.localhost:/Users/alice/dev/repo.git',
			'https://localhost:8443/Users/alice/dev/repo.git',
			'ssh://git@[::1]/Users/alice/dev/repo.git',
		];
		for (const loopbackRemote of loopbackRemotes) {
			const gitService = createMockGitService({
				remoteFetchUrls: [loopbackRemote],
				remotes: ['origin'],
			});
			expect(resolveWorkspaceOTelMetadata(gitService).remoteUrl, loopbackRemote).toBeUndefined();
		}
	});

	it('still reports a non-loopback host that serves repositories from an absolute path', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: ['git@git.mycompany.com:/srv/git/repo.git'],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		// An absolute path on a routable host is the server's layout, not the user's, so it is
		// reported. The doubled slash is existing `normalizeFetchUrl` behaviour for scp-style
		// remotes whose path is absolute.
		expect(result.remoteUrl).toBe('https://git.mycompany.com//srv/git/repo.git');
	});

	it('skips a loopback remote but still reports a later routable one', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'mirror'],
			remoteFetchUrls: ['git@localhost:/Users/alice/dev/repo.git', 'https://git.mycompany.com/owner/repo.git'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://git.mycompany.com/owner/repo.git');
	});

	it('exposes recognizedRemoteUrl only for remotes that resolve to a repo id', () => {
		const recognized = resolveWorkspaceOTelMetadata(createMockGitService({
			remoteFetchUrls: ['https://github.com/microsoft/vscode.git'],
			remotes: ['origin'],
		}));
		expect(recognized.recognizedRemoteUrl).toBe('https://github.com/microsoft/vscode.git');
		expect(recognized.remoteUrl).toBe('https://github.com/microsoft/vscode.git');

		const ado = resolveWorkspaceOTelMetadata(createMockGitService({
			remoteFetchUrls: ['https://dev.azure.com/org/project/_git/repo'],
			remotes: ['origin'],
		}));
		expect(ado.recognizedRemoteUrl).toBe('https://dev.azure.com/org/project/_git/repo');

		// The whole point of the split: non-OTel telemetry channels must not widen.
		const unrecognized = resolveWorkspaceOTelMetadata(createMockGitService({
			remoteFetchUrls: ['https://git.mycompany.com/owner/repo.git'],
			remotes: ['origin'],
		}));
		expect(unrecognized.remoteUrl).toBe('https://git.mycompany.com/owner/repo.git');
		expect(unrecognized.recognizedRemoteUrl).toBeUndefined();
	});

	it('keeps recognizedRemoteUrl on the resolvable remote in a mixed-remote repository', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'github'],
			remoteFetchUrls: ['https://git.mycompany.com/mirror/repo.git', 'https://github.com/microsoft/vscode.git'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.recognizedRemoteUrl).toBe('https://github.com/microsoft/vscode.git');
		expect(result.remoteUrl).toBe('https://github.com/microsoft/vscode.git');
	});

	it('handles a remote with no fetch URL', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: [undefined],
			remotes: ['origin'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBeUndefined();
	});

	it('prefers a resolvable GitHub remote over a higher-priority unrecognized one', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'github'],
			remoteFetchUrls: ['https://git.mycompany.com/mirror/repo.git', 'https://github.com/microsoft/vscode.git'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://github.com/microsoft/vscode.git');
	});

	it('prefers a resolvable Azure DevOps remote over a higher-priority unrecognized one', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'ado'],
			remoteFetchUrls: ['https://git.mycompany.com/mirror/repo.git', 'https://dev.azure.com/org/project/_git/repo'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://dev.azure.com/org/project/_git/repo');
	});

	it('falls back to an unrecognized remote only when no remote resolves', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'mirror'],
			remoteFetchUrls: ['https://git.mycompany.com/owner/repo.git', 'https://gitlab.com/org/repo.git'],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://git.mycompany.com/owner/repo.git');
	});

	it('prefers the upstream remote over origin for unrecognized hosts', () => {
		const gitService = createMockGitService({
			remotes: ['origin', 'upstream'],
			remoteFetchUrls: ['https://git.mycompany.com/fork/repo.git', 'https://git.mycompany.com/upstream/repo.git'],
			upstreamRemote: 'upstream',
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBe('https://git.mycompany.com/upstream/repo.git');
	});

	it('computes relative file path from repo root', () => {
		const gitService = createMockGitService({});
		const fileUri = URI.file('/workspace/repo/src/app.ts');
		const result = resolveWorkspaceOTelMetadata(gitService, fileUri);
		expect(result.fileRelativePath).toBe('src/app.ts');
	});

	it('handles file at repo root', () => {
		const gitService = createMockGitService({});
		const fileUri = URI.file('/workspace/repo/README.md');
		const result = resolveWorkspaceOTelMetadata(gitService, fileUri);
		expect(result.fileRelativePath).toBe('README.md');
	});

	it('handles file outside repo root', () => {
		const gitService = createMockGitService({});
		const fileUri = URI.file('/other/path/file.ts');
		const result = resolveWorkspaceOTelMetadata(gitService, fileUri);
		expect(result.fileRelativePath).toBeUndefined();
	});

	it('does not false-positive on path prefix match', () => {
		const gitService = createMockGitService({});
		const fileUri = URI.file('/workspace/repo2/file.ts');
		const result = resolveWorkspaceOTelMetadata(gitService, fileUri);
		expect(result.fileRelativePath).toBeUndefined();
	});

	it('handles no remotes', () => {
		const gitService = createMockGitService({
			remoteFetchUrls: [],
			remotes: [],
		});
		const result = resolveWorkspaceOTelMetadata(gitService);
		expect(result.remoteUrl).toBeUndefined();
	});
});

describe('workspaceMetadataToOTelAttributes', () => {
	it('maps all fields to correct OTel attribute keys', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			headBranchName: 'main',
			headCommitHash: 'abc123',
			remoteUrl: 'github.com/org/repo',
			fileRelativePath: 'src/index.ts',
		});
		expect(attrs[CopilotChatAttr.REPO_HEAD_BRANCH_NAME]).toBe('main');
		expect(attrs[CopilotChatAttr.REPO_HEAD_COMMIT_HASH]).toBe('abc123');
		expect(attrs[CopilotChatAttr.REPO_REMOTE_URL]).toBe('github.com/org/repo');
		expect(attrs[CopilotChatAttr.FILE_RELATIVE_PATH]).toBe('src/index.ts');
	});

	it('dual-emits github.copilot.git.* alongside copilot_chat.repo.* and derives github.org', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			headBranchName: 'feature/x',
			headCommitHash: 'cafef00d',
			remoteUrl: 'https://github.com/microsoft/vscode.git',
		});
		expect(attrs[GitHubCopilotAttr.GIT_BRANCH]).toBe('feature/x');
		expect(attrs[GitHubCopilotAttr.GIT_COMMIT_SHA]).toBe('cafef00d');
		expect(attrs[GitHubCopilotAttr.GIT_REPOSITORY]).toBe('https://github.com/microsoft/vscode.git');
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBe('microsoft');
		// Legacy keys must still be present.
		expect(attrs[CopilotChatAttr.REPO_HEAD_BRANCH_NAME]).toBe('feature/x');
	});

	it('omits github.org for non-github remotes', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			remoteUrl: 'https://gitlab.com/org/repo.git',
		});
		expect(attrs[GitHubCopilotAttr.GIT_REPOSITORY]).toBe('https://gitlab.com/org/repo.git');
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBeUndefined();
	});

	it('derives github.org for GitHub Enterprise Cloud remotes', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			remoteUrl: 'https://myco.ghe.com/acme/repo.git',
		});
		expect(attrs[GitHubCopilotAttr.GIT_REPOSITORY]).toBe('https://myco.ghe.com/acme/repo.git');
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBe('acme');
	});

	it('derives github.org through an ssh host alias', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			remoteUrl: 'https://alias-github.com/microsoft/vscode.git',
		});
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBe('microsoft');
	});

	it('emits the repository URL but no github.org for custom-domain GitHub Enterprise Server', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			remoteUrl: 'https://git.mycompany.com/owner/repo.git',
		});
		expect(attrs[GitHubCopilotAttr.GIT_REPOSITORY]).toBe('https://git.mycompany.com/owner/repo.git');
		expect(attrs[CopilotChatAttr.REPO_REMOTE_URL]).toBe('https://git.mycompany.com/owner/repo.git');
		// Distinguishing a custom GHES domain from an arbitrary git host needs the configured
		// `github-enterprise.uri`, which this module cannot read.
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBeUndefined();
	});

	it('emits the repository URL but no github.org for Bitbucket Server', () => {
		const attrs = workspaceMetadataToOTelAttributes({
			remoteUrl: 'https://bitbucket.mycorp.com/proj/repo.git',
		});
		expect(attrs[GitHubCopilotAttr.GIT_REPOSITORY]).toBe('https://bitbucket.mycorp.com/proj/repo.git');
		expect(attrs[GitHubCopilotAttr.GITHUB_ORG]).toBeUndefined();
	});
});
