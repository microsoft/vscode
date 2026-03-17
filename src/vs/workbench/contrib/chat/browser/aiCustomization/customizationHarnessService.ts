/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { CustomizationHarness, ICustomizationHarnessService, IHarnessDescriptor } from '../../common/customizationHarnessService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';

const DEFAULT_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
};

const HOOKS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.plugin],
};

const ALL_USER_ROOTS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
};

function createVSCodeHarness(): IHarnessDescriptor {
	return {
		id: CustomizationHarness.VSCode,
		label: localize('harness.vscode', "VS Code"),
		icon: ThemeIcon.fromId(Codicon.copilot.id),
		getStorageSourceFilter(_type: PromptsType): IStorageSourceFilter {
			return DEFAULT_FILTER;
		},
	};
}

function createCliHarness(cliUserRoots: readonly URI[]): IHarnessDescriptor {
	const cliUserFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
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
			return cliUserFilter;
		},
	};
}

function createClaudeHarness(claudeRoots: readonly URI[]): IHarnessDescriptor {
	const claudeFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
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
 * Core implementation of the customization harness service.
 * Exposes VS Code, CLI, and Claude harnesses for filtering customizations.
 * Sessions overrides this to further restrict user file roots to CLI-only paths.
 */
class CustomizationHarnessService implements ICustomizationHarnessService {
	declare readonly _serviceBrand: undefined;

	private readonly _activeHarness = observableValue<CustomizationHarness>(this, CustomizationHarness.VSCode);
	readonly activeHarness: IObservable<CustomizationHarness> = this._activeHarness;

	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;
	private readonly _harnesses: readonly IHarnessDescriptor[];

	constructor(
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		this._harnesses = [
			createVSCodeHarness(),
			createCliHarness([
				joinPath(userHome, '.copilot'),
				joinPath(userHome, '.claude'),
				joinPath(userHome, '.agents'),
			]),
			createClaudeHarness([
				joinPath(userHome, '.claude'),
			]),
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
		return descriptor?.getStorageSourceFilter(type) ?? DEFAULT_FILTER;
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

