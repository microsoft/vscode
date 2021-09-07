/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { localize } from 'vs/nls';

export class DisassemblyViewInput extends EditorInput {

	static readonly ID = 'debug.disassemblyView.input';

	override get typeId(): string {
		return DisassemblyViewInput.ID;
	}

	static _instance: DisassemblyViewInput;
	static get instance() {
		if (!DisassemblyViewInput._instance || DisassemblyViewInput._instance.isDisposed()) {
			DisassemblyViewInput._instance = new DisassemblyViewInput();
		}

		return DisassemblyViewInput._instance;
	}

	readonly resource = undefined;

	override getName(): string {
		return localize('disassemblyInputName', "Disassembly");
	}

	override matches(other: unknown): boolean {
		return other instanceof DisassemblyViewInput;
	}

}
