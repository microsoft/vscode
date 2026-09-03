/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';

/**
 * Flips `editor.textDirection` between `'rtl'` and `'auto'`.
 */
export class ToggleTextDirectionAction extends Action2 {

	public static readonly ID = 'editor.action.toggleTextDirection';

	constructor() {
		super({
			id: ToggleTextDirectionAction.ID,
			title: nls.localize2('toggleTextDirection', "Toggle Editor Text Direction (Right-to-Left)"),
			precondition: undefined,
			metadata: {
				description: nls.localize2('toggleTextDirectionDescription', "Switches `editor.textDirection` between 'rtl' and 'auto' for the language of the active editor. In 'rtl' the lines flow from the right and the editor mirrors its layout."),
			},
			f1: true
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const codeEditorService = accessor.get(ICodeEditorService);

		// Invoked from the Command Palette, focus is in the quick input rather than in an editor, so
		// the focused editor is null and only the active one identifies what the user is looking at.
		const editor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		if (!model) {
			// Without a model there is no language to scope to, and writing the setting globally is not
			// what this command means. Say so rather than flipping every language silently.
			alert(nls.localize('toggleTextDirection.noEditor', "Open an editor to toggle its text direction"));
			return;
		}

		// Direction is a property of what a file contains, so the toggle is scoped to the language of
		// the editor it was invoked from. Writing it globally would flip every other language too,
		// which is not what somebody toggling it from a Markdown file is asking for. The resource is
		// part of the scope so that a folder-scoped value resolves against the right folder.
		const languageId = model.getLanguageId();
		const overrides = { overrideIdentifier: languageId, resource: model.uri };

		const current = configurationService.getValue<string>('editor.textDirection', overrides);
		const next = current === 'rtl' ? 'auto' : 'rtl';
		// No explicit target: `updateValue` writes to the scope the effective value already comes from.
		// Forcing the user settings would leave a workspace or folder value in place and announce a
		// change that never took effect.
		await configurationService.updateValue('editor.textDirection', next, overrides);

		alert(next === 'rtl'
			? nls.localize('toggleTextDirection.rtl', "The editor now lays out {0} right-to-left", languageId)
			: nls.localize('toggleTextDirection.auto', "The editor now lays out {0} by the direction each line declares", languageId));
	}
}

registerAction2(ToggleTextDirectionAction);
