/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
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

		// Direction is a property of what a file contains, so the toggle is scoped to the language
		// of the editor it was invoked from. Writing it globally would flip every other language
		// too, which is not what somebody toggling it from a Markdown file is asking for.
		const languageId = codeEditorService.getFocusedCodeEditor()?.getModel()?.getLanguageId();
		const overrides = languageId ? { overrideIdentifier: languageId } : {};

		const current = configurationService.getValue<string>('editor.textDirection', overrides);
		const next = current === 'rtl' ? 'auto' : 'rtl';
		await configurationService.updateValue('editor.textDirection', next, overrides, ConfigurationTarget.USER);

		const scope = languageId ?? nls.localize('toggleTextDirection.allLanguages', "all languages");
		alert(next === 'rtl'
			? nls.localize('toggleTextDirection.rtl', "The editor now lays out {0} right-to-left", scope)
			: nls.localize('toggleTextDirection.auto', "The editor now lays out {0} left-to-right", scope));
	}
}

registerAction2(ToggleTextDirectionAction);
