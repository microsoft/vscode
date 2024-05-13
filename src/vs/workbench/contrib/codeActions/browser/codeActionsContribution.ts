/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { Disposable } from 'vs/base/common/lifecycle';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { codeActionCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { CodeActionsExtensionPoint, ContributedCodeAction } from 'vs/workbench/contrib/codeActions/common/codeActionsExtensionPoint';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';

const createCodeActionsAutoSave = (description: string): IJSONSchema => {
	return {
		type: 'string',
		enum: ['always', 'explicit', 'never', true, false],
		enumDescriptions: [
			nls.localize('alwaysSave', 'Triggers Code Actions on explicit saves and auto saves triggered by window or focus changes.'),
			nls.localize('explicitSave', 'Triggers Code Actions only when explicitly saved'),
			nls.localize('neverSave', 'Never triggers Code Actions on save'),
			nls.localize('explicitSaveBoolean', 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
			nls.localize('neverSaveBoolean', 'Never triggers Code Actions on save. This value will be deprecated in favor of "never".')
		],
		default: 'explicit',
		description: description
	};
};

const codeActionsOnSaveDefaultProperties = Object.freeze<IJSONSchemaMap>({
	'source.fixAll': createCodeActionsAutoSave(nls.localize('codeActionsOnSave.fixAll', "Controls whether auto fix action should be run on file save.")),
});

const codeActionsOnSaveSchema: IConfigurationPropertySchema = {
	oneOf: [
		{
			type: 'object',
			properties: codeActionsOnSaveDefaultProperties,
			additionalProperties: {
				type: 'string'
			},
		},
		{
			type: 'array',
			items: { type: 'string' }
		}
	],
	markdownDescription: nls.localize('editor.codeActionsOnSave', 'Run Code Actions for the editor on save. Code Actions must be specified and the editor must not be shutting down. Example: `"source.organizeImports": "explicit" `'),
	type: ['object', 'array'],
	additionalProperties: {
		type: 'string',
		enum: ['always', 'explicit', 'never', true, false],
	},
	default: {},
	scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
};

export const editorConfiguration = Object.freeze<IConfigurationNode>({
	...editorConfigurationBaseNode,
	properties: {
		'editor.codeActionsOnSave': codeActionsOnSaveSchema
	}
});

export class CodeActionsContribution extends Disposable implements IWorkbenchContribution {

	private _contributedCodeActions: CodeActionsExtensionPoint[] = [];

	private readonly _onDidChangeContributions = this._register(new Emitter<void>());

	constructor(
		codeActionsExtensionPoint: IExtensionPoint<CodeActionsExtensionPoint[]>,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		codeActionsExtensionPoint.setHandler(extensionPoints => {
			this._contributedCodeActions = extensionPoints.flatMap(x => x.value).filter(x => Array.isArray(x.actions));
			this.updateConfigurationSchema(this._contributedCodeActions);
			this._onDidChangeContributions.fire();
		});

		keybindingService.registerSchemaContribution({
			getSchemaAdditions: () => this.getSchemaAdditions(),
			onDidChange: this._onDidChangeContributions.event,
		});
	}

	private updateConfigurationSchema(codeActionContributions: readonly CodeActionsExtensionPoint[]) {
		const newProperties: IJSONSchemaMap = { ...codeActionsOnSaveDefaultProperties };
		for (const [sourceAction, props] of this.getSourceActions(codeActionContributions)) {
			newProperties[sourceAction] = createCodeActionsAutoSave(nls.localize('codeActionsOnSave.generic', "Controls whether '{0}' actions should be run on file save.", props.title));
		}
		codeActionsOnSaveSchema.properties = newProperties;
		Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.notifyConfigurationSchemaUpdated(editorConfiguration);
	}

	private getSourceActions(contributions: readonly CodeActionsExtensionPoint[]) {
		const defaultKinds = Object.keys(codeActionsOnSaveDefaultProperties).map(value => new HierarchicalKind(value));
		const sourceActions = new Map<string, { readonly title: string }>();
		for (const contribution of contributions) {
			for (const action of contribution.actions) {
				const kind = new HierarchicalKind(action.kind);
				if (CodeActionKind.Source.contains(kind)
					// Exclude any we already included by default
					&& !defaultKinds.some(defaultKind => defaultKind.contains(kind))
				) {
					sourceActions.set(kind.value, action);
				}
			}
		}
		return sourceActions;
	}

	private getSchemaAdditions(): IJSONSchema[] {
		const conditionalSchema = (command: string, actions: readonly ContributedCodeAction[]): IJSONSchema => {
			return {
				if: {
					required: ['command'],
					properties: {
						'command': { const: command }
					}
				},
				then: {
					properties: {
						'args': {
							required: ['kind'],
							properties: {
								'kind': {
									anyOf: [
										{
											enum: actions.map(action => action.kind),
											enumDescriptions: actions.map(action => action.description ?? action.title),
										},
										{ type: 'string' },
									]
								}
							}
						}
					}
				}
			};
		};

		const getActions = (ofKind: HierarchicalKind): ContributedCodeAction[] => {
			const allActions = this._contributedCodeActions.flatMap(desc => desc.actions);

			const out = new Map<string, ContributedCodeAction>();
			for (const action of allActions) {
				if (!out.has(action.kind) && ofKind.contains(new HierarchicalKind(action.kind))) {
					out.set(action.kind, action);
				}
			}
			return Array.from(out.values());
		};

		return [
			conditionalSchema(codeActionCommandId, getActions(HierarchicalKind.Empty)),
			conditionalSchema(refactorCommandId, getActions(CodeActionKind.Refactor)),
			conditionalSchema(sourceActionCommandId, getActions(CodeActionKind.Source)),
		];
	}
}
