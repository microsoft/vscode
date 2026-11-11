/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, derived, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';

/**
 * Observes the badge of `section` while the active harness shows it in the editor, otherwise `undefined`.
 */
export function observeVisibleSectionBadge(accessor: ServicesAccessor, section: AICustomizationManagementSection): IObservable<string | undefined> {
	return observeFirstVisibleSectionBadge(accessor, sections => sections.includes(section) ? [section] : []);
}

/**
 * Observes the badge of the first section with a badge that the active harness shows in the editor, otherwise
 * `undefined`. Entry points to the editor show it as a single badge.
 */
export function observeVisibleSectionsBadge(accessor: ServicesAccessor): IObservable<string | undefined> {
	return observeFirstVisibleSectionBadge(accessor, sections => sections);
}

function observeFirstVisibleSectionBadge(accessor: ServicesAccessor, selectSections: (managementSections: readonly AICustomizationManagementSection[]) => readonly AICustomizationManagementSection[]): IObservable<string | undefined> {
	const instantiationService = accessor.get(IInstantiationService);
	const harnessService = accessor.get(ICustomizationHarnessService);
	const workspaceService = accessor.get(IAICustomizationWorkspaceService);
	const configurationService = accessor.get(IConfigurationService);
	const configurationChanged = observableSignalFromEvent('aiCustomizationSectionBadges.configuration', configurationService.onDidChangeConfiguration);

	// Resolve the badge observables once per harness so that badge changes only re-read them.
	const sectionBadges = derived(reader => {
		const harnessId = harnessService.activeHarness.read(reader);
		return selectSections(workspaceService.managementSections).flatMap(section => {
			const getBadge = aiCustomizationManagementSectionRegistry.getBadge(section, harnessId);
			return getBadge ? [{ section, badge: instantiationService.invokeFunction(getBadge) }] : [];
		});
	});

	return derived(reader => {
		configurationChanged.read(reader);
		harnessService.availableHarnesses.read(reader);
		const harnessId = harnessService.activeHarness.read(reader);
		for (const { section, badge } of sectionBadges.read(reader)) {
			// Only read badges of visible sections, as reading a badge may log an experiment trigger.
			if (aiCustomizationManagementSectionRegistry.isVisible(section, harnessId, harnessService, configurationService)) {
				const description = badge.read(reader);
				if (description !== undefined) {
					return description;
				}
			}
		}
		return undefined;
	});
}
