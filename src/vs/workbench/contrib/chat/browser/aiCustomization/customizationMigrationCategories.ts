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
 * Prominent explanation shown above the migration list.
 */
export interface ICustomizationMigrationBanner {
	readonly message: string;
	readonly consequence?: string;
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
	readonly shortcutLabel: string;
	readonly shortcutTooltip: string;
	readonly cardLabel: string;
	readonly cardActionLabel: string;
	readonly cardActionAriaLabel: string;
	readonly pageTitle: string;
	readonly pageLinkLabel: string;
	readonly pageLinkUrl: string;
	readonly pageEmptyMessage: string;
	readonly migrateButtonTooltip: string;
	readonly backLabel: string;
	readonly noFilesMigratedMessage: string;
	isCandidate(customization: MigratableConfiguration): boolean;
	group(customizations: readonly MigratableConfiguration[]): readonly ICustomizationMigrationGroup[];
	getShortcutAriaLabel(count: number): string;
	getCardDescription(customizations: readonly MigratableConfiguration[], harnessLabel: string): string;
	getPageDescription(customizations: readonly MigratableConfiguration[], harnessLabel: string): string;
	/** When present, replaces the page description with a prominent banner. */
	getBanner?(customizations: readonly MigratableConfiguration[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationBanner;
	getConfirmation(customizations: readonly MigratableConfiguration[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationConfirmation;
	getMigratedMessage(migratedCount: number): string;
	getMigratedWithReviewMessage?(migratedCount: number, unsupportedHeaderKeys: string): string;
	getFailedMessage(failedFileNames: readonly string[], hiddenFileCount: number): string;
}

const SKILLS_DOCUMENTATION_URL = 'https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product';
const CUSTOMIZATION_DOCUMENTATION_URL = 'https://code.visualstudio.com/docs/agent-customization/overview?referrer=in-product';

/**
 * Converts `*.prompt.md` files into skills. Agent-host harnesses ignore prompt
 * files entirely, so both workspace and user prompts are offered here.
 */
const promptFilesMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.PromptFiles,
	sourceTypes: [PromptsType.prompt],
	enablementSetting: ChatConfiguration.ChatCustomizationsPromptMigrationEnabled,
	shortcutLabel: localize('promptMigrationShortcutLabel', "Migrate Prompts"),
	shortcutTooltip: localize('promptMigrationShortcutTooltip', "Convert deprecated prompt files to skills"),
	cardLabel: localize('promptMigrationCardLabel', "Migrate Prompt Files"),
	cardActionLabel: localize('promptMigrationCardAction', "Convert to Skills..."),
	cardActionAriaLabel: localize('promptMigrationCardActionAriaLabel', "Convert prompt files to skills"),
	pageTitle: localize('promptMigrationPageTitle', "Migrate Prompt Files"),
	pageLinkLabel: localize('promptMigrationLearnMore', "Learn more about agent skills"),
	pageLinkUrl: SKILLS_DOCUMENTATION_URL,
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

	getShortcutAriaLabel(count) {
		return localize('promptMigrationShortcutAriaLabelWithCount', "Prompts, {0} deprecated prompt files need migration", count);
	},

	getCardDescription(customizations, harnessLabel) {
		const { workspaceCount, userCount, totalCount } = countPromptStorages(customizations);
		if (workspaceCount > 0 && userCount > 0) {
			return localize(
				'promptMigrationCardDescriptionWorkspaceAndUser',
				"Prompt files are deprecated for this harness. Found {0} prompt files ({1} workspace, {2} global) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
				totalCount, workspaceCount, userCount, harnessLabel,
			);
		}
		if (workspaceCount > 0) {
			return localize(
				'promptMigrationCardDescriptionWorkspace',
				"Prompt files are deprecated for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
				workspaceCount, harnessLabel,
			);
		}
		return localize(
			'promptMigrationCardDescriptionUser',
			"Prompt files are deprecated for this harness. Found {0} global prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
			userCount, harnessLabel,
		);
	},

	getPageDescription(customizations, harnessLabel) {
		const { workspaceCount, userCount, totalCount } = countPromptStorages(customizations);
		if (totalCount === 0) {
			return localize('promptMigrationPageDescription', "Select prompt files to convert into skills for the active harness.");
		}
		if (workspaceCount > 0 && userCount > 0) {
			return localize(
				'promptMigrationPageDescriptionWorkspaceAndUser',
				"Prompt files are not supported for this harness. Found {0} prompt files ({1} workspace, {2} user) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
				totalCount, workspaceCount, userCount, harnessLabel,
			);
		}
		if (workspaceCount > 0) {
			return localize(
				'promptMigrationPageDescriptionWorkspace',
				"Prompt files are not supported for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
				workspaceCount, harnessLabel,
			);
		}
		return localize(
			'promptMigrationPageDescriptionUser',
			"Prompt files are not supported for this harness. Found {0} user prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
			userCount, harnessLabel,
		);
	},

	getBanner(_customizations, harnessLabel) {
		return {
			message: localize(
				'promptMigrationBannerMessage',
				"Prompts are no longer supported by {0}. Convert them to skills to keep them available in both VS Code and this harness.",
				harnessLabel,
			),
		};
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
 * Relocates agents and instructions kept in the profile's User Data prompts folder
 * to the active harness roots. These files keep their type and content; only their
 * location changes. User Data prompt files are intentionally left to
 * {@link promptFilesMigrationCategory} so every prompt file is converted in one place.
 */
const userDataMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.UserData,
	sourceTypes: [PromptsType.agent, PromptsType.instructions],
	enablementSetting: ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled,
	shortcutLabel: localize('userDataMigrationShortcutLabel', "Migrate User Data"),
	shortcutTooltip: localize('userDataMigrationShortcutTooltip', "Move user data agents and instructions to the active harness"),
	cardLabel: localize('userDataMigrationCardLabel', "Migrate User Data Customizations"),
	cardActionLabel: localize('userDataMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('userDataMigrationCardActionAriaLabel', "Migrate user data customizations to the active harness"),
	pageTitle: localize('userDataMigrationPageTitle', "Migrate User Data Customizations"),
	pageLinkLabel: localize('userDataMigrationLearnMore', "Learn more about agent customizations"),
	pageLinkUrl: CUSTOMIZATION_DOCUMENTATION_URL,
	pageEmptyMessage: localize('userDataMigrationPageEmpty', "No user data customizations are available to migrate."),
	migrateButtonTooltip: localize('userDataMigrationPageButtonTooltip', "Move the selected user data customizations to the active harness"),
	backLabel: localize('backToUserDataMigration', "Back to Migrate User Data Customizations"),
	noFilesMigratedMessage: localize('userDataMigrationNoFilesMigrated', "No user data customizations were migrated."),

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

	getShortcutAriaLabel(count) {
		return count === 1
			? localize('userDataMigrationShortcutAriaLabelSingle', "User data, 1 customization needs migration")
			: localize('userDataMigrationShortcutAriaLabelWithCount', "User data, {0} customizations need migration", count);
	},

	getCardDescription(customizations, harnessLabel) {
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		if (agentCount > 0 && instructionsCount > 0) {
			return localize(
				'userDataMigrationCardDescriptionMixed',
				"User data customizations are only used by VS Code. Found {0} customizations that {1} ignores. Move them to keep them available.",
				totalCount, harnessLabel,
			);
		}
		if (agentCount > 0) {
			return agentCount === 1
				? localize(
					'userDataMigrationCardDescriptionAgent',
					"User data customizations are only used by VS Code. Found 1 agent that {0} ignores. Move it to keep it available.",
					harnessLabel,
				)
				: localize(
					'userDataMigrationCardDescriptionAgents',
					"User data customizations are only used by VS Code. Found {0} agents that {1} ignores. Move them to keep them available.",
					agentCount, harnessLabel,
				);
		}
		return instructionsCount === 1
			? localize(
				'userDataMigrationCardDescriptionInstruction',
				"User data customizations are only used by VS Code. Found 1 instruction file that {0} ignores. Move it to keep it available.",
				harnessLabel,
			)
			: localize(
				'userDataMigrationCardDescriptionInstructions',
				"User data customizations are only used by VS Code. Found {0} instruction files that {1} ignores. Move them to keep them available.",
				instructionsCount, harnessLabel,
			);
	},

	getBanner(_customizations, harnessLabel, destinationLabel) {
		return {
			message: destinationLabel
				? localize(
					'userDataMigrationBannerMessageWithDestination',
					"They are stored in user data, which only VS Code reads. Move them to '{0}' so both VS Code and this harness can use them, keeping their name, type, and content.",
					destinationLabel,
				)
				: localize(
					'userDataMigrationBannerMessage',
					"They are stored in user data, which only VS Code reads. Migrating moves them into the folders {0} reads, keeping their name, type, and content, so you can keep using them.",
					harnessLabel,
				),
			consequence: localize(
				'userDataMigrationBannerConsequence',
				"Migrated files aren't currently included in Settings Sync.",
			),
		};
	},

	getPageDescription(customizations, harnessLabel) {
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		if (totalCount === 0) {
			return localize('userDataMigrationPageDescription', "Select user data customizations to move to the active harness.");
		}
		if (agentCount > 0 && instructionsCount > 0) {
			return localize(
				'userDataMigrationPageDescriptionAgentsAndInstructions',
				"Found {0} customizations in user data that local VS Code can still use, but {1} ignores. Move them to the harness folders to keep their type and content.",
				totalCount, harnessLabel,
			);
		}
		if (agentCount > 0) {
			return agentCount === 1
				? localize(
					'userDataMigrationPageDescriptionAgent',
					"Found 1 agent in user data that local VS Code can still use, but {0} ignores. Move it to the harness agents folder to keep it available.",
					harnessLabel,
				)
				: localize(
					'userDataMigrationPageDescriptionAgents',
					"Found {0} agents in user data that local VS Code can still use, but {1} ignores. Move them to the harness agents folder to keep them available.",
					agentCount, harnessLabel,
				);
		}
		return instructionsCount === 1
			? localize(
				'userDataMigrationPageDescriptionInstruction',
				"Found 1 instruction file in user data that local VS Code can still use, but {0} ignores. Move it to the harness instructions folder to keep it available.",
				harnessLabel,
			)
			: localize(
				'userDataMigrationPageDescriptionInstructions',
				"Found {0} instruction files in user data that local VS Code can still use, but {1} ignores. Move them to the harness instructions folder to keep them available.",
				instructionsCount, harnessLabel,
			);
	},

	getConfirmation(customizations, harnessLabel, destinationLabel) {
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		let detail: string;
		if (agentCount > 0 && instructionsCount > 0) {
			detail = localize('userDataMigrationConfirmDetailMixed', "This moves {0} customizations out of user data.", totalCount);
		} else if (agentCount > 0) {
			detail = agentCount === 1
				? localize('userDataMigrationConfirmDetailAgent', "This moves 1 agent out of user data.")
				: localize('userDataMigrationConfirmDetailAgents', "This moves {0} agents out of user data.", agentCount);
		} else {
			detail = instructionsCount === 1
				? localize('userDataMigrationConfirmDetailInstruction', "This moves 1 instruction file out of user data.")
				: localize('userDataMigrationConfirmDetailInstructions', "This moves {0} instruction files out of user data.", instructionsCount);
		}
		return {
			message: destinationLabel
				? localize('userDataMigrationConfirmMessageWithDestination', "Migrate user data customizations to '{0}'?", destinationLabel)
				: localize('userDataMigrationConfirmMessage', "Migrate user data customizations to {0}?", harnessLabel),
			detail,
			primaryButton: localize('userDataMigrationConfirmButton', "Migrate"),
			deleteOriginalsLabel: localize('userDataMigrationDeleteOriginalFilesCheckbox', "Delete the original files from user data after migration"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('userDataMigrationCompletedSingle', "Migrated 1 user data customization.")
			: localize('userDataMigrationCompleted', "Migrated {0} user data customizations.", migratedCount);
	},

	getFailedMessage(failedFileNames, hiddenFileCount) {
		const failedCount = failedFileNames.length + hiddenFileCount;
		if (failedCount === 1) {
			return localize('userDataMigrationFileFailed', "Failed to migrate 1 user data customization: {0}.", failedFileNames[0]);
		}
		return hiddenFileCount > 0
			? localize('userDataMigrationFilesFailedWithRemainder', "Failed to migrate {0} user data customizations: {1}, and {2} more.", failedCount, failedFileNames.join(', '), hiddenFileCount)
			: localize('userDataMigrationFilesFailed', "Failed to migrate {0} user data customizations: {1}.", failedCount, failedFileNames.join(', '));
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
