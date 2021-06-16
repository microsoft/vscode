/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalEditorService, ITerminalInstance, TerminalTarget } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class TerminalEditorService implements ITerminalEditorService {
	declare _serviceBrand: undefined;

	terminalEditorInstances: ITerminalInstance[] = [];

	private _editorInputs: Map</*instanceId*/number, TerminalEditorInput> = new Map();

	constructor(
		@IEditorService private readonly _editorService: IEditorService
	) {
		// TODO: Multiplex instance events
	}

	async createEditor(instance: ITerminalInstance): Promise<void> {
		instance.target = TerminalTarget.Editor;
		const input = new TerminalEditorInput(instance);
		this._editorInputs.set(instance.instanceId, input);
		await this._editorService.openEditor(input, {
			pinned: true,
			forceReload: true
		});
		this.terminalEditorInstances.push(instance);
	}

	detachActiveEditorInstance(): ITerminalInstance {
		const activeEditor = this._editorService.activeEditor;
		if (!(activeEditor instanceof TerminalEditorInput)) {
			throw new Error('Active editor is not a terminal');
		}
		const instance = activeEditor.terminalInstance;
		activeEditor.detachInstance();
		this._editorInputs.delete(instance.instanceId);
		activeEditor.dispose();
		return instance;
	}
}
