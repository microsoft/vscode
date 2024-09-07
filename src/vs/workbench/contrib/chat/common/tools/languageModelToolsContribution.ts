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

interface IRawToolContribution {
	id: string;
	name?: string;
	icon?: string | { light: string; dark: string };
	when?: string;
	displayName?: string;
	userDescription?: string;
	modelDescription: string;
	parametersSchema?: IJSONSchema;
	canBeInvokedManually?: boolean;
}

const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolContribution[]>({
	extensionPoint: 'languageModelTools',
	activationEventsGenerator: (contributions: IRawToolContribution[], result) => {
		for (const contrib of contributions) {
			result.push(`onLanguageModelTool:${contrib.id}`);
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.tools', 'Contributes a tool that can be invoked by a language model.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['id', 'modelDescription'],
			properties: {
				id: {
					description: localize('toolId', "A unique id for this tool."),
					type: 'string',
					// Borrow OpenAI's requirement for tool names
					pattern: '^[\\w-]+$'
				},
				name: {
					description: localize('toolName', "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", '`canBeInvokedManually`'),
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
					description: localize('toolModelDescription', "A description of this tool that may be passed to a language model."),
					type: 'string'
				},
				parametersSchema: {
					description: localize('parametersSchema', "A JSON schema for the parameters this tool accepts."),
					type: 'object',
					$ref: 'http://json-schema.org/draft-07/schema#'
				},
				canBeInvokedManually: {
					description: localize('canBeInvokedManually', "Whether this tool can be invoked manually by the user through the chat UX."),
					type: 'boolean'
				},
				icon: {
					description: localize('icon', "An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like `\\$(zap)`"),
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
					if (!rawTool.id || !rawTool.modelDescription) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name and modelDescription: ${JSON.stringify(rawTool)}`);
						continue;
					}

					if (!rawTool.id.match(/^[\w-]+$/)) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.id}. The id must match /^[\\w-]+$/.`);
						continue;
					}

					if (rawTool.canBeInvokedManually && !rawTool.name) {
						logService.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeInvokedManually' set without a name: ${JSON.stringify(rawTool)}`);
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
						icon,
						when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : undefined,
					};
					const disposable = languageModelToolsService.registerToolData(tool);
					this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.id), disposable);
				}
			}

			for (const extension of delta.removed) {
				for (const tool of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.id));
				}
			}
		});
	}
}
