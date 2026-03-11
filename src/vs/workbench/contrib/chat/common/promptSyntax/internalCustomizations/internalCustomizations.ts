/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IAgentSkill, IInternalPromptPath, PromptsStorage } from '../service/promptsService.js';
import { PromptsType } from '../promptTypes.js';
import { registerChatInternalFileSystem } from './internalPromptFileSystem.js';
import { InternalSkill } from './internalSkill.js';
import { troubleshootSkill } from './skills/troubleshootSkill.js';
export { InternalSkill } from './internalSkill.js';
export { troubleshootSkill } from './skills/troubleshootSkill.js';

/**
 * Manages built-in internal customizations (skills, instructions, agents, etc.)
 * backed by a readonly virtual filesystem.
 *
 * To add a new internal skill, create an {@link InternalSkill} instance and
 * register it in the constructor.
 */
export class ChatInternalCustomizations extends Disposable {

	private readonly skills: readonly InternalSkill[];
	private readonly skillsByUri = new Map<string, InternalSkill>();

	constructor(fileService: IFileService) {
		super();

		const { provider, disposable: fsDisposable } = registerChatInternalFileSystem(fileService);
		this._register(fsDisposable);

		// --- Built-in skills (add new entries here) ---
		this.skills = [
			troubleshootSkill,
		];

		for (const skill of this.skills) {
			provider.registerFile(skill.uri, skill.content);
			this.skillsByUri.set(skill.uri.toString(), skill);
			this._register(skill);
		}

	}

	/**
	 * Returns the {@link IAgentSkill} metadata for all internal skills,
	 * for injection into the skills list.
	 */
	getSkills(): readonly IAgentSkill[] {
		return this.skills.map(s => s.skill);
	}

	/**
	 * Looks up the {@link InternalSkill} instance for a given URI,
	 * e.g. to check its {@link InternalSkill.when} clause.
	 */
	getInternalSkillByUri(uri: URI): InternalSkill | undefined {
		return this.skillsByUri.get(uri.toString());
	}

	/**
	 * Returns internal prompt file paths for a given customization type.
	 */
	getPromptPaths(type: PromptsType): readonly IInternalPromptPath[] {
		if (type === PromptsType.skill) {
			return this.skills.map(s => ({
				uri: s.uri,
				storage: PromptsStorage.internal as const,
				type,
				name: s.name,
				description: s.description,
			}));
		}
		return [];
	}
}
