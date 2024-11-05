/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { editorConfigurationBaseNode } from '../../../common/config/editorConfigurationSchema.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { DefaultDropProvidersFeature } from './defaultProviders.js';
import { DropIntoEditorController, changeDropTypeCommandId, dropAsPreferenceConfig, dropWidgetVisibleCtx } from './dropIntoEditorController.js';

registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorFeature(DefaultDropProvidersFeature);

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: changeDropTypeCommandId,
			precondition: dropWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor, _args: any) {
		DropIntoEditorController.get(editor)?.changeDropType();
	}
});

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: 'editor.hideDropWidget',
			precondition: dropWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor, _args: any) {
		DropIntoEditorController.get(editor)?.clearWidgets();
	}
});

export type PreferredDropConfiguration = ReadonlyArray<{ readonly kind: string; readonly mimeType?: string }>;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		[dropAsPreferenceConfig]: {
			type: 'array',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('preferredDescription', "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds with optional mime types for the content being dropped. The first available edit of a preferred kind will be used."),
			default: [],
			items: {
				type: 'object',
				required: ['kind'],
				properties: {
					mimeType: {
						type: 'string',
						description: nls.localize('mimeType', "The optional mime type that this preference applies to. If not provided, the preference will be used for all mime types."),
					},
					kind: {
						type: 'string',
						description: nls.localize('kind', "The kind identifier of the drop edit."),
					}
				},
				defaultSnippets: [
					{ body: { kind: '$1' } }
				]
			}
		},
	}
});
