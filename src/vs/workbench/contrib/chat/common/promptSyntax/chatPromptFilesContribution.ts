/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ExtensionAgentSourceType, IPromptsService } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';
import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';

type PathType = 'extension' | 'storageUri';

interface IRawChatFileContribution {
	readonly name: string;
	readonly path: string;
	readonly description?: string; // reserved for future use
	readonly pathType?: PathType;
}

interface IRawChatFolderContribution {
	readonly path: string;
	readonly pathType?: PathType;
	readonly external?: boolean;
}

type ChatContributionPoint = 'chatPromptFiles' | 'chatInstructions' | 'chatAgents';
type ChatFolderContributionPoint = 'chatPromptFileFolders' | 'chatInstructionFolders' | 'chatAgentFolders';

function registerChatFilesExtensionPoint(point: ChatContributionPoint) {
	return extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatFileContribution[]>({
		extensionPoint: point,
		jsonSchema: {
			description: localize('chatContribution.schema.description', 'Contributes {0} for chat prompts.', point),
			type: 'array',
			items: {
				additionalProperties: false,
				type: 'object',
				defaultSnippets: [{
					body: {
						name: 'exampleName',
						path: './relative/path/to/file.md',
						description: 'Optional description',
						pathType: 'extension'
					}
				}],
				required: ['name', 'path'],
				properties: {
					name: {
						description: localize('chatContribution.property.name', 'Identifier for this file. Must be unique within this extension for this contribution point.'),
						type: 'string',
						pattern: '^[\\w.-]+$'
					},
					path: {
						description: localize('chatContribution.property.path', 'Path to the file relative to the extension root or storageUri.'),
						type: 'string'
					},
					description: {
						description: localize('chatContribution.property.description', '(Optional) Description of the file.'),
						type: 'string'
					},
					pathType: {
						description: localize('chatContribution.property.pathType', '(Optional) Type of path: "extension" (default, relative to extension root) or "storageUri" (relative to workspace storage).'),
						type: 'string',
						enum: ['extension', 'storageUri'],
						default: 'extension'
					}
				}
			}
		}
	});
}

function registerChatFoldersExtensionPoint(point: ChatFolderContributionPoint, fileTypeName: string, defaultPath: string, fileExtension: string) {
	return extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatFolderContribution[]>({
		extensionPoint: point,
		jsonSchema: {
			description: localize('chatFolders.schema.description', 'Contributes directories containing {0} files for chat.', fileTypeName),
			type: 'array',
			items: {
				additionalProperties: false,
				type: 'object',
				defaultSnippets: [{
					body: {
						path: defaultPath,
						pathType: 'extension'
					}
				}],
				required: ['path'],
				properties: {
					path: {
						description: localize('chatFolders.property.path', 'Path to the directory containing {0} files relative to the extension root or storageUri.', fileExtension),
						type: 'string'
					},
					pathType: {
						description: localize('chatFolders.property.pathType', '(Optional) Type of path: "extension" (default, relative to extension root) or "storageUri" (relative to workspace storage).'),
						type: 'string',
						enum: ['extension', 'storageUri'],
						default: 'extension'
					},
					external: {
						description: localize('chatFolders.property.external', '(Optional) If true, agents from this folder will not appear in the builtin section but will be shown in the Configure Custom Agents menu. Requires chatParticipantPrivate proposal.'),
						type: 'boolean',
						default: false
					}
				}
			}
		}
	});
}

const epPrompt = registerChatFilesExtensionPoint('chatPromptFiles');
const epInstructions = registerChatFilesExtensionPoint('chatInstructions');
const epAgents = registerChatFilesExtensionPoint('chatAgents');
const epPromptFileFolders = registerChatFoldersExtensionPoint('chatPromptFileFolders', 'prompt', './prompts', '.prompt.md');
const epInstructionFolders = registerChatFoldersExtensionPoint('chatInstructionFolders', 'instruction', './instructions', '.instructions.md');
const epAgentFolders = registerChatFoldersExtensionPoint('chatAgentFolders', 'agent', './agents', '.agent.md');

function pointToType(contributionPoint: ChatContributionPoint): PromptsType {
	switch (contributionPoint) {
		case 'chatPromptFiles': return PromptsType.prompt;
		case 'chatInstructions': return PromptsType.instructions;
		case 'chatAgents': return PromptsType.agent;
	}
}

function folderPointToType(contributionPoint: ChatFolderContributionPoint): PromptsType {
	switch (contributionPoint) {
		case 'chatPromptFileFolders': return PromptsType.prompt;
		case 'chatInstructionFolders': return PromptsType.instructions;
		case 'chatAgentFolders': return PromptsType.agent;
	}
}

function getFileExtension(type: PromptsType): string {
	switch (type) {
		case PromptsType.prompt: return '.prompt.md';
		case PromptsType.instructions: return '.instructions.md';
		case PromptsType.agent: return '.agent.md';
	}
}

function key(extensionId: ExtensionIdentifier, type: PromptsType, name: string) {
	return `${extensionId.value}/${type}/${name}`;
}

export class ChatPromptFilesExtensionPointHandler implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.chatPromptFilesExtensionPointHandler';

	private readonly registrations = new DisposableMap<string>();

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		this.handle(epPrompt, 'chatPromptFiles');
		this.handle(epInstructions, 'chatInstructions');
		this.handle(epAgents, 'chatAgents');
		this.handleFolders(epPromptFileFolders, 'chatPromptFileFolders');
		this.handleFolders(epInstructionFolders, 'chatInstructionFolders');
		this.handleFolders(epAgentFolders, 'chatAgentFolders');
	}

	private resolvePathUri(path: string, pathType: PathType | undefined, extension: IExtensionDescription): URI {
		const effectivePathType = pathType || 'extension';

		if (effectivePathType === 'storageUri') {
			// Construct path: workspaceStorageHome/<workspace-id>/<extension-id>/<path>
			const workspaceId = this.workspaceContextService.getWorkspace().id;
			const extensionStorageUri = joinPath(
				this.environmentService.workspaceStorageHome,
				workspaceId,
				extension.identifier.value
			);
			return joinPath(extensionStorageUri, path);
		} else {
			return joinPath(extension.extensionLocation, path);
		}
	}

	private handle(extensionPoint: extensionsRegistry.IExtensionPoint<IRawChatFileContribution[]>, contributionPoint: ChatContributionPoint) {
		extensionPoint.setHandler((_extensions, delta) => {
			for (const ext of delta.added) {
				const type = pointToType(contributionPoint);
				for (const raw of ext.value) {
					if (!raw.name || !raw.name.match(/^[\w.-]+$/)) {
						ext.collector.error(localize('extension.invalid.name', "Extension '{0}' cannot register {1} entry with invalid name '{2}'.", ext.description.identifier.value, contributionPoint, raw.name));
						continue;
					}
					if (!raw.path) {
						ext.collector.error(localize('extension.missing.path', "Extension '{0}' cannot register {1} entry '{2}' without path.", ext.description.identifier.value, contributionPoint, raw.name));
						continue;
					}
					if (!raw.description) {
						ext.collector.error(localize('extension.missing.description', "Extension '{0}' cannot register {1} entry '{2}' without description.", ext.description.identifier.value, contributionPoint, raw.name));
						continue;
					}

					// Handle pathType resolution
					const pathType = raw.pathType || 'extension';
					const fileUri = this.resolvePathUri(raw.path, raw.pathType, ext.description);
					const baseUri = pathType === 'storageUri' ? undefined : ext.description.extensionLocation;

					// Only validate extension-relative paths
					if (baseUri && !isEqualOrParent(fileUri, baseUri)) {
						ext.collector.error(localize('extension.invalid.path', "Extension '{0}' {1} entry '{2}' path resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.name));
						continue;
					}
					try {
						const description = raw.description || '';
						const d = this.promptsService.registerContributedFile(type, raw.name, description, fileUri, ext.description);
						this.registrations.set(key(ext.description.identifier, type, raw.name), d);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						ext.collector.error(localize('extension.registration.failed', "Failed to register {0} entry '{1}': {2}", contributionPoint, raw.name, msg));
					}
				}
			}
			for (const ext of delta.removed) {
				const type = pointToType(contributionPoint);
				for (const raw of ext.value) {
					this.registrations.deleteAndDispose(key(ext.description.identifier, type, raw.name));
				}
			}
		});
	}

	private handleFolders(extensionPoint: extensionsRegistry.IExtensionPoint<IRawChatFolderContribution[]>, contributionPoint: ChatFolderContributionPoint) {
		extensionPoint.setHandler((_extensions, delta) => {
			for (const ext of delta.added) {
				const type = folderPointToType(contributionPoint);
				const fileExtension = getFileExtension(type);
				for (const raw of ext.value) {
					if (!raw.path) {
						ext.collector.error(localize('extension.missing.folder.path', "Extension '{0}' cannot register {1} entry without path.", ext.description.identifier.value, contributionPoint));
						continue;
					}

					// Handle pathType resolution and scan directory
					const pathType = raw.pathType || 'extension';
					const dirUri = this.resolvePathUri(raw.path, raw.pathType, ext.description);
					const baseUri = pathType === 'storageUri' ? undefined : ext.description.extensionLocation;

					// Only validate extension-relative paths
					if (baseUri && !isEqualOrParent(dirUri, baseUri)) {
						ext.collector.error(localize('extension.invalid.folder.path', "Extension '{0}' {1} entry path '{2}' resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.path));
						continue;
					}

					// Scan directory asynchronously
					(async () => {
						try {
							// Check if directory exists
							const stat = await this.fileService.resolve(dirUri);
							if (!stat.isDirectory) {
								ext.collector.error(localize('extension.not.folder', "Extension '{0}' {1} entry path '{2}' is not a directory.", ext.description.identifier.value, contributionPoint, raw.path));
								return;
							}

							// Scan directory for files with matching extension
							if (stat.children) {
								for (const child of stat.children) {
									if (child.isFile && child.name.endsWith(fileExtension)) {
										const fileName = child.name;
										const name = fileName.slice(0, -fileExtension.length);

										try {
											const description = `Contributed from folder: ${raw.path}`;
											const uniqueName = `${ext.description.identifier.value}/${raw.path}/${name}`;
											const sourceType = raw.external === true ? ExtensionAgentSourceType.externalContribution : ExtensionAgentSourceType.contribution;
											const d = this.promptsService.registerContributedFile(type, uniqueName, description, child.resource, ext.description, sourceType);
											this.registrations.set(key(ext.description.identifier, type, uniqueName), d);
										} catch (e) {
											const msg = e instanceof Error ? e.message : String(e);
											ext.collector.error(localize('extension.folder.file.registration.failed', "Failed to register file '{0}' from {1} folder '{2}': {3}", fileName, contributionPoint, raw.path, msg));
										}
									}
								}
							}
						} catch (e) {
							const msg = e instanceof Error ? e.message : String(e);
							ext.collector.error(localize('extension.folder.scan.failed', "Failed to scan {0} folder '{1}': {2}", contributionPoint, raw.path, msg));
						}
					})();
				}
			}
			for (const ext of delta.removed) {
				for (const raw of ext.value) {
					// Remove all files registered from this folder
					for (const [regKey,] of this.registrations) {
						if (regKey.startsWith(`${ext.description.identifier.value}/`) && regKey.includes(`/${raw.path}/`)) {
							this.registrations.deleteAndDispose(regKey);
						}
					}
				}
			}
		});
	}
}
