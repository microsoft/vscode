/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CostReporter } from './CostReporter';

/**
 * Tunable caps surfaced to the chat surface. Both numbers are in USD; both
 * default to "advisory" when {@link enabled} is false (the meters still
 * render but no turn is ever blocked).
 */
export interface SpendLimits {
	readonly enabled: boolean;
	readonly sessionCapUsd: number;
	readonly taskCapUsd: number;
}

/**
 * Outcome shape for `checkSession()` — the only consumer-facing pre-flight
 * check used by `ChatPanel.handleSendMessage`. Keeping the discriminator
 * simple makes the call-site a one-line guard.
 */
export interface SessionCapOutcome {
	readonly blocked: boolean;
	readonly currentUsd: number;
	readonly capUsd: number;
}

/**
 * SpendGuard — lightweight helper that wraps {@link CostReporter} with the
 * session/task cap policy. The class itself is deliberately stateless beyond
 * the `taskStartCost` snapshot; reading caps re-fetches from configuration
 * so changes via Settings → Features are picked up immediately without an
 * editor restart.
 *
 * Two checks are exposed:
 *
 * - {@link checkSessionCap} — fired BEFORE a user turn dispatches. If the
 *   total session spend already breaches the cap, the caller refuses to
 *   start another turn (modal in the webview).
 * - {@link beginTask} / {@link checkTaskCap} — fired around a single
 *   orchestrator turn. The caller invokes `beginTask()` once the request is
 *   admitted, then calls `checkTaskCap()` after every cost-affecting event
 *   to decide whether to abort mid-turn.
 *
 * Both methods short-circuit (no block) when `enabled === false` so the
 * caps stay advisory unless the user explicitly opts in via
 * `sota.spendLimit.enabled` (default `true`).
 */
export class SpendGuard {
	private taskStartCost = 0;

	constructor(private readonly costReporter: CostReporter) { }

	/**
	 * Snapshot the current session total so subsequent task-cap checks can
	 * compute the per-turn delta. Idempotent — safe to call multiple times
	 * before a single turn dispatches; only the most recent baseline matters.
	 */
	beginTask(): void {
		this.taskStartCost = this.costReporter.getTotalCost();
	}

	/**
	 * Return how much the current task has spent since `beginTask()`. Always
	 * non-negative — defensive against clock skew or session resets that
	 * could otherwise produce a negative delta.
	 */
	getTaskCost(): number {
		const delta = this.costReporter.getTotalCost() - this.taskStartCost;
		return delta > 0 ? delta : 0;
	}

	/**
	 * Pre-flight session-cap check. Returns `blocked: true` when the running
	 * session total has already met or exceeded the cap. The caller is
	 * responsible for surfacing the modal to the user.
	 */
	checkSessionCap(): SessionCapOutcome {
		const limits = readSpendLimits();
		const current = this.costReporter.getTotalCost();
		const cap = limits.sessionCapUsd;
		const blocked = limits.enabled && cap > 0 && current >= cap;
		return { blocked, currentUsd: current, capUsd: cap };
	}

	/**
	 * Mid-turn task-cap check. Returns `true` once the current turn's spend
	 * has met or exceeded the per-task cap, telling the caller to abort.
	 */
	checkTaskCap(): boolean {
		const limits = readSpendLimits();
		if (!limits.enabled || limits.taskCapUsd <= 0) {
			return false;
		}
		return this.getTaskCost() >= limits.taskCapUsd;
	}
}

/**
 * Read the live spend-limit configuration. Number coercion treats non-finite
 * values as "no cap" so a malformed setting can never accidentally block the
 * next turn.
 */
export function readSpendLimits(): SpendLimits {
	const cfg = vscode.workspace.getConfiguration('sota');
	const enabled = cfg.get<boolean>('spendLimit.enabled', true);
	const rawSession = cfg.get<number>('spendLimit.session', 5.0);
	const rawTask = cfg.get<number>('spendLimit.task', 1.0);
	const sessionCapUsd = typeof rawSession === 'number' && Number.isFinite(rawSession) && rawSession >= 0
		? rawSession
		: 5.0;
	const taskCapUsd = typeof rawTask === 'number' && Number.isFinite(rawTask) && rawTask >= 0
		? rawTask
		: 1.0;
	return { enabled, sessionCapUsd, taskCapUsd };
}
