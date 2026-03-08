/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ParallelExecutor — coordinates parallel agent execution using
 * scope locks and git worktrees.
 *
 * Integrates the ScopeLockManager (file-level locking) with the
 * WorktreeManager (isolated git worktrees) to allow multiple agents
 * to work concurrently on non-overlapping file sets.
 */

import { ScopeLockManager, LockConflict } from './ScopeLockManager';
import { WorktreeManager, MergeResult } from './WorktreeManager';

export interface ParallelTask {
	id: string;
	agentId: string;
	instruction: string;
	scopeFiles: string[];
	dependencies: string[];
}

export interface ParallelTaskResult {
	taskId: string;
	agentId: string;
	success: boolean;
	mergeResult?: MergeResult;
	error?: string;
}

export interface ExecutionGroup {
	/** Tasks that can run in parallel */
	parallel: ParallelTask[];
	/** Tasks that must wait for the parallel group to finish */
	serialized: ParallelTask[];
	/** Reason for serialization */
	serializationReasons: Map<string, string>;
}

export interface ParallelExecutorOptions {
	repoRoot: string;
	lockHost: string;
	lockPort: number;
	maxConcurrent?: number;
	lockTtlMs?: number;
	conflictCheckIntervalMs?: number;
}

const DEFAULT_CONFLICT_CHECK_INTERVAL_MS = 15_000;

export class ParallelExecutor {
	private readonly lockManager: ScopeLockManager;
	private readonly worktreeManager: WorktreeManager;
	private readonly conflictCheckIntervalMs: number;

	private conflictCheckTimer: ReturnType<typeof setInterval> | undefined;
	private readonly activeExecutions = new Map<string, ParallelTask>();

	constructor(options: ParallelExecutorOptions) {
		this.lockManager = new ScopeLockManager({
			host: options.lockHost,
			port: options.lockPort,
			defaultTtlMs: options.lockTtlMs,
		});

		this.worktreeManager = new WorktreeManager({
			repoRoot: options.repoRoot,
			maxConcurrent: options.maxConcurrent,
		});

		this.conflictCheckIntervalMs = DEFAULT_CONFLICT_CHECK_INTERVAL_MS;

		// Register deadlock handler
		this.lockManager.onDeadlock((agents) => {
			console.warn(`[ParallelExecutor] Deadlock detected between agents: ${agents.join(', ')}`);
			// Cancel the last agent in the cycle to break the deadlock
			const agentToCancel = agents[agents.length - 1];
			this.lockManager.releaseLock(agentToCancel);
		});
	}

	/**
	 * Analyze a set of tasks and determine which can run in parallel.
	 * Tasks with overlapping scope files are serialized.
	 */
	planExecution(tasks: ParallelTask[]): ExecutionGroup {
		const parallel: ParallelTask[] = [];
		const serialized: ParallelTask[] = [];
		const reasons = new Map<string, string>();

		// Track files claimed by parallel tasks
		const claimedFiles = new Map<string, string>(); // file -> taskId

		for (const task of tasks) {
			// Check if task has unsatisfied dependencies on other tasks in this batch
			const hasDeps = task.dependencies.some(depId =>
				tasks.some(t => t.id === depId)
			);

			if (hasDeps) {
				serialized.push(task);
				reasons.set(task.id, `Depends on: ${task.dependencies.join(', ')}`);
				continue;
			}

			// Check for scope overlap with already-parallel tasks
			const overlapping = task.scopeFiles.filter(f => claimedFiles.has(f));
			if (overlapping.length > 0) {
				serialized.push(task);
				const conflictingTask = claimedFiles.get(overlapping[0])!;
				reasons.set(task.id,
					`File overlap with ${conflictingTask}: ${overlapping.join(', ')}`
				);
				continue;
			}

			// Check for conflicts with existing locks
			const lockConflicts = this.lockManager.checkConflict(task.scopeFiles);
			if (lockConflicts.length > 0) {
				serialized.push(task);
				reasons.set(task.id,
					`Lock conflict: ${lockConflicts.map(c => `${c.file} held by ${c.heldBy}`).join(', ')}`
				);
				continue;
			}

			// Task can run in parallel
			parallel.push(task);
			for (const file of task.scopeFiles) {
				claimedFiles.set(file, task.id);
			}
		}

		return { parallel, serialized, serializationReasons: reasons };
	}

	/**
	 * Execute a task in an isolated worktree with scope locks.
	 * Returns a handle that the caller uses to run the actual agent logic.
	 */
	async prepareExecution(task: ParallelTask): Promise<{
		worktreePath: string;
		execute: (fn: (worktreePath: string) => Promise<void>) => Promise<ParallelTaskResult>;
	}> {
		// Acquire scope locks
		const lockResult = this.lockManager.acquireLock(task.agentId, task.scopeFiles);
		if (!lockResult.success) {
			return {
				worktreePath: '',
				execute: async () => ({
					taskId: task.id,
					agentId: task.agentId,
					success: false,
					error: `Lock conflict: ${lockResult.conflicts?.map(c => c.file).join(', ')}`,
				}),
			};
		}

		// Create worktree
		const worktree = await this.worktreeManager.createWorktree(task.agentId);
		this.activeExecutions.set(task.agentId, task);

		return {
			worktreePath: worktree.worktreePath,
			execute: async (fn: (worktreePath: string) => Promise<void>) => {
				try {
					// Run the agent's logic in the worktree
					await fn(worktree.worktreePath);

					// Simulate merge before committing
					const sim = await this.worktreeManager.simulateMerge(task.agentId);
					if (!sim.success) {
						return {
							taskId: task.id,
							agentId: task.agentId,
							success: false,
							mergeResult: sim,
							error: `Merge conflict predicted: ${sim.conflicts.join(', ')}`,
						};
					}

					// Merge back to main
					const mergeResult = await this.worktreeManager.mergeWorktree(
						task.agentId,
						`[agent:${task.agentId}] ${task.instruction}`,
					);

					return {
						taskId: task.id,
						agentId: task.agentId,
						success: mergeResult.success,
						mergeResult,
						error: mergeResult.success ? undefined : mergeResult.summary,
					};
				} finally {
					// Always cleanup
					this.lockManager.releaseLock(task.agentId);
					await this.worktreeManager.removeWorktree(task.agentId);
					this.activeExecutions.delete(task.agentId);
				}
			},
		};
	}

	/**
	 * Start continuous conflict detection for active parallel agents.
	 * Warns early if agents' changes start overlapping.
	 */
	startConflictDetection(
		onOverlap: (agentA: string, agentB: string, files: string[]) => void,
	): void {
		this.conflictCheckTimer = setInterval(async () => {
			const agents = [...this.activeExecutions.keys()];
			for (let i = 0; i < agents.length; i++) {
				for (let j = i + 1; j < agents.length; j++) {
					try {
						const overlap = await this.worktreeManager.checkOverlap(agents[i], agents[j]);
						if (overlap.length > 0) {
							onOverlap(agents[i], agents[j], overlap);
						}
					} catch {
						// Agent may have finished between check start and now
					}
				}
			}
		}, this.conflictCheckIntervalMs);
	}

	/**
	 * Stop conflict detection and cleanup all resources.
	 */
	async dispose(): Promise<void> {
		if (this.conflictCheckTimer) {
			clearInterval(this.conflictCheckTimer);
		}
		this.lockManager.dispose();
		await this.worktreeManager.removeAll();
	}

	/**
	 * Get current lock status for display in the agent status sidebar.
	 */
	getLockStatus(): Array<{ agentId: string; files: string[]; acquiredAt: number }> {
		return this.lockManager.listLocks().map(lock => ({
			agentId: lock.agentId,
			files: lock.files,
			acquiredAt: lock.acquiredAt,
		}));
	}
}
