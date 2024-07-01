/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ISettableObservable, autorun, constObservable, disposableObservableValue, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { GhostTextWidget } from 'vs/editor/contrib/inlineEdit/browser/ghostTextWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IInlineEdit, InlineEditTriggerKind } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { InlineEditHintsWidget } from 'vs/editor/contrib/inlineEdit/browser/inlineEditHintsWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { createStyleSheet2 } from 'vs/base/browser/dom';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

export class InlineEditWidget implements IDisposable {
	constructor(public readonly widget: GhostTextWidget, public readonly edit: IInlineEdit) { }

	dispose(): void {
		this.widget.dispose();
	}
}

export class InlineEditController extends Disposable {
	static ID = 'editor.contrib.inlineEditController';

	public static readonly inlineEditVisibleKey = 'inlineEditVisible';
	public static readonly inlineEditVisibleContext = new RawContextKey<boolean>(InlineEditController.inlineEditVisibleKey, false);
	private _isVisibleContext = InlineEditController.inlineEditVisibleContext.bindTo(this.contextKeyService);

	public static readonly cursorAtInlineEditKey = 'cursorAtInlineEdit';
	public static readonly cursorAtInlineEditContext = new RawContextKey<boolean>(InlineEditController.cursorAtInlineEditKey, false);
	private _isCursorAtInlineEditContext = InlineEditController.cursorAtInlineEditContext.bindTo(this.contextKeyService);

	public static get(editor: ICodeEditor): InlineEditController | null {
		return editor.getContribution<InlineEditController>(InlineEditController.ID);
	}

	private _currentEdit: ISettableObservable<InlineEditWidget | undefined> = this._register(disposableObservableValue(this, undefined));
	private _currentRequestCts: CancellationTokenSource | undefined;

	private _jumpBackPosition: Position | undefined;
	private _isAccepting: ISettableObservable<boolean> = observableValue(this, false);

	private readonly _enabled = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineEdit).enabled);
	private readonly _fontFamily = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineEdit).fontFamily);
	private readonly _backgroundColoring = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineEdit).backgroundColoring);


	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		//Automatically request inline edit when the content was changed
		//Cancel the previous request if there is one
		//Remove the previous ghost text
		const modelChangedSignal = observableSignalFromEvent('InlineEditController.modelContentChangedSignal', editor.onDidChangeModelContent);
		this._register(autorun(reader => {
			/** @description InlineEditController.modelContentChanged model */
			if (!this._enabled.read(reader)) {
				return;
			}
			modelChangedSignal.read(reader);
			if (this._isAccepting.read(reader)) {
				return;
			}
			this.getInlineEdit(editor, true);
		}));

		//Check if the cursor is at the ghost text
		const cursorPosition = observableFromEvent(this, editor.onDidChangeCursorPosition, () => editor.getPosition());
		this._register(autorun(reader => {
			/** @description InlineEditController.cursorPositionChanged model */
			if (!this._enabled.read(reader)) {
				return;
			}

			const pos = cursorPosition.read(reader);
			if (pos) {
				this.checkCursorPosition(pos);
			}
		}));

		//Perform stuff when the current edit has changed
		this._register(autorun((reader) => {
			/** @description InlineEditController.update model */
			const currentEdit = this._currentEdit.read(reader);
			this._isCursorAtInlineEditContext.set(false);
			if (!currentEdit) {
				this._isVisibleContext.set(false);
				return;
			}
			this._isVisibleContext.set(true);
			const pos = editor.getPosition();
			if (pos) {
				this.checkCursorPosition(pos);
			}
		}));

		//Clear suggestions on lost focus
		const editorBlurSingal = observableSignalFromEvent('InlineEditController.editorBlurSignal', editor.onDidBlurEditorWidget);
		this._register(autorun(async reader => {
			/** @description InlineEditController.editorBlur */
			if (!this._enabled.read(reader)) {
				return;
			}
			editorBlurSingal.read(reader);
			// This is a hidden setting very useful for debugging
			if (this._configurationService.getValue('editor.experimentalInlineEdit.keepOnBlur') || editor.getOption(EditorOption.inlineEdit).keepOnBlur) {
				return;
			}
			this._currentRequestCts?.dispose(true);
			this._currentRequestCts = undefined;
			await this.clear(false);
		}));

		//Invoke provider on focus
		const editorFocusSignal = observableSignalFromEvent('InlineEditController.editorFocusSignal', editor.onDidFocusEditorText);
		this._register(autorun(reader => {
			/** @description InlineEditController.editorFocus */
			if (!this._enabled.read(reader)) {
				return;
			}
			editorFocusSignal.read(reader);
			this.getInlineEdit(editor, true);
		}));


		//handle changes of font setting
		const styleElement = this._register(createStyleSheet2());
		this._register(autorun(reader => {
			const fontFamily = this._fontFamily.read(reader);
			styleElement.setStyle(fontFamily === '' || fontFamily === 'default' ? `` : `
.monaco-editor .inline-edit-decoration,
.monaco-editor .inline-edit-decoration-preview,
.monaco-editor .inline-edit {
	font-family: ${fontFamily};
}`);
		}));

		this._register(new InlineEditHintsWidget(this.editor, this._currentEdit, this.instantiationService));
	}

	private checkCursorPosition(position: Position) {
		if (!this._currentEdit) {
			this._isCursorAtInlineEditContext.set(false);
			return;
		}
		const gt = this._currentEdit.get()?.edit;
		if (!gt) {
			this._isCursorAtInlineEditContext.set(false);
			return;
		}
		this._isCursorAtInlineEditContext.set(Range.containsPosition(gt.range, position));
	}

	private validateInlineEdit(editor: ICodeEditor, edit: IInlineEdit): boolean {
		//Multiline inline replacing edit must replace whole lines
		if (edit.text.includes('\n') && edit.range.startLineNumber !== edit.range.endLineNumber && edit.range.startColumn !== edit.range.endColumn) {
			const firstColumn = edit.range.startColumn;
			if (firstColumn !== 1) {
				return false;
			}
			const lastLine = edit.range.endLineNumber;
			const lastColumn = edit.range.endColumn;
			const lineLength = editor.getModel()?.getLineLength(lastLine) ?? 0;
			if (lastColumn !== lineLength + 1) {
				return false;
			}
		}
		return true;
	}

	private async fetchInlineEdit(editor: ICodeEditor, auto: boolean): Promise<IInlineEdit | undefined> {
		if (this._currentRequestCts) {
			this._currentRequestCts.dispose(true);
		}
		const model = editor.getModel();
		if (!model) {
			return;
		}
		const modelVersion = model.getVersionId();
		const providers = this.languageFeaturesService.inlineEditProvider.all(model);
		if (providers.length === 0) {
			return;
		}
		const provider = providers[0];
		this._currentRequestCts = new CancellationTokenSource();
		const token = this._currentRequestCts.token;
		const triggerKind = auto ? InlineEditTriggerKind.Automatic : InlineEditTriggerKind.Invoke;
		const shouldDebounce = auto;
		if (shouldDebounce) {
			await wait(50, token);
		}
		if (token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== modelVersion) {
			return;
		}
		const edit = await provider.provideInlineEdit(model, { triggerKind }, token);
		if (!edit) {
			return;
		}
		if (token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== modelVersion) {
			return;
		}
		if (!this.validateInlineEdit(editor, edit)) {
			return;
		}
		return edit;
	}

	private async getInlineEdit(editor: ICodeEditor, auto: boolean) {
		this._isCursorAtInlineEditContext.set(false);
		await this.clear();
		const edit = await this.fetchInlineEdit(editor, auto);
		if (!edit) {
			return;
		}
		const line = edit.range.endLineNumber;
		const column = edit.range.endColumn;
		const textToDisplay = edit.text.endsWith('\n') && !(edit.range.startLineNumber === edit.range.endLineNumber && edit.range.startColumn === edit.range.endColumn) ? edit.text.slice(0, -1) : edit.text;
		const ghostText = new GhostText(line, [new GhostTextPart(column, textToDisplay, false)]);
		const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
			ghostText: constObservable(ghostText),
			minReservedLineCount: constObservable(0),
			targetTextModel: constObservable(this.editor.getModel() ?? undefined),
			range: constObservable(edit.range),
			backgroundColoring: this._backgroundColoring
		});
		this._currentEdit.set(new InlineEditWidget(instance, edit), undefined);
	}

	public async trigger() {
		await this.getInlineEdit(this.editor, false);
	}

	public async jumpBack() {
		if (!this._jumpBackPosition) {
			return;
		}
		this.editor.setPosition(this._jumpBackPosition);
		//if position is outside viewports, scroll to it
		this.editor.revealPositionInCenterIfOutsideViewport(this._jumpBackPosition);
	}

	public async accept() {
		this._isAccepting.set(true, undefined);
		const data = this._currentEdit.get()?.edit;
		if (!data) {
			return;
		}

		//It should only happen in case of last line suggestion
		let text = data.text;
		if (data.text.startsWith('\n')) {
			text = data.text.substring(1);
		}
		this.editor.pushUndoStop();
		this.editor.executeEdits('acceptCurrent', [EditOperation.replace(Range.lift(data.range), text)]);
		if (data.accepted) {
			await this._commandService
				.executeCommand(data.accepted.id, ...(data.accepted.arguments || []))
				.then(undefined, onUnexpectedExternalError);
		}
		this.freeEdit(data);
		transaction((tx) => {
			this._currentEdit.set(undefined, tx);
			this._isAccepting.set(false, tx);
		});
	}

	public jumpToCurrent(): void {
		this._jumpBackPosition = this.editor.getSelection()?.getStartPosition();

		const data = this._currentEdit.get()?.edit;
		if (!data) {
			return;
		}
		const position = Position.lift({ lineNumber: data.range.startLineNumber, column: data.range.startColumn });
		this.editor.setPosition(position);
		//if position is outside viewports, scroll to it
		this.editor.revealPositionInCenterIfOutsideViewport(position);
	}

	public async clear(sendRejection: boolean = true) {
		const edit = this._currentEdit.get()?.edit;
		if (edit && edit?.rejected && sendRejection) {
			await this._commandService
				.executeCommand(edit.rejected.id, ...(edit.rejected.arguments || []))
				.then(undefined, onUnexpectedExternalError);
		}
		if (edit) {
			this.freeEdit(edit);
		}
		this._currentEdit.set(undefined, undefined);
	}

	private freeEdit(edit: IInlineEdit) {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		const providers = this.languageFeaturesService.inlineEditProvider.all(model);
		if (providers.length === 0) {
			return;
		}
		providers[0].freeInlineEdit(edit);
	}

	public shouldShowHoverAt(range: Range) {
		const currentEdit = this._currentEdit.get();
		if (!currentEdit) {
			return false;
		}
		const edit = currentEdit.edit;
		const model = currentEdit.widget.model;
		const overReplaceRange = Range.containsPosition(edit.range, range.getStartPosition()) || Range.containsPosition(edit.range, range.getEndPosition());
		if (overReplaceRange) {
			return true;
		}
		const ghostText = model.ghostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._currentEdit.get()?.widget.ownsViewZone(viewZoneId) ?? false;
	}

}

function wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
	return new Promise(resolve => {
		let d: IDisposable | undefined = undefined;
		const handle = setTimeout(() => {
			if (d) { d.dispose(); }
			resolve();
		}, ms);
		if (cancellationToken) {
			d = cancellationToken.onCancellationRequested(() => {
				clearTimeout(handle);
				if (d) { d.dispose(); }
				resolve();
			});
		}
	});
}
