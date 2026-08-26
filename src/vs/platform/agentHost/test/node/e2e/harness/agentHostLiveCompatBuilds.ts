/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The named Agent Host builds live-compatibility scenarios run against.
 *
 * Scenarios refer to these by id only, so a checkpoint can be re-pinned to a
 * newer commit without touching any scenario. Ids are ordered oldest-first.
 */

import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { AgentHostBuildSourceKind, type IAgentHostBuildDescriptor, type IAgentHostBuildPlanContext } from './agentHostBuildPlan.js';

/**
 * Bump when the way a historical build is compiled changes in a manner that
 * invalidates already-cached outputs.
 */
export const AGENT_HOST_LIVE_COMPAT_RECIPE_VERSION = '1';

export const enum AgentHostBuildId {
	Legacy = 'legacy',
	Predecessor = 'predecessor',
	Intermediate = 'intermediate',
	Current = 'current',
}

export const agentHostLiveCompatBuilds: readonly IAgentHostBuildDescriptor[] = [
	{
		id: AgentHostBuildId.Legacy,
		source: AgentHostBuildSourceKind.Ref,
		ref: '97ed7b57c6d9becb4fe386c59157eda016050d6a',
		description: 'Oldest supported Agent Host build in the compatibility matrix.',
	},
	{
		id: AgentHostBuildId.Predecessor,
		source: AgentHostBuildSourceKind.Ref,
		ref: '49f24d87cd32d2a696e469d2c61fb8d0cada4cc9',
		description: 'The build immediately preceding the in-flight changes.',
	},
	{
		id: AgentHostBuildId.Intermediate,
		source: AgentHostBuildSourceKind.Ref,
		ref: '7453d67fdcde27faba527d69a535ddd51b8d1afa',
		description: 'Intermediate build used to exercise multi-hop upgrades.',
	},
	{
		id: AgentHostBuildId.Current,
		source: AgentHostBuildSourceKind.WorkingTree,
		description: 'The current working tree, built in place; never checked out or reset.',
	},
];

export function agentHostLiveCompatBuild(id: AgentHostBuildId | string): IAgentHostBuildDescriptor {
	const descriptor = agentHostLiveCompatBuilds.find(build => build.id === id);
	if (!descriptor) {
		throw new Error(`[agent-host-live-compat] unknown build checkpoint '${id}'; known: ${agentHostLiveCompatBuilds.map(build => build.id).join(', ')}`);
	}
	return descriptor;
}

/**
 * Default cache root for materialized historical worktrees and their compiled
 * output. Deliberately outside the repository so a stale cache can never be
 * mistaken for repository content, and overridable for CI.
 */
export function agentHostLiveCompatCacheRoot(environment: Readonly<Record<string, string | undefined>> = process.env): string {
	return environment['AGENT_HOST_LIVE_COMPAT_CACHE'] || join(tmpdir(), 'vscode-agent-host-live-compat');
}

/**
 * Build the planning context for a checkpoint. `resolveCommit` is supplied by
 * the caller (the preparation script resolves refs with git; tests can pass a
 * fixed sha) so that planning itself stays pure.
 */
export function agentHostLiveCompatPlanContext(
	descriptor: IAgentHostBuildDescriptor,
	options: { readonly repoRoot: string; readonly cacheRoot?: string; readonly resolveCommit?: (ref: string) => string | undefined },
): IAgentHostBuildPlanContext {
	return {
		repoRoot: options.repoRoot,
		cacheRoot: options.cacheRoot ?? agentHostLiveCompatCacheRoot(),
		resolvedCommit: descriptor.ref ? options.resolveCommit?.(descriptor.ref) : undefined,
		recipeVersion: AGENT_HOST_LIVE_COMPAT_RECIPE_VERSION,
	};
}
