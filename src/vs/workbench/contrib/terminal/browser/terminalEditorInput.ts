/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

export const terminalInputId = 'workbench.editors.terminal';
export class TerminalEditorInput extends EditorInput {

	static readonly ID = terminalInputId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.vscodeTerminal });

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	get resource(): URI | undefined {
		return TerminalEditorInput.RESOURCE;
	}

	constructor(
	) {
		super();
	}

	override getName() {
		return terminalStrings.terminalEditorInput.value;
	}
}
