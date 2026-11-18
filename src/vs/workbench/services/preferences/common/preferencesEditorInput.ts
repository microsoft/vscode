/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { isResourceEditorInput, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { getDefaultSettingsResource, IPreferencesService, ISettingsEditorOptions } from './preferences.js';
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

const PreferencesEditorIcon = registerIcon('preferences-editor-label-icon', Codicon.settings, nls.localize('preferencesEditorLabelIcon', 'Icon of the preferences editor label.'));

export class PreferencesEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.preferences';

	readonly resource: URI = URI.from({
		scheme: Schemas.vscodeSettings,
		path: `preferenceseditor`
	});

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof PreferencesEditorInput;
	}

	override get typeId(): string {
		return PreferencesEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('preferencesEditorInputName', "Preferences");
	}

	override getIcon(): ThemeIcon {
		return PreferencesEditorIcon;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}

/**
 * Side by side editor of the default settings (secondary) and an editable
 * settings file (primary), resolved through the split settings editor
 * registration of the editor resolver.
 */
export class SplitSettingsEditorInput extends SideBySideEditorInput {

	/**
	 * The editor id of the split settings editor registration. Kept at its
	 * historical value so that existing editor associations continue to match.
	 */
	static readonly EDITOR_ID: string = SideBySideEditorInput.ID;

	override get editorId(): string {
		return SplitSettingsEditorInput.EDITOR_ID;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		// Editor groups are picked for the untyped request that opens this editor
		// (see `IPreferencesService`) before this editor is created. Match such a
		// request when it is for the same settings file and its configuration target
		// pairs that file with the same default settings.
		if (!isResourceEditorInput(otherInput)) {
			return false;
		}

		const options: ISettingsEditorOptions | undefined = otherInput.options;
		return options?.override === SplitSettingsEditorInput.EDITOR_ID &&
			options.target !== undefined &&
			isEqual(otherInput.resource, this.primary.resource) &&
			isEqual(getDefaultSettingsResource(options.target), this.secondary.resource);
	}
}
