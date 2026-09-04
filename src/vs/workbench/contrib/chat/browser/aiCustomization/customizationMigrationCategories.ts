/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatConfiguration } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { isPromptFileMigrationCandidate, isUserDataMigrationCandidate, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

export const enum CustomizationMigrationCategoryId {
	PromptFiles = 'promptFiles',
	UserData = 'userData',
}

export interface ICustomizationMigrationGroup {
	readonly key: string;
	readonly label: string;
	readonly customizations: readonly MigratableConfiguration[];
}

export interface ICustomizationMigrationConfirmation {
	readonly message: string;
	readonly detail: string;
	readonly primaryButton: string;
	readonly deleteOriginalsLabel: string;
}

/**
 * A self-contained migration flow. Each category owns its candidates, grouping,
 * and user-visible copy so the two migrations stay focused and independently readable.
 */
export interface ICustomizationMigrationCategory {
	readonly id: CustomizationMigrationCategoryId;
	/** Prompt types scanned when collecting candidates for this category. */
	readonly sourceTypes: readonly PromptsType[];
	/** Experimental setting gating this migration. Each category is enabled independently. */
	readonly enablementSetting: ChatConfiguration;
	readonly cardLabel: string;
	readonly cardActionLabel: string;
	readonly cardActionAriaLabel: string;
	readonly pageTitle: string;
	readonly pageEmptyMessage: string;
	readonly migrateButtonTooltip: string;
	readonly backLabel: string;
	readonly noFilesMigratedMessage: string;
	isCandidate(customization: MigratableConfiguration): boolean;
	group(customizations: readonly MigratableConfiguration[]): readonly ICustomizationMigrationGroup[];
	getCardDescription(customizations: readonly MigratableConfiguration[], harnessLabel: string): string;
	getConfirmation(customizations: readonly MigratableConfiguration[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationConfirmation;
	getMigratedMessage(migratedCount: number): string;
	getMigratedWithReviewMessage?(migratedCount: number, unsupportedHeaderKeys: string): string;
	getFailedMessage(failedFileNames: readonly string[], hiddenFileCount: number): string;
}

/**
 * Converts `*.prompt.md` files into skills. Agent-host harnesses ignore prompt
 * files entirely, so both workspace and user prompts are offered here.
 */
const promptFilesMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.PromptFiles,
	sourceTypes: [PromptsType.prompt],
	enablementSetting: ChatConfiguration.ChatCustomizationsPromptMigrationEnabled,
	cardLabel: localize('promptMigrationCardLabel', "Prompt Files"),
	cardActionLabel: localize('promptMigrationCardAction', "Review Migration"),
	cardActionAriaLabel: localize('promptMigrationCardActionAriaLabel', "Review prompt file migration"),
	pageTitle: localize('promptMigrationPageTitle', "Migrate Prompt Files"),
	pageEmptyMessage: localize('promptMigrationPageEmpty', "No prompt files are available to migrate."),
	migrateButtonTooltip: localize('promptMigrationPageButtonTooltip', "Convert selected prompt files to skills"),
	backLabel: localize('backToPromptMigration', "Back to Migrate Prompt Files"),
	noFilesMigratedMessage: localize('promptMigrationNoFilesConverted', "No prompt files were converted."),

	isCandidate: isPromptFileMigrationCandidate,

	group(customizations) {
		return [
			{
				key: PromptsStorage.local,
				label: localize('promptMigrationWorkspaceGroup', "Workspace"),
				customizations: customizations.filter(customization => customization.storage === PromptsStorage.local),
			},
			{
				key: PromptsStorage.user,
				label: localize('promptMigrationUserGroup', "User"),
				customizations: customizations.filter(customization => customization.storage === PromptsStorage.user),
			},
		];
	},

	getCardDescription(customizations, harnessLabel) {
		return customizations.length === 1
			? localize('promptMigrationCardDescriptionSingle', "{0} will ignore this prompt file. Convert it to a skill to keep it available.", harnessLabel)
			: localize('promptMigrationCardDescription', "{0} will ignore these prompt files. Convert them to skills to keep them available.", harnessLabel);
	},

	getConfirmation(customizations) {
		const { workspaceCount, userCount } = countPromptStorages(customizations);
		const detail = workspaceCount > 0 && userCount > 0
			? localize('promptMigrationConfirmDetailWorkspaceAndUser', "This converts {0} workspace prompt files and {1} user prompt files into skills.", workspaceCount, userCount)
			: workspaceCount > 0
				? localize('promptMigrationConfirmDetailWorkspace', "This converts {0} workspace prompt files into skills.", workspaceCount)
				: localize('promptMigrationConfirmDetailUser', "This converts {0} user prompt files into skills.", userCount);
		return {
			message: localize('promptMigrationConfirmMessage', "Convert prompt files to skills?"),
			detail,
			primaryButton: localize('promptMigrationConfirmButton', "Convert to Skills"),
			deleteOriginalsLabel: localize('promptMigrationDeletePromptFilesCheckbox', "Delete original prompt files after migration"),
		};
	},

	getMigratedMessage(migratedCount) {
		return localize('promptMigrationConverted', "Converted {0} prompt files to skills.", migratedCount);
	},

	getMigratedWithReviewMessage(migratedCount, unsupportedHeaderKeys) {
		return localize(
			'promptMigrationConvertedWithReview',
			"Converted {0} prompt files to skills. Review migrated skills that used unsupported prompt headers: {1}.",
			migratedCount, unsupportedHeaderKeys,
		);
	},

	getFailedMessage(failedFileNames, hiddenFileCount) {
		return hiddenFileCount > 0
			? localize('promptMigrationFilesFailedWithRemainder', "Failed to migrate {0} prompt files: {1}, and {2} more.", failedFileNames.length + hiddenFileCount, failedFileNames.join(', '), hiddenFileCount)
			: localize('promptMigrationFilesFailed', "Failed to migrate {0} prompt files: {1}.", failedFileNames.length, failedFileNames.join(', '));
	},
};

/**
 * Relocates agents and instructions kept in the active profile's User Data prompts folder
 * to the active harness roots. These files keep their type and content; only their
 * location changes. User Data prompt files are intentionally left to
 * {@link promptFilesMigrationCategory} so every prompt file is converted in one place.
 */
const userDataMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.UserData,
	sourceTypes: [PromptsType.agent, PromptsType.instructions],
	enablementSetting: ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled,
	cardLabel: localize('userDataMigrationCardLabel', "VS Code-only Customizations"),
	cardActionLabel: localize('userDataMigrationCardAction', "Review Migration"),
	cardActionAriaLabel: localize('userDataMigrationCardActionAriaLabel', "Review VS Code-only customization migration"),
	pageTitle: localize('userDataMigrationPageTitle', "Migrate VS Code-only customizations"),
	pageEmptyMessage: localize('userDataMigrationPageEmpty', "No VS Code-only customizations are available to migrate."),
	migrateButtonTooltip: localize('userDataMigrationPageButtonTooltip', "Move the selected VS Code-only customizations to the active harness"),
	backLabel: localize('backToUserDataMigration', "Back to Migrate VS Code-only customizations"),
	noFilesMigratedMessage: localize('userDataMigrationNoFilesMigrated', "No VS Code-only customizations were migrated."),

	isCandidate: isUserDataMigrationCandidate,

	group(customizations) {
		return [
			{
				key: PromptsType.agent,
				label: localize('userDataMigrationAgentsGroup', "Agents"),
				customizations: customizations.filter(customization => customization.type === PromptsType.agent),
			},
			{
				key: PromptsType.instructions,
				label: localize('userDataMigrationInstructionsGroup', "Instructions"),
				customizations: customizations.filter(customization => customization.type === PromptsType.instructions),
			},
		];
	},

	getCardDescription(customizations, harnessLabel) {
		const { agentCount, instructionsCount } = countUserDataTypes(customizations);
		if (agentCount > 0 && instructionsCount > 0) {
			return localize(
				'userDataMigrationCardDescriptionMixed',
				"{0} will ignore these agents and instruction files. Move them to portable Copilot folders to keep them available.",
				harnessLabel,
			);
		}
		if (agentCount > 0) {
			return agentCount === 1
				? localize(
					'userDataMigrationCardDescriptionAgent',
					"{0} will ignore this agent. Move it to a portable Copilot folder to keep it available.",
					harnessLabel,
				)
				: localize(
					'userDataMigrationCardDescriptionAgents',
					"{0} will ignore these agents. Move them to portable Copilot folders to keep them available.",
					harnessLabel,
				);
		}
		return instructionsCount === 1
			? localize(
				'userDataMigrationCardDescriptionInstruction',
				"{0} will ignore this instruction file. Move it to a portable Copilot folder to keep it available.",
				harnessLabel,
			)
			: localize(
				'userDataMigrationCardDescriptionInstructions',
				"{0} will ignore these instruction files. Move them to portable Copilot folders to keep them available.",
				harnessLabel,
			);
	},

	getConfirmation(customizations, harnessLabel, destinationLabel) {
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		let detail: string;
		if (agentCount > 0 && instructionsCount > 0) {
			detail = localize('userDataMigrationConfirmDetailMixed', "This moves {0} customizations out of their VS Code-only folder.", totalCount);
		} else if (agentCount > 0) {
			detail = agentCount === 1
				? localize('userDataMigrationConfirmDetailAgent', "This moves 1 agent out of its VS Code-only folder.")
				: localize('userDataMigrationConfirmDetailAgents', "This moves {0} agents out of their VS Code-only folder.", agentCount);
		} else {
			detail = instructionsCount === 1
				? localize('userDataMigrationConfirmDetailInstruction', "This moves 1 instruction file out of its VS Code-only folder.")
				: localize('userDataMigrationConfirmDetailInstructions', "This moves {0} instruction files out of their VS Code-only folder.", instructionsCount);
		}
		return {
			message: destinationLabel
				? localize('userDataMigrationConfirmMessageWithDestination', "Migrate VS Code-only customizations to '{0}'?", destinationLabel)
				: localize('userDataMigrationConfirmMessage', "Migrate VS Code-only customizations to {0}?", harnessLabel),
			detail,
			primaryButton: localize('userDataMigrationConfirmButton', "Migrate"),
			deleteOriginalsLabel: localize('userDataMigrationDeleteOriginalFilesCheckbox', "Delete the original files from the VS Code-only folder after migration"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('userDataMigrationCompletedSingle', "Migrated 1 VS Code-only customization.")
			: localize('userDataMigrationCompleted', "Migrated {0} VS Code-only customizations.", migratedCount);
	},

	getFailedMessage(failedFileNames, hiddenFileCount) {
		const failedCount = failedFileNames.length + hiddenFileCount;
		if (failedCount === 1) {
			return localize('userDataMigrationFileFailed', "Failed to migrate 1 VS Code-only customization: {0}.", failedFileNames[0]);
		}
		return hiddenFileCount > 0
			? localize('userDataMigrationFilesFailedWithRemainder', "Failed to migrate {0} VS Code-only customizations: {1}, and {2} more.", failedCount, failedFileNames.join(', '), hiddenFileCount)
			: localize('userDataMigrationFilesFailed', "Failed to migrate {0} VS Code-only customizations: {1}.", failedCount, failedFileNames.join(', '));
	},
};

export const CUSTOMIZATION_MIGRATION_CATEGORIES: readonly ICustomizationMigrationCategory[] = [
	promptFilesMigrationCategory,
	userDataMigrationCategory,
];

export function getCustomizationMigrationCategory(id: CustomizationMigrationCategoryId): ICustomizationMigrationCategory {
	const category = CUSTOMIZATION_MIGRATION_CATEGORIES.find(candidate => candidate.id === id);
	if (!category) {
		throw new Error(`Unknown customization migration category: ${id}`);
	}
	return category;
}

/**
 * All prompt types the given categories can discover, so candidates can be collected with one pass per type.
 */
export function getCustomizationMigrationSourceTypes(categories: readonly ICustomizationMigrationCategory[]): readonly PromptsType[] {
	return Array.from(new Set(categories.flatMap(category => category.sourceTypes)));
}

function countPromptStorages(customizations: readonly MigratableConfiguration[]): { workspaceCount: number; userCount: number; totalCount: number } {
	const workspaceCount = customizations.filter(customization => customization.storage === PromptsStorage.local).length;
	const userCount = customizations.filter(customization => customization.storage === PromptsStorage.user).length;
	return { workspaceCount, userCount, totalCount: workspaceCount + userCount };
}

function countUserDataTypes(customizations: readonly MigratableConfiguration[]): { agentCount: number; instructionsCount: number; totalCount: number } {
	const agentCount = customizations.filter(customization => customization.type === PromptsType.agent).length;
	const instructionsCount = customizations.filter(customization => customization.type === PromptsType.instructions).length;
	return { agentCount, instructionsCount, totalCount: agentCount + instructionsCount };
}
