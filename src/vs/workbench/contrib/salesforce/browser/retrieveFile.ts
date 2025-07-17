/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export const RETRIEVE_SOURCE_FROM_ORG_COMMAND_ID = 'salesforce.retrieveSourceFromOrg';

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

async function readConfig(fileService: IFileService, workspaceService: IWorkspaceContextService): Promise<AipexiumConfig> {
	const workspaceRoot = workspaceService.getWorkspace().folders[0]?.uri;
	if (!workspaceRoot) throw new Error('No workspace found');

	const configPath = URI.file(workspaceRoot.fsPath + '/.aipexium/config.json');
	try {
		const configContent = await fileService.readFile(configPath);
		const buffer = configContent.value as VSBuffer;
		return JSON.parse(buffer.toString());
	} catch {
		return {};
	}
}

async function getTargetOrgAlias(
	fileService: IFileService,
	workspaceService: IWorkspaceContextService,
	quickInputService: IQuickInputService,
	notificationService: INotificationService
): Promise<string | null> {
	try {
		const config = await readConfig(fileService, workspaceService);
		if (config.aliasname?.trim()) return config.aliasname.trim();

		if (config.authorizedOrgs?.length) {
			const authorized = config.authorizedOrgs.filter(org => org.authorised);
			if (authorized.length === 1) return authorized[0].alias;

			if (authorized.length > 1) {
				const selected = await quickInputService.pick(
					authorized.map(org => ({ label: `${org.alias} (${org.username})`, value: org.alias })),
					{ placeHolder: 'Select an authorized org' }
				);
				return selected?.value ?? null;
			}
		}

		const manual = await quickInputService.input({
			placeHolder: 'Enter org alias (e.g., MyDevOrg)',
			prompt: 'No authorized orgs found.'
		});
		return manual?.trim() || null;
	} catch {
		const fallback = await quickInputService.input({
			placeHolder: 'Enter org alias (e.g., MyDevOrg)',
			prompt: 'Error reading config. Please enter manually.'
		});
		return fallback?.trim() || null;
	}
}

function getMetadataTypeFromPath(filePath: string): string {
	const fileName = basename(filePath);
	const dirName = basename(dirname(filePath));

	if (filePath.includes('/lwc/') || filePath.includes('\\lwc\\')) return 'LightningComponentBundle';
	if (fileName.endsWith('.cls')) return 'ApexClass';
	if (fileName.endsWith('.trigger')) return 'ApexTrigger';
	if (fileName.endsWith('.flow-meta.xml')) return 'Flow';
	if (fileName.endsWith('.object-meta.xml')) return 'CustomObject';
	if (fileName.endsWith('.permissionset-meta.xml')) return 'PermissionSet';
	if (fileName.endsWith('.profile-meta.xml')) return 'Profile';
	if (fileName.endsWith('.layout-meta.xml')) return 'Layout';
	if (fileName.endsWith('.email-meta.xml')) return 'EmailTemplate';
	if (fileName.endsWith('.report-meta.xml')) return 'Report';
	if (fileName.endsWith('.dashboard-meta.xml')) return 'Dashboard';
	if (fileName.endsWith('.tab-meta.xml')) return 'CustomTab';
	if (fileName.endsWith('.resource-meta.xml')) return 'StaticResource';
	if (fileName.endsWith('.page-meta.xml')) return 'ApexPage';
	if (fileName.endsWith('.component-meta.xml')) return 'ApexComponent';

	return 'ApexClass';
}

function getComponentNameFromPath(filePath: string): string {
	if (filePath.includes('/lwc/') || filePath.includes('\\lwc\\')) {
		const segments = filePath.split(/[\\/]/);
		const lwcIndex = segments.findIndex(seg => seg === 'lwc');
		return segments[lwcIndex + 1] || basename(dirname(filePath));
	}

	const fileName = basename(filePath);
	return fileName
		.replace('.cls', '')
		.replace('.trigger', '')
		.replace('.flow-meta.xml', '')
		.replace('.object-meta.xml', '')
		.replace('.permissionset-meta.xml', '')
		.replace('.profile-meta.xml', '')
		.replace('.layout-meta.xml', '')
		.replace('.email-meta.xml', '')
		.replace('.report-meta.xml', '')
		.replace('.dashboard-meta.xml', '')
		.replace('.tab-meta.xml', '')
		.replace('.resource-meta.xml', '')
		.replace('.page-meta.xml', '')
		.replace('.component-meta.xml', '')
		.replace('-meta.xml', '');
}

async function getFilesFromDirectory(fileService: IFileService, directoryPath: URI): Promise<string[]> {
	try {
		const stat = await fileService.stat(directoryPath);
		if (!stat.isDirectory) return [];

		const children = await fileService.resolve(directoryPath);
		const files: string[] = [];

		for (const child of children.children ?? []) {
			if (child.isDirectory) {
				const name = basename(child.resource.fsPath);
				if (name === '__tests__' || name === '.ds_store') continue;
				const nested = await getFilesFromDirectory(fileService, child.resource);
				files.push(...nested);
			} else {
				files.push(child.resource.fsPath);
			}
		}

		return files;
	} catch (error) {
		console.error('Error reading directory:', error);
		return [];
	}
}

function generatePackageXML(metadataMap: Record<string, Set<string>>): string {
	const typesXml = Object.entries(metadataMap).map(([type, members]) => {
		const membersXml = Array.from(members).map(m => `    <members>${m}</members>`).join('\n');
		return `  <types>\n${membersXml}\n    <name>${type}</name>\n  </types>`;
	}).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml}
  <version>60.0</version>
</Package>`;
}

async function isFolder(fileService: IFileService, resource: URI): Promise<boolean> {
	try {
		const stat = await fileService.stat(resource);
		return stat.isDirectory;
	} catch {
		return false;
	}
}

CommandsRegistry.registerCommand({
	id: RETRIEVE_SOURCE_FROM_ORG_COMMAND_ID,
	handler: async (accessor, resource?: URI) => {
		const commandService = accessor.get<ICommandService>(ICommandService);
		const fileService = accessor.get(IFileService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		try {
			if (!resource) {
				notificationService.error('No resource selected');
				return;
			}

			const targetOrgAlias = await getTargetOrgAlias(fileService, workspaceService, quickInputService, notificationService);
			if (!targetOrgAlias) return;

			const filePath = resource.fsPath;
			const isDir = await isFolder(fileService, resource);

			if (isDir) {
				const files = await getFilesFromDirectory(fileService, resource);
				if (!files.length) {
					notificationService.error('No retrievable files found in folder.');
					return;
				}

				const metadataMap: Record<string, Set<string>> = {};

				for (const file of files) {
					const type = getMetadataTypeFromPath(file);
					const name = getComponentNameFromPath(file);
					if (!name || name === 'lwc' || name === '__tests__') continue;

					if (!metadataMap[type]) metadataMap[type] = new Set();
					metadataMap[type].add(name);
				}

				const xml = generatePackageXML(metadataMap);
				const workspaceRoot = workspaceService.getWorkspace().folders[0].uri.fsPath;
				const manifestPath = URI.file(`${workspaceRoot}/manifest/package.xml`);
				await fileService.writeFile(manifestPath, VSBuffer.fromString(xml));

				notificationService.info(`Retrieving from manifest using org: ${targetOrgAlias}`);
				await commandService.executeCommand('workbench.action.terminal.new');
				await commandService.executeCommand('workbench.action.terminal.sendSequence', {
					text: `sf project retrieve start --manifest manifest/package.xml --target-org ${targetOrgAlias} --ignore-conflicts\n`
				});
			} else {
				const type = getMetadataTypeFromPath(filePath);
				const name = getComponentNameFromPath(filePath);
				if (!name) return;

				notificationService.info(`Retrieving ${type}:${name}`);
				await commandService.executeCommand('workbench.action.terminal.new');
				await commandService.executeCommand('workbench.action.terminal.sendSequence', {
					text: `sf project retrieve start --metadata "${type}:${name}" --target-org ${targetOrgAlias} --ignore-conflicts\n`
				});
			}
		} catch (error) {
			console.error(error);
			notificationService.error(`Retrieval failed: ${error.message || 'Unknown error'}`);
		}
	}
});
