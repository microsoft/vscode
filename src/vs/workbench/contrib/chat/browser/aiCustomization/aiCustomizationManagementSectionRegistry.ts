/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';

export interface IAICustomizationManagementSectionWidget extends IDisposable {
	layout?(dimension: Dimension): void;
	focus?(): void;
	fireItemCount?(): void;
	setSearchQuery?(query: string): void;
	/** Shows the installed extension with the given identifier, such as its page. */
	showExtension?(extensionId: string): void;
	setVisible?(visible: boolean): void;
	setCloseCustomizationEditor?(closeCustomizationEditor: () => Promise<boolean>): void;
	getAccessibilityContent?(): string;
	readonly onDidChangeItemCount?: Event<number>;
}

export interface IAICustomizationManagementSectionContribution {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	/** At least one of these boolean settings must be enabled to show or instantiate the section. */
	readonly enablementSettings?: readonly string[];
	/** Instantiate while hidden so sidebar metadata such as item counts is available before first navigation. */
	readonly initializeOnEditorOpen?: boolean;
	/** Visually separates this section from the preceding customization sections in the navigation list. */
	readonly separatorBefore?: boolean;
	readonly supportsHarness: (harnessId: string) => boolean;
	/**
	 * Creates the section's widget in `container`. `group` is the editor group of the editor that shows the section,
	 * which editor panes that the section shows need.
	 */
	create(instantiationService: IInstantiationService, container: HTMLElement, group: IEditorGroup): IAICustomizationManagementSectionWidget;
}

/**
 * Describes why a section needs attention, for example because it has suggestions to review, or `undefined` when it
 * doesn't. The description is the hover and part of the accessible name of the badges that entry points to the section
 * show. Entry points read it only while they show the section, so reading it may log experiment triggers.
 */
export type AICustomizationManagementSectionBadgeProvider = (accessor: ServicesAccessor) => IObservable<string | undefined>;

interface IAICustomizationManagementSectionBadgeRegistration {
	readonly getBadge: AICustomizationManagementSectionBadgeProvider;
	readonly supportsHarness: (harnessId: string) => boolean;
}

class AICustomizationManagementSectionRegistry {
	private readonly contributions = new Map<AICustomizationManagementSection, IAICustomizationManagementSectionContribution[]>();
	private readonly badges = new Map<AICustomizationManagementSection, IAICustomizationManagementSectionBadgeRegistration[]>();

	register(contribution: IAICustomizationManagementSectionContribution): IDisposable {
		const contributions = this.contributions.get(contribution.id) ?? [];
		contributions.push(contribution);
		this.contributions.set(contribution.id, contributions);
		return toDisposable(() => {
			const index = contributions.indexOf(contribution);
			if (index !== -1) {
				contributions.splice(index, 1);
			}
			if (contributions.length === 0) {
				this.contributions.delete(contribution.id);
			}
		});
	}

	has(id: AICustomizationManagementSection): boolean {
		return this.contributions.has(id);
	}

	getDefault(id: AICustomizationManagementSection): IAICustomizationManagementSectionContribution | undefined {
		return this.contributions.get(id)?.[0];
	}

	get(id: AICustomizationManagementSection, harnessId: string): IAICustomizationManagementSectionContribution | undefined {
		return this.contributions.get(id)?.find(contribution => contribution.supportsHarness(harnessId));
	}

	/**
	 * Registers the badge of a built-in or contributed section, for the harnesses that `supportsHarness` accepts, or
	 * all harnesses if it is omitted.
	 */
	registerBadge(section: AICustomizationManagementSection, getBadge: AICustomizationManagementSectionBadgeProvider, supportsHarness: (harnessId: string) => boolean = () => true): IDisposable {
		const registration: IAICustomizationManagementSectionBadgeRegistration = { getBadge, supportsHarness };
		const registrations = this.badges.get(section) ?? [];
		registrations.push(registration);
		this.badges.set(section, registrations);
		return toDisposable(() => {
			const index = registrations.indexOf(registration);
			if (index !== -1) {
				registrations.splice(index, 1);
			}
			if (registrations.length === 0) {
				this.badges.delete(section);
			}
		});
	}

	getBadge(section: AICustomizationManagementSection, harnessId: string): AICustomizationManagementSectionBadgeProvider | undefined {
		return this.badges.get(section)?.find(registration => registration.supportsHarness(harnessId))?.getBadge;
	}

	/**
	 * Whether the editor shows `section` for the harness: the harness doesn't hide it and, if the section is
	 * contributed, a contribution supports the harness and one of its enablement settings, if any, is enabled.
	 */
	isVisible(section: AICustomizationManagementSection, harnessId: string, harnessService: ICustomizationHarnessService, configurationService: IConfigurationService): boolean {
		if (harnessService.findHarnessById(harnessId)?.hiddenSections?.includes(section)) {
			return false;
		}
		if (!this.has(section)) {
			return true;
		}
		const contribution = this.get(section, harnessId);
		return !!contribution && this.isEnabled(contribution, configurationService);
	}

	/**
	 * Whether one of the contribution's enablement settings, if any, is enabled.
	 */
	isEnabled(contribution: IAICustomizationManagementSectionContribution | undefined, configurationService: IConfigurationService): boolean {
		const settings = contribution?.enablementSettings;
		return !settings || settings.some(setting => configurationService.getValue<boolean>(setting) === true);
	}
}

export const aiCustomizationManagementSectionRegistry = new AICustomizationManagementSectionRegistry();
