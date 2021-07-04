/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorInput, IUntypedEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { TextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Settings2EditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class PreferencesEditorInput extends SideBySideEditorInput {
	static override readonly ID: string = 'workbench.editorinputs.preferencesEditorInput';

	override get typeId(): string {
		return PreferencesEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override getTitle(verbosity: Verbosity): string {
		return this.primary.getTitle(verbosity);
	}

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || this.primary.matches(otherInput);
	}
}

export class DefaultPreferencesEditorInput extends TextResourceEditorInput {
	static override readonly ID = 'workbench.editorinputs.defaultpreferences';
	constructor(
		defaultSettingsResource: URI,
		@ITextModelService textModelResolverService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService
	) {
		super(defaultSettingsResource, nls.localize('settingsEditorName', "Default Settings"), '', undefined, undefined, textModelResolverService, textFileService, editorService, fileService, labelService);
	}

	override get typeId(): string {
		return DefaultPreferencesEditorInput.ID;
	}

	override matches(other: IEditorInput | IUntypedEditorInput): boolean {
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

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
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
