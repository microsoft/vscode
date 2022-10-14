/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Settings2EditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';

export interface IKeybindingsEditorSearchOptions {
	searchValue: string;
	recordKeybindings: boolean;
	sortByPrecedence: boolean;
}

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

	override async resolve(): Promise<Settings2EditorModel> {
		return this._settingsModel;
	}

	override dispose(): void {
		this._settingsModel.dispose();

		super.dispose();
	}
}
