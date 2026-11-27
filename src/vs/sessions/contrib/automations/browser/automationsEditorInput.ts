/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';

export const AUTOMATIONS_MODAL_SETTING = 'chat.automations.modal';

export class AutomationsEditorInput extends EditorInput implements IModalEditorOptionsProvider {
	static readonly ID = 'sessions.input.automations';
	private static instance: AutomationsEditorInput | undefined;
	readonly resource = undefined;

	static getOrCreate(): AutomationsEditorInput {
		if (!this.instance || this.instance.isDisposed()) {
			this.instance = new AutomationsEditorInput();
		}
		return this.instance;
	}

	override get typeId(): string { return AutomationsEditorInput.ID; }
	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}
	override getName(): string { return localize('automations.modal.name', "Automations"); }
	override getIcon() { return Codicon.calendar; }
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof AutomationsEditorInput;
	}
	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true, canMoveToEditorArea: false };
	}
}
