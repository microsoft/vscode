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
import { splitLines } from 'vs/base/common/strings';

// TODO: refactor the code
// TODO: Can control and selection bounds be used to fix the issues?
// TODO: test accessibility on NVDA with Windows

export class NativeEditContext extends AbstractEditContext {

	private readonly _domElement = new FastDomNode(document.createElement('div'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new EditContext();

	private _isFocused = false;
	private _contentLeft = 0;
	private _previousSelection: Selection | undefined;
	private _previousHiddenAreaValue: string | undefined;
	private _domNodeToRemove: ChildNode | undefined;
	private _editContextState: EditContextState | undefined;

	// Development variables, remove later
	private _parent!: HTMLElement;
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
			// Is the below correct?
			this._context.viewModel.setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(domNode, 'blur', () => {
			this._isFocused = false;
			// Is the below correct?
			this._context.viewModel.setHasFocus(false);
		}));
		let copiedText: string | undefined;
		this._register(dom.addDisposableListener(domNode, 'copy', () => {
			if (this._previousSelection) {
				copiedText = '';
				const numberOfLinesToCopy = this._previousSelection.endLineNumber - this._previousSelection.startLineNumber;
				for (let i = 0; i <= numberOfLinesToCopy; i++) {
					const childElement = this._domElement.domNode.children.item(i);
					if (!childElement) {
						continue;
					}
					if (i === 0) {
						const startColumn = this._previousSelection.startColumn;
						copiedText += childElement.textContent?.substring(startColumn - 1) ?? '';
					}
					else if (i === numberOfLinesToCopy) {
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
			if (this._editContextState && copiedText !== undefined && e.metaKey && e.key === 'v') {
				this._handleTextUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, copiedText, 0, 0);
				copiedText = undefined;
			}
			this._viewController.emitKeyDown(new StandardKeyboardEvent(e));
		}));
		this._register(dom.addDisposableListener(domNode, 'keyup', (e) => {
			this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
		}));
		this._register(dom.addDisposableListener(domNode, 'beforeinput', (e) => {
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._handleEnter(e);
			}
		}));
		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text)));
		this._register(editContextAddDisposableListener(this._ctx, 'textformatupdate', e => this._handleTextFormatUpdate(e)));
		this._register(this._context.viewModel.model.onDidChangeContent(() => this._onDidChangeContent()));
		this._onDidChangeContent();

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

		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const hiddenAreaContent = this._hiddenAreaContent(selection);
		this._renderHiddenAreaElement(hiddenAreaContent, selection);
	}

	private _hiddenAreaContent(selection: Selection): string {
		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStart = new Position(selection.startLineNumber, 1);
		const textEnd = new Position(selection.endLineNumber, Number.MAX_SAFE_INTEGER);
		const textEdit = new TextEdit([
			docStart.isBefore(textStart) ? new SingleTextEdit(Range.fromPositions(docStart, textStart), '') : undefined,
			textEnd.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEnd, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const text = textEdit.apply(doc);
		return text;
	}

	private _onDidChangeSelection(e: ViewCursorStateChangedEvent) {

		const selection = e.selections[0];
		const hiddenAreaContent = this._hiddenAreaContent(selection);
		this._updateAriaAttributes(selection);
		this._removeChildNodeIfNeeded();
		const startIndexOfSelection = this._rerenderHiddenAreaElementOnSelectionChange(hiddenAreaContent, selection);
		this._updateDocumentSelection(selection, startIndexOfSelection);
		this._updateDomNodePosition(selection.startLineNumber);

		console.log('onDidChangeSelection');
		console.log('selection ; ', selection);
	}

	private _updateAriaAttributes(selection: Selection) {
		const domNode = this._domElement.domNode;
		if (selection.isEmpty()) {
			domNode.setAttribute('aria-activedescendant', `edit-context-content`);
			domNode.setAttribute('aria-controls', 'native-edit-context');
		} else {
			domNode.removeAttribute('aria-activedescendant');
			domNode.removeAttribute('aria-controls');
		}
	}

	private _removeChildNodeIfNeeded() {
		try {
			// remove the node if it needs to be removed then reset the value of variable nodeToRemove
			// this way the screen reader reads 'selected' or 'unselected'
			if (this._domNodeToRemove) {
				this._domElement.domNode.removeChild(this._domNodeToRemove);
				this._domNodeToRemove = undefined;
			}
		} catch (e) { }
	}

	private _updateDocumentSelection(selection: Selection, startIndexOfSelection: number) {
		const domNode = this._domElement.domNode;
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const startDomNode = domNode.childNodes.item(startIndexOfSelection).firstChild;
			const endDomNode = domNode.childNodes.item(selection.endLineNumber - selection.startLineNumber + startIndexOfSelection).firstChild;
			if (startDomNode && endDomNode) {
				range.setStart(startDomNode, selection.startColumn - 1);
				range.setEnd(endDomNode, selection.endColumn - 1);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
	}

	private _rerenderHiddenAreaElementOnSelectionChange(hiddenAreaContent: string, selection: Selection): number {
		let startIndexOfSelection = 0;
		if (this._previousHiddenAreaValue !== hiddenAreaContent
			|| this._previousSelection?.startLineNumber !== selection.startLineNumber
			|| this._previousSelection?.endLineNumber !== selection.endLineNumber) {
			startIndexOfSelection = this._renderHiddenAreaElement(hiddenAreaContent, selection);
		}
		this._previousSelection = selection;
		this._previousHiddenAreaValue = hiddenAreaContent;
		return startIndexOfSelection;
	}

	private _renderHiddenAreaElement(content: string, selection: Selection): number {
		const rerenderAllChildrenNodes = (content: string[]) => {
			domNode.replaceChildren();
			content.forEach(line => domNode.appendChild(createDivWithContent(line)));
		};
		const createDivWithContent = (line: string): HTMLElement => {
			const childElement = document.createElement('div');
			childElement.textContent = line.length > 0 ? line : '\n';
			childElement.id = `edit-context-content`;
			childElement.role = 'textbox';
			return childElement;
		};

		const domNode = this._domElement.domNode;
		const splitContent = splitLines(content);

		if (domNode.lastChild
			&& this._previousSelection?.startLineNumber === selection.startLineNumber
			&& this._previousSelection.endLineNumber - 1 === selection.endLineNumber) {
			// We decreased the selection at the bottom
			// Remove the dom node on the next selection change so the screen reader can read 'unselected' on the text
			this._domNodeToRemove = domNode.lastChild;
		}
		else if (domNode.firstChild && this._previousSelection?.endLineNumber === selection.endLineNumber && this._previousSelection.startLineNumber + 1 === selection.startLineNumber) {
			// We decreased the selection at the top
			// Remove the dom node on the next selection change so the screen reader can read 'unselected' on the text
			this._domNodeToRemove = domNode.firstChild;
			return 1;
		} else if (this._previousSelection?.startLineNumber === selection.startLineNumber && this._previousSelection.endLineNumber + 1 === selection.endLineNumber) {
			// We increased the selection at the bottom
			const lastLineContent = splitContent[splitContent.length - 1];
			domNode.appendChild(createDivWithContent(lastLineContent));
		} else if (this._previousSelection?.endLineNumber === selection.endLineNumber && this._previousSelection.startLineNumber - 1 === selection.startLineNumber) {
			// We increased the selection at the top
			const firstLineContent = splitContent[0];
			domNode.prepend(createDivWithContent(firstLineContent));
		} else {
			rerenderAllChildrenNodes(splitContent);
		}
		this._updateDomNodePosition(selection.startLineNumber);
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
		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _handleEnter(e: InputEvent): void {
		if (!this._editContextState) {
			return;
		}
		e.preventDefault();
		this._handleTextUpdate(this._editContextState.selection.start, this._editContextState.selection.endExclusive, '\n');
	}

	private _handleTextUpdate(updateRangeStart: number, updateRangeEnd: number, text: string, _deleteBefore?: number, _deleteAfter?: number): void {
		console.log('_handleTextUpdate');
		console.log('updateRangeStart : ', updateRangeStart);
		console.log('updateRangeEnd : ', updateRangeEnd);
		console.log('text : ', text);

		if (!this._editContextState) {
			return;
		}
		const updateRange = new OffsetRange(updateRangeStart, updateRangeEnd);
		if (!updateRange.equals(this._editContextState.selection)) {
			const deleteBefore = _deleteBefore !== undefined ? _deleteBefore : this._editContextState.positionOffset - updateRangeStart;
			const deleteAfter = _deleteAfter !== undefined ? _deleteAfter : updateRangeEnd - this._editContextState.positionOffset;
			this._viewController.compositionType(text, deleteBefore, deleteAfter, 0);
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

		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const doc = new LineBasedText(lineNumber => this._context.viewModel.getLineContent(lineNumber), this._context.viewModel.getLineCount());
		const docStart = new Position(1, 1);
		const textStart = new Position(selection.startLineNumber - 2, 1);
		const textEnd = new Position(selection.endLineNumber + 1, Number.MAX_SAFE_INTEGER);
		const textEdit = new TextEdit([
			docStart.isBefore(textStart) ? new SingleTextEdit(Range.fromPositions(docStart, textStart), '') : undefined,
			textEnd.isBefore(doc.endPositionExclusive) ? new SingleTextEdit(Range.fromPositions(textEnd, doc.endPositionExclusive), '') : undefined
		].filter(isDefined));
		const value = textEdit.apply(doc);
		const selectionStart = textEdit.mapPosition(selection.getStartPosition()) as Position;
		const selectionEnd = textEdit.mapPosition(selection.getEndPosition()) as Position;
		const position = textEdit.mapPosition(selection.getPosition()) as Position;
		const offsetTransformer = new PositionOffsetTransformer(value);
		const offsetRange = new OffsetRange((offsetTransformer.getOffset(selectionStart)), (offsetTransformer.getOffset(selectionEnd)));
		const positionOffset = offsetTransformer.getOffset(position);
		const editContextState = new EditContextState(textEdit, offsetTransformer, positionOffset, offsetRange);
		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, value);
		this._ctx.updateSelection(offsetRange.start, offsetRange.endExclusive);
		this._editContextState = editContextState;


		// Developer code
		const subContent = value.substring(offsetRange.start, offsetRange.endExclusive);
		console.log('updateEditContext');
		console.log('value : ', value);
		console.log('subcontent : ', subContent);
	}

	public override prepareRender(ctx: RenderingContext): void {
		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) ?? [];
		if (linesVisibleRanges.length === 0) { return; }

		const controlBoundingClientRect = this._domElement.domNode.getBoundingClientRect();
		const controlBounds = new DOMRect(
			controlBoundingClientRect.left - this._contentLeft + 19, // +19 to align with the text, need to find variable value
			controlBoundingClientRect.top - 92, // need to find variable value
			controlBoundingClientRect.width,
			controlBoundingClientRect.height,
		);
		const selectionBounds = controlBounds;
		this._ctx.updateControlBounds(controlBounds);
		this._ctx.updateSelectionBounds(selectionBounds);
		this.updateEditContext();

		// developer code
		this._renderSelectionBoundsForDevelopment(controlBounds, selectionBounds);
	}

	private _renderSelectionBoundsForDevelopment(controlBounds: DOMRect, selectionBounds: DOMRect) {
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

		console.log('controlBounds : ', controlBounds);
		console.log('selectionBounds : ', selectionBounds);
		console.log('controlBoundsElement : ', controlBoundsElement);
		console.log('selectionBoundsElement : ', selectionBoundsElement);
		console.log('character bounds : ', this._ctx.characterBounds());
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
		this._updateDomNodePosition(this._previousSelection.startLineNumber);
		return true;
	}

	private _updateDomNodePosition(startLineNumber: number): void {
		const domNode = this._domElement.domNode;
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(startLineNumber - 5) - this._context.viewLayout.getCurrentScrollTop()}px`;
		domNode.style.left = `${this._contentLeft - this._context.viewLayout.getCurrentScrollLeft()}px`;
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
