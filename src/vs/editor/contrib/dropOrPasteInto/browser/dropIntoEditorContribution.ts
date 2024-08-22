/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes';
import { ICodeEditor } from '../../../browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions';
import { editorConfigurationBaseNode } from '../../../common/config/editorConfigurationSchema';
import { registerEditorFeature } from '../../../common/editorFeatures';
import { DefaultDropProvidersFeature } from './defaultProviders';
import * as nls from '../../../../nls';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';
import { Registry } from '../../../../platform/registry/common/platform';
import { DropIntoEditorController, changeDropTypeCommandId, defaultProviderConfig, dropWidgetVisibleCtx } from './dropIntoEditorController';

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
