/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayEqualsC } from '../../../../../base/common/equals.js';
import { IObservable, derived, derivedOpts, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';

/**
 * The services that observing section badges reads.
 */
export interface IAICustomizationSectionBadgeServices {
	readonly instantiationService: IInstantiationService;
	readonly harnessService: ICustomizationHarnessService;
	readonly workspaceService: IAICustomizationWorkspaceService;
	readonly configurationService: IConfigurationService;
}

/**
 * A section that the active harness shows, and the description of its badge.
 */
export interface IAICustomizationVisibleSectionBadge {
	readonly section: AICustomizationManagementSection;
	readonly badge: string;
}

/**
 * Observes the badge of `section` while the active harness shows it in the editor, otherwise `undefined`.
 */
export function observeVisibleSectionBadge(accessor: ServicesAccessor, section: AICustomizationManagementSection): IObservable<string | undefined> {
	const badges = observeVisibleSectionBadges(getSectionBadgeServices(accessor), sections => sections.includes(section) ? [section] : []);
	return derived(reader => badges.read(reader)[0]?.badge);
}

/**
 * Observes the badge of the first section with a badge that the active harness shows in the editor, otherwise
 * `undefined`. Entry points to the editor show it as a single badge.
 */
export function observeVisibleSectionsBadge(accessor: ServicesAccessor): IObservable<string | undefined> {
	const badges = observeVisibleSectionBadges(getSectionBadgeServices(accessor));
	return derived(reader => badges.read(reader)[0]?.badge);
}

/**
 * Observes the badges of the management sections, or of those that `selectSections` selects, that the active harness
 * shows in the editor, in the order of the management sections. Only reads the badges of visible sections, as reading
 * a badge may log an experiment trigger.
 */
export function observeVisibleSectionBadges(
	{ instantiationService, harnessService, workspaceService, configurationService }: IAICustomizationSectionBadgeServices,
	selectSections: (managementSections: readonly AICustomizationManagementSection[]) => readonly AICustomizationManagementSection[] = sections => sections,
): IObservable<readonly IAICustomizationVisibleSectionBadge[]> {
	const configurationChanged = observableSignalFromEvent('aiCustomizationSectionBadges.configuration', configurationService.onDidChangeConfiguration);

	// Resolve the badge observables once per harness so that badge changes only re-read them.
	const sectionBadges = derived(reader => {
		const harnessId = harnessService.activeHarness.read(reader);
		return selectSections(workspaceService.managementSections).flatMap(section => {
			const getBadge = aiCustomizationManagementSectionRegistry.getBadge(section, harnessId);
			return getBadge ? [{ section, badge: instantiationService.invokeFunction(getBadge) }] : [];
		});
	});

	return derivedOpts({ equalsFn: arrayEqualsC((a, b) => a.section === b.section && a.badge === b.badge) }, reader => {
		configurationChanged.read(reader);
		harnessService.availableHarnesses.read(reader);
		const harnessId = harnessService.activeHarness.read(reader);
		const visibleBadges: IAICustomizationVisibleSectionBadge[] = [];
		for (const { section, badge } of sectionBadges.read(reader)) {
			if (aiCustomizationManagementSectionRegistry.isVisible(section, harnessId, harnessService, configurationService)) {
				const description = badge.read(reader);
				if (description !== undefined) {
					visibleBadges.push({ section, badge: description });
				}
			}
		}
		return visibleBadges;
	});
}

function getSectionBadgeServices(accessor: ServicesAccessor): IAICustomizationSectionBadgeServices {
	return {
		instantiationService: accessor.get(IInstantiationService),
		harnessService: accessor.get(ICustomizationHarnessService),
		workspaceService: accessor.get(IAICustomizationWorkspaceService),
		configurationService: accessor.get(IConfigurationService),
	};
}
