/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID } from './aiCustomizationManagement.js';

/**
 * Editor input for the AI Customizations Management Editor.
 * This is a singleton-style input with no file resource.
 */
export class AICustomizationManagementEditorInput extends EditorInput {

	static readonly ID: string = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID;

	readonly resource = undefined;

	private static _instance: AICustomizationManagementEditorInput | undefined;

	private _sectionLabel: string | undefined;

	/**
	 * Gets or creates the singleton instance of this input.
	 */
	static getOrCreate(): AICustomizationManagementEditorInput {
		if (!AICustomizationManagementEditorInput._instance || AICustomizationManagementEditorInput._instance.isDisposed()) {
			AICustomizationManagementEditorInput._instance = new AICustomizationManagementEditorInput();
		}
		return AICustomizationManagementEditorInput._instance;
	}

	constructor() {
		super();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof AICustomizationManagementEditorInput;
	}

	override get typeId(): string {
		return AICustomizationManagementEditorInput.ID;
	}

	override getName(): string {
		if (this._sectionLabel) {
			return localize('aiCustomizationManagementEditorNameWithSection', "Customizations: {0}", this._sectionLabel);
		}
		return localize('aiCustomizationManagementEditorName', "Customizations");
	}

	/**
	 * Updates the section label shown in the editor tab title.
	 */
	setSectionLabel(label: string): void {
		if (this._sectionLabel !== label) {
			this._sectionLabel = label;
			this._onDidChangeLabel.fire();
		}
	}

	override getIcon(): ThemeIcon {
		return Codicon.settingsGear;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
