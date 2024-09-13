/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './nativeEditContext.css';
import { isFirefox } from '../../../../../base/browser/browser.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { CursorState } from '../../../../common/cursorCommon.js';
import { CursorChangeReason } from '../../../../common/cursorEvents.js';
import { EndOfLinePreference, IModelDeltaDecoration } from '../../../../common/model.js';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent } from '../../../../common/viewEvents.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { RestrictedRenderingContext, RenderingContext } from '../../../view/renderingContext.js';
import { ViewController } from '../../../view/viewController.js';
import { ClipboardStoredMetadata, getDataToCopy, InMemoryClipboardMetadataManager } from '../clipboardUtils.js';
import { AbstractEditContext } from '../editContextUtils.js';
import { editContextAddDisposableListener, FocusTracker, ITypeData } from './nativeEditContextUtils.js';
import { ScreenReaderSupport } from './screenReaderSupport.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';

export class NativeEditContext extends AbstractEditContext {

	public readonly domNode: FastDomNode<HTMLDivElement>;
	private readonly _editContext: EditContext;
	private readonly _screenReaderSupport: ScreenReaderSupport;

	// Overflow guard container
	private _parent: HTMLElement | undefined;
	private _decorations: string[] = [];
	private _renderingContext: RenderingContext | undefined;
	private _primarySelection: Selection = new Selection(1, 1, 1, 1);

	private _textStartPositionWithinEditor: Position = new Position(1, 1);
	private _compositionRangeWithinEditor: Range | undefined;

	private readonly _focusTracker: FocusTracker;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		@IInstantiationService instantiationService: IInstantiationService,
		@IClipboardService clipboardService: IClipboardService,
	) {
		super(context);

		this.domNode = new FastDomNode(document.createElement('div'));
		this.domNode.setClassName(`native-edit-context`);
		this._updateDomAttributes();

		this._focusTracker = this._register(new FocusTracker(this.domNode.domNode, (newFocusValue: boolean) => this._context.viewModel.setHasFocus(newFocusValue)));

		this._editContext = new EditContext();
		this.domNode.domNode.editContext = this._editContext;

		this._screenReaderSupport = instantiationService.createInstance(ScreenReaderSupport, this.domNode, context);

		this._register(addDisposableListener(this.domNode.domNode, 'copy', () => this._ensureClipboardGetsEditorSelection(clipboardService)));
		this._register(addDisposableListener(this.domNode.domNode, 'cut', () => {
			this._ensureClipboardGetsEditorSelection(clipboardService);
			viewController.cut();
		}));

		this._register(addDisposableListener(this.domNode.domNode, 'keyup', (e) => viewController.emitKeyUp(new StandardKeyboardEvent(e))));
		this._register(addDisposableListener(this.domNode.domNode, 'keydown', async (e) => {

			const standardKeyboardEvent = new StandardKeyboardEvent(e);

			// When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
			if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION) {
				standardKeyboardEvent.stopPropagation();
			}
			viewController.emitKeyDown(standardKeyboardEvent);
		}));
		this._register(addDisposableListener(this.domNode.domNode, 'beforeinput', async (e) => {
			if (e.inputType === 'insertParagraph') {
				this._onType(viewController, { text: '\n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
			}
		}));

		// Edit context events
		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', (e) => this._handleTextFormatUpdate(e)));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', (e) => this._updateCharacterBounds()));
		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', (e) => {
			const compositionRangeWithinEditor = this._compositionRangeWithinEditor;
			if (compositionRangeWithinEditor) {
				const position = this._context.viewModel.getPrimaryCursorState().modelState.position;
				const newCompositionRangeWithinEditor = Range.fromPositions(compositionRangeWithinEditor.getStartPosition(), position);
				this._compositionRangeWithinEditor = newCompositionRangeWithinEditor;
			}
			this._emitTypeEvent(viewController, e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', (e) => {
			const position = this._context.viewModel.getPrimaryCursorState().modelState.position;
			const newCompositionRange = Range.fromPositions(position, position);
			this._compositionRangeWithinEditor = newCompositionRange;
			// Utlimately fires onDidCompositionStart() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			viewController.compositionStart();
			// Emits ViewCompositionStartEvent which can be depended on by ViewEventHandlers
			this._context.viewModel.onCompositionStart();
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', (e) => {
			this._compositionRangeWithinEditor = undefined;
			// Utlimately fires compositionEnd() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			viewController.compositionEnd();
			// Emits ViewCompositionEndEvent which can be depended on by ViewEventHandlers
			this._context.viewModel.onCompositionEnd();
		}));
	}

	// --- Public methods ---

	public override dispose(): void {
		super.dispose();
		this.domNode.domNode.remove();
	}

	public appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this.domNode);
		this._parent = overflowGuardContainer.domNode;
	}

	public setAriaOptions(): void {
		this._screenReaderSupport.setAriaOptions();
	}

	/* Last rendered data needed for correct hit-testing and determining the mouse position.
	 * Without this, the selection will blink as incorrect mouse position is calculated */
	public getLastRenderData(): Position | null {
		return this._primarySelection.getPosition();
	}

	public prepareRender(ctx: RenderingContext): void {
		this._renderingContext = ctx;
		this._screenReaderSupport.prepareRender(ctx);
		this._updateEditContext();
		this._updateSelectionAndControlBounds();
		this._updateCharacterBounds();
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._screenReaderSupport.render(ctx);
	}

	public override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
		this._screenReaderSupport.onCursorStateChanged(e);
		return true;
	}

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {
		this._screenReaderSupport.onConfigurationChanged(e);
		this._updateDomAttributes();
		return true;
	}

	public writeScreenReaderContent(): void {
		this._screenReaderSupport.writeScreenReaderContent();
	}

	public isFocused(): boolean { return this._focusTracker.isFocused; }

	public focus(): void { this._focusTracker.focus(); }

	public refreshFocusState(): void { }

	// --- Private methods ---

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		this.domNode.domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
	}

	private _updateEditContext(): void {
		const editContextState = this._getNewEditContextState();
		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, editContextState.text);
		this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
		this._textStartPositionWithinEditor = editContextState.textStartPositionWithinEditor;
	}

	private _emitTypeEvent(viewController: ViewController, e: TextUpdateEvent): void {
		if (!this._editContext) {
			return;
		}
		const model = this._context.viewModel.model;
		const offsetOfStartOfText = model.getOffsetAt(this._textStartPositionWithinEditor);
		const offsetOfSelectionEnd = model.getOffsetAt(this._primarySelection.getEndPosition());
		const offsetOfSelectionStart = model.getOffsetAt(this._primarySelection.getStartPosition());
		const selectionEndOffset = offsetOfSelectionEnd - offsetOfStartOfText;
		const selectionStartOffset = offsetOfSelectionStart - offsetOfStartOfText;

		let replaceNextCharCnt = 0;
		let replacePrevCharCnt = 0;
		if (e.updateRangeEnd > selectionEndOffset) {
			replaceNextCharCnt = e.updateRangeEnd - selectionEndOffset;
		}
		if (e.updateRangeStart < selectionStartOffset) {
			replacePrevCharCnt = selectionStartOffset - e.updateRangeStart;
		}
		let text = '';
		if (selectionStartOffset < e.updateRangeStart) {
			text += this._editContext.text.substring(selectionStartOffset, e.updateRangeStart);
		}
		text += e.text;
		if (selectionEndOffset > e.updateRangeEnd) {
			text += this._editContext.text.substring(e.updateRangeEnd, selectionEndOffset);
		}
		const typeInput: ITypeData = {
			text,
			replacePrevCharCnt,
			replaceNextCharCnt,
			positionDelta: 0,
		};
		this._onType(viewController, typeInput);

		// The selection can be non empty so need to update the cursor states after typing (which makes the selection empty)
		const primaryPositionOffset = selectionStartOffset - replacePrevCharCnt + text.length;
		this._updateCursorStatesAfterType(primaryPositionOffset, e.selectionStart, e.selectionEnd);
	}

	private _onType(viewController: ViewController, typeInput: ITypeData): void {
		if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
			viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
		} else {
			viewController.type(typeInput.text);
		}
	}

	private _updateCursorStatesAfterType(primaryPositionOffset: number, desiredSelectionStartOffset: number, desiredSelectionEndOffset: number): void {
		const leftDeltaOffsetOfPrimaryCursor = desiredSelectionStartOffset - primaryPositionOffset;
		const rightDeltaOffsetOfPrimaryCursor = desiredSelectionEndOffset - primaryPositionOffset;
		const cursorPositions = this._context.viewModel.getCursorStates().map(cursorState => cursorState.modelState.position);
		const newSelections = cursorPositions.map(cursorPosition => {
			const positionLineNumber = cursorPosition.lineNumber;
			const positionColumn = cursorPosition.column;
			return new Selection(positionLineNumber, positionColumn + leftDeltaOffsetOfPrimaryCursor, positionLineNumber, positionColumn + rightDeltaOffsetOfPrimaryCursor);
		});
		const newCursorStates = newSelections.map(selection => CursorState.fromModelSelection(selection));
		this._context.viewModel.setCursorStates('editContext', CursorChangeReason.Explicit, newCursorStates);
	}

	private _getNewEditContextState(): { text: string; selectionStartOffset: number; selectionEndOffset: number; textStartPositionWithinEditor: Position } {
		const selectionStartOffset = this._primarySelection.startColumn - 1;
		let selectionEndOffset: number = 0;
		for (let i = this._primarySelection.startLineNumber; i <= this._primarySelection.endLineNumber; i++) {
			if (i === this._primarySelection.endLineNumber) {
				selectionEndOffset += this._primarySelection.endColumn - 1;
			} else {
				selectionEndOffset += this._context.viewModel.model.getLineMaxColumn(i);
			}
		}
		const endColumnOfEndLineNumber = this._context.viewModel.model.getLineMaxColumn(this._primarySelection.endLineNumber);
		const rangeOfText = new Range(this._primarySelection.startLineNumber, 1, this._primarySelection.endLineNumber, endColumnOfEndLineNumber);
		const text = this._context.viewModel.model.getValueInRange(rangeOfText, EndOfLinePreference.TextDefined);
		const textStartPositionWithinEditor = rangeOfText.getStartPosition();
		return {
			text,
			selectionStartOffset,
			selectionEndOffset,
			textStartPositionWithinEditor
		};
	}

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {
		if (!this._editContext) {
			return;
		}
		const formats = e.getTextFormats();
		const textStartPositionWithinEditor = this._textStartPositionWithinEditor;
		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const textModel = this._context.viewModel.model;
			const offsetOfEditContextText = textModel.getOffsetAt(textStartPositionWithinEditor);
			const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
			const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
			const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
			const classNames = [
				'edit-context-format-decoration',
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

	private _updateSelectionAndControlBounds() {
		if (!this._parent) {
			return;
		}
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.startLineNumber);
		const editorScrollTop = this._context.viewLayout.getCurrentScrollTop();

		const top = parentBounds.top + verticalOffsetStart - editorScrollTop;
		const height = (this._primarySelection.endLineNumber - this._primarySelection.startLineNumber + 1) * lineHeight;
		let left = parentBounds.left + contentLeft;
		let width: number;

		if (this._primarySelection.isEmpty()) {
			if (this._renderingContext) {
				const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(this._primarySelection, true) ?? [];
				if (linesVisibleRanges.length > 0) {
					left += Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
				}
			}
			width = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
		} else {
			width = parentBounds.width - contentLeft;
		}

		const selectionBounds = new DOMRect(left, top, width, height);
		const controlBounds = selectionBounds;
		this._editContext.updateControlBounds(controlBounds);
		this._editContext.updateSelectionBounds(selectionBounds);
	}

	private _updateCharacterBounds() {
		if (!this._parent || !this._compositionRangeWithinEditor) {
			return;
		}
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const parentBounds = this._parent.getBoundingClientRect();
		const compositionRangeWithinEditor = this._compositionRangeWithinEditor;
		const verticalOffsetStartOfComposition = this._context.viewLayout.getVerticalOffsetForLineNumber(compositionRangeWithinEditor.startLineNumber);
		const editorScrollTop = this._context.viewLayout.getCurrentScrollTop();
		const top = parentBounds.top + verticalOffsetStartOfComposition - editorScrollTop;

		const characterBounds: DOMRect[] = [];
		if (this._renderingContext) {
			const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(compositionRangeWithinEditor, true) ?? [];
			for (const lineVisibleRanges of linesVisibleRanges) {
				for (const visibleRange of lineVisibleRanges.ranges) {
					characterBounds.push(new DOMRect(parentBounds.left + contentLeft + visibleRange.left, top, visibleRange.width, lineHeight));
				}
			}
		}
		const textModel = this._context.viewModel.model;
		const offsetOfEditContextStart = textModel.getOffsetAt(this._textStartPositionWithinEditor);
		const offsetOfCompositionStart = textModel.getOffsetAt(compositionRangeWithinEditor.getStartPosition());
		const offsetOfCompositionStartInEditContext = offsetOfCompositionStart - offsetOfEditContextStart;
		this._editContext.updateCharacterBounds(offsetOfCompositionStartInEditContext, characterBounds);
	}

	private _ensureClipboardGetsEditorSelection(clipboardService: IClipboardService): void {
		const options = this._context.configuration.options;
		const emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		const copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
		const selections = this._context.viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
		const dataToCopy = getDataToCopy(this._context.viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting);
		const storedMetadata: ClipboardStoredMetadata = {
			version: 1,
			isFromEmptySelection: dataToCopy.isFromEmptySelection,
			multicursorText: dataToCopy.multicursorText,
			mode: dataToCopy.mode
		};
		InMemoryClipboardMetadataManager.INSTANCE.set(
			// When writing "LINE\r\n" to the clipboard and then pasting,
			// Firefox pastes "LINE\n", so let's work around this quirk
			(isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
			storedMetadata
		);
		clipboardService.writeText(dataToCopy.text);
	}
}
