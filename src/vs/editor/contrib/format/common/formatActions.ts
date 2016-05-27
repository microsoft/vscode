/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry} from 'vs/editor/common/modes';
import {getOnTypeFormattingEdits, getDocumentFormattingEdits, getDocumentRangeFormattingEdits} from '../common/format';
import {EditOperationsCommand} from './formatCommand';
import {Selection} from 'vs/editor/common/core/selection';

class FormatOnType implements editorCommon.IEditorContribution {

	public static ID = 'editor.contrib.autoFormat';

	private editor: editorCommon.ICommonCodeEditor;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: editorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelMode(() => this.update()));
		this.callOnDispose.push(OnTypeFormattingEditProviderRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.formatOnType) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		var model = this.editor.getModel();

		// no support
		var [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.autoFormatTriggerCharacters) {
			return;
		}

		// register typing listeners that will trigger the format
		support.autoFormatTriggerCharacters.forEach(ch => {
			this.callOnModel.push(this.editor.addTypingListener(ch, this.trigger.bind(this, ch)));
		});
	}

	private trigger(ch: string): void {

		if (this.editor.getSelections().length > 1) {
			return;
		}

		var model = this.editor.getModel(),
			position = this.editor.getPosition(),
			canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. Iff so, we won't
		// apply the format edits
		var unbind = this.editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
			if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
				// a model.setValue() was called
				canceled = true;
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLineChanged) {
				var changedLine = (<editorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				canceled = changedLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesInserted) {
				var insertLine = (<editorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				canceled = insertLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesDeleted) {
				var deleteLine2 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				canceled = deleteLine2 <= position.lineNumber;
			}

			if (canceled) {
				// cancel only once
				unbind.dispose();
			}
		});

		let modelOpts = model.getOptions();

		getOnTypeFormattingEdits(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {

			unbind.dispose();

			if (canceled || arrays.isFalsyOrEmpty(edits)) {
				return;
			}

			this.editor.executeCommand(this.getId(), new EditOperationsCommand(edits, this.editor.getSelection()));

		},(err) => {
			unbind.dispose();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

export class FormatAction extends EditorAction {

	public static ID = 'editor.action.format';

	private _disposables: IDisposable[];

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.UpdateOnModelChange | Behaviour.ShowInContextMenu);
		this._disposables = [
			DocumentFormattingEditProviderRegistry.onDidChange(() => this.resetEnablementState()),
			DocumentRangeFormattingEditProviderRegistry.onDidChange(() => this.resetEnablementState())
		];
	}

	public dispose() {
		super.dispose();
		this._disposables = dispose(this._disposables);
	}

	public getGroupId(): string {
		return '2_change/2_format';
	}

	public isSupported(): boolean {
		return (
			(
				DocumentFormattingEditProviderRegistry.has(this.editor.getModel())
				|| DocumentRangeFormattingEditProviderRegistry.has(this.editor.getModel())
			)
			&& super.isSupported()
		);
	}

	public run(): TPromise<boolean> {

		const model = this.editor.getModel(),
			editorSelection = this.editor.getSelection(),
			modelOpts = model.getOptions(),
			options = {
				tabSize: modelOpts.tabSize,
				insertSpaces: modelOpts.insertSpaces,
			};

		let formattingPromise: TPromise<editorCommon.ISingleEditOperation[]>;

		if (editorSelection.isEmpty()) {
			formattingPromise = getDocumentFormattingEdits(model, options);
		} else {
			formattingPromise = getDocumentRangeFormattingEdits(model, editorSelection, options);
		}

		if (!formattingPromise) {
			return TPromise.as(false);
		}

		// Capture the state of the editor
		var state = this.editor.captureState(editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then((result: editorCommon.ISingleEditOperation[]) => {

			if (!state.validate(this.editor)) {
				return false;
			}

			if (!result || result.length === 0) {
				return false;
			}

			this.apply(this.editor, editorSelection, result);
			this.editor.focus();
			return true;
		});
	}

	public apply(editor: editorCommon.ICommonCodeEditor, editorSelection: Selection, value: editorCommon.ISingleEditOperation[]): void {
		var state: editorCommon.IEditorViewState = null;

		if (editorSelection.isEmpty()) {
			state = editor.saveViewState();
		}
		var command = new EditOperationsCommand(value, editorSelection);
		editor.executeCommand(this.id, command);

		if (state) {
			editor.restoreViewState(state);
		}
	}
}

// register action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FormatAction, FormatAction.ID, nls.localize('formatAction.label', "Format Code"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
	linux: { primary:KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
}, 'Format Code'));
CommonEditorRegistry.registerEditorContribution(FormatOnType);