/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import type { IGitService, RepoContext } from '../../../git/common/gitService';
import { CopilotChatAttr } from '../genAiAttributes';
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
		expect(result.remoteUrl).toBeDefined();
		expect(result.remoteUrl).toContain('github.com');
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
});
