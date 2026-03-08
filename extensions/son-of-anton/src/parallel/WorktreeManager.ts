/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * WorktreeManager — manages git worktrees for parallel agent execution.
 *
 * Each agent gets its own isolated worktree to make changes without
 * interfering with other agents or the main working directory.
 */

import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const exec = promisify(cp.exec);

export interface WorktreeInfo {
	/** Unique agent ID that owns this worktree */
	agentId: string;
	/** Branch name for this worktree */
	branch: string;
	/** Absolute path to the worktree directory */
	worktreePath: string;
	/** When the worktree was created */
	createdAt: number;
	/** Files that were changed in this worktree */
	changedFiles: string[];
}

export interface MergeResult {
	success: boolean;
	/** Files that conflicted during merge */
	conflicts: string[];
	/** Human-readable summary of the merge */
	summary: string;
}

export interface WorktreeManagerOptions {
	/** Root directory of the git repository */
	repoRoot: string;
	/** Maximum concurrent worktrees (default: 2) */
	maxConcurrent?: number;
	/** Temp directory for worktrees (default: os.tmpdir()) */
	tempDir?: string;
}

const DEFAULT_MAX_CONCURRENT = 2;

export class WorktreeManager {
	private readonly worktrees = new Map<string, WorktreeInfo>();
	private readonly repoRoot: string;
	private readonly maxConcurrent: number;
	private readonly tempDir: string;

	constructor(options: WorktreeManagerOptions) {
		this.repoRoot = options.repoRoot;
		this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
		this.tempDir = options.tempDir ?? os.tmpdir();
	}

	/**
	 * Create a new worktree for an agent.
	 * The worktree is branched from HEAD of the current branch.
	 */
	async createWorktree(agentId: string): Promise<WorktreeInfo> {
		if (this.worktrees.size >= this.maxConcurrent) {
			throw new Error(
				`Maximum concurrent worktrees (${this.maxConcurrent}) reached. ` +
				`Active worktrees: ${[...this.worktrees.keys()].join(', ')}`
			);
		}

		if (this.worktrees.has(agentId)) {
			throw new Error(`Worktree already exists for agent ${agentId}`);
		}

		const branch = `sota/agent-${agentId}`;
		const worktreePath = path.join(this.tempDir, `sota-agent-${agentId}`);

		// Create the worktree with a new branch from HEAD
		await this.git(`worktree add "${worktreePath}" -b "${branch}" HEAD`);

		const info: WorktreeInfo = {
			agentId,
			branch,
			worktreePath,
			createdAt: Date.now(),
			changedFiles: [],
		};

		this.worktrees.set(agentId, info);
		return info;
	}

	/**
	 * Get the worktree info for an agent.
	 */
	getWorktree(agentId: string): WorktreeInfo | undefined {
		return this.worktrees.get(agentId);
	}

	/**
	 * List all active worktrees.
	 */
	listWorktrees(): WorktreeInfo[] {
		return [...this.worktrees.values()];
	}

	/**
	 * Get the list of files changed in a worktree.
	 */
	async getChangedFiles(agentId: string): Promise<string[]> {
		const info = this.worktrees.get(agentId);
		if (!info) {
			throw new Error(`No worktree for agent ${agentId}`);
		}

		const { stdout } = await exec('git diff --name-only HEAD', {
			cwd: info.worktreePath,
		});

		const files = stdout.trim().split('\n').filter(Boolean);
		info.changedFiles = files;
		return files;
	}

	/**
	 * Check if two agents' worktrees have overlapping changed files.
	 * Used for continuous conflict detection during parallel execution.
	 */
	async checkOverlap(agentIdA: string, agentIdB: string): Promise<string[]> {
		const [filesA, filesB] = await Promise.all([
			this.getChangedFiles(agentIdA),
			this.getChangedFiles(agentIdB),
		]);

		const setB = new Set(filesB);
		return filesA.filter(f => setB.has(f));
	}

	/**
	 * Simulate a three-way merge to predict conflicts before actually merging.
	 */
	async simulateMerge(agentId: string): Promise<MergeResult> {
		const info = this.worktrees.get(agentId);
		if (!info) {
			throw new Error(`No worktree for agent ${agentId}`);
		}

		try {
			// Attempt a dry-run merge
			await this.git(`merge-tree HEAD HEAD "${info.branch}"`);
			return { success: true, conflicts: [], summary: 'Clean merge predicted.' };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);

			// Parse conflict markers from merge-tree output
			const conflictPattern = /CONFLICT \(content\): Merge conflict in (.+)/g;
			const conflicts: string[] = [];
			let match;
			while ((match = conflictPattern.exec(message)) !== null) {
				conflicts.push(match[1]);
			}

			return {
				success: conflicts.length === 0,
				conflicts,
				summary: conflicts.length > 0
					? `Conflicts predicted in: ${conflicts.join(', ')}`
					: 'Merge simulation completed with warnings.',
			};
		}
	}

	/**
	 * Merge a worktree's changes back into the main branch.
	 * Commits changes in the worktree first, then merges into main.
	 */
	async mergeWorktree(agentId: string, commitMessage: string): Promise<MergeResult> {
		const info = this.worktrees.get(agentId);
		if (!info) {
			throw new Error(`No worktree for agent ${agentId}`);
		}

		try {
			// Stage and commit changes in the worktree
			await exec('git add -A', { cwd: info.worktreePath });

			const { stdout: status } = await exec('git status --porcelain', {
				cwd: info.worktreePath,
			});

			if (status.trim()) {
				await exec(
					`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
					{ cwd: info.worktreePath },
				);
			}

			// Merge the agent branch into the current branch in the main repo
			const { stdout, stderr } = await exec(
				`git merge "${info.branch}" --no-edit`,
				{ cwd: this.repoRoot },
			);

			return {
				success: true,
				conflicts: [],
				summary: `Merged ${info.branch}: ${stdout.trim() || 'success'}`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);

			// Parse conflict files
			const conflictPattern = /CONFLICT \(content\): Merge conflict in (.+)/g;
			const conflicts: string[] = [];
			let match;
			while ((match = conflictPattern.exec(message)) !== null) {
				conflicts.push(match[1]);
			}

			// Abort the failed merge
			try {
				await exec('git merge --abort', { cwd: this.repoRoot });
			} catch {
				// May not need aborting if merge didn't start
			}

			return {
				success: false,
				conflicts,
				summary: `Merge failed: ${message}`,
			};
		}
	}

	/**
	 * Remove a worktree and delete its branch.
	 */
	async removeWorktree(agentId: string): Promise<void> {
		const info = this.worktrees.get(agentId);
		if (!info) {
			return;
		}

		try {
			await this.git(`worktree remove "${info.worktreePath}" --force`);
		} catch {
			// Worktree may already be removed
		}

		try {
			await this.git(`branch -D "${info.branch}"`);
		} catch {
			// Branch may already be deleted
		}

		this.worktrees.delete(agentId);
	}

	/**
	 * Remove all worktrees. Used for cleanup on shutdown.
	 */
	async removeAll(): Promise<void> {
		const agents = [...this.worktrees.keys()];
		await Promise.all(agents.map(id => this.removeWorktree(id)));
	}

	/**
	 * Run a git command in the main repository.
	 */
	private async git(args: string): Promise<string> {
		const { stdout } = await exec(`git ${args}`, { cwd: this.repoRoot });
		return stdout.trim();
	}
}
