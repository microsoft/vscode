/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { AutoFixAction, CodeActionCommand, FixAllAction, OrganizeImportsAction, QuickFixAction, RefactorAction, SourceAction } from 'vs/editor/contrib/codeAction/browser/codeActionCommands';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { LightBulbWidget } from 'vs/editor/contrib/codeAction/browser/lightBulbWidget';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

registerEditorContribution(CodeActionController.ID, CodeActionController, EditorContributionInstantiation.Eventually);
registerEditorContribution(LightBulbWidget.ID, LightBulbWidget, EditorContributionInstantiation.Lazy);
registerEditorAction(QuickFixAction);
registerEditorAction(RefactorAction);
registerEditorAction(SourceAction);
registerEditorAction(OrganizeImportsAction);
registerEditorAction(AutoFixAction);
registerEditorAction(FixAllAction);
registerEditorCommand(new CodeActionCommand());

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		'editor.codeActionWidget.showHeaders': {
			type: 'boolean',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('showCodeActionHeaders', "Enable/disable showing group headers in the Code Action menu."),
			default: true,
		},
	}
});

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		'editor.codeActionWidget.includeNearbyQuickfixes': {
			type: 'boolean',
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('includeNearbyQuickfixes', "Enable/disable showing nearest quickfix within a line when not currently on a diagnostic."),
			default: false,
		},
	}
});
