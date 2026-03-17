/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, IHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';

/**
 * Filter: hooks are always local + plugin only.
 */
const HOOKS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.plugin],
};

/**
 * Filter: prompts are shown from all user roots.
 */
const ALL_USER_ROOTS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE],
};

function createCliHarness(cliUserRoots: readonly URI[]): IHarnessDescriptor {
	const cliUserFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE],
		includedUserFileRoots: cliUserRoots,
	};

	return {
		id: CustomizationHarness.CLI,
		label: localize('harness.cli', "Copilot CLI"),
		icon: ThemeIcon.fromId(Codicon.terminal.id),
		getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
			if (type === PromptsType.hook) {
				return HOOKS_FILTER;
			}
			if (type === PromptsType.prompt) {
				return ALL_USER_ROOTS_FILTER;
			}
			// Agents, skills, instructions — only CLI-accessible user roots
			return cliUserFilter;
		},
	};
}

function createClaudeHarness(claudeRoots: readonly URI[]): IHarnessDescriptor {
	const claudeFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE],
		includedUserFileRoots: claudeRoots,
	};

	return {
		id: CustomizationHarness.Claude,
		label: localize('harness.claude', "Claude"),
		icon: ThemeIcon.fromId(Codicon.sparkle.id),
		getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
			if (type === PromptsType.hook) {
				return HOOKS_FILTER;
			}
			if (type === PromptsType.prompt) {
				return ALL_USER_ROOTS_FILTER;
			}
			return claudeFilter;
		},
	};
}

/**
 * Sessions-window override of the customization harness service.
 *
 * Exposes CLI and Claude harnesses with restricted user-root filters
 * so the customizations UI only shows items accessible to each harness.
 */
export class SessionsCustomizationHarnessService implements ICustomizationHarnessService {
	declare readonly _serviceBrand: undefined;

	private readonly _activeHarness = observableValue<CustomizationHarness>(this, CustomizationHarness.CLI);
	readonly activeHarness: IObservable<CustomizationHarness> = this._activeHarness;

	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	private readonly _harnesses: readonly IHarnessDescriptor[];

	constructor(
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });

		const cliUserRoots = [
			joinPath(userHome, '.copilot'),
			joinPath(userHome, '.claude'),
			joinPath(userHome, '.agents'),
		];

		const claudeRoots = [
			joinPath(userHome, '.claude'),
		];

		this._harnesses = [
			createCliHarness(cliUserRoots),
			createClaudeHarness(claudeRoots),
		];
		this.availableHarnesses = constObservable(this._harnesses);
	}

	setActiveHarness(id: CustomizationHarness): void {
		if (this._harnesses.some(h => h.id === id)) {
			this._activeHarness.set(id, undefined);
		}
	}

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		const activeId = this._activeHarness.get();
		const descriptor = this._harnesses.find(h => h.id === activeId);
		return descriptor?.getStorageSourceFilter(type) ?? this._harnesses[0].getStorageSourceFilter(type);
	}
}
