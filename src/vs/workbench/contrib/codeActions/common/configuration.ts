/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/codeActionTrigger';
import * as nls from 'vs/nls';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { CodeActionExtensionPointFields, CodeActionsExtensionPoint } from 'vs/workbench/contrib/codeActions/common/extensionPoint';
import { IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';

const codeActionsOnSaveDefaultProperties = Object.freeze<IJSONSchemaMap>({
	'source.fixAll': {
		type: 'boolean',
		description: nls.localize('codeActionsOnSave.fixAll', "Controls whether auto fix action should be run on file save.")
	}
});

const codeActionsOnSaveSchema: IJSONSchema = {
	type: 'object',
	properties: codeActionsOnSaveDefaultProperties,
	'additionalProperties': {
		type: 'boolean'
	},
	default: {},
	description: nls.localize('codeActionsOnSave', "Code action kinds to be run on save.")
};

export const editorConfiguration = Object.freeze<IConfigurationNode>({
	id: 'editor',
	order: 5,
	type: 'object',
	title: nls.localize('editorConfigurationTitle', "Editor"),
	overridable: true,
	properties: {
		'editor.codeActionsOnSave': codeActionsOnSaveSchema,
		'editor.codeActionsOnSaveTimeout': {
			type: 'number',
			default: 750,
			description: nls.localize('codeActionsOnSaveTimeout', "Timeout in milliseconds after which the code actions that are run on save are cancelled.")
		},
	}
});

export class CodeActionConfigurationManager implements IWorkbenchContribution {
	constructor(
		codeActionsExtensionPoint: IExtensionPoint<CodeActionsExtensionPoint[]>
	) {
		codeActionsExtensionPoint.setHandler(extensionPoints => {
			const newProperties: IJSONSchemaMap = { ...codeActionsOnSaveDefaultProperties };
			for (const [sourceAction, props] of this.getSourceActions(extensionPoints)) {
				newProperties[sourceAction] = {
					type: 'boolean',
					description: nls.localize(
						'codeActionsOnSave.generic',
						"Controls whether '{0}' actions should be run on file save.",
						props.title)
				};
			}
			codeActionsOnSaveSchema.properties = newProperties;

			Registry.as<IConfigurationRegistry>(Extensions.Configuration)
				.notifyConfigurationSchemaUpdated(editorConfiguration);
		});
	}

	private getSourceActions(extensionPoints: readonly IExtensionPointUser<CodeActionsExtensionPoint[]>[]) {
		const sourceActions = new Map<string, { readonly title: string }>();
		for (const contribution of flatten(extensionPoints.map(x => x.value))) {
			const kind = new CodeActionKind(contribution[CodeActionExtensionPointFields.kind]);
			const defaultKinds = Object.keys(codeActionsOnSaveDefaultProperties).map(value => new CodeActionKind(value));
			if (CodeActionKind.Source.contains(kind)
				// Exclude any we already included by default
				&& !defaultKinds.some(defaultKind => defaultKind.contains(kind))
			) {
				sourceActions.set(kind.value, contribution);
			}
		}
		return sourceActions;
	}
}
