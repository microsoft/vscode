/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { copilotHostSkillNames } from './copilotBuiltinSkills.js';

/** Who shipped a skill: VS Code, the bundled Copilot runtime, or anyone else. */
export type CopilotSkillOrigin = 'vscode' | 'runtime' | 'other';

/** Where the runtime reports it discovered a skill (`skill.invoked` `source`). */
const runtimeSkillSources: ReadonlySet<string> = new Set(['project', 'inherited', 'personal-copilot', 'personal-agents', 'custom', 'plugin', 'builtin', 'remote', 'sdk', 'mcp']);

/** Sources discovered from the workspace, the user's home or an organization, which never ship with the product wherever they sit. */
const userSkillSources: ReadonlySet<string> = new Set(['project', 'inherited', 'personal-copilot', 'personal-agents', 'remote']);

export interface ICopilotSkillTelemetry {
	readonly skillSource: string;
	readonly skillOrigin: CopilotSkillOrigin;
	/** The skill name, only for skills VS Code or the bundled runtime ship; any other name could identify a user. */
	readonly skillName: string | undefined;
}

/**
 * Classifies an invoked skill for telemetry. Only skills with trusted provenance are named: the runtime's
 * `builtin` skills, skills in its bundled plugin directories, and the skills the host serves itself.
 * Skills VS Code syncs to the runtime (Agents window and extension skills) arrive as copies under user
 * data, mixed with third-party skills, so they stay unnamed.
 */
export function getCopilotSkillTelemetry(skill: { readonly name: string; readonly path?: string; readonly source?: string }, runtimePluginRoots: readonly URI[]): ICopilotSkillTelemetry {
	const skillOrigin = getSkillOrigin(skill, runtimePluginRoots);
	return {
		skillSource: skill.source === undefined ? 'unknown' : runtimeSkillSources.has(skill.source) ? skill.source : 'other',
		skillOrigin,
		skillName: skillOrigin === 'other' ? undefined : skill.name,
	};
}

function getSkillOrigin(skill: { readonly name: string; readonly path?: string; readonly source?: string }, runtimePluginRoots: readonly URI[]): CopilotSkillOrigin {
	if (skill.source === 'builtin') {
		return 'runtime';
	}
	if (userSkillSources.has(skill.source ?? '')) {
		return 'other';
	}
	const location = skill.path && isAbsolute(skill.path) ? URI.file(skill.path) : undefined;
	if (location && runtimePluginRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(location, root))) {
		return 'runtime';
	}
	if (skill.source === 'sdk' && copilotHostSkillNames.has(skill.name)) {
		return 'vscode';
	}
	return 'other';
}
