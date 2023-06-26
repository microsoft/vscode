/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';

export function getAccessibilityHelpText(accessor: ServicesAccessor): string {
	const keybindingService = accessor.get(IKeybindingService);
	const content = [];
	content.push(localize('notebook.overview', 'The notebook view is a collection of code and markdown cells. Code cells can be executed and will produce output directly below the cell.'));
	content.push(descriptionForCommand('notebook.execute', localize('notebook.cell.executeAndFocusContainer', 'The Execute Cell command ({0}) executes the cell that currently has focus.',), localize('notebook.cell.executeAndFocusContainerNoKb', 'The Execute Cell command executes the cell that currently has focus and is currently not triggerable by a keybinding.'), keybindingService));

	return content.join('\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
	const accessibleViewService = accessor.get(IAccessibleViewService);
	const helpText = getAccessibilityHelpText(accessor);
	const provider = accessibleViewService.registerProvider({
		id: 'notebook',
		provideContent: () => helpText,
		onClose: () => {
			editor.focus();
			provider.dispose();
		},
		options: { type: AccessibleViewType.HelpMenu, ariaLabel: 'Notebook accessibility help' }
	});
	accessibleViewService.show('notebook');
}
