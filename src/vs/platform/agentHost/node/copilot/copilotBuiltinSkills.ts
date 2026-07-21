/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import type { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { TROUBLESHOOT_SKILL_NAME } from '../../common/agentHostTroubleshoot.js';

/**
 * Root directory of the Copilot harness's built-in skills, bundled next to
 * this module (`<out>/vs/platform/agentHost/node/copilot/skills`). Each skill
 * lives in its own `<name>/SKILL.md` subfolder.
 */
function builtinSkillsRoot(): URI {
	return FileAccess.asFileUri('vs/platform/agentHost/node/copilot/skills');
}

/**
 * A built-in skill bundled with the Copilot harness. Adding a new one is:
 *   1. create `skills/<name>/SKILL.md` next to this module, and
 *   2. add an entry here.
 * Nothing else in the plumbing is skill-specific: the folder is fed to the
 * SDK's `skillDirectories` (so the runtime loads it), the manifest is surfaced
 * by the slash-command completion provider (so it appears in `/` completions
 * immediately), and the send path dispatches `/<name>` to the runtime's native
 * `commands.invoke` (which resolves the skill and returns its invocation
 * message). A skill that also needs host-side request rewriting (as
 * `/troubleshoot` does for its session log) layers that behavior on top in the
 * send path.
 */
export interface IBuiltinSkill {
	/** Folder name under {@link builtinSkillsRoot} and the `/<name>` command. */
	readonly name: string;
	/**
	 * User-facing description shown in completions / the customization list,
	 * resolved lazily so `localize()` runs at call time rather than module-init.
	 */
	readonly description: () => string;
}

/**
 * The registry of built-in skills bundled with the Copilot harness. This is the
 * single place to declare them; the directory-loading and discovery plumbing
 * below is fully generic and iterates this list.
 */
export const BUILTIN_SKILLS: readonly IBuiltinSkill[] = [
	{ name: TROUBLESHOOT_SKILL_NAME, description: () => localize('copilot.builtin.troubleshoot', "(Built-In) Investigate unexpected behavior in the current Copilot CLI session by analyzing its session log.") },
];

/**
 * Returns one on-disk directory per built-in skill (the folder containing each
 * `SKILL.md`), in the shape the Copilot SDK's `skillDirectories` session config
 * expects.
 *
 * They are bundled with the agent host, so they resolve to a real path on
 * whichever machine the host runs on - which is why the built-in skills work
 * without VS Code and over a remote connection.
 */
export function getBuiltinSkillDirectories(): string[] {
	const root = builtinSkillsRoot();
	return BUILTIN_SKILLS.map(skill => joinPath(root, skill.name).fsPath);
}

/** Whether `name` is a bundled built-in skill's `/<name>` command. */
export function isBuiltinSkill(name: string): boolean {
	return BUILTIN_SKILLS.some(skill => skill.name === name);
}

