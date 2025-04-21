/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './nativeEditContext.css';
import { isFirefox } from '../../../../../base/browser/browser.js';
import { addDisposableListener, getActiveWindow, getWindow, getWindowId } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { EndOfLinePreference, EndOfLineSequence, IModelDeltaDecoration } from '../../../../common/model.js';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent, ViewDecorationsChangedEvent, ViewFlushedEvent, ViewLinesChangedEvent, ViewLinesDeletedEvent, ViewLinesInsertedEvent, ViewScrollChangedEvent, ViewZonesChangedEvent } from '../../../../common/viewEvents.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { RestrictedRenderingContext, RenderingContext } from '../../../view/renderingContext.js';
import { ViewController } from '../../../view/viewController.js';
import { ClipboardEventUtils, ClipboardStoredMetadata, getDataToCopy, InMemoryClipboardMetadataManager } from '../clipboardUtils.js';
import { AbstractEditContext } from '../editContext.js';
import { editContextAddDisposableListener, FocusTracker, ITypeData } from './nativeEditContextUtils.js';
import { ScreenReaderSupport } from './screenReaderSupport.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { IVisibleRangeProvider } from '../textArea/textAreaEditContext.js';
import { PositionOffsetTransformer } from '../../../../common/core/positionToOffset.js';
import { IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { EditContext } from './editContextFactory.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { NativeEditContextRegistry } from './nativeEditContextRegistry.js';
import { IEditorAriaOptions } from '../../../editorBrowser.js';
import { isHighSurrogate, isLowSurrogate } from '../../../../../base/common/strings.js';
import { IME } from '../../../../../base/common/ime.js';

// Corresponds to classes in nativeEditContext.css
enum CompositionClassName {
	NONE = 'edit-context-composition-none',
	SECONDARY = 'edit-context-composition-secondary',
	PRIMARY = 'edit-context-composition-primary',
}

interface ITextUpdateEvent {
	text: string;
	selectionStart: number;
	selectionEnd: number;
	updateRangeStart: number;
	updateRangeEnd: number;
}

export class NativeEditContext extends AbstractEditContext {

	// Text area used to handle paste events
	public readonly domNode: FastDomNode<HTMLDivElement>;
	private readonly _imeTextArea: FastDomNode<HTMLTextAreaElement>;
	private readonly _editContext: EditContext;
	private readonly _screenReaderSupport: ScreenReaderSupport;
	private _editContextPrimarySelection: Selection = new Selection(1, 1, 1, 1);

	// Overflow guard container
	private _parent: HTMLElement | undefined;
	private _decorations: string[] = [];
	private _primarySelection: Selection = new Selection(1, 1, 1, 1);


	private _targetWindowId: number = -1;
	private _scrollTop: number = 0;
	private _scrollLeft: number = 0;

	private readonly _focusTracker: FocusTracker;

	private readonly _selectionChangeListener: MutableDisposable<IDisposable>;

	constructor(
		ownerID: string,
		context: ViewContext,
		overflowGuardContainer: FastDomNode<HTMLElement>,
		private readonly _viewController: ViewController,
		private readonly _visibleRangeProvider: IVisibleRangeProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super(context);

		this.domNode = new FastDomNode(document.createElement('div'));
		this.domNode.setClassName(`native-edit-context`);
		this._imeTextArea = new FastDomNode(document.createElement('textarea'));
		this._imeTextArea.setClassName(`ime-text-area`);
		this._imeTextArea.setAttribute('readonly', 'true');
		this.domNode.setAttribute('autocorrect', 'off');
		this.domNode.setAttribute('autocapitalize', 'off');
		this.domNode.setAttribute('autocomplete', 'off');
		this.domNode.setAttribute('spellcheck', 'false');

		this._updateDomAttributes();

		overflowGuardContainer.appendChild(this.domNode);
		overflowGuardContainer.appendChild(this._imeTextArea);
		this._parent = overflowGuardContainer.domNode;

		this._selectionChangeListener = this._register(new MutableDisposable());
		this._focusTracker = this._register(new FocusTracker(this.domNode.domNode, (newFocusValue: boolean) => {
			if (newFocusValue) {
				this._selectionChangeListener.value = this._setSelectionChangeListener(this._viewController);
				this._screenReaderSupport.setIgnoreSelectionChangeTime('onFocus');
			} else {
				this._selectionChangeListener.value = undefined;
			}
			this._context.viewModel.setHasFocus(newFocusValue);
		}));

		const window = getWindow(this.domNode.domNode);
		this._editContext = EditContext.create(window);
		this.setEditContextOnDomNode();

		this._screenReaderSupport = instantiationService.createInstance(ScreenReaderSupport, this.domNode, context);

		this._register(addDisposableListener(this.domNode.domNode, 'copy', (e) => this._ensureClipboardGetsEditorSelection(e)));
		this._register(addDisposableListener(this.domNode.domNode, 'cut', (e) => {
			// Pretend here we touched the text area, as the `cut` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._screenReaderSupport.setIgnoreSelectionChangeTime('onCut');
			this._ensureClipboardGetsEditorSelection(e);
			this._viewController.cut();
		}));

		this._register(addDisposableListener(this.domNode.domNode, 'keyup', (e) => this._onKeyUp(e)));
		this._register(addDisposableListener(this.domNode.domNode, 'keydown', async (e) => this._onKeyDown(e)));
		this._register(addDisposableListener(this._imeTextArea.domNode, 'keyup', (e) => this._onKeyUp(e)));
		this._register(addDisposableListener(this._imeTextArea.domNode, 'keydown', async (e) => this._onKeyDown(e)));
		this._register(addDisposableListener(this.domNode.domNode, 'beforeinput', async (e) => {
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._onType(this._viewController, { text: '\n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
			}
		}));
		this._register(addDisposableListener(this.domNode.domNode, 'paste', (e) => {
			e.preventDefault();
			if (!e.clipboardData) {
				return;
			}
			let [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
			if (!text) {
				return;
			}
			metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
			let pasteOnNewLine = false;
			let multicursorText: string[] | null = null;
			let mode: string | null = null;
			if (metadata) {
				const options = this._context.configuration.options;
				const emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
				pasteOnNewLine = emptySelectionClipboard && !!metadata.isFromEmptySelection;
				multicursorText = typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null;
				mode = metadata.mode;
			}
			this._viewController.paste(text, pasteOnNewLine, multicursorText, mode);
		}));

		// Edit context events
		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', (e) => this._handleTextFormatUpdate(e)));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', (e) => this._updateCharacterBounds(e)));
		let highSurrogateCharacter: string | undefined;
		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', (e) => {
			const text = e.text;
			if (text.length === 1) {
				const charCode = text.charCodeAt(0);
				if (isHighSurrogate(charCode)) {
					highSurrogateCharacter = text;
					return;
				}
				if (isLowSurrogate(charCode) && highSurrogateCharacter) {
					const textUpdateEvent: ITextUpdateEvent = {
						text: highSurrogateCharacter + text,
						selectionEnd: e.selectionEnd,
						selectionStart: e.selectionStart,
						updateRangeStart: e.updateRangeStart - 1,
						updateRangeEnd: e.updateRangeEnd - 1
					};
					highSurrogateCharacter = undefined;
					this._emitTypeEvent(this._viewController, textUpdateEvent);
					return;
				}
			}
			this._emitTypeEvent(this._viewController, e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', (e) => {
			// Utlimately fires onDidCompositionStart() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			this._viewController.compositionStart();
			// Emits ViewCompositionStartEvent which can be depended on by ViewEventHandlers
			this._context.viewModel.onCompositionStart();
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', (e) => {
			// Utlimately fires compositionEnd() on the editor to notify for example suggest model of composition state
			// Updates the composition state of the cursor controller which determines behavior of typing with interceptors
			this._viewController.compositionEnd();
			// Emits ViewCompositionEndEvent which can be depended on by ViewEventHandlers
			this._context.viewModel.onCompositionEnd();
		}));
		let reenableTracking: boolean = false;
		this._register(IME.onDidChange(() => {
			if (IME.enabled && reenableTracking) {
				this.domNode.focus();
				this._focusTracker.resume();
				reenableTracking = false;
			}
			if (!IME.enabled && this.isFocused()) {
				this._focusTracker.pause();
				this._imeTextArea.focus();
				reenableTracking = true;
			}
		}));
		this._register(NativeEditContextRegistry.register(ownerID, this));
	}

	// --- Public methods ---

	public override dispose(): void {
		// Force blue the dom node so can write in pane with no native edit context after disposal
		this.domNode.domNode.blur();
		this.domNode.domNode.remove();
		this._imeTextArea.domNode.remove();
		super.dispose();
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		this._screenReaderSupport.setAriaOptions(options);
	}

	/* Last rendered data needed for correct hit-testing and determining the mouse position.
	 * Without this, the selection will blink as incorrect mouse position is calculated */
	public getLastRenderData(): Position | null {
		return this._primarySelection.getPosition();
	}

	public prepareRender(ctx: RenderingContext): void {
		this._screenReaderSupport.prepareRender(ctx);
		this._updateEditContext();
		this._updateSelectionAndControlBounds(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._screenReaderSupport.render(ctx);
	}

	public override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
		this._screenReaderSupport.onCursorStateChanged(e);
		this._updateEditContext();
		return true;
	}

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {
		this._screenReaderSupport.onConfigurationChanged(e);
		this._updateDomAttributes();
		return true;
	}

	public override onDecorationsChanged(e: ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}

	public override onFlushed(e: ViewFlushedEvent): boolean {
		return true;
	}

	public override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		return true;
	}

	public override onLinesDeleted(e: ViewLinesDeletedEvent): boolean {
		return true;
	}

	public override onLinesInserted(e: ViewLinesInsertedEvent): boolean {
		return true;
	}

	public override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		this._scrollLeft = e.scrollLeft;
		this._scrollTop = e.scrollTop;
		return true;
	}

	public override onZonesChanged(e: ViewZonesChangedEvent): boolean {
		return true;
	}

	public onWillPaste(): void {
		this._onWillPaste();
	}

	private _onWillPaste(): void {
		this._screenReaderSupport.setIgnoreSelectionChangeTime('onWillPaste');
	}

	public writeScreenReaderContent(): void {
		this._screenReaderSupport.writeScreenReaderContent();
	}

	public isFocused(): boolean {
		return this._focusTracker.isFocused;
	}

	public focus(): void {
		this._focusTracker.focus();

		// If the editor is off DOM, focus cannot be really set, so let's double check that we have managed to set the focus
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		this._focusTracker.refreshFocusState();
	}

	// TODO: added as a workaround fix for https://github.com/microsoft/vscode/issues/229825
	// When this issue will be fixed the following should be removed.
	public setEditContextOnDomNode(): void {
		const targetWindow = getWindow(this.domNode.domNode);
		const targetWindowId = getWindowId(targetWindow);
		if (this._targetWindowId !== targetWindowId) {
			this.domNode.domNode.editContext = this._editContext;
			this._targetWindowId = targetWindowId;
		}
	}

	// --- Private methods ---

	private _onKeyUp(e: KeyboardEvent) {
		this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
	}

	private _onKeyDown(e: KeyboardEvent) {
		const standardKeyboardEvent = new StandardKeyboardEvent(e);
		// When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
		if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION) {
			standardKeyboardEvent.stopPropagation();
		}
		this._viewController.emitKeyDown(standardKeyboardEvent);
	}

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		this.domNode.domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
	}

	private _updateEditContext(): void {
		const editContextState = this._getNewEditContextState();
		if (!editContextState) {
			return;
		}
		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, editContextState.text ?? ' ');
		this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
		this._editContextPrimarySelection = editContextState.editContextPrimarySelection;
	}

	private _emitTypeEvent(viewController: ViewController, e: ITextUpdateEvent): void {
		if (!this._editContext) {
			return;
		}
		if (!this._editContextPrimarySelection.equalsSelection(this._primarySelection)) {
			return;
		}
		const model = this._context.viewModel.model;
		const startPositionOfEditContext = this._editContextStartPosition();
		const offsetOfStartOfText = model.getOffsetAt(startPositionOfEditContext);
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
		let positionDelta = 0;
		if (e.selectionStart === e.selectionEnd && selectionStartOffset === selectionEndOffset) {
			positionDelta = e.selectionStart - (e.updateRangeStart + e.text.length);
		}
		const typeInput: ITypeData = {
			text,
			replacePrevCharCnt,
			replaceNextCharCnt,
			positionDelta
		};
		this._onType(viewController, typeInput);

		// It could be that the typed letter does not produce a change in the editor text,
		// for example if an extension registers a custom typing command, and the typing operation does something else like scrolling
		// Need to update the edit context to reflect this
		this._updateEditContext();
	}

	private _onType(viewController: ViewController, typeInput: ITypeData): void {
		if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
			viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
		} else {
			viewController.type(typeInput.text);
		}
	}

	private _getNewEditContextState(): { text: string; selectionStartOffset: number; selectionEndOffset: number; editContextPrimarySelection: Selection } | undefined {
		const editContextPrimarySelection = this._primarySelection;
		const model = this._context.viewModel.model;
		if (!model.isValidRange(editContextPrimarySelection)) {
			return;
		}
		const primarySelectionStartLine = editContextPrimarySelection.startLineNumber;
		const primarySelectionEndLine = editContextPrimarySelection.endLineNumber;
		const endColumnOfEndLineNumber = model.getLineMaxColumn(primarySelectionEndLine);
		const rangeOfText = new Range(primarySelectionStartLine, 1, primarySelectionEndLine, endColumnOfEndLineNumber);
		const text = model.getValueInRange(rangeOfText, EndOfLinePreference.TextDefined);
		const selectionStartOffset = editContextPrimarySelection.startColumn - 1;
		const selectionEndOffset = text.length + editContextPrimarySelection.endColumn - endColumnOfEndLineNumber;
		return {
			text,
			selectionStartOffset,
			selectionEndOffset,
			editContextPrimarySelection
		};
	}

	private _editContextStartPosition(): Position {
		return new Position(this._editContextPrimarySelection.startLineNumber, 1);
	}

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {
		if (!this._editContext) {
			return;
		}
		const formats = e.getTextFormats();
		const editContextStartPosition = this._editContextStartPosition();
		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const textModel = this._context.viewModel.model;
			const offsetOfEditContextText = textModel.getOffsetAt(editContextStartPosition);
			const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
			const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
			const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
			const thickness = f.underlineThickness.toLowerCase();
			let decorationClassName: string = CompositionClassName.NONE;
			switch (thickness) {
				case 'thin':
					decorationClassName = CompositionClassName.SECONDARY;
					break;
				case 'thick':
					decorationClassName = CompositionClassName.PRIMARY;
					break;
			}
			decorations.push({
				range: decorationRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: decorationClassName,
				}
			});
		});
		this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _updateSelectionAndControlBounds(ctx: RenderingContext) {
		if (!this._parent) {
			return;
		}
		const options = this._context.configuration.options;
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const parentBounds = this._parent.getBoundingClientRect();
		const viewSelection = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(this._primarySelection);
		const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(viewSelection.startLineNumber);

		const top = parentBounds.top + verticalOffsetStart - this._scrollTop;
		const verticalOffsetEnd = this._context.viewLayout.getVerticalOffsetAfterLineNumber(viewSelection.endLineNumber);
		const height = verticalOffsetEnd - verticalOffsetStart;
		let left = parentBounds.left + contentLeft - this._scrollLeft;
		let width: number;

		if (this._primarySelection.isEmpty()) {
			const linesVisibleRanges = ctx.visibleRangeForPosition(viewSelection.getStartPosition());
			if (linesVisibleRanges) {
				left += linesVisibleRanges.left;
			}
			width = 0;
		} else {
			width = parentBounds.width - contentLeft;
		}

		const selectionBounds = new DOMRect(left, top, width, height);
		this._editContext.updateSelectionBounds(selectionBounds);
		this._editContext.updateControlBounds(selectionBounds);
	}

	private _updateCharacterBounds(e: CharacterBoundsUpdateEvent): void {
		if (!this._parent) {
			return;
		}
		const options = this._context.configuration.options;
		const typicalHalfWidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
		const parentBounds = this._parent.getBoundingClientRect();

		const characterBounds: DOMRect[] = [];
		const offsetTransformer = new PositionOffsetTransformer(this._editContext.text);
		for (let offset = e.rangeStart; offset < e.rangeEnd; offset++) {
			const editContextStartPosition = offsetTransformer.getPosition(offset);
			const textStartLineOffsetWithinEditor = this._editContextPrimarySelection.startLineNumber - 1;
			const characterStartPosition = new Position(textStartLineOffsetWithinEditor + editContextStartPosition.lineNumber, editContextStartPosition.column);
			const characterEndPosition = characterStartPosition.delta(0, 1);
			const characterModelRange = Range.fromPositions(characterStartPosition, characterEndPosition);
			const characterViewRange = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(characterModelRange);
			const characterLinesVisibleRanges = this._visibleRangeProvider.linesVisibleRangesForRange(characterViewRange, true) ?? [];
			const lineNumber = characterViewRange.startLineNumber;
			const characterVerticalOffset = this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
			const top = parentBounds.top + characterVerticalOffset - this._scrollTop;

			let left = 0;
			let width = typicalHalfWidthCharacterWidth;
			if (characterLinesVisibleRanges.length > 0) {
				for (const visibleRange of characterLinesVisibleRanges[0].ranges) {
					left = visibleRange.left;
					width = visibleRange.width;
					break;
				}
			}
			const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(lineNumber);
			characterBounds.push(new DOMRect(parentBounds.left + contentLeft + left - this._scrollLeft, top, width, lineHeight));
		}
		this._editContext.updateCharacterBounds(e.rangeStart, characterBounds);
	}

	private _ensureClipboardGetsEditorSelection(e: ClipboardEvent): void {
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
		e.preventDefault();
		if (e.clipboardData) {
			ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, storedMetadata);
		}
	}

	private _setSelectionChangeListener(viewController: ViewController): IDisposable {
		// See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
		// When using a Braille display or NVDA for example, it is possible for users to reposition the
		// system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.

		// `selectionchange` events often come multiple times for a single logical change
		// so throttle multiple `selectionchange` events that burst in a short period of time.
		let previousSelectionChangeEventTime = 0;
		return addDisposableListener(this.domNode.domNode.ownerDocument, 'selectionchange', () => {
			const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
			if (!this.isFocused() || !isScreenReaderOptimized || !IME.enabled) {
				return;
			}
			const screenReaderContentState = this._screenReaderSupport.screenReaderContentState;
			if (!screenReaderContentState) {
				return;
			}
			const now = Date.now();
			const delta1 = now - previousSelectionChangeEventTime;
			previousSelectionChangeEventTime = now;
			if (delta1 < 5) {
				// received another `selectionchange` event within 5ms of the previous `selectionchange` event
				// => ignore it
				return;
			}
			const delta2 = now - this._screenReaderSupport.getIgnoreSelectionChangeTime();
			this._screenReaderSupport.resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the textarea
				// => ignore it, since we caused it
				return;
			}
			const activeDocument = getActiveWindow().document;
			const activeDocumentSelection = activeDocument.getSelection();
			if (!activeDocumentSelection) {
				return;
			}
			const rangeCount = activeDocumentSelection.rangeCount;
			if (rangeCount === 0) {
				return;
			}
			const range = activeDocumentSelection.getRangeAt(0);
			const viewModel = this._context.viewModel;
			const model = viewModel.model;
			const coordinatesConverter = viewModel.coordinatesConverter;
			const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(screenReaderContentState.startPositionWithinEditor);
			const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
			let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
			let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
			const modelUsesCRLF = model.getEndOfLineSequence() === EndOfLineSequence.CRLF;
			if (modelUsesCRLF) {
				const screenReaderContentText = screenReaderContentState.value;
				const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
				const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
				const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
				offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
				offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
			}
			const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
			const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
			const newSelection = Selection.fromPositions(positionOfSelectionStart, positionOfSelectionEnd);
			viewController.setSelection(newSelection);
		});
	}
}
