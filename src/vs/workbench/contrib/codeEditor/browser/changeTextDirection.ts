/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, ServicesAccessor, registerEditorAction, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';

const transientTextDirectionState = 'transientTextDirectionState';

/**
 * State written/read by the change text direction action and associated with a particular model.
 *
 * The direction of a file is not a property of its language: a repository holds an English README
 * and an Arabic guide, both Markdown. So this is per model and in memory, like the word wrap
 * override next door - the setting stays the place to express a lasting preference, and this
 * command never writes to it.
 */
export interface ITextDirectionTransientState {
	readonly textDirectionOverride: 'auto' | 'ltr' | 'rtl';
}

export function writeTransientState(model: ITextModel, state: ITextDirectionTransientState | null, codeEditorService: ICodeEditorService): void {
	codeEditorService.setTransientModelProperty(model, transientTextDirectionState, state);
}

export function readTransientState(model: ITextModel, codeEditorService: ICodeEditorService): ITextDirectionTransientState | null {
	return codeEditorService.getTransientModelProperty(model, transientTextDirectionState) as ITextDirectionTransientState | null;
}

const CHANGE_TEXT_DIRECTION_ID = 'editor.action.changeTextDirection';

class ChangeTextDirectionAction extends EditorAction {

	constructor() {
		super({
			id: CHANGE_TEXT_DIRECTION_ID,
			label: nls.localize2('changeTextDirection', "View: Change Editor Text Direction"),
			precondition: undefined,
			metadata: {
				description: nls.localize2('changeTextDirection.description', "Cycle the direction of the active editor between the direction set for it, right-to-left, and left-to-right. The change applies to this file only and is not saved."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const languageService = accessor.get(ILanguageService);

		if (!canChangeTextDirection(editor)) {
			return;
		}

		const model = editor.getModel();
		const current = readTransientState(model, codeEditorService);

		// Three states, back to the start: whatever the settings say, then right-to-left, then
		// left-to-right. A cycle rather than a toggle because a file can want either direction
		// against its language, and because a toggle would quietly discard an explicit `ltr`.
		let next: ITextDirectionTransientState | null;
		switch (current?.textDirectionOverride) {
			case undefined: next = { textDirectionOverride: 'rtl' }; break;
			case 'rtl': next = { textDirectionOverride: 'ltr' }; break;
			default: next = null; break;
		}

		writeTransientState(model, next, codeEditorService);

		const languageName = languageService.getLanguageName(model.getLanguageId()) ?? model.getLanguageId();
		alert(
			next === null
				? nls.localize('changeTextDirection.inherit', "This file follows the direction set for {0}", languageName)
				: next.textDirectionOverride === 'rtl'
					? nls.localize('changeTextDirection.rtl', "This file is now laid out right-to-left")
					: nls.localize('changeTextDirection.ltr', "This file is now laid out left-to-right")
		);
	}
}

class ChangeTextDirectionController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.changeTextDirectionController';

	constructor(
		private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		this._register(_editor.onDidChangeModel(() => this._ensureTextDirection()));
		this._register(_codeEditorService.onDidChangeTransientModelProperty(() => this._ensureTextDirection()));
	}

	private _ensureTextDirection(): void {
		if (!canChangeTextDirection(this._editor)) {
			return;
		}
		const state = readTransientState(this._editor.getModel(), this._codeEditorService);
		this._editor.updateOptions({
			textDirectionOverride: state ? state.textDirectionOverride : 'inherit'
		});
	}
}

function canChangeTextDirection(editor: ICodeEditor | null): editor is IActiveCodeEditor {
	if (!editor || editor.isSimpleWidget) {
		return false;
	}
	return !!editor.getModel();
}

registerEditorContribution(ChangeTextDirectionController.ID, ChangeTextDirectionController, EditorContributionInstantiation.Eager); // eager because it needs to change the editor text direction configuration
registerEditorAction(ChangeTextDirectionAction);

// View menu, next to Word Wrap: the two are the same kind of per-file view choice.
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	command: {
		id: CHANGE_TEXT_DIRECTION_ID,
		title: nls.localize({ key: 'miChangeTextDirection', comment: ['&& denotes a mnemonic'] }, "Text &&Direction"),
	},
	order: 2,
	group: '6_editor'
});
