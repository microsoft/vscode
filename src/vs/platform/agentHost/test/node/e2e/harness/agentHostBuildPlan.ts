/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure planning layer for cross-version ("live compatibility") Agent Host runs.
 *
 * A live-compat scenario drives one preserved user-data directory through
 * several *builds* of the Agent Host: an old release, an intermediate one, and
 * the build currently under development. This module owns the decisions —
 * where a build lives, how it is identified, when it may be reused — without
 * performing any filesystem or git work, so the rules can be unit tested
 * without checking out or compiling anything.
 *
 * The externality principle still holds: nothing here knows anything about the
 * agent host beyond the path of its server entry point.
 */

import { join } from '../../../../../../base/common/path.js';

/** How the sources for a build are obtained. */
export const enum AgentHostBuildSourceKind {
	/**
	 * An immutable git ref (commit sha, tag). Materialized into a detached
	 * worktree under the cache root and built there, never in the repository
	 * the test runs from.
	 */
	Ref = 'ref',
	/**
	 * The developer's current (possibly dirty) working tree. Used as-is: never
	 * checked out, reset, stashed, or otherwise mutated.
	 */
	WorkingTree = 'workingTree',
}

/** A named build a live-compat scenario can run a phase against. */
export interface IAgentHostBuildDescriptor {
	/** Stable id used in scenario code, reporting and cache paths, e.g. `legacy`. */
	readonly id: string;
	readonly source: AgentHostBuildSourceKind;
	/** Immutable git ref; required for {@link AgentHostBuildSourceKind.Ref}, forbidden otherwise. */
	readonly ref?: string;
	/** Human readable note surfaced in diagnostics. */
	readonly description?: string;
}

export interface IAgentHostBuildPlanContext {
	/** Absolute path of the repository the test runs from. Never mutated for ref builds. */
	readonly repoRoot: string;
	/** Absolute path under which historical worktrees and their outputs are cached. */
	readonly cacheRoot: string;
	/**
	 * The resolved commit sha for a {@link AgentHostBuildSourceKind.Ref} build.
	 * Planning is pure, so the caller resolves the ref and passes the result in.
	 */
	readonly resolvedCommit?: string;
	/**
	 * Bumped whenever the build recipe changes in a way that invalidates
	 * previously cached outputs.
	 */
	readonly recipeVersion: string;
}

/** Where a build lives and how to tell whether it is already usable. */
export interface IAgentHostBuildPlan {
	readonly id: string;
	readonly source: AgentHostBuildSourceKind;
	readonly ref?: string;
	readonly resolvedCommit?: string;
	readonly description?: string;
	/** Root of the sources for this build (a cached worktree, or the repo itself). */
	readonly sourceRoot: string;
	/** Absolute path of the compiled agent host server entry to launch. */
	readonly serverEntry: string;
	/**
	 * Identity of the built output. Equal keys mean the cached build is still
	 * valid; `undefined` for the working tree, which is never cached because it
	 * changes under us by design.
	 */
	readonly cacheKey: string | undefined;
	/** File recording {@link cacheKey} for a completed build; `undefined` when uncacheable. */
	readonly cacheMarkerPath: string | undefined;
	/** Whether a git worktree must be materialized before building. */
	readonly requiresWorktree: boolean;
}

/** Relative path of the compiled agent host server entry within a build output root. */
export const AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH = join('out', 'vs', 'platform', 'agentHost', 'node', 'agentHostServerMain.js');

const BUILD_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Validate a descriptor and resolve it to concrete paths and a cache identity.
 *
 * @throws when the descriptor is internally inconsistent, which is always a
 * scenario authoring bug rather than an environment problem.
 */
export function planAgentHostBuild(descriptor: IAgentHostBuildDescriptor, context: IAgentHostBuildPlanContext): IAgentHostBuildPlan {
	if (!BUILD_ID_PATTERN.test(descriptor.id)) {
		throw new Error(`[agent-host-live-compat] invalid build id '${descriptor.id}': expected lowercase alphanumeric segments separated by '-'`);
	}

	if (descriptor.source === AgentHostBuildSourceKind.WorkingTree) {
		if (descriptor.ref !== undefined) {
			throw new Error(`[agent-host-live-compat] build '${descriptor.id}' targets the working tree and must not declare a ref (got '${descriptor.ref}')`);
		}
		return {
			id: descriptor.id,
			source: descriptor.source,
			description: descriptor.description,
			sourceRoot: context.repoRoot,
			serverEntry: join(context.repoRoot, AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH),
			cacheKey: undefined,
			cacheMarkerPath: undefined,
			requiresWorktree: false,
		};
	}

	if (!descriptor.ref) {
		throw new Error(`[agent-host-live-compat] build '${descriptor.id}' targets a git ref but declares none`);
	}
	if (context.resolvedCommit !== undefined && !COMMIT_PATTERN.test(context.resolvedCommit)) {
		throw new Error(`[agent-host-live-compat] build '${descriptor.id}' resolved to '${context.resolvedCommit}', which is not a full commit sha`);
	}

	const sourceRoot = join(context.cacheRoot, 'builds', descriptor.id);
	return {
		id: descriptor.id,
		source: descriptor.source,
		ref: descriptor.ref,
		resolvedCommit: context.resolvedCommit,
		description: descriptor.description,
		sourceRoot,
		serverEntry: join(sourceRoot, AGENT_HOST_SERVER_ENTRY_RELATIVE_PATH),
		cacheKey: context.resolvedCommit === undefined ? undefined : buildCacheKey(context.resolvedCommit, context.recipeVersion),
		cacheMarkerPath: join(sourceRoot, '.agent-host-live-compat-build.json'),
		requiresWorktree: true,
	};
}

function buildCacheKey(resolvedCommit: string, recipeVersion: string): string {
	return `commit:${resolvedCommit}|recipe:${recipeVersion}`;
}

/** Contents of a build's cache marker file. */
export interface IAgentHostBuildCacheMarker {
	readonly cacheKey: string;
	readonly builtAt: string;
}

export function serializeBuildCacheMarker(cacheKey: string, builtAt: string): string {
	return `${JSON.stringify({ cacheKey, builtAt } satisfies IAgentHostBuildCacheMarker, undefined, '\t')}\n`;
}

/**
 * Whether a previously built output can be reused. Unreadable or malformed
 * markers are treated as "not built" rather than as errors: a stale cache must
 * never fail a run, it must only cost a rebuild.
 */
export function isBuildCacheUsable(plan: IAgentHostBuildPlan, markerContent: string | undefined): boolean {
	if (plan.cacheKey === undefined || markerContent === undefined) {
		return false;
	}
	try {
		const marker = JSON.parse(markerContent) as Partial<IAgentHostBuildCacheMarker>;
		return marker.cacheKey === plan.cacheKey;
	} catch {
		return false;
	}
}

/**
 * Explain why a planned build cannot be launched, in terms a developer can act
 * on. Returns `undefined` when the build looks launchable.
 */
export function describeUnusableBuild(plan: IAgentHostBuildPlan, state: { readonly serverEntryExists: boolean; readonly cacheUsable: boolean }): string | undefined {
	if (state.serverEntryExists && (state.cacheUsable || plan.cacheKey === undefined)) {
		return undefined;
	}
	const lines = [`[agent-host-live-compat] build '${plan.id}' is not ready to launch.`];
	if (plan.description) {
		lines.push(`  ${plan.description}`);
	}
	if (!state.serverEntryExists) {
		lines.push(`  Missing compiled entry: ${plan.serverEntry}`);
	} else {
		lines.push(`  Compiled output is stale for ${plan.ref ?? 'the working tree'}: ${plan.sourceRoot}`);
	}
	if (plan.source === AgentHostBuildSourceKind.WorkingTree) {
		lines.push('  Compile the current working tree (for example `npm run transpile-client`) and re-run.');
	} else {
		lines.push(`  Prepare it with: node scripts/test-agent-host-live-compat.ts --prepare ${plan.id}`);
	}
	return lines.join('\n');
}
