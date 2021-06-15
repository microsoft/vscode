/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalEditorInput extends EditorInput {

	static readonly ID = 'workbench.editors.terminal';

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	private readonly _terminalInstance: ITerminalInstance;

	get terminalInstance(): ITerminalInstance {
		return this._terminalInstance;
	}

	get resource(): URI {
		return this.terminalInstance.resource;
	}

	constructor(
		terminalInstance: ITerminalInstance
	) {
		super();
		this._terminalInstance = terminalInstance;
		this._terminalInstance.onTitleChanged(() => this._onDidChangeLabel.fire());
	}

	override getName() {
		return this.terminalInstance.title;
	}

	override dispose() {
		this.terminalInstance.dispose();
		super.dispose();
	}
}
