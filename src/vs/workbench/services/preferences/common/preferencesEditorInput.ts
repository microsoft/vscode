/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IPreferencesService } from './preferences.js';
import { Settings2EditorModel } from './preferencesModels.js';

const SettingsEditorIcon = registerIcon('settings-editor-label-icon', Codicon.settings, nls.localize('settingsEditorLabelIcon', 'Icon of the settings editor label.'));

export class SettingsEditor2Input extends EditorInput {

	static readonly ID: string = 'workbench.input.settings2';
	private readonly _settingsModel: Settings2EditorModel;

	readonly resource: URI = URI.from({
		scheme: Schemas.vscodeSettings,
		path: `settingseditor`
	});

	constructor(
		@IPreferencesService _preferencesService: IPreferencesService,
	) {
		super();

		this._settingsModel = _preferencesService.createSettings2EditorModel();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof SettingsEditor2Input;
	}

	override get typeId(): string {
		return SettingsEditor2Input.ID;
	}

	override getName(): string {
		return nls.localize('settingsEditor2InputName', "Settings");
	}

	override getIcon(): ThemeIcon {
		return SettingsEditorIcon;
	}

	override async resolve(): Promise<Settings2EditorModel> {
		return this._settingsModel;
	}

	override dispose(): void {
		this._settingsModel.dispose();

		super.dispose();
	}
}
