/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

export const DEPLOY_FILE_TO_ORG_COMMAND_ID = 'salesforce.deployFileToOrg';

interface OrgConfig {
	username: string;
	alias: string;
	authorised: boolean;
}

interface AipexiumConfig {
	authorizedOrgs?: OrgConfig[];
	aliasname?: string;
	[key: string]: any;
}

// Helper function to read config file
async function readConfig(fileService: IFileService, workspaceService: IWorkspaceContextService): Promise<AipexiumConfig> {
	const workspaceRoot = workspaceService.getWorkspace().folders[0]?.uri;
	if (!workspaceRoot) {
		throw new Error('No workspace found');
	}

	const configPath = URI.file(workspaceRoot.fsPath + '/.aipexium/config.json');

	try {
		const configContent = await fileService.readFile(configPath);
		return JSON.parse(configContent.value.toString());
	} catch (error) {
		// If file doesn't exist, return empty config
		return {};
	}
}

// Helper function to get target org alias
async function getTargetOrgAlias(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService,
	quickInputService: IQuickInputService,
	notificationService: INotificationService
): Promise<string | null> {
	try {
		// Read config file
		const config = await readConfig(fileService, workspaceService);

		// Check if we have an alias name in config (legacy support)
		if (config.aliasname && config.aliasname.trim() !== '') {
			return config.aliasname.trim();
		}

		// Filter authorized orgs that have authorised: true
		if (config.authorizedOrgs && config.authorizedOrgs.length > 0) {
			const authorizedOrgs = config.authorizedOrgs.filter(org => org.authorised === true);

			if (authorizedOrgs.length === 0) {
				notificationService.error('No authorized orgs found in config. Please set authorised: true for at least one org.');
				return null;
			}

			// If only one authorized org, use it directly
			if (authorizedOrgs.length === 1) {
				const selectedOrg = authorizedOrgs[0];
				notificationService.info(`Auto-selected authorized org: ${selectedOrg.alias} (${selectedOrg.username})`);
				return selectedOrg.alias;
			}

			// If multiple authorized orgs, let user choose
			const selectedOrg = await quickInputService.pick(
				authorizedOrgs.map(org => ({
					label: `${org.alias} (${org.username})`,
					value: org.alias,
					description: org.username
				})),
				{
					placeHolder: 'Select an authorized org to deploy to'
				}
			);

			if (selectedOrg) {
				return selectedOrg.value;
			}
		}

		// If no authorized orgs found, prompt user to enter alias manually
		const manualAlias = await quickInputService.input({
			placeHolder: 'Enter org alias (e.g., MyDevOrg)',
			prompt: 'No authorized orgs found in config. Please enter org alias manually.'
		});

		return manualAlias && manualAlias.trim() !== '' ? manualAlias.trim() : null;

	} catch (error) {
		console.error('Error reading config:', error);

		// Fallback to manual input
		const manualAlias = await quickInputService.input({
			placeHolder: 'Enter org alias (e.g., MyDevOrg)',
			prompt: 'Error reading config. Please enter org alias manually.'
		});

		return manualAlias && manualAlias.trim() !== '' ? manualAlias.trim() : null;
	}
}

export function registerDeployFileCommand() {
	CommandsRegistry.registerCommand({
		id: DEPLOY_FILE_TO_ORG_COMMAND_ID,
		handler: async (accessor, resource: URI | undefined) => {
			const commandService = accessor.get(ICommandService);
			const fileService = accessor.get(IFileService);
			const workspaceService = accessor.get(IWorkspaceContextService);
			const quickInputService = accessor.get(IQuickInputService);
			const notificationService = accessor.get(INotificationService);

			try {
				// Check if a file/resource is selected
				if (!resource || !resource.fsPath) {
					notificationService.error('No file selected for deployment.');
					console.error('No file selected.');
					return;
				}

				// Get target org alias from config
				const targetOrgAlias = await getTargetOrgAlias(
					fileService,
					workspaceService,
					quickInputService,
					notificationService
				);

				if (!targetOrgAlias) {
					notificationService.error('No target org specified. Deployment cancelled.');
					console.error('No target org specified.');
					return;
				}

				// Show notification about deployment
				notificationService.info(`Deploying to org: ${targetOrgAlias}`);

				// Open new terminal
				await commandService.executeCommand('workbench.action.terminal.new');

				// Execute deployment command with dynamic org alias
				const deployCommand = `sf project deploy start --source-dir "${resource.fsPath}" --target-org ${targetOrgAlias}\n`;

				await commandService.executeCommand('workbench.action.terminal.sendSequence', {
					text: deployCommand
				});

				console.log(`Deployment started for file: ${resource.fsPath} to org: ${targetOrgAlias}`);

			} catch (error) {
				console.error('Error during deployment:', error);
				notificationService.error(`Deployment failed: ${error.message || 'Unknown error'}`);
			}
		}
	});
}

// Optional: Command to deploy entire project (not just a file)
export const DEPLOY_PROJECT_TO_ORG_COMMAND_ID = 'salesforce.deployProjectToOrg';

export function registerDeployProjectCommand() {
	CommandsRegistry.registerCommand({
		id: DEPLOY_PROJECT_TO_ORG_COMMAND_ID,
		handler: async (accessor) => {
			const commandService = accessor.get(ICommandService);
			const fileService = accessor.get(IFileService);
			const workspaceService = accessor.get(IWorkspaceContextService);
			const quickInputService = accessor.get(IQuickInputService);
			const notificationService = accessor.get(INotificationService);

			try {
				// Get target org alias from config
				const targetOrgAlias = await getTargetOrgAlias(
					fileService,
					workspaceService,
					quickInputService,
					notificationService
				);

				if (!targetOrgAlias) {
					notificationService.error('No target org specified. Deployment cancelled.');
					console.error('No target org specified.');
					return;
				}

				// Show notification about deployment
				notificationService.info(`Deploying entire project to org: ${targetOrgAlias}`);

				// Open new terminal
				await commandService.executeCommand('workbench.action.terminal.new');

				// Execute project deployment command
				const deployCommand = `sf project deploy start --target-org ${targetOrgAlias}\n`;

				await commandService.executeCommand('workbench.action.terminal.sendSequence', {
					text: deployCommand
				});

				console.log(`Project deployment started to org: ${targetOrgAlias}`);

			} catch (error) {
				console.error('Error during project deployment:', error);
				notificationService.error(`Project deployment failed: ${error.message || 'Unknown error'}`);
			}
		}
	});
}
