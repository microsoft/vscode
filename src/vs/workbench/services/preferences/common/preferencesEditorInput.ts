/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, SideBySideEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { KeybindingsEditorModel } from 'vs/workbench/services/preferences/common/keybindingsEditorModel';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Settings2EditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';

export class PreferencesEditorInput extends SideBySideEditorInput {
	static readonly ID: string = 'workbench.editorinputs.preferencesEditorInput';

	getTypeId(): string {
		return PreferencesEditorInput.ID;
	}

	getTitle(verbosity: Verbosity): string | null {
		return this.master.getTitle(verbosity);
	}
}

export class DefaultPreferencesEditorInput extends ResourceEditorInput {
	static readonly ID = 'workbench.editorinputs.defaultpreferences';
	constructor(defaultSettingsResource: URI,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(nls.localize('settingsEditorName', "Default Settings"), '', defaultSettingsResource, undefined, textModelResolverService);
	}

	getTypeId(): string {
		return DefaultPreferencesEditorInput.ID;
	}

	matches(other: unknown): boolean {
		if (other instanceof DefaultPreferencesEditorInput) {
			return true;
		}
		if (!super.matches(other)) {
			return false;
		}
		return true;
	}
}

export interface IKeybindingsEditorSearchOptions {
	searchValue: string;
	recordKeybindings: boolean;
	sortByPrecedence: boolean;
}

export class KeybindingsEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.keybindings';
	readonly keybindingsModel: KeybindingsEditorModel;

	searchOptions: IKeybindingsEditorSearchOptions | null;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.keybindingsModel = instantiationService.createInstance(KeybindingsEditorModel, OS);
	}

	getTypeId(): string {
		return KeybindingsEditorInput.ID;
	}

	getName(): string {
		return nls.localize('keybindingsInputName', "Keyboard Shortcuts");
	}

	resolve(): Promise<KeybindingsEditorModel> {
		return Promise.resolve(this.keybindingsModel);
	}

	matches(otherInput: unknown): boolean {
		return otherInput instanceof KeybindingsEditorInput;
	}
}

export class SettingsEditor2Input extends EditorInput {

	static readonly ID: string = 'workbench.input.settings2';
	private readonly _settingsModel: Settings2EditorModel;
	private resource: URI = URI.from({
		scheme: 'vscode-settings',
		path: `settingseditor`
	});

	constructor(
		@IPreferencesService _preferencesService: IPreferencesService,
	) {
		super();

		this._settingsModel = _preferencesService.createSettings2EditorModel();
	}

	matches(otherInput: unknown): boolean {
		return otherInput instanceof SettingsEditor2Input;
	}

	getTypeId(): string {
		return SettingsEditor2Input.ID;
	}

	getName(): string {
		return nls.localize('settingsEditor2InputName', "Settings");
	}

	resolve(): Promise<Settings2EditorModel> {
		return Promise.resolve(this._settingsModel);
	}

	getResource(): URI {
		return this.resource;
	}
}
