/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerEditorAction, ServicesAccessor, EditorAction, registerEditorContribution, IActionOptions } from 'vs/editor/browser/editorExtensions';
import { OnTypeFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { getOnTypeFormattingEdits, getDocumentFormattingEdits, getDocumentRangeFormattingEdits, NoProviderError } from 'vs/editor/contrib/format/format';
import { EditOperationsCommand } from 'vs/editor/contrib/format/formatCommand';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import { Range } from 'vs/editor/common/core/range';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISingleEditOperation } from 'vs/editor/common/model';
import { INotificationService } from 'vs/platform/notification/common/notification';


function alertFormattingEdits(edits: ISingleEditOperation[]): void {

	edits = edits.filter(edit => edit.range);
	if (!edits.length) {
		return;
	}

	let { range } = edits[0];
	for (let i = 1; i < edits.length; i++) {
		range = Range.plusRange(range, edits[i].range);
	}
	const { startLineNumber, endLineNumber } = range;
	if (startLineNumber === endLineNumber) {
		if (edits.length === 1) {
			alert(nls.localize('hint11', "Made 1 formatting edit on line {0}", startLineNumber));
		} else {
			alert(nls.localize('hintn1', "Made {0} formatting edits on line {1}", edits.length, startLineNumber));
		}
	} else {
		if (edits.length === 1) {
			alert(nls.localize('hint1n', "Made 1 formatting edit between lines {0} and {1}", startLineNumber, endLineNumber));
		} else {
			alert(nls.localize('hintnn', "Made {0} formatting edits between lines {1} and {2}", edits.length, startLineNumber, endLineNumber));
		}
	}
}

class FormatOnType implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.autoFormat';

	private editor: ICodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
		this.editor = editor;
		this.workerService = workerService;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
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
		let triggerChars = new CharacterSet();
		for (let ch of support.autoFormatTriggerCharacters) {
			triggerChars.add(ch.charCodeAt(0));
		}
		this.callOnModel.push(this.editor.onDidType((text: string) => {
			let lastCharCode = text.charCodeAt(text.length - 1);
			if (triggerChars.has(lastCharCode)) {
				this.trigger(String.fromCharCode(lastCharCode));
			}
		}));
	}

	private trigger(ch: string): void {

		if (this.editor.getSelections().length > 1) {
			return;
		}

		var model = this.editor.getModel(),
			position = this.editor.getPosition(),
			canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. If so, we won't
		// apply the format edits
		var unbind = this.editor.onDidChangeModelContent((e) => {
			if (e.isFlush) {
				// a model.setValue() was called
				// cancel only once
				canceled = true;
				unbind.dispose();
				return;
			}

			for (let i = 0, len = e.changes.length; i < len; i++) {
				const change = e.changes[i];
				if (change.range.endLineNumber <= position.lineNumber) {
					// cancel only once
					canceled = true;
					unbind.dispose();
					return;
				}
			}

		});

		let modelOpts = model.getOptions();

		getOnTypeFormattingEdits(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {
			return this.workerService.computeMoreMinimalEdits(model.uri, edits);
		}).then(edits => {

			unbind.dispose();

			if (canceled || isFalsyOrEmpty(edits)) {
				return;
			}

			EditOperationsCommand.executeAsCommand(this.editor, edits);
			alertFormattingEdits(edits);

		}, (err) => {
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

class FormatOnPaste implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.formatOnPaste';

	private editor: ICodeEditor;
	private workerService: IEditorWorkerService;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor, @IEditorWorkerService workerService: IEditorWorkerService) {
		this.editor = editor;
		this.workerService = workerService;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
		this.callOnDispose.push(DocumentRangeFormattingEditProviderRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.formatOnPaste) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		let model = this.editor.getModel();

		// no support
		let [support] = DocumentRangeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.provideDocumentRangeFormattingEdits) {
			return;
		}

		this.callOnModel.push(this.editor.onDidPaste((range: Range) => {
			this.trigger(range);
		}));
	}

	private trigger(range: Range): void {
		if (this.editor.getSelections().length > 1) {
			return;
		}

		const model = this.editor.getModel();
		const { tabSize, insertSpaces } = model.getOptions();
		const state = new EditorState(this.editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);

		getDocumentRangeFormattingEdits(model, range, { tabSize, insertSpaces }).then(edits => {
			return this.workerService.computeMoreMinimalEdits(model.uri, edits);
		}).then(edits => {
			if (!state.validate(this.editor) || isFalsyOrEmpty(edits)) {
				return;
			}
			EditOperationsCommand.execute(this.editor, edits);
			alertFormattingEdits(edits);
		});
	}

	public getId(): string {
		return FormatOnPaste.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

export abstract class AbstractFormatAction extends EditorAction {

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<void> {

		const workerService = accessor.get(IEditorWorkerService);
		const notificationService = accessor.get(INotificationService);

		const formattingPromise = this._getFormattingEdits(editor);
		if (!formattingPromise) {
			return TPromise.as(void 0);
		}

		// Capture the state of the editor
		const state = new EditorState(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then(edits => workerService.computeMoreMinimalEdits(editor.getModel().uri, edits)).then(edits => {
			if (!state.validate(editor) || isFalsyOrEmpty(edits)) {
				return;
			}

			EditOperationsCommand.execute(editor, edits);
			alertFormattingEdits(edits);
			editor.focus();
		}, err => {
			if (err instanceof Error && err.name === NoProviderError.Name) {
				this._notifyNoProviderError(notificationService, editor.getModel().getLanguageIdentifier().language);
			} else {
				throw err;
			}
		});
	}

	protected abstract _getFormattingEdits(editor: ICodeEditor): TPromise<ISingleEditOperation[]>;
	protected _notifyNoProviderError(notificationService: INotificationService, language: string): void {
		notificationService.info(nls.localize('no.provider', "There is no formatter for '{0}'-files installed.", language));
	}
}

export class FormatDocumentAction extends AbstractFormatAction {

	constructor() {
		super({
			id: 'editor.action.formatDocument',
			label: nls.localize('formatDocument.label', "Format Document"),
			alias: 'Format Document',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				// secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_D)],
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
			},
			menuOpts: {
				when: EditorContextKeys.hasDocumentFormattingProvider,
				group: '1_modification',
				order: 1.3
			}
		});
	}

	protected _getFormattingEdits(editor: ICodeEditor): TPromise<ISingleEditOperation[]> {
		const model = editor.getModel();
		const { tabSize, insertSpaces } = model.getOptions();
		return getDocumentFormattingEdits(model, { tabSize, insertSpaces });
	}

	protected _notifyNoProviderError(notificationService: INotificationService, language: string): void {
		notificationService.info(nls.localize('no.documentprovider', "There is no document formatter for '{0}'-files installed.", language));
	}
}

export class FormatSelectionAction extends AbstractFormatAction {

	constructor() {
		super({
			id: 'editor.action.formatSelection',
			label: nls.localize('formatSelection.label', "Format Selection"),
			alias: 'Format Code',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_F)
			},
			menuOpts: {
				when: ContextKeyExpr.and(EditorContextKeys.hasDocumentSelectionFormattingProvider, EditorContextKeys.hasNonEmptySelection),
				group: '1_modification',
				order: 1.31
			}
		});
	}

	protected _getFormattingEdits(editor: ICodeEditor): TPromise<ISingleEditOperation[]> {
		const model = editor.getModel();
		const { tabSize, insertSpaces } = model.getOptions();
		return getDocumentRangeFormattingEdits(model, editor.getSelection(), { tabSize, insertSpaces });
	}

	protected _notifyNoProviderError(notificationService: INotificationService, language: string): void {
		notificationService.info(nls.localize('no.selectionprovider', "There is no selection formatter for '{0}'-files installed.", language));
	}
}

registerEditorContribution(FormatOnType);
registerEditorContribution(FormatOnPaste);
registerEditorAction(FormatDocumentAction);
registerEditorAction(FormatSelectionAction);

// this is the old format action that does both (format document OR format selection)
// and we keep it here such that existing keybinding configurations etc will still work
CommandsRegistry.registerCommand('editor.action.format', accessor => {
	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor) {
		return new class extends AbstractFormatAction {
			constructor() {
				super({} as IActionOptions);
			}
			_getFormattingEdits(editor: ICodeEditor): TPromise<ISingleEditOperation[]> {
				const model = editor.getModel();
				const editorSelection = editor.getSelection();
				const { tabSize, insertSpaces } = model.getOptions();

				return editorSelection.isEmpty()
					? getDocumentFormattingEdits(model, { tabSize, insertSpaces })
					: getDocumentRangeFormattingEdits(model, editorSelection, { tabSize, insertSpaces });
			}
		}().run(accessor, editor);
	}
	return undefined;
});
