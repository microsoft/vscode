/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { IPromptsService } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';
import { DisposableMap } from '../../../../../base/common/lifecycle.js';

interface IRawChatFileContribution {
	readonly name: string;
	readonly path: string;
	readonly description?: string; // reserved for future use
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
						name: 'exampleName',
						path: './relative/path/to/file.md',
						description: 'Optional description'
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
						description: localize('chatContribution.property.path', 'Path to the file relative to the extension root.'),
						type: 'string'
					},
					description: {
						description: localize('chatContribution.property.description', '(Optional) Description of the file.'),
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

function key(extensionId: ExtensionIdentifier, type: PromptsType, name: string) {
	return `${extensionId.value}/${type}/${name}`;
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
					const fileUri = joinPath(ext.description.extensionLocation, raw.path);
					if (!isEqualOrParent(fileUri, ext.description.extensionLocation)) {
						ext.collector.error(localize('extension.invalid.path', "Extension '{0}' {1} entry '{2}' path resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.name));
						continue;
					}
					try {
						const d = this.promptsService.registerContributedFile(type, raw.name, raw.description, fileUri, ext.description);
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
}
