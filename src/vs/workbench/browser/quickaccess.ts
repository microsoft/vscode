/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls';
import { ContextKeyExpr, RawContextKey } from '../../platform/contextkey/common/contextkey';
import { ICommandHandler } from '../../platform/commands/common/commands';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput';
import { Disposable } from '../../base/common/lifecycle';
import { getIEditor } from '../../editor/browser/editorBrowser';
import { ICodeEditorViewState, IDiffEditorViewState } from '../../editor/common/editorCommon';
import { IResourceEditorInput, ITextResourceEditorInput } from '../../platform/editor/common/editor';
import { EditorInput } from '../common/editor/editorInput';
import { IEditorGroup, IEditorGroupsService } from '../services/editor/common/editorGroupsService';
import { ACTIVE_GROUP_TYPE, AUX_WINDOW_GROUP_TYPE, IEditorService, SIDE_GROUP_TYPE } from '../services/editor/common/editorService';
import { IUntitledTextResourceEditorInput, IUntypedEditorInput, GroupIdentifier, IEditorPane } from '../common/editor';

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
export class PickerEditorState extends Disposable {
	private _editorViewState: {
		editor: EditorInput;
		group: IEditorGroup;
		state: ICodeEditorViewState | IDiffEditorViewState | undefined;
	} | undefined = undefined;

	private readonly openedTransientEditors = new Set<EditorInput>(); // editors that were opened between set and restore

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super();
	}

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

	/**
	 * Open a transient editor such that it may be closed when the state is restored.
	 * Note that, when the state is restored, if the editor is no longer transient, it will not be closed.
	 */
	async openTransientEditor(editor: IResourceEditorInput | ITextResourceEditorInput | IUntitledTextResourceEditorInput | IUntypedEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<IEditorPane | undefined> {
		editor.options = { ...editor.options, transient: true };

		const editorPane = await this.editorService.openEditor(editor, group);
		if (editorPane?.input && editorPane.input !== this._editorViewState?.editor && editorPane.group.isTransient(editorPane.input)) {
			this.openedTransientEditors.add(editorPane.input);
		}

		return editorPane;
	}

	async restore(): Promise<void> {
		if (this._editorViewState) {
			for (const editor of this.openedTransientEditors) {
				if (editor.isDirty()) {
					continue;
				}

				for (const group of this.editorGroupsService.groups) {
					if (group.isTransient(editor)) {
						await group.closeEditor(editor, { preserveFocus: true });
					}
				}
			}

			await this._editorViewState.group.openEditor(this._editorViewState.editor, {
				viewState: this._editorViewState.state,
				preserveFocus: true // important to not close the picker as a result
			});

			this.reset();
		}
	}

	reset() {
		this._editorViewState = undefined;
		this.openedTransientEditors.clear();
	}

	override dispose(): void {
		super.dispose();

		this.reset();
	}
}
