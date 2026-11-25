/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IBuiltinPromptPath } from './promptsService.js';

export const IAgenticSkillsService = createDecorator<IAgenticSkillsService>('agenticSkillsService');

/**
 * Owns the built-in skills that ship with the app (for example `/create-pr` and `/merge` in the Agents window),
 * together with the user's decision to disable them.
 *
 * Independent of any harness: the local chat harness and agent hosts consume it alike. The regular workbench ships no
 * built-in skills and registers {@link NullAgenticSkillsService}.
 */
export interface IAgenticSkillsService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the available built-in skills or their disabled state change.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Returns the built-in skills that are currently available, including disabled ones.
	 */
	getSkills(token: CancellationToken): Promise<readonly IBuiltinPromptPath[]>;

	/**
	 * Whether the URI belongs to a built-in skill, whether or not that skill is currently available.
	 */
	isBuiltinSkill(uri: URI): boolean;

	/**
	 * Returns the built-in skills that the user disabled.
	 */
	getDisabledSkills(): ResourceSet;

	/**
	 * Replaces the set of disabled built-in skills.
	 */
	setDisabledSkills(uris: ResourceSet): void;
}

export class NullAgenticSkillsService implements IAgenticSkillsService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	async getSkills(_token: CancellationToken): Promise<readonly IBuiltinPromptPath[]> { return []; }
	isBuiltinSkill(_uri: URI): boolean { return false; }
	getDisabledSkills(): ResourceSet { return new ResourceSet(); }
	setDisabledSkills(_uris: ResourceSet): void { }
}
