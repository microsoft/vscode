/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EndOfLinePreference, IModelDeltaDecoration } from 'vs/editor/common/model';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DebugEditContext } from 'vs/editor/browser/controller/editContext/native/debugEditContext';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ClipboardStoredMetadata, getDataToCopy, InMemoryClipboardMetadataManager } from 'vs/editor/browser/controller/editContext/clipboardUtils';
import * as browser from 'vs/base/browser/browser';
import { EditContextWrapper } from 'vs/editor/browser/controller/editContext/native/nativeEditContextUtils';
import { AbstractEditContext, ITypeData } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { ScreenReaderSupport } from 'vs/editor/browser/controller/editContext/native/screenReaderSupport';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Position } from 'vs/editor/common/core/position';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { Selection } from 'vs/editor/common/core/selection';
import { CursorState } from 'vs/editor/common/cursorCommon';

// Boolean which controls whether we should show the control, selection and character bounds
const showControlBounds = false;

export class NativeEditContext extends AbstractEditContext {

	public readonly domNode: FastDomNode<HTMLDivElement>;
	private readonly _editContext: EditContextWrapper;
	private readonly _screenReaderSupport: ScreenReaderSupport;

	private _hasFocus: boolean = false;
	// Overflow guard container
	private _parent: HTMLElement | undefined;
	private _decorations: string[] = [];
	private _renderingContext: RenderingContext | undefined;
	private _primarySelection: Selection = new Selection(1, 1, 1, 1);

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(context);

		this.domNode = new FastDomNode(document.createElement('div'));
		this.domNode.setClassName(`native-edit-context ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		this._updateDomAttributes();

		const editContext = showControlBounds ? new DebugEditContext() : new EditContext();
		this.domNode.domNode.editContext = editContext;
		this._editContext = new EditContextWrapper(editContext);

		this._screenReaderSupport = new ScreenReaderSupport(this.domNode, context, keybindingService);

		// Dom node events
		this._register(dom.addDisposableListener(this.domNode.domNode, 'focus', () => this._setHasFocus(true)));
		this._register(dom.addDisposableListener(this.domNode.domNode, 'blur', () => this._setHasFocus(false)));
		this._register(dom.addDisposableListener(this.domNode.domNode, 'copy', async () => this._ensureClipboardGetsEditorSelection()));
		this._register(dom.addDisposableListener(this.domNode.domNode, 'keyup', (e) => this._viewController.emitKeyUp(new StandardKeyboardEvent(e))));
		this._register(dom.addDisposableListener(this.domNode.domNode, 'keydown', async (e) => {

			const standardKeyboardEvent = new StandardKeyboardEvent(e);

			// When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
			if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION) {
				standardKeyboardEvent.stopPropagation();
			}
			// Enter key presses are not sent as text update events, hence we need to handle them outside of the text update event
			// The beforeinput and input events send `insertParagraph` and `insertLineBreak` events but only on input elements
			// Hence we handle the enter key press in the keydown event
			if (standardKeyboardEvent.keyCode === KeyCode.Enter) {
				this._emitNewLineEvent();
			}
			// TODO : paste event not fired correctly?
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

		// Edit context events
		this._register(this._editContext.onTextFormatUpdate(e => this._handleTextFormatUpdate(e)));
		this._register(this._editContext.onCharacterBoundsUpdate(e => this._updateCharacterBounds()));
		this._register(this._editContext.onTextUpdate(e => {
			const compositionRangeWithinEditor = this._editContext.compositionRangeWithinEditor;
			if (compositionRangeWithinEditor) {
				const position = this._context.viewModel.getPrimaryCursorState().viewState.position;
				const newCompositionRangeWithinEditor = Range.fromPositions(compositionRangeWithinEditor.getStartPosition(), position);
				this._editContext.updateCompositionRangeWithinEditor(newCompositionRangeWithinEditor);
			}
			this._emitTypeEvent(e);
		}));
		this._register(this._editContext.onCompositionStart(e => {
			const position = this._context.viewModel.getPrimaryCursorState().viewState.position;
			const newCompositionRange = Range.fromPositions(position, position);
			this._editContext.updateCompositionRangeWithinEditor(newCompositionRange);
			// Utlimately fires onDidCompositionStart() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			this._viewController.compositionStart();
			// Emits ViewCompositionStartEvent which can be depended on by ViewEventHandlers
			this._context.viewModel.onCompositionStart();
		}));
		this._register(this._editContext.onCompositionEnd(e => {
			this._editContext.updateCompositionRangeWithinEditor(undefined);
			// Utlimately fires compositionEnd() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			this._viewController.compositionEnd();
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
		return this._screenReaderSupport.getLastRenderData();
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

	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
		this._screenReaderSupport.onCursorStateChanged(e);
		return true;
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._screenReaderSupport.onConfigurationChanged(e);
		this._updateDomAttributes();
		return true;
	}

	public writeScreenReaderContent(): void {
		this._screenReaderSupport.writeScreenReaderContent();
	}

	public isFocused(): boolean {
		return this._hasFocus;
	}

	public focus(): void {
		this._setHasFocus(true);
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		const hasFocus = dom.getActiveElement() === this.domNode.domNode;
		this._setHasFocus(hasFocus);
	}

	// --- Private methods ---

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		this.domNode.domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
	}

	private _updateEditContext(): void {
		const editContextState = this._getNewEditContextState();
		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, editContextState.text);
		this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
		this._editContext.updateTextStartPositionWithinEditor(editContextState.textStartPositionWithinEditor);
	}

	private _emitNewLineEvent(): void {
		this._onType({
			text: '\n',
			replacePrevCharCnt: 0,
			replaceNextCharCnt: 0,
			positionDelta: 0,
		});
	}

	private _emitTypeEvent(e: { text: string; updateRangeStart: number; updateRangeEnd: number; selectionStart: number; selectionEnd: number }): void {
		if (!this._editContext) {
			return;
		}
		const model = this._context.viewModel.model;
		const offsetOfStartOfText = model.getOffsetAt(this._editContext.textStartPositionWithinEditor);
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
		this._onType(typeInput);

		// The selection can be non empty so need to update the cursor states after typing (which makes the selection empty)
		const primaryPositionOffset = selectionStartOffset - replacePrevCharCnt + text.length;
		this._updateCursorStatesAfterType(primaryPositionOffset, e.selectionStart, e.selectionEnd);
	}

	private _onType(typeInput: ITypeData): void {
		if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
			this._viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
		} else {
			this._viewController.type(typeInput.text);
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

	private _setHasFocus(newHasFocus: boolean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;
		if (this._hasFocus) {
			this.domNode.domNode.focus();
			this._context.viewModel.setHasFocus(true);
		} else {
			this._context.viewModel.setHasFocus(false);
		}
	}

	private _getNewEditContextState(): { text: string; selectionStartOffset: number; selectionEndOffset: number; textStartPositionWithinEditor: Position } {
		const selectionStartOffset = this._primarySelection.startColumn - 1;
		let selectionEndOffset: number = 0;
		for (let i = this._primarySelection.startLineNumber; i <= this._primarySelection.endLineNumber; i++) {
			if (i === this._primarySelection.endLineNumber) {
				selectionEndOffset += this._primarySelection.endColumn - 1;
			} else {
				selectionEndOffset += this._context.viewModel.getLineMaxColumn(i);
			}
		}
		const endColumnOfEndLineNumber = this._context.viewModel.getLineMaxColumn(this._primarySelection.endLineNumber);
		const rangeOfText = new Range(this._primarySelection.startLineNumber, 1, this._primarySelection.endLineNumber, endColumnOfEndLineNumber);
		const text = this._context.viewModel.getValueInRange(rangeOfText, EndOfLinePreference.TextDefined);
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
		const textStartPositionWithinEditor = this._editContext.textStartPositionWithinEditor;
		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const textModel = this._context.viewModel.model;
			const offsetOfEditContextText = textModel.getOffsetAt(textStartPositionWithinEditor);
			const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
			const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
			const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
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
		if (!this._parent || !this._editContext.compositionRangeWithinEditor) {
			return;
		}
		const options = this._context.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const parentBounds = this._parent.getBoundingClientRect();
		const compositionRangeWithinEditor = this._editContext.compositionRangeWithinEditor;
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
		const offsetOfEditContextStart = textModel.getOffsetAt(this._editContext.textStartPositionWithinEditor);
		const offsetOfCompositionStart = textModel.getOffsetAt(compositionRangeWithinEditor.getStartPosition());
		const offsetOfCompositionStartInEditContext = offsetOfCompositionStart - offsetOfEditContextStart;
		this._editContext.updateCharacterBounds(offsetOfCompositionStartInEditContext, characterBounds);
	}

	private _ensureClipboardGetsEditorSelection(): void {
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
			(browser.isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
			storedMetadata
		);
		this._clipboardService.writeText(dataToCopy.text);
	}
}

