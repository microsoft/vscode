/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPromptsService } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';

interface IRawChatFileContribution {
	readonly path: string;
	readonly name?: string;
	readonly description?: string;
}

enum ChatContributionPoint {
	chatInstructions = 'chatInstructions',
	chatAgents = 'chatAgents',
	chatPromptFiles = 'chatPromptFiles',
	chatSkills = 'chatSkills'
}

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

const epPrompt = registerChatFilesExtensionPoint(ChatContributionPoint.chatPromptFiles);
const epInstructions = registerChatFilesExtensionPoint(ChatContributionPoint.chatInstructions);
const epAgents = registerChatFilesExtensionPoint(ChatContributionPoint.chatAgents);
const epSkills = registerChatFilesExtensionPoint(ChatContributionPoint.chatSkills);

function pointToType(contributionPoint: ChatContributionPoint): PromptsType {
	switch (contributionPoint) {
		case ChatContributionPoint.chatPromptFiles: return PromptsType.prompt;
		case ChatContributionPoint.chatInstructions: return PromptsType.instructions;
		case ChatContributionPoint.chatAgents: return PromptsType.agent;
		case ChatContributionPoint.chatSkills: return PromptsType.skill;
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
		this.handle(epPrompt, ChatContributionPoint.chatPromptFiles);
		this.handle(epInstructions, ChatContributionPoint.chatInstructions);
		this.handle(epAgents, ChatContributionPoint.chatAgents);
		this.handle(epSkills, ChatContributionPoint.chatSkills);
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
