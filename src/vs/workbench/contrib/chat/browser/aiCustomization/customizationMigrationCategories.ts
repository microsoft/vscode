/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationCandidate, CustomizationMigrationType, getCustomizationMigrationEnablementSetting, IMcpServerCustomizationMigrationFailure, isConfiguredLocationMigrationCandidate, isMcpServerCustomizationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigrationFailureReason, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import type { ICustomizationMigrationDashboardItem } from './customizationMigrationDashboard.js';

export const enum CustomizationMigrationCategoryId {
	PromptFiles = 'promptFiles',
	UserData = 'userData',
	ConfiguredLocations = 'configuredLocations',
	McpServers = 'mcpServers',
}

export interface ICustomizationMigrationGroup {
	readonly key: string;
	readonly label: string;
	readonly customizations: readonly CustomizationMigrationCandidate[];
}

export interface ICustomizationMigrationCandidatePresentation {
	readonly name: string;
	readonly selectionAriaLabel: string;
	readonly pathLabel: string;
	readonly file?: MigratableConfiguration;
}

export interface ICustomizationMigrationConfirmation {
	readonly message: string;
	readonly detail: string;
	readonly primaryButton: string;
	readonly deleteOriginalsLabel?: string;
}

/**
 * Prominent explanation shown above the migration list.
 */
export interface ICustomizationMigrationBanner {
	readonly message: string | IMarkdownString;
	readonly consequence?: string;
}

/**
 * A self-contained migration flow. Each category owns its candidates, grouping,
 * and user-visible copy so migrations stay focused and independently readable.
 */
export interface ICustomizationMigrationCategory {
	readonly id: CustomizationMigrationCategoryId;
	readonly migrationType: CustomizationMigrationType;
	/** Prompt types scanned when collecting candidates for this category. */
	readonly sourceTypes?: readonly PromptsType[];
	/** Experimental setting gating this migration. Each category is enabled independently. */
	readonly enablementSetting: ChatConfiguration;
	/** Settings that must differ from their defaults for this migration to apply. */
	readonly configurationSettingIds?: readonly string[];
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
	isCandidate?(customization: MigratableConfiguration): boolean;
	group(customizations: readonly CustomizationMigrationCandidate[]): readonly ICustomizationMigrationGroup[];
	getCandidatePresentation(customization: CustomizationMigrationCandidate, getUriLabel: (uri: URI) => string): ICustomizationMigrationCandidatePresentation;
	getShortcutAriaLabel(count: number): string;
	getCardDescription(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string): string;
	getPageDescription(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string): string;
	getDashboardItem?(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string, destinationLabel?: string): Omit<ICustomizationMigrationDashboardItem, 'id' | 'label' | 'description' | 'count' | 'actionLabel' | 'actionAriaLabel'>;
	/** When present, replaces the page description with a prominent banner. */
	getModifiedSettingIds?(configurationService: IConfigurationService): readonly string[];
	getBanner?(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string, destinationLabel: string | undefined, modifiedSettingIds: readonly string[]): ICustomizationMigrationBanner;
	getConfirmation(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationConfirmation;
	getMigratedMessage(migratedCount: number): string;
	getMigratedWithReviewMessage?(migratedCount: number, unsupportedHeaderKeys: string): string;
	getFailedMessage(failedFileNames: readonly string[], hiddenFileCount: number): string;
	getMcpServerFailureMessage?(failures: readonly IMcpServerCustomizationMigrationFailure[]): string;
}

const SKILLS_DOCUMENTATION_URL = 'https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product';
const CUSTOMIZATION_DOCUMENTATION_URL = 'https://code.visualstudio.com/docs/agent-customization/overview?referrer=in-product';
const MCP_DOCUMENTATION_URL = 'https://code.visualstudio.com/docs/agent-customization/mcp-servers?referrer=in-product';
const CONFIGURED_LOCATION_SETTING_IDS = [
	PromptsConfig.AGENTS_LOCATION_KEY,
	PromptsConfig.MODE_LOCATION_KEY,
	PromptsConfig.SKILLS_LOCATION_KEY,
	PromptsConfig.INSTRUCTIONS_LOCATION_KEY,
] as const;

/**
 * Converts `*.prompt.md` files into skills. Agent-host harnesses ignore prompt
 * files entirely, so both workspace and user prompts are offered here.
 */
const promptFilesMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.PromptFiles,
	migrationType: CustomizationMigrationType.PromptFiles,
	sourceTypes: [PromptsType.prompt],
	enablementSetting: getCustomizationMigrationEnablementSetting(CustomizationMigrationType.PromptFiles),
	shortcutLabel: localize('promptMigrationShortcutLabel', "Migrate Prompts"),
	shortcutTooltip: localize('promptMigrationShortcutTooltip', "Convert deprecated prompt files to skills"),
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
	getCandidatePresentation: getFileCandidatePresentation,

	group(customizations) {
		return [
			{
				key: PromptsStorage.local,
				label: localize('promptMigrationWorkspaceGroup', "Workspace"),
				customizations: customizations.filter(customization => !isMcpServerCustomizationMigrationCandidate(customization) && customization.storage === PromptsStorage.local),
			},
			{
				key: PromptsStorage.user,
				label: localize('promptMigrationUserGroup', "User"),
				customizations: customizations.filter(customization => !isMcpServerCustomizationMigrationCandidate(customization) && customization.storage === PromptsStorage.user),
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
	migrationType: CustomizationMigrationType.UserData,
	sourceTypes: [PromptsType.agent, PromptsType.instructions],
	enablementSetting: getCustomizationMigrationEnablementSetting(CustomizationMigrationType.UserData),
	shortcutLabel: localize('userDataMigrationShortcutLabel', "Migrate User Data"),
	shortcutTooltip: localize('userDataMigrationShortcutTooltip', "Move user data agents and instructions to the active harness"),
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
	getCandidatePresentation: getFileCandidatePresentation,

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

const configuredLocationsMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.ConfiguredLocations,
	migrationType: CustomizationMigrationType.ConfiguredLocations,
	sourceTypes: [PromptsType.agent, PromptsType.instructions, PromptsType.skill],
	enablementSetting: getCustomizationMigrationEnablementSetting(CustomizationMigrationType.ConfiguredLocations),
	configurationSettingIds: CONFIGURED_LOCATION_SETTING_IDS,
	shortcutLabel: localize('configuredLocationsMigrationShortcutLabel', "Migrate Location Settings"),
	shortcutTooltip: localize('configuredLocationsMigrationShortcutTooltip', "Move customizations from locations unsupported by the active harness"),
	cardLabel: localize('configuredLocationsMigrationCardLabel', "Migrate Location Settings"),
	cardActionLabel: localize('configuredLocationsMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('configuredLocationsMigrationCardActionAriaLabel', "Migrate customizations from unsupported configured locations"),
	pageTitle: localize('configuredLocationsMigrationPageTitle', "Migrate Location Settings"),
	pageLinkLabel: localize('configuredLocationsMigrationLearnMore', "Learn more about agent customizations"),
	pageLinkUrl: CUSTOMIZATION_DOCUMENTATION_URL,
	pageEmptyMessage: localize('configuredLocationsMigrationPageEmpty', "No customizations in unsupported configured locations are available to migrate."),
	migrateButtonTooltip: localize('configuredLocationsMigrationPageButtonTooltip', "Move the selected customizations to locations supported by the active harness"),
	backLabel: localize('backToConfiguredLocationsMigration', "Back to Migrate Location Settings"),
	noFilesMigratedMessage: localize('configuredLocationsMigrationNoFilesMigrated', "No customizations from configured locations were migrated."),

	isCandidate: isConfiguredLocationMigrationCandidate,
	getCandidatePresentation: getFileCandidatePresentation,

	getModifiedSettingIds(configurationService) {
		return CONFIGURED_LOCATION_SETTING_IDS.filter(settingId => {
			const inspected = configurationService.inspect(settingId);
			return !equals(inspected.value, inspected.defaultValue);
		});
	},

	group(customizations) {
		return [
			{
				key: PromptsType.agent,
				label: localize('configuredLocationsMigrationAgentsGroup', "Agents"),
				customizations: customizations.filter(customization => customization.type === PromptsType.agent),
			},
			{
				key: PromptsType.instructions,
				label: localize('configuredLocationsMigrationInstructionsGroup', "Instructions"),
				customizations: customizations.filter(customization => customization.type === PromptsType.instructions),
			},
			{
				key: PromptsType.skill,
				label: localize('configuredLocationsMigrationSkillsGroup', "Skills"),
				customizations: customizations.filter(customization => customization.type === PromptsType.skill),
			},
		].filter(group => group.customizations.length > 0);
	},

	getShortcutAriaLabel(count) {
		return count === 1
			? localize('configuredLocationsMigrationShortcutAriaLabelSingle', "Locations, 1 customization needs migration")
			: localize('configuredLocationsMigrationShortcutAriaLabelWithCount', "Locations, {0} customizations need migration", count);
	},

	getCardDescription(customizations, harnessLabel) {
		return customizations.length === 1
			? localize('configuredLocationsMigrationCardDescriptionSingle', "Found 1 customization in a configured location that {0} does not use. Move it to keep it available.", harnessLabel)
			: localize('configuredLocationsMigrationCardDescription', "Found {0} customizations in configured locations that {1} does not use. Move them to keep them available.", customizations.length, harnessLabel);
	},

	getPageDescription(customizations, harnessLabel) {
		return customizations.length === 0
			? localize('configuredLocationsMigrationPageDescriptionEmpty', "Select customizations to move to locations supported by the active harness.")
			: localize('configuredLocationsMigrationPageDescription', "Found {0} customizations in locations configured through VS Code settings that {1} does not use. Move them to supported harness locations.", customizations.length, harnessLabel);
	},

	getBanner(_customizations, harnessLabel, destinationLabel, modifiedSettingIds) {
		const settingsLinks = modifiedSettingIds.map(settingId => `[${settingId}](${createCommandUri('workbench.action.openSettings', { query: `@id:${settingId}` })})`);
		const settingsList = formatSettingLinks(settingsLinks);
		const message = settingsLinks.length === 1
			? destinationLabel
				? localize('configuredLocationsMigrationBannerSingleSettingWithDestination', "The setting {0} is no longer read by {1}. Move the customizations to '{2}' so both VS Code and {1} can use them.", settingsList, harnessLabel, destinationLabel)
				: localize('configuredLocationsMigrationBannerSingleSetting', "The setting {0} is no longer read by {1}. Move the customizations into supported harness folders so both VS Code and {1} can use them.", settingsList, harnessLabel)
			: destinationLabel
				? localize('configuredLocationsMigrationBannerSettingsWithDestination', "The settings {0} are no longer read by {1}. Move the customizations to '{2}' so both VS Code and {1} can use them.", settingsList, harnessLabel, destinationLabel)
				: localize('configuredLocationsMigrationBannerSettings', "The settings {0} are no longer read by {1}. Move the customizations into supported harness folders so both VS Code and {1} can use them.", settingsList, harnessLabel);
		return {
			message: new MarkdownString(message, {
				isTrusted: { enabledCommands: ['workbench.action.openSettings'] },
			}),
			consequence: localize('configuredLocationsMigrationBannerConsequence', "The option to clear unused location settings after migration is selected by default."),
		};
	},

	getConfirmation(customizations, harnessLabel, destinationLabel) {
		return {
			message: destinationLabel
				? localize('configuredLocationsMigrationConfirmMessageWithDestination', "Migrate customizations to '{0}'?", destinationLabel)
				: localize('configuredLocationsMigrationConfirmMessage', "Migrate customizations to {0}?", harnessLabel),
			detail: customizations.length === 1
				? localize('configuredLocationsMigrationConfirmDetailSingle', "This moves 1 customization out of an unsupported configured location.")
				: localize('configuredLocationsMigrationConfirmDetail', "This moves {0} customizations out of unsupported configured locations.", customizations.length),
			primaryButton: localize('configuredLocationsMigrationConfirmButton', "Migrate"),
			deleteOriginalsLabel: localize('configuredLocationsMigrationDeleteOriginalFilesCheckbox', "Delete the original files after migration"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('configuredLocationsMigrationCompletedSingle', "Migrated 1 customization from a configured location.")
			: localize('configuredLocationsMigrationCompleted', "Migrated {0} customizations from configured locations.", migratedCount);
	},

	getFailedMessage(failedFileNames, hiddenFileCount) {
		const failedCount = failedFileNames.length + hiddenFileCount;
		if (failedCount === 1) {
			return localize('configuredLocationsMigrationFileFailed', "Failed to migrate 1 customization: {0}.", failedFileNames[0]);
		}
		return hiddenFileCount > 0
			? localize('configuredLocationsMigrationFilesFailedWithRemainder', "Failed to migrate {0} customizations: {1}, and {2} more.", failedCount, failedFileNames.join(', '), hiddenFileCount)
			: localize('configuredLocationsMigrationFilesFailed', "Failed to migrate {0} customizations: {1}.", failedCount, failedFileNames.join(', '));
	},
};

const mcpServersMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.McpServers,
	migrationType: CustomizationMigrationType.McpServers,
	enablementSetting: getCustomizationMigrationEnablementSetting(CustomizationMigrationType.McpServers),
	shortcutLabel: localize('mcpMigrationShortcutLabel', "Migrate MCP Servers"),
	shortcutTooltip: localize('mcpMigrationShortcutTooltip', "Move supported workspace MCP servers to root .mcp.json files"),
	cardLabel: localize('mcpMigrationCardLabel', "Migrate MCP Servers"),
	cardActionLabel: localize('mcpMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('mcpMigrationCardActionAriaLabel', "Migrate supported workspace MCP servers"),
	pageTitle: localize('mcpMigrationPageTitle', "Migrate MCP Servers"),
	pageLinkLabel: localize('mcpMigrationLearnMore', "Learn more about MCP servers"),
	pageLinkUrl: MCP_DOCUMENTATION_URL,
	pageEmptyMessage: localize('mcpMigrationPageEmpty', "No supported workspace MCP servers are available to migrate."),
	migrateButtonTooltip: localize('mcpMigrationPageButtonTooltip', "Move selected MCP servers to root .mcp.json files"),
	backLabel: localize('backToMcpMigration', "Back to Migrate MCP Servers"),
	noFilesMigratedMessage: localize('mcpMigrationNoneMigrated', "No MCP servers were migrated."),

	getCandidatePresentation(customization, getUriLabel) {
		if (!isMcpServerCustomizationMigrationCandidate(customization)) {
			throw new Error('Expected an MCP server migration candidate');
		}
		const sourceLabel = getUriLabel(customization.sourceUri);
		return {
			name: customization.name,
			selectionAriaLabel: localize('mcpMigrationSelectAriaLabel', "Select {0} from {1}", customization.name, sourceLabel),
			pathLabel: localize('mcpMigrationItemPath', "{0} to {1}", sourceLabel, getUriLabel(customization.targetUri)),
		};
	},

	group(customizations) {
		return [{
			key: 'workspace',
			label: localize('mcpMigrationWorkspaceGroup', "Workspace"),
			customizations,
		}];
	},

	getShortcutAriaLabel(count) {
		return count === 1
			? localize('mcpMigrationShortcutAriaLabelSingle', "MCP servers, 1 server can be migrated")
			: localize('mcpMigrationShortcutAriaLabelWithCount', "MCP servers, {0} servers can be migrated", count);
	},

	getCardDescription(customizations, harnessLabel) {
		return customizations.length === 1
			? localize('mcpMigrationCardDescriptionSingle', "Found 1 supported server in .vscode/mcp.json that can move to the workspace root so {0} can discover it directly.", harnessLabel)
			: localize('mcpMigrationCardDescriptionMultiple', "Found {0} supported servers in .vscode/mcp.json that can move to workspace root files so {1} can discover them directly.", customizations.length, harnessLabel);
	},

	getPageDescription(customizations, harnessLabel) {
		return customizations.length === 1
			? localize('mcpMigrationPageDescriptionSingle', "Select the supported MCP server to move so {0} can discover it directly. Unsupported and unselected servers stay in .vscode/mcp.json.", harnessLabel)
			: localize('mcpMigrationPageDescriptionMultiple', "Select supported MCP servers to move so {0} can discover them directly. Unsupported and unselected servers stay in .vscode/mcp.json.", harnessLabel);
	},

	getBanner(_customizations, harnessLabel) {
		return {
			message: localize('mcpMigrationBannerMessage', "Eligible servers move from .vscode/mcp.json to .mcp.json at each workspace root so {0} can discover them directly. Unsupported and unselected servers stay in their current files.", harnessLabel),
			consequence: localize('mcpMigrationBannerConsequence', "Migrated entries are removed from .vscode/mcp.json only after the root .mcp.json entries are written successfully."),
		};
	},

	getConfirmation(customizations) {
		return {
			message: customizations.length === 1
				? localize('mcpMigrationConfirmMessageSingle', "Migrate 1 MCP server to .mcp.json?")
				: localize('mcpMigrationConfirmMessageMultiple', "Migrate {0} MCP servers to .mcp.json?", customizations.length),
			detail: localize('mcpMigrationConfirmDetail', "Selected entries are removed from .vscode/mcp.json after they are written and verified in .mcp.json. Unsupported and unselected entries stay in place."),
			primaryButton: localize('mcpMigrationConfirmButton', "Migrate"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('mcpMigrationCompletedSingle', "Migrated 1 MCP server.")
			: localize('mcpMigrationCompletedMultiple', "Migrated {0} MCP servers.", migratedCount);
	},

	getFailedMessage(failedServerNames, hiddenServerCount) {
		const failedCount = failedServerNames.length + hiddenServerCount;
		if (failedCount === 1) {
			return localize('mcpMigrationFailedSingle', "Failed to migrate MCP server: {0}.", failedServerNames[0]);
		}
		return hiddenServerCount > 0
			? localize('mcpMigrationFailedWithRemainder', "Failed to migrate {0} MCP servers: {1}, and {2} more.", failedCount, failedServerNames.join(', '), hiddenServerCount)
			: localize('mcpMigrationFailedMultiple', "Failed to migrate {0} MCP servers: {1}.", failedCount, failedServerNames.join(', '));
	},

	getMcpServerFailureMessage(failures) {
		if (failures.some(failure => failure.reason === McpServerCustomizationMigrationFailureReason.RollbackFailed)) {
			return failures.length === 1
				? localize('mcpMigrationRollbackFailed', "Could not safely complete or roll back the migration for '{0}'. Review both MCP configuration files.", failures[0].name)
				: localize('mcpMigrationRollbackFailedMultiple', "Some MCP server migrations could not be safely completed or rolled back. Review the affected source and destination MCP configuration files.");
		}
		const crossRootConflicts = failures.filter(failure => failure.reason === McpServerCustomizationMigrationFailureReason.CrossRootConflict);
		if (crossRootConflicts.length > 0) {
			return failures.length === 1
				? localize('mcpMigrationCrossRootConflict', "Could not migrate '{0}' because another workspace root defines an MCP server with the same name. Rename or remove the duplicate before migrating.", crossRootConflicts[0].name)
				: localize('mcpMigrationCrossRootConflicts', "Some MCP servers could not be migrated because their names conflict across workspace roots. Rename or remove the duplicates before migrating.");
		}
		if (failures.length !== 1) {
			const displayedFailures = failures.slice(0, 3);
			return this.getFailedMessage(displayedFailures.map(failure => failure.name), failures.length - displayedFailures.length);
		}
		const [failure] = failures;
		switch (failure.reason) {
			case McpServerCustomizationMigrationFailureReason.NoLongerEligible:
				return localize('mcpMigrationNoLongerEligible', "Could not migrate '{0}' because it is no longer eligible.", failure.name);
			case McpServerCustomizationMigrationFailureReason.SourceChanged:
				return localize('mcpMigrationSourceChanged', "Could not migrate '{0}' because its source configuration changed.", failure.name);
			case McpServerCustomizationMigrationFailureReason.TargetConflict:
				return localize('mcpMigrationTargetConflict', "Could not migrate '{0}' because .mcp.json already contains a different server with that name.", failure.name);
			case McpServerCustomizationMigrationFailureReason.InvalidTarget:
				return localize('mcpMigrationInvalidTarget', "Could not migrate '{0}' because the destination .mcp.json is invalid.", failure.name);
			default:
				return this.getFailedMessage([failure.name], 0);
		}
	},
};

function formatSettingLinks(settingsLinks: readonly string[]): string {
	switch (settingsLinks.length) {
		case 1:
			return settingsLinks[0];
		case 2:
			return localize('twoConfiguredLocationSettings', "{0} and {1}", settingsLinks[0], settingsLinks[1]);
		case 3:
			return localize('threeConfiguredLocationSettings', "{0}, {1}, and {2}", settingsLinks[0], settingsLinks[1], settingsLinks[2]);
		case 4:
			return localize('fourConfiguredLocationSettings', "{0}, {1}, {2}, and {3}", settingsLinks[0], settingsLinks[1], settingsLinks[2], settingsLinks[3]);
		default:
			throw new Error('Expected at least one configured location setting');
	}
}

export const CUSTOMIZATION_MIGRATION_CATEGORIES: readonly ICustomizationMigrationCategory[] = [
	promptFilesMigrationCategory,
	userDataMigrationCategory,
	configuredLocationsMigrationCategory,
	mcpServersMigrationCategory,
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
	return Array.from(new Set(categories.flatMap(category => category.sourceTypes ?? [])));
}

function getFileCandidatePresentation(
	customization: CustomizationMigrationCandidate,
	getUriLabel: (uri: URI) => string,
): ICustomizationMigrationCandidatePresentation {
	if (isMcpServerCustomizationMigrationCandidate(customization)) {
		throw new Error('Expected a file migration candidate');
	}
	const name = customization.name ?? basename(customization.uri);
	const pathLabel = getUriLabel(customization.uri);
	return {
		name,
		selectionAriaLabel: localize('customizationMigrationSelectAriaLabel', "Select {0}", name),
		pathLabel,
		file: customization,
	};
}

function countPromptStorages(customizations: readonly CustomizationMigrationCandidate[]): { workspaceCount: number; userCount: number; totalCount: number } {
	const fileCustomizations = customizations.filter(customization => !isMcpServerCustomizationMigrationCandidate(customization));
	const workspaceCount = fileCustomizations.filter(customization => customization.storage === PromptsStorage.local).length;
	const userCount = fileCustomizations.filter(customization => customization.storage === PromptsStorage.user).length;
	return { workspaceCount, userCount, totalCount: workspaceCount + userCount };
}

function countUserDataTypes(customizations: readonly CustomizationMigrationCandidate[]): { agentCount: number; instructionsCount: number; totalCount: number } {
	const agentCount = customizations.filter(customization => customization.type === PromptsType.agent).length;
	const instructionsCount = customizations.filter(customization => customization.type === PromptsType.instructions).length;
	return { agentCount, instructionsCount, totalCount: agentCount + instructionsCount };
}
