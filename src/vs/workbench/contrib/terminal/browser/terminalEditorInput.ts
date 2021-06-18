/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';

export class TerminalEditorInput extends EditorInput {

	static readonly ID = 'workbench.editors.terminal';

	private _isDetached = false;

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return TerminalEditor.ID;
	}

	private readonly _terminalInstance: ITerminalInstance;
	/**
	 * Returns the terminal instance for this input if it has not yet been detached from the input.
	 */
	get terminalInstance(): ITerminalInstance | undefined {
		return this._isDetached ? undefined : this._terminalInstance;
	}

	get resource(): URI {
		return this._terminalInstance.resource;
	}

	constructor(
		terminalInstance: ITerminalInstance
	) {
		super();
		this._terminalInstance = terminalInstance;
		this._terminalInstance.onTitleChanged(() => this._onDidChangeLabel.fire());
		this._register(toDisposable(() => {
			if (!this._isDetached) {
				this._terminalInstance.dispose();
			}
		}));
	}

	override getName() {
		return this._terminalInstance.title;
	}

	/**
	 * Detach the instance from the input such that when the input is disposed it will not dispose
	 * of the terminal instance/process.
	 */
	detachInstance() {
		this._terminalInstance.detachFromElement();
		this._isDetached = true;
	}
}
