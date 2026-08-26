/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Entry point for running the forward-migration matrix.
 *
 * The split from {@link forwardMigrationMatrix} is deliberate. That module
 * knows how to drive two *already resolved* builds and nothing else, which is
 * what makes it testable without a prepared cache. This module owns the messy
 * outside world: turning checkpoint ids into launchable builds, deciding what
 * pairs constitute "forward", and shaping a summary for a caller.
 *
 * Two rules carry over from the baseline matrix and are restated because they
 * are properties of the *result*, not of the code:
 *
 * - **A pair is never silently skipped.** A checkpoint that cannot be resolved
 *   is reported as a failed entry carrying the resolver's own explanation
 *   (which names the exact `--prepare` command to run), so a run that covered
 *   two of three upgrades can never be mistaken for a run that covered three.
 * - **Pairs run sequentially**, for the same attributability reason.
 */

import { AgentHostBuildId } from '../harness/agentHostLiveCompatBuilds.js';
import type { IPreparedAgentHostBuild } from '../harness/crossVersionAgentHostTarget.js';
import { resolveBuild, type ILiveCompatMatrixOptions } from './agentHostLiveCompatMatrix.js';
import { runForwardMigrationScenario, type IForwardMigrationSummary } from './forwardMigrationMatrix.js';
import type { ILiveCompatScenarioResult } from './sameBuildRestartBaseline.js';

/**
 * The source checkpoints, oldest first. Every one of them upgrades to the
 * working tree, which is the only build a forward claim can be *about*.
 */
export const FORWARD_MIGRATION_SOURCES: readonly string[] = Object.freeze([
	AgentHostBuildId.Legacy,
	AgentHostBuildId.Predecessor,
	AgentHostBuildId.Intermediate,
]);

export interface IRunForwardMigrationOptions extends ILiveCompatMatrixOptions {
	/** Source checkpoints to upgrade from. Defaults to all three. */
	readonly sources?: readonly string[];
	/**
	 * Also run each pair with several sessions in the profile.
	 *
	 * Kept opt-out rather than opt-in: a single-session upgrade cannot detect a
	 * migration that preserves one row but conflates identities across a set,
	 * and that is a realistic failure mode.
	 */
	readonly includeMultiSession?: boolean;
	/** How many sessions the multi-session variant seeds. */
	readonly multiSessionCount?: number;
}

/**
 * Run every forward-migration pair and summarize the outcome.
 */
export async function runForwardMigrations(options: IRunForwardMigrationOptions): Promise<IForwardMigrationSummary> {
	const startedAt = Date.now();
	const sources = options.sources ?? FORWARD_MIGRATION_SOURCES;
	const includeMultiSession = options.includeMultiSession ?? true;
	const multiSessionCount = options.multiSessionCount ?? 3;
	const results: ILiveCompatScenarioResult[] = [];

	// Resolved once: a missing working tree is a property of the run, not of
	// each pair, and re-resolving it per pair would repeat the same message
	// three times while hiding that they share a single cause.
	let target: IPreparedAgentHostBuild | undefined;
	let targetError: string | undefined;
	try {
		target = resolveBuild(AgentHostBuildId.Current, options);
	} catch (error) {
		targetError = messageOf(error);
	}

	for (const sourceId of sources) {
		let source: IPreparedAgentHostBuild | undefined;
		let sourceError: string | undefined;
		try {
			source = resolveBuild(sourceId, options);
		} catch (error) {
			sourceError = messageOf(error);
		}

		const unresolved = sourceError ?? targetError;
		if (unresolved || !source || !target) {
			results.push(unresolvedResult(sourceId, unresolved ?? 'build could not be resolved', startedAt));
			continue;
		}

		results.push(await runForwardMigrationScenario(source, target, {
			diagnosticsRoot: options.diagnosticsRoot,
			scenarioSuffix: 'single-session',
		}));
		if (includeMultiSession) {
			results.push(await runForwardMigrationScenario(source, target, {
				diagnosticsRoot: options.diagnosticsRoot,
				sessionCount: multiSessionCount,
				scenarioSuffix: 'multi-session',
			}));
		}
	}

	return {
		suite: 'agent-host-live-compat/forward-migration',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(result => result.outcome === 'passed') ? 'passed' : 'failed',
		results,
	};
}

function unresolvedResult(sourceId: string, detail: string, startedAt: number): ILiveCompatScenarioResult {
	return {
		scenario: 'forward-migration',
		build: `${sourceId}->${AgentHostBuildId.Current}`,
		outcome: 'failed',
		durationMs: Date.now() - startedAt,
		steps: [{ name: 'resolve-build', outcome: 'failed', durationMs: 0, detail }],
		diagnosticsPath: '',
		error: detail,
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
