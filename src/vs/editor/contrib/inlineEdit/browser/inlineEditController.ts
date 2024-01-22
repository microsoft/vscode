/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ISettableObservable, autorun, constObservable, disposableObservableValue } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { GhostTextWidget } from 'vs/editor/contrib/inlineEdit/browser/ghostTextWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IInlineEdit, InlineEditRejectionReason, InlineEditTriggerKind } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineEdit/browser/ghostText';
import { ICommandService } from 'vs/platform/commands/common/commands';

class InlineEditWidget implements IDisposable {
	constructor(public readonly widget: GhostTextWidget, public readonly edit: IInlineEdit) { }

	dispose(): void {
		this.widget.dispose();
	}
}

export class InlineEditController extends Disposable {
	static ID = 'editor.contrib.inlineEditController';

	public static readonly inlineEditVisibleContext = new RawContextKey<boolean>('inlineEditVisible', false);
	private _isVisibleContext = InlineEditController.inlineEditVisibleContext.bindTo(this.contextKeyService);

	public static readonly cursorAtInlineEditContext = new RawContextKey<boolean>('cursorAtInlineEdit', false);
	private _isCursorAtInlineEditContext = InlineEditController.cursorAtInlineEditContext.bindTo(this.contextKeyService);

	public static get(editor: ICodeEditor): InlineEditController | null {
		return editor.getContribution<InlineEditController>(InlineEditController.ID);
	}

	private _currentEdit: ISettableObservable<InlineEditWidget | undefined> = disposableObservableValue(this, undefined);

	private readonly _rulerDecorations: IEditorDecorationsCollection;
	private readonly _rulerDecoration: ModelDecorationOptions;

	private _currentRequestCts: CancellationTokenSource | undefined;

	private _jumpBackPosition: Position | undefined;
	private _isAccepting: boolean = false;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		//Ruler decorations for the inline edits
		const opts: IModelDecorationOptions = {
			description: 'multi-ghost-text-decoration',
			overviewRuler: {
				color: Color.cyan.toString(),
				position: OverviewRulerLane.Full
			},
			minimap: {
				color: Color.cyan.toString(),
				position: MinimapPosition.Inline
			},
		};
		this._rulerDecoration = ModelDecorationOptions.createDynamic(opts);
		this._rulerDecorations = editor.createDecorationsCollection();

		//Automatically request inline edit when the content was changed
		//Cancel the previous request if there is one
		//Remove the previous ghost text
		this._register(editor.onDidChangeModelContent(async () => {
			this._isCursorAtInlineEditContext.set(false);
			this.clear(false);
			this._isAccepting = false;
			const edit = await this.fetchInlineEdit(editor, true);
			if (!edit) {
				return;
			}
			const ghostText = new GhostText(edit.position.lineNumber, [new GhostTextPart(edit.position.column, edit.text.split('\n'), false)]);
			const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
				ghostText: constObservable(ghostText),
				minReservedLineCount: constObservable(0),
				targetTextModel: constObservable(this.editor.getModel() ?? undefined),
				removeRange: constObservable(edit.replaceRange)
			});
			this._currentEdit.set(new InlineEditWidget(instance, edit), undefined);
		}));

		//Check if the cursor is at the ghost text
		this._register(editor.onDidChangeCursorPosition((e) => {
			if (!this._currentEdit) {
				this._isCursorAtInlineEditContext.set(false);
				return;
			}
			const gt = this._currentEdit.get()?.edit;
			if (!gt) {
				this._isCursorAtInlineEditContext.set(false);
				return;
			}
			const pos = e.position;
			if (gt.replaceRange && gt.replaceRange.startLineNumber === pos.lineNumber && gt.replaceRange.startColumn === pos.column) {
				this._isCursorAtInlineEditContext.set(true);
			}
			else if (gt.replaceRange === undefined && pos.lineNumber === gt.position.lineNumber && pos.column === gt.position.column) {
				this._isCursorAtInlineEditContext.set(true);
			} else {
				this._isCursorAtInlineEditContext.set(false);
			}
		}));

		//Perform stuff when the current edit has changed
		this._register(autorun((reader) => {
			/** @description InlineEditController.update model */
			const currentEdit = this._currentEdit.read(reader);
			if (!currentEdit) {
				this._isVisibleContext.set(false);
				this._isCursorAtInlineEditContext.set(false);
				this.showRulerDecoration(undefined);
				return;
			}
			this._isVisibleContext.set(true);
			this._isCursorAtInlineEditContext.set(false);
			this.showRulerDecoration(currentEdit.edit);
		}));
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
		return edit;
	}

	private showRulerDecoration(ghostText: IInlineEdit | undefined) {
		if (!ghostText) {
			this._rulerDecorations.set([]);
			return;
		}
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		const col = model.getLineMaxColumn(ghostText.position.lineNumber);
		const range = new Range(ghostText.position.lineNumber, 0, ghostText.position.lineNumber, col);
		const decoration =
		{
			range: range,
			options: this._rulerDecoration
		};
		this._rulerDecorations.set([decoration]);
	}

	public async jumpBack() {
		if (!this._jumpBackPosition) {
			return;
		}
		this.editor.setPosition(this._jumpBackPosition);
		//if position is outside viewports, scroll to it
		this.editor.revealPositionInCenterIfOutsideViewport(this._jumpBackPosition);
	}

	public accept(): void {
		this._isAccepting = true;
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
		if (data.replaceRange) {
			this.editor.executeEdits('acceptCurrent', [EditOperation.replace(Range.lift(data.replaceRange), text)]);
		}
		else {
			this.editor.executeEdits('acceptCurrent', [EditOperation.insert(Position.lift(data.position), text)]);
		}
		if (data.accepted) {
			this._commandService.executeCommand(data.accepted.id, ...data.accepted.arguments ?? []);
		}
		this._currentEdit.set(undefined, undefined);
	}

	public jumpToCurrent(): void {
		this._jumpBackPosition = this.editor.getSelection()?.getStartPosition();

		const data = this._currentEdit.get()?.edit;
		if (!data) {
			return;
		}
		const position = data.replaceRange ?
			Position.lift({ lineNumber: data.replaceRange.startLineNumber, column: data.replaceRange.startColumn }) :
			Position.lift(data.position);

		this.editor.setPosition(position);
		//if position is outside viewports, scroll to it
		this.editor.revealPositionInCenterIfOutsideViewport(position);
	}

	public clear(explcit: boolean) {
		const rejectReason = explcit ? InlineEditRejectionReason.Explicit : InlineEditRejectionReason.Implicit;
		const edit = this._currentEdit.get()?.edit;
		if (edit && edit?.rejected && !this._isAccepting) {
			this._commandService.executeCommand(edit.rejected.id, rejectReason, ...edit.rejected.arguments ?? []);
		}
		this._currentEdit.set(undefined, undefined);
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
