/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { pasteAsCommandId } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js';
import { pasteAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { dropAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import * as nls from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

const dropEnumValues: string[] = [];

const dropAsPreferenceSchema: IConfigurationPropertySchema = {
	type: 'array',
	scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
	description: nls.localize('dropPreferredDescription', "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
	default: [],
	items: {
		description: nls.localize('dropKind', "The kind identifier of the drop edit."),
		anyOf: [
			{ type: 'string' },
			{ enum: dropEnumValues }
		],
	}
};

const pasteEnumValues: string[] = [];

const pasteAsPreferenceSchema: IConfigurationPropertySchema = {
	type: 'array',
	scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
	description: nls.localize('pastePreferredDescription', "Configures the preferred type of edit to use when pasting content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
	default: [],
	items: {
		description: nls.localize('pasteKind', "The kind identifier of the paste edit."),
		anyOf: [
			{ type: 'string' },
			{ enum: pasteEnumValues }
		]
	}
};

export const editorConfiguration = Object.freeze<IConfigurationNode>({
	...editorConfigurationBaseNode,
	properties: {
		[pasteAsPreferenceConfig]: pasteAsPreferenceSchema,
		[dropAsPreferenceConfig]: dropAsPreferenceSchema,
	}
});

export class DropOrPasteSchemaContribution extends Disposable implements IWorkbenchContribution {

	public static ID = 'workbench.contrib.dropOrPasteIntoSchema';

	private readonly _onDidChangeSchemaContributions = this._register(new Emitter<void>());

	private _allProvidedDropKinds: HierarchicalKind[] = [];
	private _allProvidedPasteKinds: HierarchicalKind[] = [];

	constructor(
		@IKeybindingService keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly languageFeatures: ILanguageFeaturesService
	) {
		super();

		this._register(
			Event.runAndSubscribe(
				Event.debounce(
					Event.any(languageFeatures.documentPasteEditProvider.onDidChange, languageFeatures.documentPasteEditProvider.onDidChange),
					() => { },
					1000,
				), () => {
					this.updateProvidedKinds();
					this.updateConfigurationSchema();

					this._onDidChangeSchemaContributions.fire();
				}));

		keybindingService.registerSchemaContribution({
			getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
			onDidChange: this._onDidChangeSchemaContributions.event,
		});
	}

	private updateProvidedKinds(): void {
		// Drop
		const dropKinds = new Map<string, HierarchicalKind>();
		for (const provider of this.languageFeatures.documentDropEditProvider.allNoModel()) {
			for (const kind of provider.providedDropEditKinds ?? []) {
				dropKinds.set(kind.value, kind);
			}
		}
		this._allProvidedDropKinds = Array.from(dropKinds.values());

		// Paste
		const pasteKinds = new Map<string, HierarchicalKind>();
		for (const provider of this.languageFeatures.documentPasteEditProvider.allNoModel()) {
			for (const kind of provider.providedPasteEditKinds ?? []) {
				pasteKinds.set(kind.value, kind);
			}
		}
		this._allProvidedPasteKinds = Array.from(pasteKinds.values());
	}

	private updateConfigurationSchema(): void {
		pasteEnumValues.length = 0;
		for (const codeActionKind of this._allProvidedPasteKinds) {
			pasteEnumValues.push(codeActionKind.value);
		}

		dropEnumValues.length = 0;
		for (const codeActionKind of this._allProvidedDropKinds) {
			dropEnumValues.push(codeActionKind.value);
		}

		Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.notifyConfigurationSchemaUpdated(editorConfiguration);
	}

	private getKeybindingSchemaAdditions(): IJSONSchema[] {
		return [
			{
				if: {
					required: ['command'],
					properties: {
						'command': { const: pasteAsCommandId }
					}
				},
				then: {
					properties: {
						'args': {
							oneOf: [
								{
									required: ['kind'],
									properties: {
										'kind': {
											anyOf: [
												{ enum: Array.from(this._allProvidedPasteKinds.map(x => x.value)) },
												{ type: 'string' },
											]
										}
									}
								},
								{
									required: ['preferences'],
									properties: {
										'preferences': {
											type: 'array',
											items: {
												anyOf: [
													{ enum: Array.from(this._allProvidedPasteKinds.map(x => x.value)) },
													{ type: 'string' },
												]
											}
										}
									}
								}
							]
						}
					}
				}
			},
		];
	}
}
