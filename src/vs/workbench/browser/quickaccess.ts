/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { getIEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorViewState, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorOptions } from 'vs/platform/editor/common/editor';

export const inQuickPickContextKeyValue = 'inQuickOpen';
export const InQuickPickContextKey = new RawContextKey<boolean>(inQuickPickContextKeyValue, false, localize('inQuickOpen', "Whether keyboard focus is inside the quick open control"));
export const inQuickPickContext = ContextKeyExpr.has(inQuickPickContextKeyValue);

export const defaultQuickAccessContextKeyValue = 'inFilesPicker';
export const defaultQuickAccessContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(defaultQuickAccessContextKeyValue));

export interface IWorkbenchQuickAccessConfiguration {
	readonly workbench: {
		readonly commandPalette: {
			readonly history: number;
			readonly preserveInput: boolean;
			readonly experimental: {
				readonly suggestCommands: boolean;
				readonly enableNaturalLanguageSearch: boolean;
				readonly askChatLocation: 'quickChat' | 'chatView';
			};
		};
		readonly quickOpen: {
			readonly enableExperimentalNewVersion: boolean;
			readonly preserveInput: boolean;
		};
	};
}

export function getQuickNavigateHandler(id: string, next?: boolean): ICommandHandler {
	return accessor => {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);

		const keys = keybindingService.lookupKeybindings(id);
		const quickNavigate = { keybindings: keys };

		quickInputService.navigate(!!next, quickNavigate);
	};
}
export class EditorViewState {
	private _editorViewState: {
		editor: EditorInput;
		group: IEditorGroup;
		state: ICodeEditorViewState | IDiffEditorViewState | undefined;
	} | undefined = undefined;

	constructor(private readonly editorService: IEditorService) { }

	set(): void {
		if (this._editorViewState) {
			return; // return early if already done
		}

		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane) {
			this._editorViewState = {
				group: activeEditorPane.group,
				editor: activeEditorPane.input,
				state: getIEditor(activeEditorPane.getControl())?.saveViewState() ?? undefined,
			};
		}
	}

	async restore(): Promise<void> {
		if (this._editorViewState) {
			const options: IEditorOptions = {
				viewState: this._editorViewState.state,
				preserveFocus: true /* import to not close the picker as a result */
			};

			await this._editorViewState.group.openEditor(this._editorViewState.editor, options);
		}
	}

	reset() {
		this._editorViewState = undefined;
	}
}
