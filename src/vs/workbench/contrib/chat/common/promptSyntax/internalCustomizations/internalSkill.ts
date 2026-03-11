/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ContextKeyExpression } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IAgentSkill, PromptsStorage } from '../service/promptsService.js';
import { CHAT_INTERNAL_SCHEME } from './internalPromptFileSystem.js';

/**
 * A built-in skill backed by the internal readonly virtual filesystem.
 *
 * To add a new internal skill, create an instance documenting the skill
 * name, description and SKILL.md content, then add it to the
 * {@link internalSkills} array in {@link internalCustomizations.ts}.
 */
export class InternalSkill extends Disposable {

	/** Virtual filesystem URI for the SKILL.md file. */
	readonly uri: URI;

	/** The skill metadata exposed to the skills list and system prompt. */
	readonly skill: IAgentSkill;

	/**
	 * Optional context key expression. When set, the skill is only included
	 * in the system prompt when this expression evaluates to true.
	 */
	readonly when: ContextKeyExpression | undefined;

	constructor(
		readonly name: string,
		readonly description: string,
		readonly content: string,
		options?: {
			disableModelInvocation?: boolean;
			userInvocable?: boolean;
			when?: ContextKeyExpression;
		},
	) {
		super();
		this.uri = URI.from({
			scheme: CHAT_INTERNAL_SCHEME,
			path: `/skills/${name}/SKILL.md`,
		});
		this.skill = {
			uri: this.uri,
			storage: PromptsStorage.internal,
			name,
			description,
			disableModelInvocation: options?.disableModelInvocation ?? false,
			userInvocable: options?.userInvocable ?? true,
		};
		this.when = options?.when;
	}
}
