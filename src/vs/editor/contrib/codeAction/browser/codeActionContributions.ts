/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { AutoFixAction, CodeActionCommand, CodeActionController, FixAllAction, OrganizeImportsAction, QuickFixAction, RefactorAction, RefactorPreview, SourceAction } from 'vs/editor/contrib/codeAction/browser/codeActionCommands';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

registerEditorContribution(CodeActionController.ID, CodeActionController, EditorContributionInstantiation.Idle);
registerEditorAction(QuickFixAction);
registerEditorAction(RefactorAction);
registerEditorAction(RefactorPreview);
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
