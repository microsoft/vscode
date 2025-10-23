/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, IActionOptions, registerEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { ICommand } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { BlockCommentCommand } from './blockCommentCommand.js';
import { LineCommentCommand, Type } from './lineCommentCommand.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

abstract class CommentLineAction extends EditorAction {

	private readonly _type: Type;

	constructor(type: Type, opts: IActionOptions) {
		super(opts);
		this._type = type;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);

		if (!editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const commands: ICommand[] = [];
		const modelOptions = model.getOptions();
		const commentsOptions = editor.getOption(EditorOption.comments);

		const selections = editor.getSelections().map((selection, index) => ({ selection, index, ignoreFirstLine: false }));
		selections.sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));

		// Remove selections that would result in copying the same line
		let prev = selections[0];
		for (let i = 1; i < selections.length; i++) {
			const curr = selections[i];
			if (prev.selection.endLineNumber === curr.selection.startLineNumber) {
				// these two selections would copy the same line
				if (prev.index < curr.index) {
					// prev wins
					curr.ignoreFirstLine = true;
				} else {
					// curr wins
					prev.ignoreFirstLine = true;
					prev = curr;
				}
			}
		}


		for (const selection of selections) {
			commands.push(new LineCommentCommand(
				languageConfigurationService,
				selection.selection,
				modelOptions.indentSize,
				this._type,
				commentsOptions.insertSpace,
				commentsOptions.ignoreEmptyLines,
				selection.ignoreFirstLine
			));
		}

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}

}

class ToggleCommentLineAction extends CommentLineAction {
	constructor() {
		super(Type.Toggle, {
			id: 'editor.action.commentLine',
			label: nls.localize2('comment.line', "Toggle Line Comment"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarEditMenu,
				group: '5_insert',
				title: nls.localize({ key: 'miToggleLineComment', comment: ['&& denotes a mnemonic'] }, "&&Toggle Line Comment"),
				order: 1
			}
		});
	}
}

class AddLineCommentAction extends CommentLineAction {
	constructor() {
		super(Type.ForceAdd, {
			id: 'editor.action.addCommentLine',
			label: nls.localize2('comment.line.add', "Add Line Comment"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

class RemoveLineCommentAction extends CommentLineAction {
	constructor() {
		super(Type.ForceRemove, {
			id: 'editor.action.removeCommentLine',
			label: nls.localize2('comment.line.remove', "Remove Line Comment"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

class BlockCommentAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.blockComment',
			label: nls.localize2('comment.block', "Toggle Block Comment"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarEditMenu,
				group: '5_insert',
				title: nls.localize({ key: 'miToggleBlockComment', comment: ['&& denotes a mnemonic'] }, "Toggle &&Block Comment"),
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);

		if (!editor.hasModel()) {
			return;
		}

		const commentsOptions = editor.getOption(EditorOption.comments);
		const commands: ICommand[] = [];
		const selections = editor.getSelections();
		for (const selection of selections) {
			commands.push(new BlockCommentCommand(selection, commentsOptions.insertSpace, languageConfigurationService));
		}

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}
}

registerEditorAction(ToggleCommentLineAction);
registerEditorAction(AddLineCommentAction);
registerEditorAction(RemoveLineCommentAction);
registerEditorAction(BlockCommentAction);
