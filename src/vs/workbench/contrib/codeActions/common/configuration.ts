/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { Emitter } from 'vs/base/common/event';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { Disposable } from 'vs/base/common/lifecycle';
import { CodeActionCommand, RefactorAction, SourceAction } from 'vs/editor/contrib/codeAction/codeActionCommands';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/codeActionTrigger';
import * as nls from 'vs/nls';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { CodeActionExtensionPointFields, CodeActionsExtensionPoint } from 'vs/workbench/contrib/codeActions/common/extensionPoint';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';

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

export class CodeActionWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private _contributedCodeActions: CodeActionsExtensionPoint[] = [];

	private readonly _onDidChangeContributions = this._register(new Emitter<void>());

	constructor(
		codeActionsExtensionPoint: IExtensionPoint<CodeActionsExtensionPoint[]>,
		keybindingService: IKeybindingService,
	) {
		super();

		codeActionsExtensionPoint.setHandler(extensionPoints => {
			this._contributedCodeActions = flatten(extensionPoints.map(x => x.value));
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
			newProperties[sourceAction] = {
				type: 'boolean',
				description: nls.localize('codeActionsOnSave.generic', "Controls whether '{0}' actions should be run on file save.", props.title)
			};
		}
		codeActionsOnSaveSchema.properties = newProperties;
		Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.notifyConfigurationSchemaUpdated(editorConfiguration);
	}

	private getSourceActions(contributions: readonly CodeActionsExtensionPoint[]) {
		const sourceActions = new Map<string, { readonly title: string }>();
		for (const contribution of contributions) {
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

	private getSchemaAdditions(): IJSONSchema[] {
		const conditionalSchema = (command: string, values: string[]): IJSONSchema => {
			return {
				if: {
					properties: {
						'command': { const: command }
					}
				},
				then: {
					required: ['args'],
					properties: {
						'args': {
							required: ['kind'],
							properties: {
								'kind': {
									anyOf: [
										{ enum: values },
										{ type: 'string' },
									]
								}
							}
						}
					}
				}
			};
		};

		const getActions = (ofKind: CodeActionKind): string[] => {
			return this._contributedCodeActions
				.map(desc => desc[CodeActionExtensionPointFields.kind])
				.filter(kind => ofKind.contains(new CodeActionKind(kind)));
		};

		return [
			conditionalSchema(CodeActionCommand.Id, getActions(CodeActionKind.Empty)),
			conditionalSchema(RefactorAction.Id, getActions(CodeActionKind.Refactor)),
			conditionalSchema(SourceAction.Id, getActions(CodeActionKind.Source)),
		];
	}
}
