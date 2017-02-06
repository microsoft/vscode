/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileService } from 'vs/platform/files/common/files';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IMessageService } from 'vs/platform/message/common/message';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IRange, ICommonCodeEditor, EditorContextKeys, ModeContextKeys, IEditorContribution } from 'vs/editor/common/editorCommon';
import { BulkEdit, createBulkEdit } from 'vs/editor/common/services/bulkEdit';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { rename } from '../common/rename';
import RenameInputField from './renameInputField';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { optional } from 'vs/platform/instantiation/common/instantiation';

// ---  register actions and commands

const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false);

@editorContribution
class RenameController implements IEditorContribution {

	private static ID = 'editor.contrib.renameController';

	public static get(editor: ICommonCodeEditor): RenameController {
		return editor.getContribution<RenameController>(RenameController.ID);
	}

	private _renameInputField: RenameInputField;
	private _renameInputVisible: IContextKey<boolean>;

	constructor(
		private editor: ICodeEditor,
		@IMessageService private _messageService: IMessageService,
		@ITextModelResolverService private _textModelResolverService: ITextModelResolverService,
		@IProgressService private _progressService: IProgressService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@optional(IFileService) private _fileService: IFileService
	) {
		this._renameInputField = new RenameInputField(editor);
		this._renameInputVisible = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
	}

	public dispose(): void {
		this._renameInputField.dispose();
	}

	public getId(): string {
		return RenameController.ID;
	}

	public run(): TPromise<void> {

		const selection = this.editor.getSelection(),
			word = this.editor.getModel().getWordAtPosition(selection.getStartPosition());

		if (!word) {
			return undefined;
		}

		let lineNumber = selection.startLineNumber,
			selectionStart = 0,
			selectionEnd = word.word.length,
			wordRange: IRange;

		wordRange = {
			startLineNumber: lineNumber,
			startColumn: word.startColumn,
			endLineNumber: lineNumber,
			endColumn: word.endColumn
		};

		if (!selection.isEmpty() && selection.startLineNumber === selection.endLineNumber) {
			selectionStart = Math.max(0, selection.startColumn - word.startColumn);
			selectionEnd = Math.min(word.endColumn, selection.endColumn) - word.startColumn;
		}

		this._renameInputVisible.set(true);
		return this._renameInputField.getInput(wordRange, word.word, selectionStart, selectionEnd).then(newName => {
			this._renameInputVisible.reset();
			this.editor.focus();

			const renameOperation = this._prepareRename(newName).then(edit => {

				return edit.finish().then(selection => {
					if (selection) {
						this.editor.setSelection(selection);
					}
				});

			}, err => {
				if (typeof err === 'string') {
					this._messageService.show(Severity.Info, err);
					return undefined;
				} else {
					this._messageService.show(Severity.Error, nls.localize('rename.failed', "Sorry, rename failed to execute."));
					return TPromise.wrapError(err);
				}
			});

			this._progressService.showWhile(renameOperation, 250);
			return renameOperation;

		}, err => {
			this._renameInputVisible.reset();
			this.editor.focus();

			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
			return undefined;
		});
	}

	public acceptRenameInput(): void {
		this._renameInputField.acceptInput();
	}

	public cancelRenameInput(): void {
		this._renameInputField.cancelInput();
	}

	private _prepareRename(newName: string): TPromise<BulkEdit> {

		// start recording of file changes so that we can figure out if a file that
		// is to be renamed conflicts with another (concurrent) modification
		let edit = createBulkEdit(this._textModelResolverService, <ICodeEditor>this.editor, this._fileService);

		return rename(this.editor.getModel(), this.editor.getPosition(), newName).then(result => {
			if (result.rejectReason) {
				return TPromise.wrapError(result.rejectReason);
			}
			edit.add(result.edits);
			return edit;
		});
	}
}

// ---- action implementation

@editorAction
export class RenameAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.rename',
			label: nls.localize('rename.label', "Rename Symbol"),
			alias: 'Rename Symbol',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasRenameProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyCode.F2
			},
			menuOpts: {
				group: '1_modification',
				order: 1.1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		let controller = RenameController.get(editor);
		if (controller) {
			return controller.run();
		}
		return undefined;
	}
}

const RenameCommand = EditorCommand.bindToContribution<RenameController>(RenameController.get);

CommonEditorRegistry.registerEditorCommand(new RenameCommand({
	id: 'acceptRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.acceptRenameInput(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(99),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.Enter
	}
}));

CommonEditorRegistry.registerEditorCommand(new RenameCommand({
	id: 'cancelRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.cancelRenameInput(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(99),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
