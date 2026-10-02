/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename } from '../../../../../base/common/resources.js';
import type { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationCandidate, CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationExclusion, IMcpServerCustomizationMigrationFailure, isConfiguredLocationMigrationCandidate, isMcpServerCustomizationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigrationFailureReason, mcpServerCustomizationMigrationRemovableProperties, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

export const enum CustomizationMigrationCategoryId {
	PromptFiles = 'promptFiles',
	UserData = 'userData',
	ConfiguredLocations = 'configuredLocations',
	McpServers = 'mcpServers',
}

export const homepageMigrationCategories = [
	CustomizationMigrationCategoryId.PromptFiles,
	CustomizationMigrationCategoryId.UserData,
	CustomizationMigrationCategoryId.ConfiguredLocations,
	CustomizationMigrationCategoryId.McpServers,
] as const;


export interface ICustomizationMigrationConfirmation {
	readonly message: string;
	readonly detail: string;
	readonly primaryButton: string;
	readonly deleteOriginalsLabel?: string;
}

/**
 * A self-contained migration flow with category-specific discovery, confirmation,
 * execution result, and failure copy.
 */
export interface ICustomizationMigrationCategory {
	readonly id: CustomizationMigrationCategoryId;
	readonly migrationType: CustomizationMigrationType;
	/** Prompt types scanned when collecting candidates for this category. */
	readonly sourceTypes?: readonly PromptsType[];
	/** Experimental setting gating this migration. */
	readonly enablementSetting: ChatConfiguration;
	/** Settings that must differ from their defaults for this migration to apply. */
	readonly configurationSettingIds?: readonly string[];
	readonly shortcutLabel: string;
	readonly shortcutTooltip: string;
	readonly cardLabel: string;
	readonly cardActionLabel: string;
	readonly cardActionAriaLabel: string;
	readonly noFilesMigratedMessage: string;
	isCandidate?(customization: MigratableConfiguration): boolean;
	getCandidateLabel(customization: CustomizationMigrationCandidate): string;
	getCandidateWarnings?(customization: CustomizationMigrationCandidate, harnessLabel: string): readonly string[];
	getShortcutAriaLabel(count: number): string;
	getCardDescription(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string): string;
	getModifiedSettingIds?(configurationService: IConfigurationService): readonly string[];
	getConfirmation(customizations: readonly CustomizationMigrationCandidate[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationConfirmation;
	getMigratedMessage(migratedCount: number): string;
	getMigratedWithReviewMessage?(migratedCount: number, unsupportedHeaderKeys: string): string;
	getFailedMessage(failedFileNames: readonly string[], hiddenFileCount: number): string;
	getMcpServerFailureMessage?(failures: readonly IMcpServerCustomizationMigrationFailure[]): string;
	getMcpServerExclusionReason?(exclusion: IMcpServerCustomizationMigrationExclusion): string;
}

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
	enablementSetting: ChatConfiguration.ChatCustomizationsMigrationEnabled,
	shortcutLabel: localize('promptMigrationShortcutLabel', "Migrate Prompts"),
	shortcutTooltip: localize('promptMigrationShortcutTooltip', "Convert deprecated prompt files to skills"),
	cardLabel: localize('promptMigrationCardLabel', "Migrate Prompt Files"),
	cardActionLabel: localize('promptMigrationCardAction', "Convert to Skills..."),
	cardActionAriaLabel: localize('promptMigrationCardActionAriaLabel', "Convert prompt files to skills"),
	noFilesMigratedMessage: localize('promptMigrationNoFilesConverted', "No prompt files were converted."),

	isCandidate: isPromptFileMigrationCandidate,
	getCandidateLabel: getFileCandidateLabel,


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
	enablementSetting: ChatConfiguration.ChatCustomizationsMigrationEnabled,
	shortcutLabel: localize('userDataMigrationShortcutLabel', "Migrate User Data"),
	shortcutTooltip: localize('userDataMigrationShortcutTooltip', "Move user data agents and instructions to the active harness"),
	cardLabel: localize('userDataMigrationCardLabel', "Migrate User Data Customizations"),
	cardActionLabel: localize('userDataMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('userDataMigrationCardActionAriaLabel', "Migrate user data customizations to the active harness"),
	noFilesMigratedMessage: localize('userDataMigrationNoFilesMigrated', "No user data customizations were migrated."),

	isCandidate: isUserDataMigrationCandidate,
	getCandidateLabel: getFileCandidateLabel,


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

const configuredLocationsMigrationCategory: ICustomizationMigrationCategory = {
	id: CustomizationMigrationCategoryId.ConfiguredLocations,
	migrationType: CustomizationMigrationType.ConfiguredLocations,
	sourceTypes: [PromptsType.agent, PromptsType.instructions, PromptsType.skill],
	enablementSetting: ChatConfiguration.ChatCustomizationsMigrationEnabled,
	configurationSettingIds: CONFIGURED_LOCATION_SETTING_IDS,
	shortcutLabel: localize('configuredLocationsMigrationShortcutLabel', "Migrate Location Settings"),
	shortcutTooltip: localize('configuredLocationsMigrationShortcutTooltip', "Move customizations from VS Code-configured locations to locations supported by the active harness"),
	cardLabel: localize('configuredLocationsMigrationCardLabel', "Migrate Location Settings"),
	cardActionLabel: localize('configuredLocationsMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('configuredLocationsMigrationCardActionAriaLabel', "Migrate customizations from VS Code-configured locations"),
	noFilesMigratedMessage: localize('configuredLocationsMigrationNoFilesMigrated', "No customizations from configured locations were migrated."),

	isCandidate: isConfiguredLocationMigrationCandidate,
	getCandidateLabel: getFileCandidateLabel,

	getModifiedSettingIds(configurationService) {
		return CONFIGURED_LOCATION_SETTING_IDS.filter(settingId => {
			const inspected = configurationService.inspect(settingId);
			return !equals(inspected.value, inspected.defaultValue);
		});
	},


	getShortcutAriaLabel(count) {
		return count === 1
			? localize('configuredLocationsMigrationShortcutAriaLabelSingle', "Locations, 1 customization needs migration")
			: localize('configuredLocationsMigrationShortcutAriaLabelWithCount', "Locations, {0} customizations need migration", count);
	},

	getCardDescription(customizations, harnessLabel) {
		return customizations.length === 1
			? localize('configuredLocationsMigrationCardDescriptionSingle', "Found 1 customization in a location observed only by the Local agent harness. {0} picks it up when running in VS Code. Move it to a supported location for use outside VS Code.", harnessLabel)
			: localize('configuredLocationsMigrationCardDescription', "Found {0} customizations in locations observed only by the Local agent harness. {1} picks them up when running in VS Code. Move them to supported locations for use outside VS Code.", customizations.length, harnessLabel);
	},

	getConfirmation(customizations, harnessLabel, destinationLabel) {
		return {
			message: destinationLabel
				? localize('configuredLocationsMigrationConfirmMessageWithDestination', "Migrate customizations to '{0}'?", destinationLabel)
				: localize('configuredLocationsMigrationConfirmMessage', "Migrate customizations to {0}?", harnessLabel),
			detail: customizations.length === 1
				? localize('configuredLocationsMigrationConfirmDetailSingle', "This moves 1 customization out of a VS Code-configured location. If all customizations that use the affected location setting migrate successfully, that setting is cleared.")
				: localize('configuredLocationsMigrationConfirmDetail', "This moves {0} customizations out of VS Code-configured locations. If all customizations that use the affected location settings migrate successfully, those settings are cleared.", customizations.length),
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
	enablementSetting: ChatConfiguration.ChatCustomizationsMigrationEnabled,
	shortcutLabel: localize('mcpMigrationShortcutLabel', "Migrate MCP Servers"),
	shortcutTooltip: localize('mcpMigrationShortcutTooltip', "Move eligible MCP servers to workspace root or Copilot home configuration files"),
	cardLabel: localize('mcpMigrationCardLabel', "Migrate MCP Servers"),
	cardActionLabel: localize('mcpMigrationCardAction', "Migrate..."),
	cardActionAriaLabel: localize('mcpMigrationCardActionAriaLabel', "Migrate eligible MCP servers"),
	noFilesMigratedMessage: localize('mcpMigrationNoneMigrated', "No MCP servers were migrated."),

	getCandidateLabel(customization) {
		if (!isMcpServerCustomizationMigrationCandidate(customization)) {
			throw new Error('Expected an MCP server migration candidate');
		}
		return customization.name;
	},

	getCandidateWarnings(customization, harnessLabel) {
		if (!isMcpServerCustomizationMigrationCandidate(customization)) {
			throw new Error('Expected an MCP server migration candidate');
		}
		return getMcpServerMigrationWarnings(customization, harnessLabel);
	},

	getShortcutAriaLabel(count) {
		return count === 1
			? localize('mcpMigrationShortcutAriaLabelSingle', "MCP servers, 1 server can be migrated")
			: localize('mcpMigrationShortcutAriaLabelWithCount', "MCP servers, {0} servers can be migrated", count);
	},

	getCardDescription(customizations, harnessLabel) {
		if (customizations.some(customization => customization.storage === PromptsStorage.user)) {
			return localize('mcpMigrationCardDescriptionUser', "Found {0} eligible MCP servers. User servers move to mcp-config.json in Copilot home; workspace servers move to the root .mcp.json so {1} can discover them directly.", customizations.length, harnessLabel);
		}
		return customizations.length === 1
			? localize('mcpMigrationCardDescriptionSingle', "Found 1 eligible server in .vscode/mcp.json that can move to the workspace root so {0} can discover it directly.", harnessLabel)
			: localize('mcpMigrationCardDescriptionMultiple', "Found {0} eligible servers in .vscode/mcp.json that can move to workspace root files so {1} can discover them directly.", customizations.length, harnessLabel);
	},



	getConfirmation(customizations) {
		if (customizations.some(customization => customization.storage === PromptsStorage.user)) {
			const hasWorkspaceServers = customizations.some(customization => customization.storage === PromptsStorage.local);
			return {
				message: customizations.length === 1
					? localize('mcpMigrationUserConfirmMessageSingle', "Migrate 1 MCP server?")
					: localize('mcpMigrationUserConfirmMessage', "Migrate {0} MCP servers?", customizations.length),
				detail: hasWorkspaceServers
					? localize('mcpMigrationMixedConfirmDetail', "Move user servers to Copilot home and workspace servers to .mcp.json. The original entries will be removed.\n\nDisabled user servers may become enabled.")
					: customizations.length === 1
						? localize('mcpMigrationUserConfirmDetailSingle', "Move to Copilot home for use across profiles and workspaces. The original entry will be removed.\n\nDisabled servers may become enabled.")
						: localize('mcpMigrationUserConfirmDetail', "Move to Copilot home for use across profiles and workspaces. The original entries will be removed.\n\nDisabled servers may become enabled."),
				primaryButton: localize('mcpMigrationConfirmButton', "Migrate"),
			};
		}
		return {
			message: customizations.length === 1
				? localize('mcpMigrationConfirmMessageSingle', "Migrate 1 MCP server to .mcp.json?")
				: localize('mcpMigrationConfirmMessageMultiple', "Migrate {0} MCP servers to .mcp.json?", customizations.length),
			detail: localize('mcpMigrationConfirmDetail', "Eligible entries are removed from .vscode/mcp.json after they are written and verified in .mcp.json. Entries that cannot be migrated stay in place."),
			primaryButton: localize('mcpMigrationConfirmButton', "Migrate"),
		};
	},

	getMigratedMessage(migratedCount) {
		return migratedCount === 1
			? localize('mcpMigrationCompletedSingle', "Migrated 1 MCP server.")
			: localize('mcpMigrationCompletedMultiple', "Migrated {0} MCP servers.", migratedCount);
	},

	getMcpServerExclusionReason(exclusion) {
		return exclusion.details.join(' ');
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
				return localize('mcpMigrationTargetConflict', "Could not migrate '{0}' because the destination already contains a different server with that name.", failure.name);
			case McpServerCustomizationMigrationFailureReason.InvalidTarget:
				return localize('mcpMigrationInvalidTarget', "Could not migrate '{0}' because the destination MCP configuration is invalid.", failure.name);
			default:
				return this.getFailedMessage([failure.name], 0);
		}
	},
};

function getMcpServerMigrationWarnings(server: IMcpServerCustomizationMigrationCandidate, harnessLabel: string): string[] {
	return mcpServerCustomizationMigrationRemovableProperties
		.filter(property => server.removedProperties && Object.hasOwn(server.removedProperties, property))
		.map(property => {
			switch (property) {
				case 'gallery':
					return server.removedProperties?.gallery === false
						? localize('mcpMigrationRemoveDisabledGallery', "Removes 'gallery'. Registry updates are already off.")
						: localize('mcpMigrationRemoveGallery', "Removes 'gallery'. Registry updates will stop.");
				case 'version':
					return localize('mcpMigrationRemoveVersion', "Removes 'version'. Version pins are kept.");
				case 'dev':
					return localize('mcpMigrationRemoveDev', "Removes 'dev'. Development mode will stop.");
				case 'sandboxEnabled':
					return localize('mcpMigrationRemoveSandbox', "Removes 'sandboxEnabled'. Sandboxing is handled by {0}.", harnessLabel);
			}
		});
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

function getFileCandidateLabel(customization: CustomizationMigrationCandidate): string {
	if (isMcpServerCustomizationMigrationCandidate(customization)) {
		throw new Error('Expected a file migration candidate');
	}
	return customization.name ?? basename(customization.uri);
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
