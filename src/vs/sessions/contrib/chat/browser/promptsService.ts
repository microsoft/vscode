/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../base/common/network.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { discoverBuiltinSkills } from '../../../../workbench/contrib/chat/common/promptSyntax/service/builtinSkillDiscovery.js';
import { IBuiltinPromptPath } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.js';

/** URI root for built-in skills bundled with the Agents app. */
export const BUILTIN_SKILLS_URI = FileAccess.asFileUri('vs/sessions/skills');

/**
 * Sessions-specific PromptsService that additionally discovers built-in skills
 * bundled at `vs/sessions/skills/{folder}/SKILL.md`, on top of the skills the
 * base service bundles with the workbench.
 *
 * Built-in skills are contributed via the single {@link getBuiltinPromptFiles}
 * override, so the base service merges them into `findAgentSkills()`,
 * `listPromptFiles(skill)` and
 * `listPromptFilesForStorage(skill, PromptsStorage.builtIn)` and applies its own
 * parsing, sanitization and duplicate-name precedence. Built-ins have the lowest
 * skill priority, so a user/workspace skill with the same folder name wins.
 */
export class AgenticPromptsService extends PromptsService {

	private _sessionsSkillsCache: Promise<readonly IBuiltinPromptPath[]> | undefined;

	/**
	 * Contributes the built-in skills bundled with the Agents app, in addition to
	 * the workbench-bundled skills the base service provides.
	 */
	protected override async getBuiltinPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IBuiltinPromptPath[]> {
		const inherited = await super.getBuiltinPromptFiles(type, token);
		if (type !== PromptsType.skill) {
			return inherited;
		}

		if (!this._sessionsSkillsCache) {
			this._sessionsSkillsCache = discoverBuiltinSkills(BUILTIN_SKILLS_URI, this.fileService, (uri, t) => this.parseNew(uri, t), this.logger);
		}
		return [...inherited, ...await this._sessionsSkillsCache];
	}
}
