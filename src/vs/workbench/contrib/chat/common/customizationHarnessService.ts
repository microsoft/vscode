/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageSourceFilter } from './aiCustomizationWorkspaceService.js';
import { PromptsType } from './promptSyntax/promptTypes.js';

export const ICustomizationHarnessService = createDecorator<ICustomizationHarnessService>('customizationHarnessService');

/**
 * Identifies the AI harness (execution environment) that customizations
 * are filtered for. Storage answers "where did this come from?"; harness
 * answers "who consumes it?".
 */
export enum CustomizationHarness {
	VSCode = 'vscode',
	CLI = 'cli',
	Claude = 'claude',
}

/**
 * Describes a single harness option for the UI toggle.
 */
export interface IHarnessDescriptor {
	readonly id: CustomizationHarness;
	readonly label: string;
	readonly icon: ThemeIcon;
	/**
	 * Returns the storage source filter that should be applied to customization
	 * items of the given type when this harness is active.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;
}

/**
 * Service that manages the active customization harness and provides
 * per-type storage source filters based on the selected harness.
 *
 * The default (core) registration exposes a single "VS Code" harness
 * that shows all storage sources. The sessions window overrides this
 * to provide CLI-scoped harnesses.
 */
export interface ICustomizationHarnessService {
	readonly _serviceBrand: undefined;

	/**
	 * The currently active harness.
	 */
	readonly activeHarness: IObservable<CustomizationHarness>;

	/**
	 * All harnesses available in this window.
	 * When only one harness is available the UI should hide the toggle.
	 */
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	/**
	 * Changes the active harness. The new id must be present in
	 * `availableHarnesses`.
	 */
	setActiveHarness(id: CustomizationHarness): void;

	/**
	 * Convenience: returns the storage source filter for the active harness
	 * and the given customization type.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;
}
