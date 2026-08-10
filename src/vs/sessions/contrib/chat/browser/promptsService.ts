/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../base/common/network.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { SKILL_FILENAME } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgentSkill, IBuiltinPromptPath, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.js';

/** URI root for built-in skills bundled with the Agents app. */
export const BUILTIN_SKILLS_URI = FileAccess.asFileUri('vs/sessions/skills');

/**
 * Sessions-specific PromptsService that additionally discovers built-in skills
 * bundled at `vs/sessions/skills/{folder}/SKILL.md`.
 *
 * Built-in skills are contributed via the single {@link getBuiltinPromptFiles}
 * override, so the base service merges them into `findAgentSkills()`,
 * `listPromptFiles(skill)` and
 * `listPromptFilesForStorage(skill, PromptsStorage.builtIn)` and applies its own
 * parsing, sanitization and duplicate-name precedence. Built-ins have the lowest
 * skill priority, so a user/workspace skill with the same folder name wins.
 */
export class AgenticPromptsService extends PromptsService {

	private _builtinSkillsCache: Promise<readonly IAgentSkill[]> | undefined;

	private async getBuiltinSkills(): Promise<readonly IAgentSkill[]> {
		if (!this._builtinSkillsCache) {
			this._builtinSkillsCache = this.discoverBuiltinSkills();
		}
		return this._builtinSkillsCache;
	}

	private async discoverBuiltinSkills(): Promise<readonly IAgentSkill[]> {
		try {
			const stat = await this.fileService.resolve(BUILTIN_SKILLS_URI);
			if (!stat.children) {
				return [];
			}

			const skills: IAgentSkill[] = [];
			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}
				const skillFileUri = joinPath(child.resource, SKILL_FILENAME);
				try {
					const parsed = await this.parseNew(skillFileUri, CancellationToken.None);
					const rawName = parsed.header?.name;
					const rawDescription = parsed.header?.description;
					if (!rawName || !rawDescription) {
						continue;
					}
					const name = sanitizeSkillText(rawName, 64);
					const description = sanitizeSkillText(rawDescription, 1024);
					const folderName = basename(child.resource);
					if (name !== folderName) {
						continue;
					}
					skills.push({
						uri: skillFileUri,
						storage: PromptsStorage.builtIn,
						name,
						description,
						disableModelInvocation: parsed.header?.disableModelInvocation === true,
						userInvocable: parsed.header?.userInvocable !== false,
					});
				} catch (e) {
					this.logger.warn(`[AgenticPromptsService] Failed to parse built-in skill: ${skillFileUri}`, e instanceof Error ? e.message : String(e));
				}
			}
			return skills;
		} catch {
			return [];
		}
	}

	private async getBuiltinSkillPaths(): Promise<readonly IBuiltinPromptPath[]> {
		const skills = await this.getBuiltinSkills();
		return skills.map(s => ({
			uri: s.uri,
			storage: PromptsStorage.builtIn,
			type: PromptsType.skill,
			name: s.name,
			description: s.description,
		}));
	}

	/**
	 * Contributes the built-in skills bundled with the Agents app. The base
	 * {@link PromptsService} merges these into skill discovery
	 * (`findAgentSkills()`), `listPromptFiles(skill)` and
	 * `listPromptFilesForStorage(skill, PromptsStorage.builtIn)`, applying its
	 * own parsing, sanitization and duplicate-name precedence (built-ins have
	 * the lowest priority, so user/workspace skills of the same name win).
	 */
	protected override async getBuiltinPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IBuiltinPromptPath[]> {
		if (type !== PromptsType.skill) {
			return [];
		}
		return this.getBuiltinSkillPaths();
	}
}

/**
 * Strips XML tags and truncates to the given max length.
 * Matches the sanitization applied by PromptsService for other skill sources.
 */
function sanitizeSkillText(text: string, maxLength: number): string {
	const sanitized = text.replace(/<[^>]+>/g, '');
	return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}
