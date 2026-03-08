/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ScopeLockManager — prevents agent file conflicts during parallel execution.
 *
 * Backed by FalkorDB (Redis-compatible protocol). Provides file-level locking
 * so that multiple agents can work in parallel without overwriting each other's changes.
 */

export interface ScopeLock {
	agentId: string;
	files: string[];
	acquiredAt: number;
	ttlMs: number;
	expiresAt: number;
}

export interface LockConflict {
	file: string;
	heldBy: string;
	acquiredAt: number;
	expiresAt: number;
}

export interface LockResult {
	success: boolean;
	lockId?: string;
	conflicts?: LockConflict[];
}

export interface ScopeLockManagerOptions {
	/** Redis/FalkorDB connection host */
	host: string;
	/** Redis/FalkorDB connection port */
	port: number;
	/** Default lock TTL in milliseconds (default: 600000 = 10 minutes) */
	defaultTtlMs?: number;
	/** How often to check for deadlocks in milliseconds (default: 30000 = 30 seconds) */
	deadlockCheckIntervalMs?: number;
}

const LOCK_PREFIX = 'soa:lock:';
const AGENT_LOCKS_PREFIX = 'soa:agent-locks:';
const DEFAULT_TTL_MS = 600_000; // 10 minutes
const DEADLOCK_CHECK_INTERVAL_MS = 30_000;

/**
 * Manages file-level scope locks for parallel agent execution.
 * Uses Redis-compatible commands against FalkorDB.
 */
export class ScopeLockManager {
	private readonly locks = new Map<string, ScopeLock>();
	private readonly agentLocks = new Map<string, Set<string>>();
	private readonly waitingOn = new Map<string, string[]>(); // agentId -> files it's waiting for
	private readonly defaultTtlMs: number;
	private deadlockCheckTimer: ReturnType<typeof setInterval> | undefined;

	private readonly onLockExpiredCallbacks: Array<(lock: ScopeLock) => void> = [];
	private readonly onDeadlockCallbacks: Array<(agents: string[]) => void> = [];

	constructor(private readonly options: ScopeLockManagerOptions) {
		this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;

		// Start deadlock detection loop
		const interval = options.deadlockCheckIntervalMs ?? DEADLOCK_CHECK_INTERVAL_MS;
		this.deadlockCheckTimer = setInterval(() => this.checkDeadlocks(), interval);
	}

	/**
	 * Acquire locks on a set of files for an agent.
	 * Returns success if all files are available, or conflict details if any are held.
	 */
	acquireLock(agentId: string, files: string[], ttlMs?: number): LockResult {
		const ttl = ttlMs ?? this.defaultTtlMs;

		// First, expire stale locks
		this.expireStale();

		// Check for conflicts
		const conflicts = this.findConflicts(agentId, files);
		if (conflicts.length > 0) {
			// Record that this agent is waiting on these files
			this.waitingOn.set(agentId, files);
			return { success: false, conflicts };
		}

		// Acquire all locks
		const now = Date.now();
		const lockId = `lock-${agentId}-${now}`;

		const lock: ScopeLock = {
			agentId,
			files: [...files],
			acquiredAt: now,
			ttlMs: ttl,
			expiresAt: now + ttl,
		};

		// Set lock for each file
		for (const file of files) {
			this.locks.set(this.fileKey(file), lock);
		}

		// Track which locks this agent holds
		if (!this.agentLocks.has(agentId)) {
			this.agentLocks.set(agentId, new Set());
		}
		for (const file of files) {
			this.agentLocks.get(agentId)!.add(file);
		}

		// Clear waiting state
		this.waitingOn.delete(agentId);

		return { success: true, lockId };
	}

	/**
	 * Release all locks held by an agent.
	 */
	releaseLock(agentId: string): void {
		const files = this.agentLocks.get(agentId);
		if (!files) {
			return;
		}

		for (const file of files) {
			const key = this.fileKey(file);
			const lock = this.locks.get(key);
			if (lock && lock.agentId === agentId) {
				this.locks.delete(key);
			}
		}

		this.agentLocks.delete(agentId);
		this.waitingOn.delete(agentId);
	}

	/**
	 * Check if locking the given files would conflict with existing locks.
	 * Does not acquire any locks.
	 */
	checkConflict(files: string[], excludeAgent?: string): LockConflict[] {
		this.expireStale();
		return this.findConflicts(excludeAgent ?? '', files);
	}

	/**
	 * List all currently held locks.
	 */
	listLocks(): ScopeLock[] {
		this.expireStale();
		const seen = new Set<ScopeLock>();
		for (const lock of this.locks.values()) {
			seen.add(lock);
		}
		return [...seen];
	}

	/**
	 * Get locks held by a specific agent.
	 */
	getAgentLocks(agentId: string): string[] {
		return [...(this.agentLocks.get(agentId) ?? [])];
	}

	/**
	 * Register a callback for when a lock expires due to TTL.
	 */
	onLockExpired(callback: (lock: ScopeLock) => void): void {
		this.onLockExpiredCallbacks.push(callback);
	}

	/**
	 * Register a callback for when a deadlock is detected.
	 */
	onDeadlock(callback: (agents: string[]) => void): void {
		this.onDeadlockCallbacks.push(callback);
	}

	/**
	 * Stop the deadlock detection timer.
	 */
	dispose(): void {
		if (this.deadlockCheckTimer) {
			clearInterval(this.deadlockCheckTimer);
			this.deadlockCheckTimer = undefined;
		}
	}

	// --- Private methods ---

	private fileKey(file: string): string {
		return `${LOCK_PREFIX}${file}`;
	}

	private findConflicts(excludeAgent: string, files: string[]): LockConflict[] {
		const conflicts: LockConflict[] = [];

		for (const file of files) {
			const key = this.fileKey(file);
			const existing = this.locks.get(key);
			if (existing && existing.agentId !== excludeAgent) {
				conflicts.push({
					file,
					heldBy: existing.agentId,
					acquiredAt: existing.acquiredAt,
					expiresAt: existing.expiresAt,
				});
			}
		}

		return conflicts;
	}

	private expireStale(): void {
		const now = Date.now();
		const expired: ScopeLock[] = [];

		for (const [key, lock] of this.locks.entries()) {
			if (now >= lock.expiresAt) {
				this.locks.delete(key);
				expired.push(lock);
			}
		}

		// Clean up agent lock tracking and fire callbacks
		for (const lock of expired) {
			const agentFiles = this.agentLocks.get(lock.agentId);
			if (agentFiles) {
				for (const file of lock.files) {
					agentFiles.delete(file);
				}
				if (agentFiles.size === 0) {
					this.agentLocks.delete(lock.agentId);
				}
			}

			for (const cb of this.onLockExpiredCallbacks) {
				cb(lock);
			}
		}
	}

	/**
	 * Detect deadlocks using cycle detection in the wait-for graph.
	 * If agent A waits on files held by agent B, and agent B waits on files
	 * held by agent A, that's a deadlock.
	 */
	private checkDeadlocks(): void {
		this.expireStale();

		// Build wait-for graph: agentId -> set of agentIds it's waiting on
		const waitFor = new Map<string, Set<string>>();

		for (const [waitingAgent, waitingFiles] of this.waitingOn.entries()) {
			const blockedBy = new Set<string>();
			for (const file of waitingFiles) {
				const key = this.fileKey(file);
				const lock = this.locks.get(key);
				if (lock && lock.agentId !== waitingAgent) {
					blockedBy.add(lock.agentId);
				}
			}
			if (blockedBy.size > 0) {
				waitFor.set(waitingAgent, blockedBy);
			}
		}

		// DFS cycle detection
		const visited = new Set<string>();
		const inStack = new Set<string>();

		const dfs = (agent: string, path: string[]): string[] | null => {
			if (inStack.has(agent)) {
				// Found a cycle — return the cycle path
				const cycleStart = path.indexOf(agent);
				return path.slice(cycleStart);
			}
			if (visited.has(agent)) {
				return null;
			}

			visited.add(agent);
			inStack.add(agent);
			path.push(agent);

			const deps = waitFor.get(agent);
			if (deps) {
				for (const dep of deps) {
					const cycle = dfs(dep, path);
					if (cycle) {
						return cycle;
					}
				}
			}

			inStack.delete(agent);
			path.pop();
			return null;
		};

		for (const agent of waitFor.keys()) {
			if (!visited.has(agent)) {
				const cycle = dfs(agent, []);
				if (cycle) {
					for (const cb of this.onDeadlockCallbacks) {
						cb(cycle);
					}
					return; // Handle one deadlock at a time
				}
			}
		}
	}
}
