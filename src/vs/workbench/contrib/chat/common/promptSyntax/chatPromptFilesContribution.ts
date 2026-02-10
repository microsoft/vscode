/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPromptsService, PromptsStorage } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';
import { UriComponents } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';

interface IRawChatFileContribution {
	readonly path: string;
	readonly name?: string;
	readonly description?: string;
}

enum ChatContributionPoint {
	chatInstructions = 'chatInstructions',
	chatAgents = 'chatAgents',
	chatPromptFiles = 'chatPromptFiles',
	chatSkills = 'chatSkills',
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
		default: {
			const exhaustiveCheck: never = contributionPoint;
			throw new Error(`Unknown contribution point: ${exhaustiveCheck}`);
		}
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
	const [agents, instructions, prompts, skills, hooks] = await Promise.all([
		promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None),
		promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None),
	]);

	// Combine all files and collect extension-contributed ones
	const result: IExtensionPromptFileResult[] = [];
	for (const file of [...agents, ...instructions, ...prompts, ...skills, ...hooks]) {
		if (file.storage === PromptsStorage.extension) {
			result.push({ uri: file.uri.toJSON(), type: file.type });
		}
	}

	return result;
});

class ChatPromptFilesDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	constructor(private readonly contributionPoint: ChatContributionPoint) {
		super();
	}

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.[this.contributionPoint];
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributions = manifest.contributes?.[this.contributionPoint] ?? [];
		if (!contributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('chatFilesName', "Name"),
			localize('chatFilesDescription', "Description"),
			localize('chatFilesPath', "Path"),
		];

		const rows: IRowData[][] = contributions.map(d => {
			return [
				d.name ?? '-',
				d.description ?? '-',
				d.path,
			];
		});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: ChatContributionPoint.chatPromptFiles,
	label: localize('chatPromptFiles', "Chat Prompt Files"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatPromptFiles]),
});

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: ChatContributionPoint.chatInstructions,
	label: localize('chatInstructions', "Chat Instructions"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatInstructions]),
});

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: ChatContributionPoint.chatAgents,
	label: localize('chatAgents', "Chat Agents"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatAgents]),
});

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: ChatContributionPoint.chatSkills,
	label: localize('chatSkills', "Chat Skills"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatSkills]),
});
