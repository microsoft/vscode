/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { constObservable } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection, IInlineEdit, IInlineEditContext, InlineEditTriggerKind } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { GhostTextWidget } from 'vs/editor/contrib/multiGhostText/browser/ghostTextWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';


export class MultiGhostTextController extends Disposable {
	static ID = 'editor.contrib.multiGhostTextController';

	public static readonly multiGhostTextVisibleContext = new RawContextKey<boolean>('multiGhostTextVisible', false);
	private _isVisibleContext = MultiGhostTextController.multiGhostTextVisibleContext.bindTo(this.contextKeyService);

	public static readonly cursorAtGhostTextContext = new RawContextKey<boolean>('cursorAtGhostText', false);
	private _isCursorAtGhostTextContext = MultiGhostTextController.cursorAtGhostTextContext.bindTo(this.contextKeyService);

	public static get(editor: ICodeEditor): MultiGhostTextController | null {
		return editor.getContribution<MultiGhostTextController>(MultiGhostTextController.ID);
	}

	private _currentWidget: [GhostTextWidget, IInlineEdit] | undefined;

	private readonly _rulerDecorations: IEditorDecorationsCollection;
	private readonly _rulerDecoration: ModelDecorationOptions;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

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

		this._register(editor.onDidChangeModelContent(() => {
			this._isCursorAtGhostTextContext.set(false);
			this.clear();
		}));
		this._register(editor.onDidChangeCursorPosition((e) => {
			if (!this._currentWidget) {
				this._isCursorAtGhostTextContext.set(false);
				return;
			}
			const gt = this._currentWidget[1];
			const pos = e.position;
			if (pos.lineNumber === gt.position.lineNumber && pos.column === gt.position.column) {
				this._isCursorAtGhostTextContext.set(true);
			} else {
				this._isCursorAtGhostTextContext.set(false);
			}
		}));
	}

	private showSingleGhostText(gt: IInlineEdit) {
		if (this._currentWidget) {
			this._currentWidget[0].dispose();
			this._currentWidget = undefined;
		}

		const ghostText = new GhostText(gt.position.lineNumber, [new GhostTextPart(gt.position.column, gt.text.split('\n'), false)]);
		const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
			ghostText: constObservable(ghostText),
			minReservedLineCount: constObservable(0),
			targetTextModel: constObservable(this.editor.getModel() ?? undefined),
			removeRange: constObservable(gt.replaceRange)
		});

		this._isVisibleContext.set(true);
		this._currentWidget = [instance, gt];
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

	public showGhostText(ghostText: IInlineEdit, context: IInlineEditContext): void {
		if (this._currentWidget && context.triggerKind === InlineEditTriggerKind.Automatic) {
			//ignore auto requests if we're displaying suggestions
			return;
		}
		this.showSingleGhostText(ghostText);
		this.showRulerDecoration(ghostText);
	}

	public accept(): void {
		if (!this._currentWidget) {
			return;
		}
		const widget = this._currentWidget[0];
		const data = this._currentWidget[1];

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
		widget.dispose();

	}

	public jumpToCurrent(): void {
		if (!this._currentWidget) {
			return;
		}
		const data = this._currentWidget[1];
		this.editor.setPosition(Position.lift(data.position));
		//if position is outside viewports, scroll to it
		this.editor.revealPositionInCenterIfOutsideViewport(Position.lift(data.position));
	}

	public clear() {
		// this._widgetsData = [];
		this._currentWidget?.[0].dispose();
		this._currentWidget = undefined;
		this._isVisibleContext.set(false);
		this.showRulerDecoration(undefined);
	}
}
