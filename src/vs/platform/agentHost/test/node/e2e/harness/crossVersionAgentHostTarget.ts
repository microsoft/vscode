/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-version ("live compatibility") Agent Host targets.
 *
 * A live-compat scenario runs several *phases* against one preserved isolated
 * user-data directory, switching the Agent Host **build** between phases:
 *
 * ```ts
 * const target = new CrossVersionAgentHostTarget(builds);
 * target.useBuild('legacy');   // phase 1 runs on the historical build
 * // ... drive AHP ...
 * target.useBuild('current');  // phase 2 relaunches on the current build
 * await harness.restart();     //   … same homeDir/userDataDir/replay proxy
 * ```
 *
 * Everything else is unchanged: assertions stay over AHP, and model traffic
 * still goes through the same `CapiReplayProxy` instance, so replay remains
 * strict and host-only tests still hard-fail on an unexpected model request.
 *
 * This file only *launches* builds. Materializing and compiling them is the
 * job of `scripts/test-agent-host-live-compat.ts`; a build that has not been
 * prepared produces an actionable error here rather than a module-not-found
 * crash inside a forked child.
 */

import { existsSync, readFileSync } from 'fs';
import { startRealServer, stopServer, type IServerHandle } from '../../serverIntegrationTestHelpers.js';
import {
	AgentHostBuildSourceKind,
	describeUnusableBuild,
	isBuildCacheUsable,
	planAgentHostBuild,
	type IAgentHostBuildDescriptor,
	type IAgentHostBuildPlan,
	type IAgentHostBuildPlanContext,
} from './agentHostBuildPlan.js';
import type { IAgentHostTarget, IAgentHostTargetLaunchOptions } from './agentHostTarget.js';

/**
 * A single prepared build the suite can launch. Produced by
 * {@link resolvePreparedBuild} from a descriptor, or constructed directly in
 * tests that want to exercise the target without compiling anything.
 */
export interface IPreparedAgentHostBuild {
	readonly id: string;
	/** Absolute path of the compiled agent host server entry to fork. */
	readonly serverEntry: string;
	/** Human readable provenance for diagnostics, e.g. a commit sha. */
	readonly description?: string;
}

/** Filesystem probes the resolver needs; injectable so the rules are testable. */
export interface IBuildFileSystem {
	readonly exists: (path: string) => boolean;
	readonly readText: (path: string) => string | undefined;
}

export const realBuildFileSystem: IBuildFileSystem = {
	exists: path => existsSync(path),
	readText: path => {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return undefined;
		}
	},
};

/**
 * Turn a planned build into a launchable one, or explain precisely what is
 * missing. Never builds anything: preparation is an explicit, scriptable step.
 */
export function resolvePreparedBuild(plan: IAgentHostBuildPlan, fileSystem: IBuildFileSystem = realBuildFileSystem): IPreparedAgentHostBuild {
	const cacheUsable = plan.cacheMarkerPath === undefined
		? plan.source === AgentHostBuildSourceKind.WorkingTree
		: isBuildCacheUsable(plan, fileSystem.readText(plan.cacheMarkerPath));
	const problem = describeUnusableBuild(plan, { serverEntryExists: fileSystem.exists(plan.serverEntry), cacheUsable });
	if (problem) {
		throw new Error(problem);
	}
	return {
		id: plan.id,
		serverEntry: plan.serverEntry,
		description: plan.description ?? plan.resolvedCommit ?? plan.ref,
	};
}

export function resolvePreparedBuilds(
	descriptors: readonly IAgentHostBuildDescriptor[],
	context: (descriptor: IAgentHostBuildDescriptor) => IAgentHostBuildPlanContext,
	fileSystem: IBuildFileSystem = realBuildFileSystem,
): readonly IPreparedAgentHostBuild[] {
	return descriptors.map(descriptor => resolvePreparedBuild(planAgentHostBuild(descriptor, context(descriptor)), fileSystem));
}

/**
 * An {@link IAgentHostTarget} whose underlying build can be switched between
 * phases of a scenario. Launching always goes through the same code path as
 * the default target, so the persistent dirs and the replay proxy handed in by
 * the harness are honored identically on every build.
 */
export class CrossVersionAgentHostTarget implements IAgentHostTarget {

	private readonly _builds = new Map<string, IPreparedAgentHostBuild>();
	private _current: IPreparedAgentHostBuild;
	private _lastLaunched: IServerHandle | undefined;
	private readonly _launchedBuildIds: string[] = [];

	constructor(builds: readonly IPreparedAgentHostBuild[], initialBuildId?: string) {
		if (builds.length === 0) {
			throw new Error('[agent-host-live-compat] a cross-version target needs at least one build');
		}
		for (const build of builds) {
			if (this._builds.has(build.id)) {
				throw new Error(`[agent-host-live-compat] duplicate build id '${build.id}'`);
			}
			this._builds.set(build.id, build);
		}
		this._current = initialBuildId ? this._lookup(initialBuildId) : builds[0];
	}

	get id(): string {
		return `agent-host-live-compat:${this._current.id}`;
	}

	/** The build id the next launch will use. */
	get currentBuildId(): string {
		return this._current.id;
	}

	/** Build ids actually launched so far, in order. Useful for phase assertions. */
	get launchedBuildIds(): readonly string[] {
		return this._launchedBuildIds;
	}

	/**
	 * Select the build subsequent launches use. The caller still drives the
	 * relaunch (typically `harness.restart()`), which is what preserves the
	 * user-data directory and the replay stream across the switch.
	 */
	useBuild(buildId: string): void {
		this._current = this._lookup(buildId);
	}

	async launch(options: IAgentHostTargetLaunchOptions): Promise<IServerHandle> {
		// Switching builds against a shared user-data directory is only safe once
		// the previous process has fully exited and released its state.
		await this.stopCurrentProcess();
		const build = this._current;
		const server = await startRealServer({
			serverEntry: build.serverEntry,
			homeDir: options.homeDir,
			userDataDir: options.userDataDir,
			codexHomeDir: options.codexHomeDir,
			capiReplay: options.capiReplay,
			existingCapiReplay: options.existingCapiReplay,
			claudeSdkRoot: options.claudeSdkRoot,
			codexSdkRoot: options.codexSdkRoot,
			logLevel: options.logLevel,
			env: options.env,
		});
		this._lastLaunched = server;
		this._launchedBuildIds.push(build.id);
		return server;
	}

	/**
	 * Await full shutdown of the process this target last launched. Safe to
	 * call when nothing is running, and idempotent.
	 */
	async stopCurrentProcess(): Promise<void> {
		const previous = this._lastLaunched;
		this._lastLaunched = undefined;
		if (previous) {
			await stopServer(previous);
		}
	}

	private _lookup(buildId: string): IPreparedAgentHostBuild {
		const build = this._builds.get(buildId);
		if (!build) {
			throw new Error(`[agent-host-live-compat] unknown build '${buildId}'; prepared builds: ${[...this._builds.keys()].join(', ')}`);
		}
		return build;
	}
}
