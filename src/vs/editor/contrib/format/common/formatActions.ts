/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IDisposable, cAll, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {FormatOnTypeRegistry, FormatRegistry, formatAfterKeystroke, formatDocument, formatRange} from '../common/format';
import {EditOperationsCommand} from './formatCommand';

interface IFormatOnTypeResult {
	range: editorCommon.IEditorRange;
	id: string;
	lineText: string;
}

class FormatOnType implements editorCommon.IEditorContribution {

	public static ID = 'editor.contrib.autoFormat';

	private editor: editorCommon.ICommonCodeEditor;
	private callOnDispose: IDisposable[];
	private callOnModel: Function[];

	constructor(editor: editorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.addListener2(editorCommon.EventType.ConfigurationChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(editorCommon.EventType.ModelChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(editorCommon.EventType.ModelModeChanged, () => this.update()));
		this.callOnDispose.push(editor.addListener2(editorCommon.EventType.ModelModeSupportChanged,(e: editorCommon.IModeSupportChangedEvent) => {
			if (e.formattingSupport) {
				this.update();
			}
		}));
		this.callOnDispose.push(FormatOnTypeRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = cAll(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().formatOnType) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		var model = this.editor.getModel();

		// no support
		var [support] = FormatOnTypeRegistry.ordered(model);
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
		var unbind = this.editor.addListener(editorCommon.EventType.ModelContentChanged,(e: editorCommon.IModelContentChangedEvent) => {
			if (e.changeType === editorCommon.EventType.ModelContentChangedFlush) {
				// a model.setValue() was called
				canceled = true;
			} else if (e.changeType === editorCommon.EventType.ModelContentChangedLineChanged) {
				var changedLine = (<editorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				canceled = changedLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelContentChangedLinesInserted) {
				var insertLine = (<editorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				canceled = insertLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelContentChangedLinesDeleted) {
				var deleteLine2 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				canceled = deleteLine2 <= position.lineNumber;
			}

			if (canceled) {
				// cancel only once
				unbind();
			}
		});

		let modelOpts = model.getOptions();

		formatAfterKeystroke(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {

			unbind();

			if (canceled || arrays.isFalsyOrEmpty(edits)) {
				return;
			}

			this.editor.executeCommand(this.getId(), new EditOperationsCommand(edits, this.editor.getSelection()));

		},(err) => {
			unbind();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this.callOnDispose = disposeAll(this.callOnDispose);
		while (this.callOnModel.length > 0) {
			this.callOnModel.pop()();
		}
	}
}

export class FormatAction extends EditorAction {

	public static ID = 'editor.action.format';

	private _disposable: IDisposable;

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.UpdateOnModelChange | Behaviour.ShowInContextMenu);
		this._disposable = FormatRegistry.onDidChange(() => this.resetEnablementState());
	}

	public dispose() {
		super.dispose();
		this._disposable.dispose();
	}

	public getGroupId(): string {
		return '2_change/2_format';
	}

	public isSupported(): boolean {
		return FormatRegistry.has(this.editor.getModel()) && super.isSupported();
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
			formattingPromise = formatDocument(model, options);
		} else {
			formattingPromise = formatRange(model, editorSelection, options);
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

	public apply(editor: editorCommon.ICommonCodeEditor, editorSelection: editorCommon.IEditorSelection, value: editorCommon.ISingleEditOperation[]): void {
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
}));
CommonEditorRegistry.registerEditorContribution(FormatOnType);