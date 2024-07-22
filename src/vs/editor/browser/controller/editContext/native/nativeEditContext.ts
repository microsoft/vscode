/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
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
import * as dom from 'vs/base/browser/dom';
import { SingleCursorState } from 'vs/editor/common/cursorCommon';

export class NativeEditContext extends AbstractEditContext {
	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new EditContext();

	private _parent!: HTMLElement;
	private _scrollTop = 0;
	private _contentLeft = 0;
	private _previousLine = -1;

	private _isFocused = false;

	private _editContextState: EditContextState | undefined = undefined;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
	) {
		super(context);
		const domNode = this._domElement.domNode;
		domNode.id = 'native-edit-context';
		domNode.tabIndex = 0;
		domNode.role = 'textbox';
		domNode.ariaMultiLine = 'true';
		domNode.ariaRequired = 'false';
		domNode.ariaLabel = 'use Option+F1 to open the accessibility help.';
		domNode.ariaAutoComplete = 'both';
		domNode.ariaRoleDescription = 'editor';
		domNode.setAttribute('autocorrect', 'off');
		domNode.setAttribute('autocapitalize', 'off');
		domNode.setAttribute('autocomplete', 'off');
		domNode.setAttribute('spellcheck', 'false');

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;

		this._register(dom.addDisposableListener(domNode, 'focus', () => {
			this._isFocused = true;
			this._context.viewModel.setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(domNode, 'blur', () => {
			this._isFocused = false;
			this._context.viewModel.setHasFocus(false);
		}));
		this._register(dom.addDisposableListener(domNode, 'keydown', (e) => {
			const x = new StandardKeyboardEvent(e);
			this._viewController.emitKeyDown(x);
		}));
		this._register(dom.addDisposableListener(domNode, 'keyup', (e) => {
			const x = new StandardKeyboardEvent(e);
			this._viewController.emitKeyUp(x);
		}));
		this._register(dom.addDisposableListener(domNode, 'beforeinput', (e) => {
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._handleEnter(e);
			}
		}));
		// Need to handle copy/paste event, could use the handle text update method for that
		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text)));
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

	private _handleEnter(e: InputEvent): void {
		if (!this._editContextState) {
			return;
		}
		e.preventDefault();
		this._handleTextUpdate(this._editContextState.positionOffset, this._editContextState.positionOffset, '\n');
	}

	private _handleTextUpdate(updateRangeStart: number, updateRangeEnd: number, text: string): void {
		if (!this._editContextState) {
			return;
		}
		const updateRange = new OffsetRange(updateRangeStart, updateRangeEnd);

		if (!updateRange.equals(this._editContextState.selection)) {
			const deleteBefore = this._editContextState.positionOffset - updateRangeStart;
			const deleteAfter = updateRangeEnd - this._editContextState.positionOffset;
			this._viewController.compositionType(text, deleteBefore, deleteAfter, 0);
		} else {
			this._viewController.type(text);
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
		const textStartForEditContext = new Position(primaryViewState.selection.startLineNumber - 2, 1);
		const textEndForEditContext = new Position(primaryViewState.selection.endLineNumber + 1, Number.MAX_SAFE_INTEGER);
		const textEditForEditContext = new TextEdit([
			docStart.isBefore(textStartForEditContext) ? new SingleTextEdit(Range.fromPositions(docStart, textStartForEditContext), '') : undefined,
			(primaryViewState.selection.endLineNumber - primaryViewState.selection.startLineNumber > 6) ?
				new SingleTextEdit(Range.fromPositions(new Position(primaryViewState.selection.startLineNumber + 2, 1), new Position(primaryViewState.selection.endLineNumber - 2, 1)), '') :
				undefined,
			textEndForEditContext.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEndForEditContext, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const { value: valueForEditContext, selection: selectionForEditContext } = this._findEditData(doc, textEditForEditContext, primaryViewState);
		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, valueForEditContext);
		this._ctx.updateSelection(selectionForEditContext.start, selectionForEditContext.endExclusive);

		const textStartForHiddenArea = new Position(primaryViewState.selection.startLineNumber, 1);
		const textEndForHiddenArea = new Position(primaryViewState.selection.endLineNumber, Number.MAX_SAFE_INTEGER);
		const textEditForHiddenArea = new TextEdit([
			docStart.isBefore(textStartForHiddenArea) ? new SingleTextEdit(Range.fromPositions(docStart, textStartForHiddenArea), '') : undefined,
			(primaryViewState.selection.endLineNumber - primaryViewState.selection.startLineNumber > 6) ?
				new SingleTextEdit(Range.fromPositions(new Position(primaryViewState.selection.startLineNumber, 1), new Position(primaryViewState.selection.endLineNumber, 1)), '') :
				undefined,
			textEndForHiddenArea.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEndForHiddenArea, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const { value: valueForHiddenArea, selection: selectionForHiddenArea, editContextState } = this._findEditData(doc, textEditForHiddenArea, primaryViewState);
		this._editContextState = editContextState;

		// Update posiiton of the hidden area
		const domNode = this._domElement.domNode;
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(primaryViewState.selection.startLineNumber - 5) - this._context.viewLayout.getCurrentScrollTop()}px`;
		domNode.style.left = `${this._contentLeft}px`;

		// Update the hidden area line
		const line = primaryViewState.selection.startLineNumber;
		if (this._previousLine !== line) {
			const childElement = document.createElement('div');
			childElement.textContent = valueForHiddenArea ?? ' ';
			childElement.id = `edit-context-content`;
			childElement.role = 'textbox';
			domNode.replaceChildren(childElement);
			this._previousLine = line;
		}

		// Update the active selection in the dom node
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection && domNode.firstChild?.firstChild) {
			const range = new globalThis.Range();
			const domNodeElement = domNode.firstChild?.firstChild;
			if (domNodeElement) {
				range.setStart(domNodeElement, selectionForHiddenArea.start);
				range.setEnd(domNodeElement, selectionForHiddenArea.endExclusive);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
				// TODO: Do we need this?
				domNode.setAttribute('aria-activedescendant', `edit-context-content`);
				domNode.setAttribute('aria-controls', 'native-edit-context');
			}
		}
	}

	private _findEditData(doc: LineBasedText, textEdit: TextEdit, primaryViewState: SingleCursorState): { value: string; selection: OffsetRange; editContextState: EditContextState } {
		const value = textEdit.apply(doc);
		const selectionStart = textEdit.mapPosition(primaryViewState.selection.getStartPosition()) as Position;
		const selectionEnd = textEdit.mapPosition(primaryViewState.selection.getEndPosition()) as Position;
		const position = textEdit.mapPosition(primaryViewState.selection.getPosition()) as Position;

		const t = new PositionOffsetTransformer(value);
		const selection = new OffsetRange((t.getOffset(selectionStart)), (t.getOffset(selectionEnd)));
		const positionOffset = t.getOffset(position);
		const editContextState = new EditContextState(textEdit, t, positionOffset, selection);
		return { value, selection, editContextState };
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
		// TODO
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
