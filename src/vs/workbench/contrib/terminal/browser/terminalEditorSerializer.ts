/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ISerializedTerminalEditorInput, ITerminalEditorService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';

export class TerminalInputSerializer implements IEditorSerializer {
	constructor(
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService
	) { }

	public canSerialize(editorInput: TerminalEditorInput): editorInput is TerminalEditorInput & { readonly terminalInstance: ITerminalInstance } {
		return typeof editorInput.terminalInstance?.persistentProcessId === 'number' && editorInput.terminalInstance.shouldPersist;
	}

	public serialize(editorInput: TerminalEditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return;
		}
		return JSON.stringify(this._toJson(editorInput.terminalInstance));
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		const terminalInstance = JSON.parse(serializedEditorInput);
		return this._terminalEditorService.reviveInput(terminalInstance);
	}

	private _toJson(instance: ITerminalInstance): ISerializedTerminalEditorInput {
		return {
			id: instance.persistentProcessId!,
			pid: instance.processId || 0,
			title: instance.title,
			titleSource: instance.titleSource,
			cwd: '',
			icon: instance.icon,
			color: instance.color,
			hasChildProcesses: instance.hasChildProcesses,
			isFeatureTerminal: instance.shellLaunchConfig.isFeatureTerminal,
			hideFromUser: instance.shellLaunchConfig.hideFromUser,
			reconnectionProperties: instance.shellLaunchConfig.reconnectionProperties,
			shellIntegrationNonce: instance.shellIntegrationNonce
		};
	}
}
