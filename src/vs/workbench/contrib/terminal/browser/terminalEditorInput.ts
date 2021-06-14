/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

export const terminalInputId = 'workbench.editors.terminal';
export class TerminalEditorInput extends EditorInput {

	static readonly ID = terminalInputId;

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	private readonly _terminalInstance: ITerminalInstance;

	get terminalInstance(): ITerminalInstance {
		return this._terminalInstance!;
	}

	get resource(): URI {
		return URI.from({ scheme: Schemas.vscodeTerminal, path: this._terminalInstance!.instanceId.toString() });
	}

	constructor(
		instance: ITerminalInstance
	) {
		super();
		this._terminalInstance = instance;
	}

	static copy(terminalService: ITerminalService, instantiationService: IInstantiationService): TerminalEditorInput {
		return new TerminalEditorInput(terminalService.createInstance({}));
	}

	override getName() {
		return this.terminalInstance.title;
	}
}
