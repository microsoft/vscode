/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatConfiguration } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { isPromptFileMigrationCandidate, isUserDataMigrationCandidate, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import type { ICustomizationMigrationDashboardItem } from './customizationMigrationDashboard.js';

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
	getCardDescription(customizations: readonly MigratableConfiguration[], harnessLabel: string): string;
	getDashboardItem(customizations: readonly MigratableConfiguration[], harnessLabel: string, destinationLabel?: string): Omit<ICustomizationMigrationDashboardItem, 'id' | 'label' | 'description' | 'count' | 'actionLabel' | 'actionAriaLabel'>;
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
	cardLabel: localize('promptMigrationCardLabel', "Prompt Files"),
	cardActionLabel: localize('promptMigrationCardAction', "Review Prompt Files"),
	cardActionAriaLabel: localize('promptMigrationCardActionAriaLabel', "Review prompt files that need migration"),
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

	getCardDescription(customizations, harnessLabel) {
		const { workspaceCount, userCount, totalCount } = countPromptStorages(customizations);
		if (workspaceCount > 0 && userCount > 0) {
			return localize(
				'promptMigrationCardDescriptionWorkspaceAndUser',
				"Prompt files are now deprecated. Found {0} prompt files ({1} workspace and {2} profile) that {3} will ignore. Convert them to skills to keep them available.",
				totalCount, workspaceCount, userCount, harnessLabel,
			);
		}
		if (workspaceCount > 0) {
			return localize(
				'promptMigrationCardDescriptionWorkspace',
				"Prompt files are now deprecated. Found {0} workspace prompt files that {1} will ignore. Convert them to skills to keep them available.",
				workspaceCount, harnessLabel,
			);
		}
		return localize(
			'promptMigrationCardDescriptionUser',
			"Prompt files are now deprecated. Found {0} profile prompt files that {1} will ignore. Convert them to skills to keep them available.",
			userCount, harnessLabel,
		);
	},

	getDashboardItem(customizations, _harnessLabel, destinationLabel) {
		const { workspaceCount, userCount } = countPromptStorages(customizations);
		const workspaceSummary = workspaceCount === 1
			? localize('promptMigrationDashboardWorkspaceSingle', "1 workspace file")
			: localize('promptMigrationDashboardWorkspace', "{0} workspace files", workspaceCount);
		const userSummary = userCount === 1
			? localize('promptMigrationDashboardUserSingle', "1 profile file")
			: localize('promptMigrationDashboardUser', "{0} profile files", userCount);
		return {
			operationLabel: localize('promptMigrationDashboardOperation', "Convert"),
			sourceLabel: localize('promptMigrationDashboardSource', ".prompt.md files"),
			destinationLabel: destinationLabel ?? localize('promptMigrationDashboardDestination', "Skill folders"),
			itemSummary: workspaceCount > 0 && userCount > 0
				? localize('promptMigrationDashboardWorkspaceAndUser', "{0} · {1}", workspaceSummary, userSummary)
				: workspaceCount > 0 ? workspaceSummary : userSummary,
		};
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
	cardLabel: localize('userDataMigrationCardLabel', "VS Code Profile Customizations"),
	cardActionLabel: localize('userDataMigrationCardAction', "Review Profile Files"),
	cardActionAriaLabel: localize('userDataMigrationCardActionAriaLabel', "Review VS Code profile customizations that need migration"),
	pageTitle: localize('userDataMigrationPageTitle', "Migrate VS Code profile customizations"),
	pageLinkLabel: localize('userDataMigrationLearnMore', "Learn more about agent customizations"),
	pageLinkUrl: CUSTOMIZATION_DOCUMENTATION_URL,
	pageEmptyMessage: localize('userDataMigrationPageEmpty', "No VS Code profile customizations are available to migrate."),
	migrateButtonTooltip: localize('userDataMigrationPageButtonTooltip', "Move the selected VS Code profile customizations to the active harness"),
	backLabel: localize('backToUserDataMigration', "Back to Migrate VS Code profile customizations"),
	noFilesMigratedMessage: localize('userDataMigrationNoFilesMigrated', "No VS Code profile customizations were migrated."),

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
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		if (agentCount > 0 && instructionsCount > 0) {
			return localize(
				'userDataMigrationCardDescriptionMixed',
				"Agent Host harnesses do not discover customizations stored in your VS Code profile. Found {0} agents and instruction files that {1} will ignore. Move them to portable Copilot folders to keep them available.",
				totalCount, harnessLabel,
			);
		}
		if (agentCount > 0) {
			return agentCount === 1
				? localize(
					'userDataMigrationCardDescriptionAgent',
					"Agent Host harnesses do not discover customizations stored in your VS Code profile. Found 1 agent that {0} will ignore. Move it to a portable Copilot folder to keep it available.",
					harnessLabel,
				)
				: localize(
					'userDataMigrationCardDescriptionAgents',
					"Agent Host harnesses do not discover customizations stored in your VS Code profile. Found {0} agents that {1} will ignore. Move them to portable Copilot folders to keep them available.",
					agentCount, harnessLabel,
				);
		}
		return instructionsCount === 1
			? localize(
				'userDataMigrationCardDescriptionInstruction',
				"Agent Host harnesses do not discover customizations stored in your VS Code profile. Found 1 instruction file that {0} will ignore. Move it to a portable Copilot folder to keep it available.",
				harnessLabel,
			)
			: localize(
				'userDataMigrationCardDescriptionInstructions',
				"Agent Host harnesses do not discover customizations stored in your VS Code profile. Found {0} instruction files that {1} will ignore. Move them to portable Copilot folders to keep them available.",
				instructionsCount, harnessLabel,
			);
	},

	getDashboardItem(customizations, _harnessLabel, destinationLabel) {
		const { agentCount, instructionsCount } = countUserDataTypes(customizations);
		const agentSummary = agentCount === 1
			? localize('userDataMigrationDashboardAgentSingle', "1 agent")
			: localize('userDataMigrationDashboardAgents', "{0} agents", agentCount);
		const instructionSummary = instructionsCount === 1
			? localize('userDataMigrationDashboardInstructionSingle', "1 instruction")
			: localize('userDataMigrationDashboardInstructions', "{0} instructions", instructionsCount);
		return {
			operationLabel: localize('userDataMigrationDashboardOperation', "Move"),
			sourceLabel: localize('userDataMigrationDashboardSource', "VS Code profile"),
			destinationLabel: destinationLabel ?? localize('userDataMigrationDashboardDestination', "Copilot customization folders"),
			itemSummary: agentCount > 0 && instructionsCount > 0
				? localize('userDataMigrationDashboardAgentsAndInstructions', "{0} · {1}", agentSummary, instructionSummary)
				: agentCount > 0 ? agentSummary : instructionSummary,
		};
	},

	getBanner(_customizations, harnessLabel, destinationLabel) {
		return {
			message: destinationLabel
				? localize(
					'userDataMigrationBannerMessageWithDestination',
					"These files are stored in your active VS Code profile, a VS Code-only location that can roam through Settings Sync. Move them to '{0}' so both VS Code and this harness can use them, keeping their name, type, and content.",
					destinationLabel,
				)
				: localize(
					'userDataMigrationBannerMessage',
					"These files are stored in your active VS Code profile, a VS Code-only location that can roam through Settings Sync. Migrating moves them into folders {0} reads, keeping their name, type, and content.",
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
			return localize('userDataMigrationPageDescription', "Select VS Code profile customizations to move to the active harness.");
		}
		if (agentCount > 0 && instructionsCount > 0) {
			return localize(
				'userDataMigrationPageDescriptionAgentsAndInstructions',
				"Found {0} customizations in your active VS Code profile that local VS Code can still use, but {1} does not discover. Move them to the harness folders to keep their type and content.",
				totalCount, harnessLabel,
			);
		}
		if (agentCount > 0) {
			return agentCount === 1
				? localize(
					'userDataMigrationPageDescriptionAgent',
					"Found 1 agent in your active VS Code profile that local VS Code can still use, but {0} does not discover. Move it to the harness agents folder to keep it available.",
					harnessLabel,
				)
				: localize(
					'userDataMigrationPageDescriptionAgents',
					"Found {0} agents in your active VS Code profile that local VS Code can still use, but {1} does not discover. Move them to the harness agents folder to keep them available.",
					agentCount, harnessLabel,
				);
		}
		return instructionsCount === 1
			? localize(
				'userDataMigrationPageDescriptionInstruction',
				"Found 1 instruction file in your active VS Code profile that local VS Code can still use, but {0} does not discover. Move it to the harness instructions folder to keep it available.",
				harnessLabel,
			)
			: localize(
				'userDataMigrationPageDescriptionInstructions',
				"Found {0} instruction files in your active VS Code profile that local VS Code can still use, but {1} does not discover. Move them to the harness instructions folder to keep them available.",
				instructionsCount, harnessLabel,
			);
	},

	getConfirmation(customizations, harnessLabel, destinationLabel) {
		const { agentCount, instructionsCount, totalCount } = countUserDataTypes(customizations);
		let detail: string;
		if (agentCount > 0 && instructionsCount > 0) {
			detail = localize('userDataMigrationConfirmDetailMixed', "This moves {0} customizations out of your active VS Code profile.", totalCount);
		} else if (agentCount > 0) {
			detail = agentCount === 1
				? localize('userDataMigrationConfirmDetailAgent', "This moves 1 agent out of your active VS Code profile.")
				: localize('userDataMigrationConfirmDetailAgents', "This moves {0} agents out of your active VS Code profile.", agentCount);
		} else {
			detail = instructionsCount === 1
				? localize('userDataMigrationConfirmDetailInstruction', "This moves 1 instruction file out of your active VS Code profile.")
				: localize('userDataMigrationConfirmDetailInstructions', "This moves {0} instruction files out of your active VS Code profile.", instructionsCount);
		}
		return {
			message: destinationLabel
				? localize('userDataMigrationConfirmMessageWithDestination', "Migrate VS Code profile customizations to '{0}'?", destinationLabel)
				: localize('userDataMigrationConfirmMessage', "Migrate VS Code profile customizations to {0}?", harnessLabel),
			detail,
			primaryButton: localize('userDataMigrationConfirmButton', "Migrate"),
			deleteOriginalsLabel: localize('userDataMigrationDeleteOriginalFilesCheckbox', "Delete the original files from the VS Code profile after migration"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('userDataMigrationCompletedSingle', "Migrated 1 VS Code profile customization.")
			: localize('userDataMigrationCompleted', "Migrated {0} VS Code profile customizations.", migratedCount);
	},

	getFailedMessage(failedFileNames, hiddenFileCount) {
		const failedCount = failedFileNames.length + hiddenFileCount;
		if (failedCount === 1) {
			return localize('userDataMigrationFileFailed', "Failed to migrate 1 VS Code profile customization: {0}.", failedFileNames[0]);
		}
		return hiddenFileCount > 0
			? localize('userDataMigrationFilesFailedWithRemainder', "Failed to migrate {0} VS Code profile customizations: {1}, and {2} more.", failedCount, failedFileNames.join(', '), hiddenFileCount)
			: localize('userDataMigrationFilesFailed', "Failed to migrate {0} VS Code profile customizations: {1}.", failedCount, failedFileNames.join(', '));
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
