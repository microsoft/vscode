/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ILanguageModelToolsService, IToolData } from '../languageModelToolsService.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { toolsParametersSchemaSchemaId } from './languageModelToolsParametersSchema.js';

export interface IRawToolContribution {
	name: string;
	displayName: string;
	modelDescription: string;
	toolReferenceName?: string;
	icon?: string | { light: string; dark: string };
	when?: string;
	tags?: string[];
	userDescription?: string;
	inputSchema?: IJSONSchema;

	/**
	 * TODO@API backwards compat, remove
	 * @deprecated
	 */
	parametersSchema?: IJSONSchema;
	canBeReferencedInPrompt?: boolean;
}

const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolContribution[]>({
	extensionPoint: 'languageModelTools',
	activationEventsGenerator: (contributions: IRawToolContribution[], result) => {
		for (const contrib of contributions) {
			result.push(`onLanguageModelTool:${contrib.name}`);
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
					// Borrow OpenAI's requirement for tool names
					pattern: '^[\\w-]+$'
				},
				toolReferenceName: {
					markdownDescription: localize('toolName2', "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", '`canBeReferencedInPrompt`'),
					type: 'string',
					pattern: '^[\\w-]+$'
				},
				displayName: {
					description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
					type: 'string'
				},
				userDescription: {
					description: localize('toolUserDescription', "A description of this tool that may be shown to the user."),
					type: 'string'
				},
				modelDescription: {
					description: localize('toolModelDescription', "A description of this tool that may be used by a language model to select it."),
					type: 'string'
				},
				inputSchema: {
					description: localize('parametersSchema', "A JSON schema for the input this tool accepts. The input must be an object at the top level. A particular language model may not support all JSON schema features. See the documentation for the language model family you are using for more information."),
					$ref: toolsParametersSchemaSchemaId,
				},
				canBeReferencedInPrompt: {
					markdownDescription: localize('canBeReferencedInPrompt', "If true, this tool shows up as an attachment that the user can add manually to their request. Chat participants will receive the tool in {0}.", '`ChatRequest#toolReferences`'),
					type: 'boolean'
				},
				icon: {
					markdownDescription: localize('icon', "An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like `$(zap)`"),
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

export class LanguageModelToolsExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.toolsExtensionPointHandler';

	private _registrationDisposables = new DisposableMap<string>();

	constructor(
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@ILogService logService: ILogService,
	) {
		languageModelToolsExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const rawTool of extension.value) {
					if (!rawTool.name || !rawTool.modelDescription || !rawTool.displayName) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name, modelDescription, and displayName: ${JSON.stringify(rawTool)}`);
						continue;
					}

					if (!rawTool.name.match(/^[\w-]+$/)) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.name}. The id must match /^[\\w-]+$/.`);
						continue;
					}

					if (rawTool.canBeReferencedInPrompt && !rawTool.toolReferenceName) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeReferencedInPrompt' set without a 'toolReferenceName': ${JSON.stringify(rawTool)}`);
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

					const tool: IToolData = {
						...rawTool,
						inputSchema: rawTool.inputSchema ?? rawTool.parametersSchema, // BACKWARDS compatibility
						id: rawTool.name,
						icon,
						when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : undefined,
					};
					const disposable = languageModelToolsService.registerToolData(tool);
					this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.name), disposable);
				}
			}

			for (const extension of delta.removed) {
				for (const tool of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
				}
			}
		});
	}
}
