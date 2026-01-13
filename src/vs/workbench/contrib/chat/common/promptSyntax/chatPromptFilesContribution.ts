/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { UriComponents } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPromptsService, PromptsStorage } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';

interface IRawChatFileContribution {
	readonly path: string;
	readonly name?: string;
	readonly description?: string;
}

type ChatContributionPoint = 'chatPromptFiles' | 'chatInstructions' | 'chatAgents';

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
						path: './relative/path/to/file.md',
					}
				}],
				required: ['path'],
				properties: {
					path: {
						description: localize('chatContribution.property.path', 'Path to the file relative to the extension root.'),
						type: 'string'
					},
					name: {
						description: localize('chatContribution.property.name', '(Optional) Name for this entry.'),
						deprecationMessage: localize('chatContribution.property.name.deprecated', 'Specify "name" in the prompt file itself instead.'),
						type: 'string'
					},
					description: {
						description: localize('chatContribution.property.description', '(Optional) Description of the entry.'),
						deprecationMessage: localize('chatContribution.property.description.deprecated', 'Specify "description" in the prompt file itself instead.'),
						type: 'string'
					}
				}
			}
		}
	});
}

const epPrompt = registerChatFilesExtensionPoint('chatPromptFiles');
const epInstructions = registerChatFilesExtensionPoint('chatInstructions');
const epAgents = registerChatFilesExtensionPoint('chatAgents');

function pointToType(contributionPoint: ChatContributionPoint): PromptsType {
	switch (contributionPoint) {
		case 'chatPromptFiles': return PromptsType.prompt;
		case 'chatInstructions': return PromptsType.instructions;
		case 'chatAgents': return PromptsType.agent;
	}
}

function key(extensionId: ExtensionIdentifier, type: PromptsType, path: string) {
	return `${extensionId.value}/${type}/${path}`;
}

export class ChatPromptFilesExtensionPointHandler implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.chatPromptFilesExtensionPointHandler';

	private readonly registrations = new DisposableMap<string>();

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		this.handle(epPrompt, 'chatPromptFiles');
		this.handle(epInstructions, 'chatInstructions');
		this.handle(epAgents, 'chatAgents');
	}

	private handle(extensionPoint: extensionsRegistry.IExtensionPoint<IRawChatFileContribution[]>, contributionPoint: ChatContributionPoint) {
		extensionPoint.setHandler((_extensions, delta) => {
			for (const ext of delta.added) {
				const type = pointToType(contributionPoint);
				for (const raw of ext.value) {
					if (!raw.path) {
						ext.collector.error(localize('extension.missing.path', "Extension '{0}' cannot register {1} entry without path.", ext.description.identifier.value, contributionPoint));
						continue;
					}
					const fileUri = joinPath(ext.description.extensionLocation, raw.path);
					if (!isEqualOrParent(fileUri, ext.description.extensionLocation)) {
						ext.collector.error(localize('extension.invalid.path', "Extension '{0}' {1} entry '{2}' resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.path));
						continue;
					}
					try {
						const d = this.promptsService.registerContributedFile(type, fileUri, ext.description, raw.name, raw.description);
						this.registrations.set(key(ext.description.identifier, type, raw.path), d);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						ext.collector.error(localize('extension.registration.failed', "Extension '{0}' {1}. Failed to register {2}: {3}", ext.description.identifier.value, contributionPoint, raw.path, msg));
					}
				}
			}
			for (const ext of delta.removed) {
				const type = pointToType(contributionPoint);
				for (const raw of ext.value) {
					this.registrations.deleteAndDispose(key(ext.description.identifier, type, raw.path));
				}
			}
		});
	}
}

/**
 * Result type for the extension prompt file provider command.
 */
export interface IExtensionPromptFileResult {
	readonly uri: UriComponents;
	readonly type: PromptsType;
}

/**
 * Register the command to list all extension-contributed prompt files.
 */
CommandsRegistry.registerCommand('_listExtensionPromptFiles', async (accessor): Promise<IExtensionPromptFileResult[]> => {
	const promptsService = accessor.get(IPromptsService);

	// Get extension prompt files for all prompt types in parallel
	const [agents, instructions, prompts] = await Promise.all([
		promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None),
	]);

	// Combine all files and collect extension-contributed ones
	const result: IExtensionPromptFileResult[] = [];
	for (const file of [...agents, ...instructions, ...prompts]) {
		if (file.storage === PromptsStorage.extension) {
			result.push({ uri: file.uri.toJSON(), type: file.type });
		}
	}

	return result;
});
