/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ITypeData } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as dom from 'vs/base/browser/dom';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DebugEditContext } from 'vs/editor/browser/controller/editContext/native/debugEditContext';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ClipboardStoredMetadata, getDataToCopy, InMemoryClipboardMetadataManager } from 'vs/editor/browser/controller/editContext/clipboardUtils';
import * as browser from 'vs/base/browser/browser';

// Boolean which controls whether we should show the control, selection and character bounds
const showControlBounds = true;

export class NativeEditContext extends Disposable {

	// Edit Context API
	private readonly _editContext: EditContext;

	private _parent: HTMLElement | undefined;
	private _selectionOfEditContextText: Range | undefined;

	// Composition
	private _compositionRange: Range | undefined;
	private _renderingContext: RenderingContext | undefined;

	private _modelSelections: Selection[];

	// Editor options
	private _emptySelectionClipboard: boolean;
	private _copyWithSyntaxHighlighting: boolean;

	// Decorations
	private _decorations: string[] = [];

	private _previousState: {
		value: string;
		selectionStart: number;
		selectionEnd: number;
		selectionOfContent: Selection;
	} | undefined;
	private _currentState: {
		value: string;
		selectionStart: number;
		selectionEnd: number;
		selectionOfContent: Selection;
	} | undefined;

	private _rangeStartOfCharacterBounds: number = 0;

	constructor(
		domElement: FastDomNode<HTMLDivElement>,
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		@IClipboardService private readonly _clipboardService: IClipboardService
	) {
		super();

		this._editContext = showControlBounds ? new DebugEditContext() : new EditContext();
		domElement.domNode.editContext = this._editContext;

		const options = this._context.configuration.options;
		this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this._copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
		this._modelSelections = [new Selection(1, 1, 1, 1)];

		this._register(dom.addDisposableListener(domElement.domNode, 'copy', async (e) => {
			this._ensureClipboardGetsEditorSelection();
		}));
		this._register(dom.addDisposableListener(domElement.domNode, 'keydown', async (e) => {

			const standardKeyboardEvent = new StandardKeyboardEvent(e);

			// When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
			if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION) {
				standardKeyboardEvent.stopPropagation();
			}
			// Enter key presses are not sent as text update events, hence we need to handle them outside of the text update event
			// The beforeinput and input events send `insertParagraph` and `insertLineBreak` events but only on input elements
			// Hence we handle the enter key press in the keydown event
			if (standardKeyboardEvent.keyCode === KeyCode.Enter) {
				this._emitAddNewLineEvent();
			}
			// The dom node on which edit context is set does not allow text modifications directly, as modifications should be done programmatically,
			// hence paste and cut requests are blocked and the events are not emitted. The paste and cut events are handled in the keydown event.
			if (standardKeyboardEvent.metaKey && standardKeyboardEvent.keyCode === KeyCode.KeyV) {
				e.preventDefault();
				const clipboardText = await this._clipboardService.readText();
				if (clipboardText !== '') {
					const metadata = InMemoryClipboardMetadataManager.INSTANCE.get(clipboardText);
					let pasteOnNewLine = false;
					let multicursorText: string[] | null = null;
					let mode: string | null = null;
					if (metadata) {
						pasteOnNewLine = (this._context.configuration.options.get(EditorOption.emptySelectionClipboard) && !!metadata.isFromEmptySelection);
						multicursorText = (typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null);
						mode = metadata.mode;
					}
					this._viewController.paste(clipboardText, pasteOnNewLine, multicursorText, mode);
				}
			}
			if (standardKeyboardEvent.metaKey && standardKeyboardEvent.keyCode === KeyCode.KeyX) {
				this._ensureClipboardGetsEditorSelection();
				this._viewController.cut();
			}
			this._viewController.emitKeyDown(standardKeyboardEvent);
		}));
		this._register(dom.addDisposableListener(domElement.domNode, 'keyup', (e) => {
			this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', e => {
			if (this._compositionRange) {
				const position = this._context.viewModel.getCursorStates()[0].viewState.position;
				this._compositionRange = this._compositionRange.setEndPosition(position.lineNumber, position.column);
			}
			this._emitTypeEvent(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', e => {
			const position = this._context.viewModel.getCursorStates()[0].viewState.position;
			this._compositionRange = Range.fromPositions(position, position);
			this._viewController.compositionStart();
			this._context.viewModel.onCompositionStart();
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', e => {
			this._compositionRange = undefined;
			this._viewController.compositionEnd();
			this._context.viewModel.onCompositionEnd();
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', e => {
			this._handleTextFormatUpdate(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', e => {
			this._rangeStartOfCharacterBounds = e.rangeStart;
			this._updateCharacterBounds(e.rangeStart);
		}));
	}

	public override dispose(): void {
		super.dispose();
	}

	private _emitAddNewLineEvent(): void {

		const textBeforeSelection = this._editContext.text.substring(0, this._editContext.selectionStart);
		const textAfterSelection = this._editContext.text.substring(this._editContext.selectionEnd);
		const textAfterAddingNewLine = textBeforeSelection + '\n' + textAfterSelection;

		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, textAfterAddingNewLine);
		this._onType({
			text: '\n',
			replacePrevCharCnt: 0,
			replaceNextCharCnt: 0,
			positionDelta: 0,
		});
	}

	private _emitTypeEvent(e: { text: string; updateRangeStart: number; updateRangeEnd: number }) {

		if (!this._previousState) {
			return;
		}

		const previousSelectionStart = this._previousState.selectionStart;
		const previousSelectionEnd = this._previousState.selectionEnd;

		let replacePrevCharCnt = 0;
		if (e.updateRangeStart < previousSelectionStart) {
			replacePrevCharCnt = previousSelectionStart - e.updateRangeStart;
		}

		let replaceNextCharCnt = 0;
		if (e.updateRangeEnd > previousSelectionEnd) {
			replaceNextCharCnt = e.updateRangeEnd - previousSelectionEnd;
		}

		const typeInput: ITypeData = {
			text: e.text,
			replacePrevCharCnt,
			replaceNextCharCnt,
			positionDelta: 0,
		};

		this._onType(typeInput);
	}

	public _updateEditContext(): void {

		if (this._previousState) {
			this._previousState = this._currentState;
		}
		this._currentState = this._getEditContextState();
		if (!this._previousState) {
			this._previousState = this._currentState;
		}
		this._selectionOfEditContextText = this._currentState.selectionOfContent;
		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, this._currentState.value);
		this._editContext.updateSelection(this._currentState.selectionStart, this._currentState.selectionEnd);
	}

	public setRenderingContext(renderingContext: RenderingContext): void {
		this._renderingContext = renderingContext;
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this._copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
		return true;
	}

	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._modelSelections = e.modelSelections.slice(0);
		this._updateEditContext();
		this._updateBounds();
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._updateBounds();
		return true;
	}

	public setParent(parent: HTMLElement): void {
		this._parent = parent;
	}

	private _onType(typeInput: ITypeData): void {
		if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
			this._viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
		} else {
			this._viewController.type(typeInput.text);
		}
	}

	public _getEditContextState(): {
		value: string;
		selectionStart: number;
		selectionEnd: number;
		selectionOfContent: Selection;
	} {

		const cursorState = this._context.viewModel.getPrimaryCursorState().modelState;
		const cursorSelection = cursorState.selection;

		let value = '';
		let selectionStart: number = 0;
		let selectionEnd: number = 0;
		for (let i = cursorSelection.startLineNumber; i <= cursorSelection.endLineNumber; i++) {
			value += this._context.viewModel.getLineContent(i);
			if (i === cursorSelection.startLineNumber) {
				selectionStart = cursorSelection.startColumn - 1;
			}
			if (i === cursorSelection.endLineNumber) {
				selectionEnd += cursorSelection.endColumn - 1;
			} else {
				selectionEnd += this._context.viewModel.getLineMaxColumn(i) - 1;
			}
		}
		const selectionOfContent = new Selection(
			cursorSelection.startLineNumber,
			1,
			cursorSelection.endLineNumber,
			this._context.viewModel.getLineMaxColumn(cursorSelection.endLineNumber)
		);
		return {
			value,
			selectionStart,
			selectionEnd,
			selectionOfContent
		};
	}

	private _updateCharacterBounds(rangeStart: number) {
		if (!this._parent || !this._compositionRange) {
			return;
		}
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(this._compositionRange.startLineNumber);
		let left: number = parentBounds.left + contentLeft;
		let width: number = typicalHalfwidthCharacterWidth / 2;

		if (this._renderingContext) {
			const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(this._compositionRange, true, true) ?? [];
			if (linesVisibleRanges.length === 0) { return; }
			const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
			const maxLeft = Math.max(...linesVisibleRanges.map(r => Math.max(...r.ranges.map(r => r.left + r.width))));
			left += minLeft;
			width = maxLeft - minLeft;
		}
		const characterBounds = [new DOMRect(
			left,
			parentBounds.top + verticalOffsetStart - this._context.viewLayout.getCurrentScrollTop(),
			width,
			lineHeight,
		)];
		this._editContext.updateCharacterBounds(rangeStart, characterBounds);
	}

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {
		const selectionOfEditText = this._selectionOfEditContextText;
		if (!selectionOfEditText) {
			return;
		}
		const formats = e.getTextFormats();
		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const offsetRange = new OffsetRange(f.rangeStart, f.rangeEnd);
			const textPositionTransformer = new PositionOffsetTransformer(this._editContext.text);
			const range = textPositionTransformer.getRange(offsetRange);
			const startLineNumber = selectionOfEditText.startLineNumber + range.startLineNumber - 1;
			const endLineNumber = selectionOfEditText.startLineNumber + range.endLineNumber - 1;
			let startColumn: number;
			if (startLineNumber === selectionOfEditText.startLineNumber) {
				startColumn = selectionOfEditText.startColumn + range.startColumn - 1;
			} else {
				startColumn = range.startColumn;
			}
			let endColumn: number;
			if (endLineNumber === selectionOfEditText.startLineNumber) {
				endColumn = selectionOfEditText.startColumn + range.endColumn - 1;
			} else {
				endColumn = range.endColumn;
			}
			const decorationRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			const classNames = [
				'ime',
				`underline-style-${f.underlineStyle.toLowerCase()}`,
				`underline-thickness-${f.underlineThickness.toLowerCase()}`,
			];
			decorations.push({
				range: decorationRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			});
		});
		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _updateBounds() {
		this._updateSelectionAndControlBounds();
		this._updateCharacterBounds(this._rangeStartOfCharacterBounds);
	}

	private _updateSelectionAndControlBounds() {
		if (!this._parent) {
			return;
		}
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;
		const primarySelection = primaryViewState.selection;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(primarySelection.startLineNumber);
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;

		let selectionBounds: DOMRect;
		let controlBounds: DOMRect;
		if (primarySelection.isEmpty()) {
			const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			let left: number = parentBounds.left + contentLeft;
			if (this._renderingContext) {
				const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(primaryViewState.selection, true, true) ?? [];
				if (linesVisibleRanges.length === 0) { return; }
				const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
				left += (minLeft + typicalHalfwidthCharacterWidth / 2);
			}
			selectionBounds = new DOMRect(
				left,
				parentBounds.top + verticalOffsetStart - this._context.viewLayout.getCurrentScrollTop(),
				typicalHalfwidthCharacterWidth / 2,
				lineHeight,
			);
			controlBounds = selectionBounds;
		} else {
			const numberOfLines = primarySelection.endLineNumber - primarySelection.startLineNumber;
			selectionBounds = new DOMRect(
				parentBounds.left + contentLeft,
				parentBounds.top + verticalOffsetStart - this._context.viewLayout.getCurrentScrollTop(),
				parentBounds.width - contentLeft,
				(numberOfLines + 1) * lineHeight,
			);
			controlBounds = selectionBounds;
		}
		this._editContext.updateControlBounds(controlBounds);
		this._editContext.updateSelectionBounds(selectionBounds);
	}

	private _ensureClipboardGetsEditorSelection(): void {
		const dataToCopy = getDataToCopy(this._context.viewModel, this._modelSelections, this._emptySelectionClipboard, this._copyWithSyntaxHighlighting);
		const storedMetadata: ClipboardStoredMetadata = {
			version: 1,
			isFromEmptySelection: dataToCopy.isFromEmptySelection,
			multicursorText: dataToCopy.multicursorText,
			mode: dataToCopy.mode
		};
		InMemoryClipboardMetadataManager.INSTANCE.set(
			// When writing "LINE\r\n" to the clipboard and then pasting,
			// Firefox pastes "LINE\n", so let's work around this quirk
			(browser.isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
			storedMetadata
		);
		this._clipboardService.writeText(dataToCopy.text);
	}
}

function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}

