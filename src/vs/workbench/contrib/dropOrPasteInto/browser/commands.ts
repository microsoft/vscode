/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { CopyPasteController, pasteAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController, dropAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';

export class DropOrPasteIntoCommands implements IWorkbenchContribution {
	public static ID = 'workbench.contrib.dropOrPasteInto';

	constructor(
		@IPreferencesService private readonly _preferencesService: IPreferencesService
	) {
		CopyPasteController.setConfigureDefaultAction(toAction({
			id: 'workbench.action.configurePreferredPasteAction',
			label: localize('configureDefaultPaste.label', 'Configure preferred paste action...'),
			run: () => this.configurePreferredPasteAction()
		}));

		DropIntoEditorController.setConfigureDefaultAction(toAction({
			id: 'workbench.action.configurePreferredDropAction',
			label: localize('configureDefaultDrop.label', 'Configure preferred drop action...'),
			run: () => this.configurePreferredDropAction()
		}));
	}

	private configurePreferredPasteAction() {
		return this._preferencesService.openUserSettings({
			jsonEditor: true,
			revealSetting: { key: pasteAsPreferenceConfig, edit: true }
		});
	}

	private configurePreferredDropAction() {
		return this._preferencesService.openUserSettings({
			jsonEditor: true,
			revealSetting: { key: dropAsPreferenceConfig, edit: true }
		});
	}
}
