/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import {isPromiseCanceledError} from 'vs/base/common/errors';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IMessageService} from 'vs/platform/message/common/message';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {IEditorActionDescriptorData, IRange} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {RenameProviderRegistry} from 'vs/editor/common/modes';
import {BulkEdit, createBulkEdit} from 'vs/editor/common/services/bulkEdit';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {rename} from '../common/rename';
import RenameInputField from './renameInputField';

// ---  register actions and commands

const CONTEXT_RENAME_INPUT_VISIBLE = 'renameInputVisible';

// ---- action implementation

export class RenameAction extends EditorAction {

	public static ID: string = 'editor.action.rename';

	private _messageService: IMessageService;
	private _eventService: IEventService;
	private _editorService: IEditorService;
	private _renameInputField: RenameInputField;
	private _renameInputVisible: IKeybindingContextKey<boolean>;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICodeEditor,
		@IMessageService messageService: IMessageService, @IKeybindingService keybindingService: IKeybindingService,
		@IEventService eventService: IEventService, @IEditorService editorService: IEditorService) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange);

		this._messageService = messageService;
		this._eventService = eventService;
		this._editorService = editorService;
		this._renameInputField = new RenameInputField(editor);
		this._renameInputVisible = keybindingService.createKey(CONTEXT_RENAME_INPUT_VISIBLE, false);
	}

	public getGroupId(): string {
		return '2_change/1_rename2';
	}

	public isSupported(): boolean {
		return RenameProviderRegistry.has(this.editor.getModel()) && !this.editor.getModel().hasEditableRange() && super.isSupported();
	}

	public getEnablementState(): boolean {
		return RenameProviderRegistry.has(this.editor.getModel());
	}

	public run(event?: any): TPromise<any> {

		const selection = this.editor.getSelection(),
			word = this.editor.getModel().getWordAtPosition(selection.getStartPosition());

		if (!word) {
			return;
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
			return this._prepareRename(newName).then(edit => {

				return edit.finish().then(selection => {
					this.editor.focus();
					if (selection) {
						this.editor.setSelection(selection);
					}
				});

			}, err => {
				if (typeof err === 'string') {
					this._messageService.show(Severity.Info, err);
				} else {
					return TPromise.wrapError(err);
				}
			});
		}, err => {
			this._renameInputVisible.reset();
			this.editor.focus();

			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
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
		let edit = createBulkEdit(this._eventService, this._editorService, <ICodeEditor>this.editor);

		return rename(this.editor.getModel(), this.editor.getPosition(), newName).then(result => {
			if (result.rejectReason) {
				return TPromise.wrapError(result.rejectReason);
			}
			edit.add(result.edits);
			return edit;
		});
	}
}

const weight = CommonEditorRegistry.commandWeight(99);

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(RenameAction, RenameAction.ID, nls.localize('rename.label', "Rename Symbol"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyCode.F2
}, 'Rename Symbol'));

CommonEditorRegistry.registerEditorCommand('acceptRenameInput', weight, { primary: KeyCode.Enter }, false, CONTEXT_RENAME_INPUT_VISIBLE, (ctx, editor, args) => {
	const action = <RenameAction>editor.getAction(RenameAction.ID);
	action.acceptRenameInput();
});

CommonEditorRegistry.registerEditorCommand('cancelRenameInput', weight, { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, false, CONTEXT_RENAME_INPUT_VISIBLE, (ctx, editor, args) => {
	const action = <RenameAction>editor.getAction(RenameAction.ID);
	action.cancelRenameInput();
});
