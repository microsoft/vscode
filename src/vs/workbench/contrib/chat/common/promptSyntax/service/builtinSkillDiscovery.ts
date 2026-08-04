/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { basename, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ChatConfiguration } from '../../constants.js';
import { SKILL_FILENAME } from '../config/promptFileLocations.js';
import { ParsedPromptFile } from '../promptFileParser.js';
import { PromptsType } from '../promptTypes.js';
import { IBuiltinPromptPath, PromptsStorage } from './promptsService.js';

/**
 * Session types a built-in skill is offered in, when it should not be available
 * everywhere. Keyed by skill folder name.
 *
 * Entries use the prefix-wildcard form understood by `matchesSessionType`, since
 * remote agent host session types embed a connection authority
 * (`remote-{authority}-{provider}`) and cannot be listed exhaustively.
 */
const BUILTIN_SKILL_SESSION_TYPES = new Map<string, readonly string[]>([
	// The code tour the `explain` skill drives is only wired up for agent host
	// sessions, so don't offer it where it cannot work.
	['explain', ['agent-host-*', 'remote-*']],
]);

/**
 * Setting that must be enabled for a built-in skill to be offered at all, keyed
 * by skill folder name. Skills without an entry are always offered.
 */
const BUILTIN_SKILL_ENABLEMENT_SETTINGS = new Map<string, string>([
	// `/explain` is useless without the code tour tool it drives.
	['explain', ChatConfiguration.CodeTourEnabled],
]);

/** Settings that change which built-in skills are offered, for cache invalidation. */
export const BUILTIN_SKILL_ENABLEMENT_SETTING_IDS: readonly string[] = [...new Set(BUILTIN_SKILL_ENABLEMENT_SETTINGS.values())];

/** Whether a discovered built-in skill is currently enabled by configuration. */
export function isBuiltinSkillEnabled(name: string | undefined, configurationService: IConfigurationService): boolean {
	const setting = name && BUILTIN_SKILL_ENABLEMENT_SETTINGS.get(name);
	return !setting || configurationService.getValue<boolean>(setting) === true;
}

/**
 * Discovers skills bundled with the application at `{root}/{folder}/SKILL.md`.
 *
 * Only the folder layout and header sanity checks live here; the calling
 * {@link PromptsService} applies its own parsing, sanitization and duplicate-name
 * precedence on top of the returned paths, and filters them with
 * {@link isBuiltinSkillEnabled}.
 */
export async function discoverBuiltinSkills(
	root: URI,
	fileService: IFileService,
	parse: (uri: URI, token: CancellationToken) => Promise<ParsedPromptFile>,
	logService: ILogService,
): Promise<readonly IBuiltinPromptPath[]> {
	let stat;
	try {
		stat = await fileService.resolve(root);
	} catch {
		return [];
	}

	if (!stat.children) {
		return [];
	}

	const skills: IBuiltinPromptPath[] = [];
	for (const child of stat.children) {
		if (!child.isDirectory) {
			continue;
		}

		const skillFileUri = joinPath(child.resource, SKILL_FILENAME);
		try {
			// Parsed with `CancellationToken.None` deliberately: the folder is
			// static and the result is memoized by the caller, so a caller that
			// cancels must not poison the cache with a partial scan.
			const parsed = await parse(skillFileUri, CancellationToken.None);
			const rawName = parsed.header?.name;
			const rawDescription = parsed.header?.description;
			if (!rawName || !rawDescription) {
				continue;
			}

			const name = sanitizeSkillText(rawName, 64);
			const folderName = basename(child.resource);
			if (name !== folderName) {
				continue;
			}

			skills.push({
				uri: skillFileUri,
				storage: PromptsStorage.builtIn,
				type: PromptsType.skill,
				name,
				description: sanitizeSkillText(rawDescription, 1024),
				sessionTypes: BUILTIN_SKILL_SESSION_TYPES.get(folderName),
			});
		} catch (e) {
			logService.warn(`[builtinSkills] Failed to parse built-in skill: ${skillFileUri}`, e instanceof Error ? e.message : String(e));
		}
	}

	return skills;
}

/**
 * Strips XML tags and truncates to the given max length.
 * Matches the sanitization applied by PromptsService for other skill sources.
 */
function sanitizeSkillText(text: string, maxLength: number): string {
	const sanitized = text.replace(/<[^>]+>/g, '');
	return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}
