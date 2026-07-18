/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { CustomizationLoadStatus, CustomizationType, customizationId, type DirectoryCustomization, type HookCustomization, type SkillCustomization } from '../../common/state/sessionState.js';
import type { HookMetadata } from './protocol/generated/v2/HookMetadata.js';
import type { HooksListResponse } from './protocol/generated/v2/HooksListResponse.js';
import type { SkillMetadata } from './protocol/generated/v2/SkillMetadata.js';
import type { SkillScope } from './protocol/generated/v2/SkillScope.js';
import type { SkillsListResponse } from './protocol/generated/v2/SkillsListResponse.js';

/**
 * Codex reports its *effective* skills and hooks through the cwd-scoped
 * `skills/list` and `hooks/list` app-server methods (see
 * `codex-rs/.../catalog_processor.rs`). Codex natively discovers skills from
 * the VS Code `.agents/skills` convention (`<repo>/.agents/skills` at repo
 * scope and `~/.agents/skills` at user scope) as well as `.codex` and bundled
 * roots. These helpers project those catalogs into the AHP
 * {@link DirectoryCustomization} containers that back the workbench
 * Customizations surface, so what codex actually loaded is visible alongside
 * the MCP servers already surfaced by {@link McpCustomizationController}.
 *
 * The mappers are pure (no codex round-trip): the {@link CodexAgent} fetches
 * the `skills/list` / `hooks/list` responses and feeds them here.
 */

/** Synthetic URI scheme for the per-scope codex skills container. */
const CODEX_SKILLS_SCHEME = 'codex-skills';
/** Synthetic URI scheme for the codex hooks container. */
const CODEX_HOOKS_SCHEME = 'codex-hooks';

/** Human-facing container name for each {@link SkillScope}. */
function skillScopeContainerName(scope: SkillScope): string {
	switch (scope) {
		case 'repo': return 'Repository';
		case 'user': return 'User';
		case 'system': return 'Built-in';
		case 'admin': return 'Admin';
		default: return scope;
	}
}

/** Stable ordering of scopes so the container list is deterministic. */
const SKILL_SCOPE_ORDER: readonly SkillScope[] = ['repo', 'user', 'system', 'admin'];

function skillToCustomization(skill: SkillMetadata): SkillCustomization {
	const uri = URI.file(skill.path).toString();
	return {
		type: CustomizationType.Skill,
		id: customizationId(uri),
		uri,
		name: skill.name,
		description: skill.description,
		enabled: skill.enabled,
	};
}

/**
 * Projects a codex `skills/list` response into one read-only
 * {@link DirectoryCustomization} container per {@link SkillScope}, each
 * carrying its skills as {@link SkillCustomization} children. Skills are
 * de-duplicated by their `SKILL.md` path (codex can report the same skill
 * for several requested cwds). Scopes with no skills are omitted; the result
 * is ordered by {@link SKILL_SCOPE_ORDER}.
 */
export function codexSkillsToContainers(response: SkillsListResponse | undefined): DirectoryCustomization[] {
	const byScope = new Map<SkillScope, Map<string, SkillMetadata>>();
	for (const entry of response?.data ?? []) {
		for (const skill of entry.skills ?? []) {
			let scoped = byScope.get(skill.scope);
			if (!scoped) {
				scoped = new Map();
				byScope.set(skill.scope, scoped);
			}
			if (!scoped.has(skill.path)) {
				scoped.set(skill.path, skill);
			}
		}
	}
	const containers: DirectoryCustomization[] = [];
	for (const scope of SKILL_SCOPE_ORDER) {
		const scoped = byScope.get(scope);
		if (!scoped || scoped.size === 0) {
			continue;
		}
		const children = [...scoped.values()]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(skillToCustomization);
		const containerUri = URI.from({ scheme: CODEX_SKILLS_SCHEME, path: `/${scope}` }).toString();
		containers.push({
			type: CustomizationType.Directory,
			id: customizationId(containerUri),
			uri: containerUri,
			name: skillScopeContainerName(scope),
			enabled: true,
			contents: CustomizationType.Skill,
			writable: false,
			load: { kind: CustomizationLoadStatus.Loaded },
			children,
		});
	}
	return containers;
}

function hookToCustomization(hook: HookMetadata): HookCustomization {
	// A single source file can declare several hooks, so disambiguate with the
	// codex hook `key` in the fragment to keep customization ids unique.
	const uri = URI.file(hook.sourcePath).with({ fragment: hook.key }).toString();
	return {
		type: CustomizationType.Hook,
		id: customizationId(uri),
		uri,
		name: hook.eventName,
		enabled: hook.enabled,
	};
}

/**
 * Projects a codex `hooks/list` response into a single read-only
 * {@link DirectoryCustomization} container carrying its hooks as
 * {@link HookCustomization} children. Hooks are de-duplicated by their codex
 * `key`. Returns an empty array when no hooks are configured.
 */
export function codexHooksToContainers(response: HooksListResponse | undefined): DirectoryCustomization[] {
	const byKey = new Map<string, HookMetadata>();
	for (const entry of response?.data ?? []) {
		for (const hook of entry.hooks ?? []) {
			if (!byKey.has(hook.key)) {
				byKey.set(hook.key, hook);
			}
		}
	}
	if (byKey.size === 0) {
		return [];
	}
	const children = [...byKey.values()]
		.sort((a, b) => Number(a.displayOrder - b.displayOrder) || a.key.localeCompare(b.key))
		.map(hookToCustomization);
	const containerUri = URI.from({ scheme: CODEX_HOOKS_SCHEME, path: '/hooks' }).toString();
	return [{
		type: CustomizationType.Directory,
		id: customizationId(containerUri),
		uri: containerUri,
		name: 'Hooks',
		enabled: true,
		contents: CustomizationType.Hook,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children,
	}];
}
