/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { AbstractEditContext } from 'vs/editor/browser/controller/editContext/editContext';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit, TextEdit, LineBasedText } from 'vs/editor/common/core/textEdit';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent, ViewScrollChangedEvent, ViewTokensChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as dom from 'vs/base/browser/dom';
import { Selection } from 'vs/editor/common/core/selection';

// TODO: refactor the code
// TODO: Can control and selection bounds be used to fix the issues?
// TODO: test accessibility on NVDA with Windows

export class NativeEditContext extends AbstractEditContext {

	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new EditContext();

	private _parent!: HTMLElement;
	private _contentLeft = 0;
	private _previousSelection: Selection | undefined;
	private _previousValue: string | undefined;
	private _nodeToRemove: ChildNode | null = null;
	private _isFocused = false;
	private _editContextState: EditContextState | undefined = undefined;
	private _selectionBoundsElement: HTMLElement | undefined;
	private _controlBoundsElement: HTMLElement | undefined;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
	) {
		super(context);
		const domNode = this._initializeDomNode();

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
		let copiedText: string | undefined;
		this._register(dom.addDisposableListener(domNode, 'copy', () => {
			if (this._previousSelection) {
				const numberOfLines = this._previousSelection.endLineNumber - this._previousSelection.startLineNumber;
				copiedText = '';
				for (let i = 0; i <= numberOfLines; i++) {
					const childElement = this._domElement.domNode.children.item(i);
					if (!childElement) {
						continue;
					}
					if (i === 0) {
						const startColumn = this._previousSelection.startColumn;
						copiedText += childElement.textContent?.substring(startColumn - 1) ?? '';
					}
					else if (i === numberOfLines) {
						const endColumn = this._previousSelection.endColumn;
						copiedText += '\n' + (childElement.textContent?.substring(0, endColumn) ?? '');
					}
					else {
						copiedText += '\n' + (childElement.textContent ?? '');
					}
				}
				console.log('copiedText : ', copiedText);
			}
		}));
		this._register(dom.addDisposableListener(domNode, 'keydown', (e) => {
			if (this._editContextState && copiedText && e.metaKey && e.key === 'v') {
				this._handlePasteUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, copiedText);
			}
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
		this._onDidChangeContent();
		this._register(this._context.viewModel.model.onDidChangeContent(() => {
			this._onDidChangeContent();
		}));
		// Need to handle copy/paste event, could use the handle text update method for that
		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text)));
		this._register(editContextAddDisposableListener(this._ctx, 'textformatupdate', e => this._handleTextFormatUpdate(e)));

		// --- developer code
		domNode.addEventListener('focus', () => {
			domNode.style.background = 'yellow';
		});
		domNode.addEventListener('blur', () => {
			domNode.style.background = 'white';
		});
	}

	private _decorations: string[] = [];

	private _initializeDomNode(): HTMLElement {
		const domNode = this._domElement.domNode;
		domNode.id = 'native-edit-context';
		domNode.tabIndex = 0;
		domNode.role = 'textbox';
		domNode.ariaMultiLine = 'true';
		domNode.ariaRequired = 'false';
		domNode.ariaLabel = 'use Option+F1 to open the accessibility help.';
		domNode.ariaAutoComplete = 'both';
		domNode.ariaRoleDescription = 'editor';
		domNode.style.fontSize = `${this._context.configuration.options.get(EditorOption.fontSize)}px`;
		domNode.setAttribute('autocorrect', 'off');
		domNode.setAttribute('autocapitalize', 'off');
		domNode.setAttribute('autocomplete', 'off');
		domNode.setAttribute('spellcheck', 'false');
		return domNode;
	}

	private _onDidChangeContent() {
		console.log('onDidChangeContent');
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;
		const selection = primaryViewState.selection;
		const { value: valueForHiddenArea } = this._editContextRenderingData(selection);

		// Update position of the hidden area
		const domNode = this._domElement.domNode;
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(primaryViewState.selection.startLineNumber - 5) - this._context.viewLayout.getCurrentScrollTop()}px`;
		domNode.style.left = `${this._contentLeft - this._context.viewLayout.getCurrentScrollLeft()}px`;

		// Update the hidden area line
		// can place the below attribute update into the constructor
		const firstChild = domNode.firstChild;
		if (firstChild) {
			firstChild.textContent = valueForHiddenArea.length > 0 ? valueForHiddenArea : '\n';
		} else {
			this._renderNode(valueForHiddenArea, selection);
		}
	}

	private _editContextRenderingData(selection: Selection): { value: string; offsetRange: OffsetRange; editContextState: EditContextState } {
		// Need to find the selection after typing has happened
		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStartForHiddenArea = new Position(selection.startLineNumber, 1);
		const textEndForHiddenArea = new Position(selection.endLineNumber, Number.MAX_SAFE_INTEGER);
		const textEditForHiddenArea = new TextEdit([
			docStart.isBefore(textStartForHiddenArea) ? new SingleTextEdit(Range.fromPositions(docStart, textStartForHiddenArea), '') : undefined,
			textEndForHiddenArea.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEndForHiddenArea, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		return this._findEditData(doc, textEditForHiddenArea, selection);
	}

	private _onDidChangeSelection(e: ViewCursorStateChangedEvent) {
		const selection = e.selections[0];
		const { value: valueForHiddenArea, offsetRange: selectionForHiddenArea } = this._editContextRenderingData(selection);

		const domNode = this._domElement.domNode;
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(selection.startLineNumber - 5) - this._context.viewLayout.getCurrentScrollTop()}px`;
		domNode.style.left = `${this._contentLeft - this._context.viewLayout.getCurrentScrollLeft()}px`;
		console.log('onDidChangeSelection');
		console.log('selection ; ', selection);
		console.log('selectionForHiddenArea : ', selectionForHiddenArea);

		// TODO: maybe removed
		// need to set an unset on specific occasions
		if (selection.isEmpty()) {
			domNode.setAttribute('aria-activedescendant', `edit-context-content`);
			domNode.setAttribute('aria-controls', 'native-edit-context');
		} else {
			domNode.removeAttribute('aria-activedescendant');
			domNode.removeAttribute('aria-controls');
		}

		try {
			// remove node if it needs to be removed then reset the value of nodeToRemove
			// this way the screen reader reads 'selected' or 'unselected'
			if (this._nodeToRemove && domNode.childNodes) {
				domNode.removeChild(this._nodeToRemove);
				this._nodeToRemove = null;
			}
		} catch (e) { }


		// Update the hidden area line
		// need to treat the case of multiple selection
		let startIndex = 0;
		if (this._previousValue !== valueForHiddenArea || this._previousSelection?.startLineNumber !== selection.startLineNumber || this._previousSelection.endLineNumber !== selection.endLineNumber) {
			startIndex = this._renderNode(valueForHiddenArea, selection);
		}

		// Update the active selection in the dom node
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const startDomNode = domNode.childNodes.item(startIndex).firstChild;
			const endDomNode = domNode.childNodes.item(selection.endLineNumber - selection.startLineNumber + startIndex).firstChild;
			if (startDomNode && endDomNode) {
				range.setStart(startDomNode, selection.startColumn - 1);
				range.setEnd(endDomNode, selection.endColumn - 1);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
		this._previousSelection = selection;
		this._previousValue = valueForHiddenArea;
	}

	// Rendering only the new nodes allows us to not reread the content that already existed before, only rendering the nodes that are new in the selection, and the new text specifically
	private _renderNode(content: string, selection: Selection): number {
		const rerenderAllContent = (content: string[]) => {
			domNode.replaceChildren();
			console.log('rerenderAllContent');
			for (const line of content) {
				const childElement = createDivWithContent(line);
				domNode.appendChild(childElement);
			}
		};
		const createDivWithContent = (line: string): HTMLElement => {
			const childElement = document.createElement('div');
			childElement.textContent = line.length > 0 ? line : '\n';
			childElement.id = `edit-context-content`;
			childElement.role = 'textbox';
			return childElement;
		};

		const domNode = this._domElement.domNode;
		const splitContent = content.split('\n');
		const numberOfLinesInPreviousSelection = this._previousSelection ? this._previousSelection.endLineNumber - this._previousSelection.startLineNumber : 0;
		const numberOfLinesInCurrentSelection = selection.endLineNumber - selection.startLineNumber;
		if (numberOfLinesInPreviousSelection - numberOfLinesInCurrentSelection === 1) {
			// Meaning we decreased the selection
			if (domNode.lastChild && this._previousSelection?.startLineNumber === selection.startLineNumber && this._previousSelection.endLineNumber - 1 === selection.endLineNumber) {
				// We decreased the selection at the bottom
				console.log('decreased the selection at the bottom');
				// not directly removing the child, because should read the word 'unselected', should read this on the next selection change when no longer needed
				// domNode.removeChild(domNode.lastChild);
				this._nodeToRemove = domNode.lastChild;
			}
			else if (domNode.firstChild && this._previousSelection?.endLineNumber === selection.endLineNumber && this._previousSelection.startLineNumber + 1 === selection.startLineNumber) {
				// We decreased the selection at the top
				console.log('decreased the selection at the top');
				// not directly removing the child, because should read the word 'unselected', should read this on the next selection change when no longer needed
				// domNode.removeChild(domNode.firstChild);
				this._nodeToRemove = domNode.firstChild;
				return 1;
			} else {
				rerenderAllContent(splitContent);
			}
		} else if (numberOfLinesInCurrentSelection - numberOfLinesInPreviousSelection === 1) {
			// Meaning we increased the selection
			if (this._previousSelection?.startLineNumber === selection.startLineNumber && this._previousSelection.endLineNumber + 1 === selection.endLineNumber) {
				// We increased the selection at the bottom
				console.log('increased the selection at the bottom');
				const lastLine = splitContent[splitContent.length - 1];
				const childElement = createDivWithContent(lastLine);
				domNode.appendChild(childElement);
			} else if (this._previousSelection?.endLineNumber === selection.endLineNumber && this._previousSelection.startLineNumber - 1 === selection.startLineNumber) {
				// We increased the selection at the top
				console.log('increased the selection at the top');
				const firstLine = splitContent[0];
				const childElement = createDivWithContent(firstLine);
				domNode.prepend(childElement);
			} else {
				rerenderAllContent(splitContent);
			}
		} else {
			// In this case not doing a multi-selection, so rerender everything
			rerenderAllContent(splitContent);
		}
		return 0;
	}

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
		this._handleTextUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, '\n');
	}

	private _handleTextUpdate(updateRangeStart: number, updateRangeEnd: number, text: string): void {
		console.log('_handleTextUpdate');
		console.log('updateRangeStart : ', updateRangeStart);
		console.log('updateRangeEnd : ', updateRangeEnd);
		console.log('text : ', text);

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

		this.updateEditContext();
	}

	private _handlePasteUpdate(updateRangeStart: number, updateRangeEnd: number, text: string): void {
		if (!this._editContextState) {
			return;
		}
		const updateRange = new OffsetRange(updateRangeStart, updateRangeEnd);
		if (!updateRange.equals(this._editContextState.selection)) {
			this._viewController.compositionType(text, 0, 0, 0);
		} else {
			this._viewController.type(text);
		}
		this.updateEditContext();
	}

	public override appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._parent = overflowGuardContainer.domNode;
	}

	private updateEditContext() {
		console.log('update text');
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;
		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStartForEditContext = new Position(primaryViewState.selection.startLineNumber - 2, 1);
		const textEndForEditContext = new Position(primaryViewState.selection.endLineNumber + 1, Number.MAX_SAFE_INTEGER);
		const textEditForEditContext = new TextEdit([
			docStart.isBefore(textStartForEditContext) ? new SingleTextEdit(Range.fromPositions(docStart, textStartForEditContext), '') : undefined,
			textEndForEditContext.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEndForEditContext, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const { value: valueForEditContext, offsetRange: selectionForEditContext, editContextState } = this._findEditData(doc, textEditForEditContext, primaryViewState.selection);
		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, valueForEditContext);
		this._ctx.updateSelection(selectionForEditContext.start, selectionForEditContext.endExclusive);
		this._editContextState = editContextState;
	}

	private _findEditData(doc: LineBasedText, textEdit: TextEdit, selection: Selection): { value: string; offsetRange: OffsetRange; editContextState: EditContextState } {
		const value = textEdit.apply(doc);
		const selectionStart = textEdit.mapPosition(selection.getStartPosition()) as Position;
		const selectionEnd = textEdit.mapPosition(selection.getEndPosition()) as Position;
		const position = textEdit.mapPosition(selection.getPosition()) as Position;

		const t = new PositionOffsetTransformer(value);
		const offsetRange = new OffsetRange((t.getOffset(selectionStart)), (t.getOffset(selectionEnd)));
		const positionOffset = t.getOffset(position);
		const editContextState = new EditContextState(textEdit, t, positionOffset, offsetRange);
		return { value, offsetRange, editContextState };
	}

	public override prepareRender(ctx: RenderingContext): void {
		// Is it normal that prepare render is called every single time? Why is _handleTextUpdate not called every time?
		const primaryViewState = this._context.viewModel.getCursorStates()[0].viewState;

		const linesVisibleRanges = ctx.linesVisibleRangesForRange(primaryViewState.selection, true) ?? [];
		if (linesVisibleRanges.length === 0) { return; }

		const controlBoundingClientRect = this._domElement.domNode.getBoundingClientRect();
		const controlBounds = new DOMRect(
			controlBoundingClientRect.left - this._contentLeft + 19, // +19 to align with the text
			controlBoundingClientRect.top - 92, // instead of using these hardcoded values, need to find actual values
			controlBoundingClientRect.width,
			controlBoundingClientRect.height,
		);
		const selectionBounds = controlBounds;

		console.log('controlBounds : ', controlBounds);
		console.log('selectionBounds : ', selectionBounds);

		this._ctx.updateControlBounds(controlBounds);
		this._ctx.updateSelectionBounds(selectionBounds);

		const controlBoundsElement = document.createElement('div');
		controlBoundsElement.style.position = 'absolute';
		controlBoundsElement.style.left = `${controlBounds.left}px`;
		controlBoundsElement.style.top = `${controlBounds.top}px`;
		controlBoundsElement.style.width = `${controlBounds.width}px`;
		controlBoundsElement.style.height = `${controlBounds.height}px`;
		controlBoundsElement.style.background = `blue`;
		this._controlBoundsElement?.remove();
		this._controlBoundsElement = controlBoundsElement;

		const selectionBoundsElement = document.createElement('div');
		selectionBoundsElement.style.position = 'absolute';
		selectionBoundsElement.style.left = `${selectionBounds.left}px`;
		selectionBoundsElement.style.top = `${selectionBounds.top}px`;
		selectionBoundsElement.style.width = `${selectionBounds.width}px`;
		selectionBoundsElement.style.height = `${selectionBounds.height}px`;
		selectionBoundsElement.style.background = `green`;
		this._selectionBoundsElement?.remove();
		this._selectionBoundsElement = selectionBoundsElement;

		this._parent.appendChild(controlBoundsElement);
		this._parent.appendChild(selectionBoundsElement);

		console.log('controlBoundsElement : ', controlBoundsElement);
		console.log('selectionBoundsElement : ', selectionBoundsElement);
		console.log('character bounds : ', this._ctx.characterBounds());

		this.updateEditContext();
	}

	public override render(ctx: RestrictedRenderingContext): void {
		console.log('render');
	}

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		return true;
	}

	override onTokensChanged(e: ViewTokensChangedEvent): boolean {
		this._domElement.domNode.style.fontSize = `${this._context.configuration.options.get(EditorOption.fontSize)}px`;
		return true;
	}

	override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
		this._onDidChangeSelection(e);
		return true;
	}

	override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		if (this._previousSelection?.startLineNumber === undefined) {
			return false;
		}
		const domNode = this._domElement.domNode;
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(this._previousSelection.startLineNumber - 5) - e.scrollTop}px`;
		domNode.style.left = `${this._contentLeft - this._context.viewLayout.getCurrentScrollLeft()}px`;
		return true;
	}

	public override isFocused(): boolean {
		return this._isFocused;
	}

	public override writeScreenReaderContent(reason: string): void { }

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
