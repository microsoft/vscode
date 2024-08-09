/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { DebugEditContext } from 'vs/editor/browser/controller/editContext/native/debugEditContext';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit, TextEdit, LineBasedText } from 'vs/editor/common/core/textEdit';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent, ViewScrollChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';

export class NativeEditContext extends AbstractEditContext {
	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new DebugEditContext();


	private _parent!: HTMLElement;
	private _scrollTop = 0;
	private _contentLeft = 0;

	private _isFocused = false;

	private _editContextState: EditContextState | undefined = undefined;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
	) {
		super(context);

		this._domElement.domNode.tabIndex = 0;
		this._domElement.domNode.style.width = '100px';
		this._domElement.domNode.style.height = '100px';

		this._domElement.domNode.onfocus = () => {
			this._isFocused = true;
			this._context.viewModel.setHasFocus(true);
		};

		this._domElement.domNode.onblur = () => {
			this._isFocused = false;
			this._context.viewModel.setHasFocus(false);
		};

		this._domElement.domNode.onkeydown = e => {
			const x = new StandardKeyboardEvent(e);
			this._viewController.emitKeyDown(x);
		};

		this._domElement.domNode.onkeyup = e => {
			const x = new StandardKeyboardEvent(e);
			this._viewController.emitKeyUp(x);
		};

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;

		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleTextUpdate(e)));
		this._register(editContextAddDisposableListener(this._ctx, 'textformatupdate', e => this._handleTextFormatUpdate(e)));
	}

	private _decorations: string[] = [];

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {
		if (!this._editContextState) {
			return;
		}
		const formats = e.getTextFormats();

		const decorations: IModelDeltaDecoration[] = formats.map(f => {
			const r = new OffsetRange(f.rangeStart, f.rangeEnd);
			const range = this._editContextState!.textPositionTransformer.getRange(r);
			const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
			const viewModelRange = this._editContextState!.viewModelToEditContextText.inverseMapRange(range, doc);
			const modelRange = this._context.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewModelRange);

			const classNames = [
				'underline',
				`style-${f.underlineStyle.toLowerCase()}`,
				`thickness-${f.underlineThickness.toLowerCase()}`,
			];

			return {
				range: modelRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			};
		});
		console.log(decorations[0]?.options);
		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _handleTextUpdate(e: TextUpdateEvent): void {
		if (!this._editContextState) {
			return;
		}
		const updateRange = new OffsetRange(e.updateRangeStart, e.updateRangeEnd);

		if (!updateRange.equals(this._editContextState.selection)) {
			const deleteBefore = this._editContextState.positionOffset - e.updateRangeStart;
			const deleteAfter = e.updateRangeEnd - this._editContextState.positionOffset;
			this._viewController.compositionType(e.text, deleteBefore, deleteAfter, 0);
		} else {
			this._viewController.type(e.text);
		}

		this.updateText();
	}

	public override appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._parent = overflowGuardContainer.domNode;
	}

	private updateText() {
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;

		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStart = new Position(primaryViewState.selection.startLineNumber - 2, 1);
		const textEnd = new Position(primaryViewState.selection.endLineNumber + 1, Number.MAX_SAFE_INTEGER);
		const textEdit = new TextEdit([
			docStart.isBefore(textStart) ? new SingleTextEdit(Range.fromPositions(docStart, textStart), '...\n') : undefined,
			(primaryViewState.selection.endLineNumber - primaryViewState.selection.startLineNumber > 6) ?
				new SingleTextEdit(Range.fromPositions(new Position(primaryViewState.selection.startLineNumber + 2, 1), new Position(primaryViewState.selection.endLineNumber - 2, 1)), '...\n') :
				undefined,
			textEnd.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEnd, doc.endPositionExclusive), '\n...') : undefined
		].filter(isDefined));

		const value = textEdit.apply(doc);

		const selectionStart = textEdit.mapPosition(primaryViewState.selection.getStartPosition()) as Position;
		const selectionEnd = textEdit.mapPosition(primaryViewState.selection.getEndPosition()) as Position;
		const position = textEdit.mapPosition(primaryViewState.selection.getPosition()) as Position;

		const t = new PositionOffsetTransformer(value);
		const selection = new OffsetRange((t.getOffset(selectionStart)), (t.getOffset(selectionEnd)));
		const positionOffset = t.getOffset(position);

		this._editContextState = new EditContextState(textEdit, t, positionOffset, selection);

		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, value);
		this._ctx.updateSelection(selection.start, selection.endExclusive);
	}

	public override prepareRender(ctx: RenderingContext): void {
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;

		const linesVisibleRanges = ctx.linesVisibleRangesForRange(primaryViewState.selection, true) ?? [];
		if (linesVisibleRanges.length === 0) { return; }

		const lineRange = new LineRange(linesVisibleRanges[0].lineNumber, linesVisibleRanges[linesVisibleRanges.length - 1].lineNumber + 1);

		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(lineRange.startLineNumber);
		const verticalOffsetEnd = this._context.viewLayout.getVerticalOffsetForLineNumber(lineRange.endLineNumberExclusive);

		const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
		const maxLeft = Math.max(...linesVisibleRanges.map(r => Math.max(...r.ranges.map(r => r.left + r.width))));

		const controlBounds = this._parent.getBoundingClientRect();
		const selectionBounds = new DOMRect(
			controlBounds.left + minLeft + this._contentLeft,
			controlBounds.top + verticalOffsetStart - this._scrollTop,
			maxLeft - minLeft,
			verticalOffsetEnd - verticalOffsetStart,
		);

		this._ctx.updateControlBounds(controlBounds);
		this._ctx.updateSelectionBounds(selectionBounds);

		this.updateText();
	}

	public override render(ctx: RestrictedRenderingContext): void {

	}

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		return true;
	}

	override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
		return true;
	}

	override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		this._scrollTop = e.scrollTop;
		return true;
	}

	public override isFocused(): boolean {
		return this._isFocused;
	}

	public override writeScreenReaderContent(reason: string): void {
	}

	public override focusTextArea(): void {
		this._domElement.domNode.focus();
	}

	public override refreshFocusState(): void { }

	public override setAriaOptions(options: IEditorAriaOptions): void { }
}

function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}

class EditContextState {
	constructor(
		public readonly viewModelToEditContextText: TextEdit,
		public readonly textPositionTransformer: PositionOffsetTransformer,
		public readonly positionOffset: number,
		public readonly selection: OffsetRange,
	) { }
}
