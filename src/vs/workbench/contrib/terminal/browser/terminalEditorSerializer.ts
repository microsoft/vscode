/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalIcon, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { IEditorInputSerializer } from 'vs/workbench/common/editor';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';

export class TerminalInputSerializer implements IEditorInputSerializer {
	constructor(@ITerminalService private readonly _terminalService: ITerminalService) { }

	public canSerialize(editorInput: TerminalEditorInput): boolean {
		return true;
	}

	public serialize(editorInput: TerminalEditorInput): string {
		console.log('serialize');
		const term = JSON.stringify(this._toJson(editorInput.terminalInstance));
		editorInput.detachInstance();
		return term;
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TerminalEditorInput | undefined {
		try {
			const terminalInstance = JSON.parse(serializedEditorInput);
			if (!terminalInstance) {
				return undefined;
			}
			const terminal = this._terminalService.createInstance({ attachPersistentProcess: terminalInstance });
			return new TerminalEditorInput(terminal);
		} catch {
			return undefined;
		}
	}

	private _toJson(instance?: ITerminalInstance): SerializedTerminalEditorInput | undefined {
		if (!instance) {
			return undefined;
		}
		return {
			id: instance.instanceId,
			pid: instance.persistentProcessId || 0,
			title: instance.title,
			titleSource: instance.titleSource,
			cwd: '',
			icon: instance.icon,
			color: instance.color
		};
	}
}

interface SerializedTerminalEditorInput {
	readonly id: number;
	readonly pid: number;
	readonly title: string;
	readonly titleSource: TitleEventSource;
	readonly cwd: string;
	readonly icon?: TerminalIcon;
	readonly color?: string
}
