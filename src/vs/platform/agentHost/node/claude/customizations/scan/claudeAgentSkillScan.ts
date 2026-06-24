/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../files/common/files.js';
import { readAgentComponents, readSkills, toParsedAgent, toParsedSkill, type INamedPluginResource, type IParsedAgent, type IParsedSkill } from '../../../../../agentPlugins/common/pluginParsers.js';

/**
 * The `.claude/<sub>` directories one scope (project or user) contributes
 * customizations from. `commands` holds slash commands, which are a
 * variant of skills (folded into the skill set, skills winning conflicts).
 */
function scopeRoots(scope: URI): { readonly agents: URI; readonly skills: URI; readonly commands: URI } {
	const base = URI.joinPath(scope, '.claude');
	return {
		agents: URI.joinPath(base, 'agents'),
		skills: URI.joinPath(base, 'skills'),
		commands: URI.joinPath(base, 'commands'),
	};
}

/**
 * Merges parsed components into a name→component map. First-seen wins, so
 * scanning project before user (and skills before commands) makes the
 * earlier entry shadow same-named later ones deterministically.
 */
function collectByName<T extends INamedPluginResource>(into: Map<string, T>, items: readonly T[]): void {
	for (const item of items) {
		if (!into.has(item.name)) {
			into.set(item.name, item);
		}
	}
}

/**
 * Scans a Claude session's `.claude/{agents,skills,commands}` directories
 * (project + user scope) and returns the discovered customizations with
 * their real source-file URIs and parsed names/descriptions.
 *
 * Reuses the shared parsers in `pluginParsers.ts`:
 *   - agents — flat `<name>.md` files, frontmatter name/description.
 *   - skills — `<dir>/SKILL.md` layout, frontmatter name/description.
 *   - commands — flat `<name>.md` files; a variant of skills, so they are
 *     folded into the skill set (skills win on a name conflict).
 *
 * Each scope is scanned independently and merged project-before-user so
 * precedence is deterministic (the shared readers parallelize/sort
 * internally, so handing them both scopes at once would NOT guarantee
 * which scope wins on a name clash). Within a scope, skills are collected
 * before commands so skills win same-name conflicts. MCP servers are
 * resolved separately (they live inline in `settings.json` / `.mcp.json`,
 * not as directory entries).
 */
export async function scanClaudeDiskCustomizations(
	workingDirectory: URI | undefined,
	userHome: URI,
	fileService: IFileService,
): Promise<readonly (IParsedAgent | IParsedSkill)[]> {
	// Project scope first so it wins precedence over user scope.
	const scopes = workingDirectory ? [workingDirectory, userHome] : [userHome];
	const agents = new Map<string, IParsedAgent>();
	const skills = new Map<string, IParsedSkill>();

	for (const scope of scopes) {
		const { agents: agentsDir, skills: skillsDir, commands: commandsDir } = scopeRoots(scope);
		const [agentRes, skillRes, commandRes] = await Promise.all([
			readAgentComponents([agentsDir], fileService),
			// pluginRoot = the skills dir itself, so the readSkills fallback
			// targets `<skillsDir>/SKILL.md` (a legit single-skill dir), never
			// an unrelated `<userHome>/SKILL.md`.
			readSkills(skillsDir, [skillsDir], fileService),
			readAgentComponents([commandsDir], fileService),
		]);
		collectByName(agents, agentRes.map(toParsedAgent));
		// Skills before commands so a same-named skill wins (spec section 3).
		collectByName(skills, skillRes.map(toParsedSkill));
		collectByName(skills, commandRes.map(toParsedSkill));
	}

	return [...agents.values(), ...skills.values()];
}
