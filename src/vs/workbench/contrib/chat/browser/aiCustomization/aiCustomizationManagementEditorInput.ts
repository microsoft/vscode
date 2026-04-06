/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IUntypedEditorInput, EditorInputCapabilities, GroupIdentifier, ISaveOptions, SaveReason } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID } from './aiCustomizationManagement.js';

/**
 * Editor input for the AI Customizations Management Editor.
 * This is a singleton-style input with no file resource.
 */
export class AICustomizationManagementEditorInput extends EditorInput {

	static readonly ID: string = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID;

	readonly resource = undefined;

	private _isDirty = false;
	private _saveHandler?: () => Promise<boolean>;

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

	override async save(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | undefined> {
		if (options?.reason !== undefined && options.reason !== SaveReason.EXPLICIT) {
			return undefined;
		}
		if (this._saveHandler) {
			const saved = await this._saveHandler();
			return saved ? this : undefined;
		}
		return undefined;
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

	setSaveHandler(handler: (() => Promise<boolean>) | undefined): void {
		this._saveHandler = handler;
	}
}
