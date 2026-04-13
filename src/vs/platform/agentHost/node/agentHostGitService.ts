/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostGitService = createDecorator<IAgentHostGitService>('agentHostGitService');

export interface IAgentHostGitService {
	readonly _serviceBrand: undefined;
	isInsideWorkTree(workingDirectory: URI): Promise<boolean>;
	getCurrentBranch(workingDirectory: URI): Promise<string | undefined>;
	getBranches(workingDirectory: URI, options?: { readonly query?: string; readonly limit?: number }): Promise<string[]>;
	getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined>;
	getWorktreeRoots(workingDirectory: URI): Promise<URI[]>;
	addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void>;
	removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void>;
}

function getCommonBranchPriority(branch: string): number {
	if (branch === 'main') {
		return 0;
	}
	if (branch === 'master') {
		return 1;
	}
	return 2;
}

export function getBranchCompletions(branches: readonly string[], options?: { readonly query?: string; readonly limit?: number }): string[] {
	const normalizedQuery = options?.query?.toLowerCase();
	const filtered = normalizedQuery
		? branches.filter(branch => branch.toLowerCase().includes(normalizedQuery))
		: [...branches];

	filtered.sort((a, b) => getCommonBranchPriority(a) - getCommonBranchPriority(b));
	return options?.limit ? filtered.slice(0, options.limit) : filtered;
}

export class AgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	async isInsideWorkTree(workingDirectory: URI): Promise<boolean> {
		return (await this._runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']))?.trim() === 'true';
	}

	async getCurrentBranch(workingDirectory: URI): Promise<string | undefined> {
		return (await this._runGit(workingDirectory, ['branch', '--show-current']))?.trim()
			|| (await this._runGit(workingDirectory, ['rev-parse', '--short', 'HEAD']))?.trim()
			|| undefined;
	}

	async getBranches(workingDirectory: URI, options?: { readonly query?: string; readonly limit?: number }): Promise<string[]> {
		const args = ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate'];
		args.push('refs/heads');

		const output = await this._runGit(workingDirectory, args);
		if (!output) {
			return [];
		}
		const branches = output.split(/\r?\n/g).map(line => line.trim()).filter(branch => branch.length > 0);
		return getBranchCompletions(branches, options);
	}

	async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> {
		const repositoryRootPath = (await this._runGit(workingDirectory, ['rev-parse', '--show-toplevel']))?.trim();
		return repositoryRootPath ? URI.file(repositoryRootPath) : undefined;
	}

	async getWorktreeRoots(workingDirectory: URI): Promise<URI[]> {
		const output = await this._runGit(workingDirectory, ['worktree', 'list', '--porcelain']);
		if (!output) {
			return [];
		}
		return output.split(/\r?\n/g)
			.filter(line => line.startsWith('worktree '))
			.map(line => URI.file(line.substring('worktree '.length)));
	}

	async addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void> {
		await this._runGit(repositoryRoot, ['worktree', 'add', '-b', branchName, worktree.fsPath, startPoint], { timeout: 30_000, throwOnError: true });
	}

	async removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void> {
		await this._runGit(repositoryRoot, ['worktree', 'remove', '--force', worktree.fsPath], { timeout: 30_000, throwOnError: true });
	}

	private _runGit(workingDirectory: URI, args: readonly string[], options?: { readonly timeout?: number; readonly throwOnError?: boolean }): Promise<string | undefined> {
		return new Promise((resolve, reject) => {
			cp.execFile('git', [...args], { cwd: workingDirectory.fsPath, timeout: options?.timeout ?? 5000 }, (error, stdout, stderr) => {
				if (error) {
					if (options?.throwOnError) {
						reject(new Error(stderr || error.message));
						return;
					}
					resolve(undefined);
					return;
				}
				resolve(stdout);
			});
		});
	}
}
