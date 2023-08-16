/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { registerEditorFeature } from 'vs/editor/common/editorFeatures';
import { DefaultDropProvidersFeature } from 'vs/editor/contrib/dropOrPasteInto/browser/defaultProviders';
import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { DropIntoEditorController, changeDropTypeCommandId, defaultProviderConfig, dropWidgetVisibleCtx } from './dropIntoEditorController';

registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController, EditorContributionInstantiation.BeforeFirstInteraction);

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

registerEditorFeature(DefaultDropProvidersFeature);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		[defaultProviderConfig]: {
			type: 'object',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('defaultProviderDescription', "Configures the default drop provider to use for content of a given mime type."),
			default: {},
			additionalProperties: {
				type: 'string',
			},
		},
	}
});
