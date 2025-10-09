/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, ServicesAccessor, registerEditorAction } from '../../../browser/editorExtensions.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { SHOW_OR_FOCUS_HOVER_ACTION_ID } from '../../hover/browser/hoverActionIds.js';
import { AccessibilityCommandId } from '../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';

class ShowAccessibleViewForMarkerNavigationWidget extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.accessibleViewForMarkerNavigationWidget',
			label: nls.localize('action.accessibleViewForMarkerNavigationWidget', "Show Accessible View for Problem"),
			alias: 'Show Accessible View for Problem',
			precondition: ContextKeyExpr.equals('markersNavigationVisible', true),
			kbOpts: {
				primary: KeyMod.Alt | KeyCode.F2,
				weight: KeybindingWeight.WorkbenchContrib,
				linux: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F2,
					secondary: [KeyMod.Alt | KeyCode.F2]
				}
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		
		// First, show/focus the hover which will include marker information
		await commandService.executeCommand(SHOW_OR_FOCUS_HOVER_ACTION_ID);
		
		// Then open the accessible view for the hover
		await commandService.executeCommand(AccessibilityCommandId.OpenAccessibleView);
	}
}

registerEditorAction(ShowAccessibleViewForMarkerNavigationWidget);
