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

type ChatContributionPoint = 'chatPromptFiles' | 'chatInstructions' | 'chatModes';

function registerChatFilesExtensionPoint(point: ChatContributionPoint) {
	return extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatFileContribution[]>({
		extensionPoint: point,
		jsonSchema: {
			description: localize('chat.files.' + point, 'Contributes {0} for chat prompts.', point),
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
						description: localize('chat.files.name', 'Identifier for this file. Must be unique within this extension for this contribution point.'),
						type: 'string',
						pattern: '^[\\w.-]+$'
					},
					path: {
						description: localize('chat.files.path', 'Path to the file relative to the extension root.'),
						type: 'string'
					},
					description: {
						description: localize('chat.files.description', '(Optional) Description of the file.'),
						type: 'string'
					}
				}
			}
		}
	});
}

const epPrompt = registerChatFilesExtensionPoint('chatPromptFiles');
const epInstructions = registerChatFilesExtensionPoint('chatInstructions');
const epModes = registerChatFilesExtensionPoint('chatModes');

function pointToType(point: ChatContributionPoint): PromptsType {
	switch (point) {
		case 'chatPromptFiles': return PromptsType.prompt;
		case 'chatInstructions': return PromptsType.instructions;
		case 'chatModes': return PromptsType.mode;
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
		this.handle(epModes, 'chatModes');
	}

	private handle(extensionPoint: extensionsRegistry.IExtensionPoint<IRawChatFileContribution[]>, point: ChatContributionPoint) {
		extensionPoint.setHandler((_extensions, delta) => {
			for (const ext of delta.added) {
				const type = pointToType(point);
				for (const raw of ext.value) {
					if (!raw.name || !raw.name.match(/^[\w.-]+$/)) {
						ext.collector.error(`Extension '${ext.description.identifier.value}' cannot register ${point} entry with invalid name '${raw.name}'.`);
						continue;
					}
					if (!raw.path) {
						ext.collector.error(`Extension '${ext.description.identifier.value}' cannot register ${point} entry '${raw.name}' without path.`);
						continue;
					}
					if (!raw.description) {
						ext.collector.error(`Extension '${ext.description.identifier.value}' cannot register ${point} entry '${raw.name}' without description.`);
						continue;
					}
					const fileUri = joinPath(ext.description.extensionLocation, raw.path);
					if (!isEqualOrParent(fileUri, ext.description.extensionLocation)) {
						ext.collector.error(`Extension '${ext.description.identifier.value}' ${point} entry '${raw.name}' path resolves outside the extension.`);
						continue;
					}
					try {
						const d = this.promptsService.registerContributedFile(type, raw.name, raw.description, fileUri, ext.description.identifier.value);
						this.registrations.set(key(ext.description.identifier, type, raw.name), d);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						ext.collector.error(`Failed to register ${point} entry '${raw.name}': ${msg}`);
					}
				}
			}
			for (const ext of delta.removed) {
				const type = pointToType(point);
				for (const raw of ext.value) {
					this.registrations.deleteAndDispose(key(ext.description.identifier, type, raw.name));
				}
			}
		});
	}
}
