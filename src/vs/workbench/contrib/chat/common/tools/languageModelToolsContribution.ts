/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { DisposableMap } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILanguageModelToolsService } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';

interface IRawToolContribution {
	id: string;
	displayName?: string;
	description: string;
	parametersSchema?: IJSONSchema;
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
			defaultSnippets: [{ body: { id: '', description: '' } }],
			required: ['id', 'description'],
			properties: {
				id: {
					description: localize('toolId', "A unique id for this tool."),
					type: 'string'
				},
				description: {
					description: localize('toolDescription', "A description of this tool that may be passed to a language model."),
					type: 'string'
				},
				displayName: {
					description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
					type: 'string'
				},
				parametersSchema: {
					description: localize('parametersSchema', "A JSON schema for the parameters this tool accepts."),
					type: 'object',
					$ref: 'http://json-schema.org/draft-07/schema#'
				}
			}
		}
	}
});

function toToolKey(extensionIdentifier: ExtensionIdentifier, toolId: string) {
	return `${extensionIdentifier.value}/${toolId}`;
}

export class LanguageModelToolsExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.toolsExtensionPointHandler';

	private _registrationDisposables = new DisposableMap<string>();

	constructor(
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService
	) {
		languageModelToolsExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const tool of extension.value) {
					const disposable = languageModelToolsService.registerToolData(tool);
					this._registrationDisposables.set(toToolKey(extension.description.identifier, tool.id), disposable);
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
