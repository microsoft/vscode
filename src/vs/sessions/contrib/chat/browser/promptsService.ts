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

/** URI root for built-in skills available only in the Agents app. */
export const SESSIONS_BUILTIN_SKILLS_URI = FileAccess.asFileUri('vs/sessions/skills');

/**
 * Extends shared workbench prompt discovery with skills owned by the Agents app.
 */
export class AgenticPromptsService extends PromptsService {

	private sessionsBuiltinSkillsCache: Promise<readonly IAgentSkill[]> | undefined;

	private async getSessionsBuiltinSkills(): Promise<readonly IAgentSkill[]> {
		if (!this.sessionsBuiltinSkillsCache) {
			this.sessionsBuiltinSkillsCache = this.discoverSessionsBuiltinSkills();
		}
		return this.sessionsBuiltinSkillsCache;
	}

	private async discoverSessionsBuiltinSkills(): Promise<readonly IAgentSkill[]> {
		try {
			const stat = await this.fileService.resolve(SESSIONS_BUILTIN_SKILLS_URI);
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
					if (name !== basename(child.resource)) {
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
				} catch (error) {
					this.logger.warn(`[AgenticPromptsService] Failed to parse built-in skill: ${skillFileUri}`, error instanceof Error ? error.message : String(error));
				}
			}
			return skills;
		} catch {
			return [];
		}
	}

	/**
	 * Combines shared workbench built-ins with skills owned by the Agents app.
	 */
	protected override async getBuiltinPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IBuiltinPromptPath[]> {
		const sharedBuiltins = await super.getBuiltinPromptFiles(type, token);
		if (type !== PromptsType.skill || token.isCancellationRequested) {
			return sharedBuiltins;
		}
		const sessionsSkills = await this.getSessionsBuiltinSkills();
		if (token.isCancellationRequested) {
			return sharedBuiltins;
		}
		return [
			...sharedBuiltins,
			...sessionsSkills.map(skill => ({
				uri: skill.uri,
				storage: PromptsStorage.builtIn,
				type: PromptsType.skill,
				name: skill.name,
				description: skill.description,
			} satisfies IBuiltinPromptPath)),
		];
	}
}

/**
 * Strips XML tags and truncates metadata read from a bundled skill.
 */
function sanitizeSkillText(text: string, maxLength: number): string {
	const sanitized = text.replace(/<[^>]+>/g, '');
	return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}
