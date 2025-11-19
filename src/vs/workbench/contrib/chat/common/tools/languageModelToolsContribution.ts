/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { transaction } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../languageModelToolsService.js';
import { toolsParametersSchemaSchemaId } from './languageModelToolsParametersSchema.js';

export interface IRawToolContribution {
	name: string;
	displayName: string;
	modelDescription: string;
	toolReferenceName?: string;
	legacyToolReferenceFullNames?: string[];
	icon?: string | { light: string; dark: string };
	when?: string;
	tags?: string[];
	userDescription?: string;
	inputSchema?: IJSONSchema;
	canBeReferencedInPrompt?: boolean;
}

const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolContribution[]>({
	extensionPoint: 'languageModelTools',
	activationEventsGenerator: function* (contributions: readonly IRawToolContribution[]) {
		for (const contrib of contributions) {
			yield `onLanguageModelTool:${contrib.name}`;
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.tools', 'Contributes a tool that can be invoked by a language model in a chat session, or from a standalone command. Registered tools can be used by all extensions.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{
				body: {
					name: '${1}',
					modelDescription: '${2}',
					inputSchema: {
						type: 'object',
						properties: {
							'${3:name}': {
								type: 'string',
								description: '${4:description}'
							}
						}
					},
				}
			}],
			required: ['name', 'displayName', 'modelDescription'],
			properties: {
				name: {
					description: localize('toolName', "A unique name for this tool. This name must be a globally unique identifier, and is also used as a name when presenting this tool to a language model."),
					type: 'string',
					// [\\w-]+ is OpenAI's requirement for tool names
					pattern: '^(?!copilot_|vscode_)[\\w-]+$'
				},
				toolReferenceName: {
					markdownDescription: localize('toolName2', "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", '`canBeReferencedInPrompt`'),
					type: 'string',
					pattern: '^[\\w-]+$'
				},
				legacyToolReferenceFullNames: {
					markdownDescription: localize('legacyToolReferenceFullNames', "An array of deprecated names for backwards compatibility that can also be used to reference this tool in a query. Each name must not contain whitespace. Full names are generally in the format `toolsetName/toolReferenceName` (e.g., `search/readFile`) or just `toolReferenceName` when there is no toolset (e.g., `readFile`)."),
					type: 'array',
					items: {
						type: 'string',
						pattern: '^[\\w-]+(/[\\w-]+)?$'
					}
				},
				displayName: {
					description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
					type: 'string'
				},
				userDescription: {
					description: localize('toolUserDescription', "A description of this tool that may be shown to the user."),
					type: 'string'
				},
				// eslint-disable-next-line local/code-no-localized-model-description
				modelDescription: {
					description: localize('toolModelDescription', "A description of this tool that may be used by a language model to select it."),
					type: 'string'
				},
				inputSchema: {
					description: localize('parametersSchema', "A JSON schema for the input this tool accepts. The input must be an object at the top level. A particular language model may not support all JSON schema features. See the documentation for the language model family you are using for more information."),
					$ref: toolsParametersSchemaSchemaId
				},
				canBeReferencedInPrompt: {
					markdownDescription: localize('canBeReferencedInPrompt', "If true, this tool shows up as an attachment that the user can add manually to their request. Chat participants will receive the tool in {0}.", '`ChatRequest#toolReferences`'),
					type: 'boolean'
				},
				icon: {
					markdownDescription: localize('icon', 'An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like "\\$(zap)"'),
					anyOf: [{
						type: 'string'
					},
					{
						type: 'object',
						properties: {
							light: {
								description: localize('icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}]
				},
				when: {
					markdownDescription: localize('condition', "Condition which must be true for this tool to be enabled. Note that a tool may still be invoked by another extension even when its `when` condition is false."),
					type: 'string'
				},
				tags: {
					description: localize('toolTags', "A set of tags that roughly describe the tool's capabilities. A tool user may use these to filter the set of tools to just ones that are relevant for the task at hand, or they may want to pick a tag that can be used to identify just the tools contributed by this extension."),
					type: 'array',
					items: {
						type: 'string',
						pattern: '^(?!copilot_|vscode_)'
					}
				}
			}
		}
	}
});

export interface IRawToolSetContribution {
	name: string;
	/**
	 * @deprecated
	 */
	referenceName?: string;
	legacyFullNames?: string[];
	description: string;
	icon?: string;
	tools: string[];
}

const languageModelToolSetsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolSetContribution[]>({
	extensionPoint: 'languageModelToolSets',
	deps: [languageModelToolsExtensionPoint],
	jsonSchema: {
		description: localize('vscode.extension.contributes.toolSets', 'Contributes a set of language model tools that can be used together.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{
				body: {
					name: '${1}',
					description: '${2}',
					tools: ['${3}']
				}
			}],
			required: ['name', 'description', 'tools'],
			properties: {
				name: {
					description: localize('toolSetName', "A name for this tool set. Used as reference and should not contain whitespace."),
					type: 'string',
					pattern: '^[\\w-]+$'
				},
				legacyFullNames: {
					markdownDescription: localize('toolSetLegacyFullNames', "An array of deprecated names for backwards compatibility that can also be used to reference this tool set. Each name must not contain whitespace. Full names are generally in the format `parentToolSetName/toolSetName` (e.g., `github/repo`) or just `toolSetName` when there is no parent toolset (e.g., `repo`)."),
					type: 'array',
					items: {
						type: 'string',
						pattern: '^[\\w-]+$'
					}
				},
				description: {
					description: localize('toolSetDescription', "A description of this tool set."),
					type: 'string'
				},
				icon: {
					markdownDescription: localize('toolSetIcon', "An icon that represents this tool set, like `$(zap)`"),
					type: 'string'
				},
				tools: {
					markdownDescription: localize('toolSetTools', "A list of tools or tool sets to include in this tool set. Cannot be empty and must reference tools by their `toolReferenceName`."),
					type: 'array',
					minItems: 1,
					items: {
						type: 'string'
					}
				}
			}
		}
	}
});

function toToolKey(extensionIdentifier: ExtensionIdentifier, toolName: string) {
	return `${extensionIdentifier.value}/${toolName}`;
}

function toToolSetKey(extensionIdentifier: ExtensionIdentifier, toolName: string) {
	return `toolset:${extensionIdentifier.value}/${toolName}`;
}

export class LanguageModelToolsExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.toolsExtensionPointHandler';

	private _registrationDisposables = new DisposableMap<string>();

	constructor(
		@IProductService productService: IProductService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
	) {

		languageModelToolsExtensionPoint.setHandler((_extensions, delta) => {
			for (const extension of delta.added) {
				for (const rawTool of extension.value) {
					if (!rawTool.name || !rawTool.modelDescription || !rawTool.displayName) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name, modelDescription, and displayName: ${JSON.stringify(rawTool)}`);
						continue;
					}

					if (!rawTool.name.match(/^[\w-]+$/)) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.name}. The id must match /^[\\w-]+$/.`);
						continue;
					}

					if (rawTool.canBeReferencedInPrompt && !rawTool.toolReferenceName) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeReferencedInPrompt' set without a 'toolReferenceName': ${JSON.stringify(rawTool)}`);
						continue;
					}

					if ((rawTool.name.startsWith('copilot_') || rawTool.name.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with name starting with "vscode_" or "copilot_"`);
						continue;
					}

					if (rawTool.tags?.some(tag => tag.startsWith('copilot_') || tag.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with tags starting with "vscode_" or "copilot_"`);
					}

					if (rawTool.legacyToolReferenceFullNames && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled`);
						continue;
					}

					const rawIcon = rawTool.icon;
					let icon: IToolData['icon'] | undefined;
					if (typeof rawIcon === 'string') {
						icon = ThemeIcon.fromString(rawIcon) ?? {
							dark: joinPath(extension.description.extensionLocation, rawIcon),
							light: joinPath(extension.description.extensionLocation, rawIcon)
						};
					} else if (rawIcon) {
						icon = {
							dark: joinPath(extension.description.extensionLocation, rawIcon.dark),
							light: joinPath(extension.description.extensionLocation, rawIcon.light)
						};
					}

					// If OSS and the product.json is not set up, fall back to checking api proposal
					const isBuiltinTool = productService.defaultChatAgent?.chatExtensionId ?
						ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId) :
						isProposedApiEnabled(extension.description, 'chatParticipantPrivate');

					const source: ToolDataSource = isBuiltinTool
						? ToolDataSource.Internal
						: { type: 'extension', label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };

					const tool: IToolData = {
						...rawTool,
						source,
						inputSchema: rawTool.inputSchema,
						id: rawTool.name,
						icon,
						when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : undefined,
						alwaysDisplayInputOutput: !isBuiltinTool,
					};
					try {
						const disposable = languageModelToolsService.registerToolData(tool);
						this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.name), disposable);
					} catch (e) {
						extension.collector.error(`Failed to register tool '${rawTool.name}': ${e}`);
					}
				}
			}

			for (const extension of delta.removed) {
				for (const tool of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
				}
			}
		});

		languageModelToolSetsExtensionPoint.setHandler((_extensions, delta) => {

			for (const extension of delta.added) {

				if (!isProposedApiEnabled(extension.description, 'contribLanguageModelToolSets')) {
					extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register language model tools because the 'contribLanguageModelToolSets' API proposal is not enabled.`);
					continue;
				}

				const isBuiltinTool = productService.defaultChatAgent?.chatExtensionId ?
					ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId) :
					isProposedApiEnabled(extension.description, 'chatParticipantPrivate');

				const source: ToolDataSource = isBuiltinTool
					? ToolDataSource.Internal
					: { type: 'extension', label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };


				for (const toolSet of extension.value) {

					if (isFalsyOrWhitespace(toolSet.name)) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty name`);
						continue;
					}

					if (toolSet.legacyFullNames && !isProposedApiEnabled(extension.description, 'contribLanguageModelToolSets')) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT use 'legacyFullNames' without the 'contribLanguageModelToolSets' API proposal enabled`);
						continue;
					}

					if (isFalsyOrEmpty(toolSet.tools)) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array`);
						continue;
					}

					const tools: IToolData[] = [];
					const toolSets: ToolSet[] = [];

					for (const toolName of toolSet.tools) {
						const toolObj = languageModelToolsService.getToolByName(toolName, true);
						if (toolObj) {
							tools.push(toolObj);
							continue;
						}
						const toolSetObj = languageModelToolsService.getToolSetByName(toolName);
						if (toolSetObj) {
							toolSets.push(toolSetObj);
							continue;
						}
						extension.collector.warn(`Tool set '${toolSet.name}' CANNOT find tool or tool set by name: ${toolName}`);
					}

					if (toolSets.length === 0 && tools.length === 0) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array (none of the tools were found)`);
						continue;
					}

					const store = new DisposableStore();
					const referenceName = toolSet.referenceName ?? toolSet.name;
					const existingToolSet = languageModelToolsService.getToolSetByName(referenceName);
					const mergeExisting = isBuiltinTool && existingToolSet?.source === ToolDataSource.Internal;

					let obj: ToolSet & IDisposable;
					// Allow built-in tool to update the tool set if it already exists
					if (mergeExisting) {
						obj = existingToolSet as ToolSet & IDisposable;
					} else {
						obj = languageModelToolsService.createToolSet(
							source,
							toToolSetKey(extension.description.identifier, toolSet.name),
							referenceName,
							{ icon: toolSet.icon ? ThemeIcon.fromString(toolSet.icon) : undefined, description: toolSet.description, legacyFullNames: toolSet.legacyFullNames }
						);
					}

					transaction(tx => {
						if (!mergeExisting) {
							store.add(obj);
						}
						tools.forEach(tool => store.add(obj.addTool(tool, tx)));
						toolSets.forEach(toolSet => store.add(obj.addToolSet(toolSet, tx)));
					});

					this._registrationDisposables.set(toToolSetKey(extension.description.identifier, toolSet.name), store);
				}
			}

			for (const extension of delta.removed) {
				for (const toolSet of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolSetKey(extension.description.identifier, toolSet.name));
				}
			}
		});
	}
}


// --- render

class LanguageModelToolDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.languageModelTools;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contribs = manifest.contributes?.languageModelTools ?? [];
		if (!contribs.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('toolTableName', "Name"),
			localize('toolTableDisplayName', "Display Name"),
			localize('toolTableDescription', "Description"),
		];

		const rows: IRowData[][] = contribs.map(t => {
			return [
				new MarkdownString(`\`${t.name}\``),
				t.displayName,
				t.userDescription ?? t.modelDescription,
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
	id: 'languageModelTools',
	label: localize('langModelTools', "Language Model Tools"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageModelToolDataRenderer),
});


class LanguageModelToolSetDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.languageModelToolSets;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contribs = manifest.contributes?.languageModelToolSets ?? [];
		if (!contribs.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('name', "Name"),
			localize('reference', "Reference Name"),
			localize('tools', "Tools"),
			localize('descriptions', "Description"),
		];

		const rows: IRowData[][] = contribs.map(t => {
			return [
				new MarkdownString(`\`${t.name}\``),
				t.referenceName ? new MarkdownString(`\`#${t.referenceName}\``) : 'none',
				t.tools.join(', '),
				t.description,
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
	id: 'languageModelToolSets',
	label: localize('langModelToolSets', "Language Model Tool Sets"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageModelToolSetDataRenderer),
});
