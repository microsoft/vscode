/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalIcon, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { IEditorInputSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalEditorService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';

export class TerminalInputSerializer implements IEditorInputSerializer {
	constructor(
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService
	) { }

	public canSerialize(editorInput: TerminalEditorInput): boolean {
		return !!editorInput.terminalInstance?.persistentProcessId;
	}

	public serialize(editorInput: TerminalEditorInput): string | undefined {
		if (!editorInput.terminalInstance?.persistentProcessId) {
			return;
		}
		const term = JSON.stringify(this._toJson(editorInput.terminalInstance));
		return term;
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		const terminalInstance = JSON.parse(serializedEditorInput);
		const editor = this._terminalEditorService.getOrCreateEditorInput(terminalInstance);
		editor.terminalInstance?.onExit(() => editor.dispose());
		return editor;
	}

	private _toJson(instance: ITerminalInstance): SerializedTerminalEditorInput {
		return {
			id: instance.persistentProcessId!,
			pid: instance.processId || 0,
			title: instance.title,
			titleSource: instance.titleSource,
			cwd: '',
			icon: instance.icon,
			color: instance.color
		};
	}
}

export interface SerializedTerminalEditorInput {
	readonly id: number;
	readonly pid: number;
	readonly title: string;
	readonly titleSource: TitleEventSource;
	readonly cwd: string;
	readonly icon: TerminalIcon | undefined;
	readonly color: string | undefined;
}
