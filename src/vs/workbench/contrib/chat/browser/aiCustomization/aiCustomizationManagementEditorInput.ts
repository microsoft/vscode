/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ConfirmResult } from '../../../../../platform/dialogs/common/dialogs.js';
import { IUntypedEditorInput, EditorInputCapabilities } from '../../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../../common/editor/editorInput.js';
import { AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID } from './aiCustomizationManagement.js';

/**
 * Editor input for the AI Customizations Management Editor.
 * This is a singleton-style input with no file resource.
 */
export class AICustomizationManagementEditorInput extends EditorInput {

	static readonly ID: string = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID;

	readonly resource = undefined;

	private _isDirty = false;
	private _confirmHandler?: () => Promise<ConfirmResult>;

	override readonly closeHandler: IEditorCloseHandler = {
		showConfirm: () => this._isDirty,
		confirm: async () => {
			return this._confirmHandler?.() ?? ConfirmResult.DONT_SAVE;
		},
	};

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	private static _instance: AICustomizationManagementEditorInput | undefined;

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
		return localize('aiCustomizationManagementEditorName', "Chat Customizations");
	}

	override getIcon(): ThemeIcon {
		return Codicon.settingsGear;
	}

	override async resolve(): Promise<null> {
		return null;
	}

	override isDirty(): boolean {
		return this._isDirty;
	}

	override async revert(): Promise<void> {
		this.setDirty(false);
	}

	setDirty(dirty: boolean): void {
		if (this._isDirty !== dirty) {
			this._isDirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	setConfirmHandler(handler: (() => Promise<ConfirmResult>) | undefined): void {
		this._confirmHandler = handler;
	}
}
