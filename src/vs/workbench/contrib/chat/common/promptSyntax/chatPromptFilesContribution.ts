/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { IPromptsService } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';

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

class ChatPromptFilesDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.chatPromptFiles;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributions = manifest.contributes?.chatPromptFiles ?? [];
		if (!contributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('chatPromptFilesPath', "Path"),
			localize('chatPromptFilesName', "Name"),
			localize('chatPromptFilesDescription', "Description"),
		];

		const rows: IRowData[][] = contributions.map(d => {
			return [
				d.path,
				d.name ?? '-',
				d.description ?? '-'
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

class ChatInstructionsDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.chatInstructions;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributions = manifest.contributes?.chatInstructions ?? [];
		if (!contributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('chatInstructionsPath', "Path"),
			localize('chatInstructionsName', "Name"),
			localize('chatInstructionsDescription', "Description"),
		];

		const rows: IRowData[][] = contributions.map(d => {
			return [
				d.path,
				d.name ?? '-',
				d.description ?? '-'
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

class ChatAgentsDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.chatAgents;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributions = manifest.contributes?.chatAgents ?? [];
		if (!contributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('chatAgentsPath', "Path"),
			localize('chatAgentsName', "Name"),
			localize('chatAgentsDescription', "Description"),
		];

		const rows: IRowData[][] = contributions.map(d => {
			return [
				d.path,
				d.name ?? '-',
				d.description ?? '-'
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
	id: 'chatPromptFiles',
	label: localize('chatPromptFiles', "Chat Prompt Files"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPromptFilesDataRenderer),
});

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'chatInstructions',
	label: localize('chatInstructions', "Chat Instructions"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatInstructionsDataRenderer),
});

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'chatAgents',
	label: localize('chatAgents', "Chat Agents"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatAgentsDataRenderer),
});
