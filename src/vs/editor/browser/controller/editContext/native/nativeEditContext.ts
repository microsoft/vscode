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
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
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
import { canUseZeroSizeTextarea, ensureReadOnlyAttribute, getScreenReaderContent, setAccessibilityOptions, setAttributes, VisibleTextAreaData } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { TextAreaState } from 'vs/editor/browser/controller/editContext/textArea/textAreaState';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

// TODO: use the pagination strategy to render the hidden area
// TODO: refactor the code
// TODO: test accessibility on NVDA with Windows

export class NativeEditContext extends AbstractEditContext {

	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;
	private _textAreaWrapping!: boolean;
	private _textAreaWidth!: number;
	private _fontInfo: FontInfo;

	/**
	 * Defined only when the text area is visible (composition case).
	 */
	private _visibleTextArea: VisibleTextAreaData | null;

	// ---
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
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(context);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._setAccessibilityOptions(options);

		this._contentLeft = layoutInfo.contentLeft;
		this._visibleTextArea = null;
		this._fontInfo = options.get(EditorOption.fontInfo);

		const domNode = this._domElement.domNode;
		// TODO: Do we need to add a part fingerprint here? Should this be text area or should this be something else other than text area.
		PartFingerprints.write(this._domElement, PartFingerprint.TextArea);
		domNode.className = 'native-edit-context';
		const { tabSize } = this._context.viewModel.model.getOptions();
		setAttributes(domNode, tabSize, this._textAreaWrapping, this._visibleTextArea, options, this._keybindingService);

		ensureReadOnlyAttribute(domNode, options);

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

	private _setAccessibilityOptions(options: IComputedEditorOptions): void {
		const { accessibilitySupport, accessibilityPageSize, textAreaWrapping, textAreaWidth } = setAccessibilityOptions(options, canUseZeroSizeTextarea);
		this._accessibilitySupport = accessibilitySupport;
		this._accessibilityPageSize = accessibilityPageSize;
		this._textAreaWrapping = textAreaWrapping;
		this._textAreaWidth = textAreaWidth;
	}

	private _onDidChangeContent() {
		console.log('onDidChangeContent');

		const selection = this._context.viewModel.getCursorStates()[0].viewState.selection;
		const textAreaState = this._hiddenAreaContent(selection);
		this._renderHiddenAreaElement(textAreaState, selection);
	}

	private _hiddenAreaContent(selection: Selection): TextAreaState {
		// TODO: Maybe should place into the constructor
		const options = this._context.configuration.options;
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		// TODO: uncomment this when will be sent to production
		// const accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
		const accessibilityPageSize = 10;
		const textAreaState = getScreenReaderContent(this._context, selection, accessibilitySupport, accessibilityPageSize);
		console.log('textAreaState : ', textAreaState);
		return textAreaState;
	}

	private _onDidChangeSelection(e: ViewCursorStateChangedEvent) {

		// TODO: may no longer need to rerender the hidden element on selection change because we are sending in a big block of text?
		// TODO: need to check what text is placed in the text area when selection is changed when the accessibility page size is set to a small value like 5, in order to understand the inner working of the code
		const selection = e.selections[0];
		const textAreaState = this._hiddenAreaContent(selection);
		this._removeChildNodeIfNeeded();
		this._rerenderHiddenAreaElementOnSelectionChange(textAreaState, selection);
		this._updateDocumentSelection(textAreaState);
		this._updateDomNodePosition(selection.startLineNumber);

		console.log('onDidChangeSelection');
		console.log('selection ; ', selection);
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

	private _updateDocumentSelection(textAreaState: TextAreaState) {
		const domNode = this._domElement.domNode;
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = domNode.firstChild;
			if (firstChild) {
				range.setStart(firstChild, textAreaState.selectionStart);
				range.setEnd(firstChild, textAreaState.selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
	}

	private _rerenderHiddenAreaElementOnSelectionChange(textAreaState: TextAreaState, selection: Selection): void {
		const hiddenAreaContent = textAreaState.value;
		if (this._previousHiddenAreaValue !== hiddenAreaContent
			|| this._previousSelection?.startLineNumber !== selection.startLineNumber
			|| this._previousSelection?.endLineNumber !== selection.endLineNumber) {
			this._renderHiddenAreaElement(textAreaState, selection);
		}
		this._previousSelection = selection;
		this._previousHiddenAreaValue = hiddenAreaContent;
	}

	private _renderHiddenAreaElement(textAreaState: TextAreaState, selection: Selection): void {
		this._domElement.domNode.textContent = textAreaState.value;
		this._updateDomNodePosition(selection.startLineNumber);
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
		// TODO: should not be adding 15 but doing it for the purpose of the development
		domNode.style.top = `${this._context.viewLayout.getVerticalOffsetForLineNumber(startLineNumber + 15) - this._context.viewLayout.getCurrentScrollTop()}px`;
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
