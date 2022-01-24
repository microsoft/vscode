/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { KeybindingsEditorModel } from 'vs/workbench/services/preferences/browser/keybindingsEditorModel';

export interface IKeybindingsEditorSearchOptions {
	searchValue: string;
	recordKeybindings: boolean;
	sortByPrecedence: boolean;
}

export class KeybindingsEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.keybindings';
	readonly keybindingsModel: KeybindingsEditorModel;

	searchOptions: IKeybindingsEditorSearchOptions | null = null;

	readonly resource = undefined;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.keybindingsModel = instantiationService.createInstance(KeybindingsEditorModel, OS);
	}

	override get typeId(): string {
		return KeybindingsEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('keybindingsInputName', "Keyboard Shortcuts");
	}

	override async resolve(): Promise<KeybindingsEditorModel> {
		return this.keybindingsModel;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof KeybindingsEditorInput;
	}

	override dispose(): void {
		this.keybindingsModel.dispose();

		super.dispose();
	}
}
