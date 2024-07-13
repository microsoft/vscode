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
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit, TextEdit, LineBasedText } from 'vs/editor/common/core/textEdit';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent, ViewScrollChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as nls from 'vs/nls';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as dom from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';

// TODO
// 1. Need to rerender the dom element on selection change, so that contains correct elements
// 2. Make screen reader read only part of the text area, why is it currently reading the full text area?

// TODO

// Make copy paste add correctly the text
// Add settings
// Investigate how to make the screen reader read the correct part of the div, we would want it to read letter by letter like in the text area
// Investigate other ways of using the text area, is all hope lost?

export class NativeEditContext extends AbstractEditContext {
	private readonly _domElement = new FastDomNode(document.createElement('div'));
	// private readonly _domTextAreaElement = new FastDomNode(document.createElement('textarea'));
	private readonly _ctx: EditContext = this._domElement.domNode.editContext = new DebugEditContext();


	private _parent!: HTMLElement;
	private _scrollTop = 0;
	private _contentLeft = 0;

	private _isFocused = false;

	private _editContextState: EditContextState | undefined = undefined;

	constructor(
		context: ViewContext,
		private readonly _viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(context);

		this._domElement.domNode.tabIndex = 0;
		this._domElement.domNode.style.width = '100px';
		this._domElement.domNode.style.height = '100px';
		this._domElement.domNode.role = 'contenteditable';

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

		const options = context.configuration.options;
		// const domTextAreaElement = this._domTextAreaElement;
		// domTextAreaElement.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		// domTextAreaElement.setAttribute('wrap', false ? 'on' : 'off'); // TODO
		// const { tabSize } = this._context.viewModel.model.getOptions();
		// domTextAreaElement.domNode.style.tabSize = `${tabSize * 18}px`; // TODO
		// domTextAreaElement.setAttribute('autocorrect', 'off');
		// domTextAreaElement.setAttribute('autocapitalize', 'off');
		// domTextAreaElement.setAttribute('autocomplete', 'off');
		// domTextAreaElement.setAttribute('spellcheck', 'false');
		// domTextAreaElement.setAttribute('aria-label', this._getAriaLabel(options));
		// domTextAreaElement.setAttribute('aria-required', false ? 'true' : 'false'); // TODO
		// domTextAreaElement.setAttribute('tabindex', '0'); // TODO
		// domTextAreaElement.setAttribute('role', 'textbox');
		// domTextAreaElement.setAttribute('aria-roledescription', nls.localize('editor', "editor"));
		// domTextAreaElement.setAttribute('aria-multiline', 'true');
		// domTextAreaElement.setAttribute('aria-autocomplete', false ? 'none' : 'both'); // TODO
		// domTextAreaElement.setAttribute('height', '18px');
		// domTextAreaElement.setAttribute('width', '1px');
		// this._domElement.domNode.appendChild(domTextAreaElement.domNode);

		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;

		this._register(editContextAddDisposableListener(this._ctx, 'textupdate', e => this._handleStandardTextUpdate(e)));
		this._register(editContextAddDisposableListener(this._ctx, 'textformatupdate', e => this._handleTextFormatUpdate(e)));
		this._ctx.addEventListener('textformatupdate', e => {
			console.log('text format update');
			console.log('e : ', e);
		});
		this._ctx.addEventListener('textupdate', e => {
			console.log('text update');
			console.log('e : ', e);
		});
		this._ctx.addEventListener('characterboundsupdate', e => {
			console.log('characterboundsupdate update');
			console.log('e : ', e);
		});
		this._ctx.addEventListener('oncompositionstart', e => {
			console.log('composition start');
			console.log('e : ', e);
		});
		this._ctx.addEventListener('oncompositionend', e => {
			console.log('composition end');
			console.log('e : ', e);
		});
		this._domElement.domNode.addEventListener('beforeinput', e => {
			console.log('e : ', e);
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._handleEnter(e);
			}
		});

		let copyText: string | undefined;
		this._domElement.domNode.addEventListener('copy', e => {
			console.log('copy');
			console.log('e : ', e);
			// need to set the selection correctly so that the correct text is copied, currently the top most text is copied
			const target = e.target;
			if (target && dom.isHTMLElement(target)) {
				copyText = target.innerText;
			} else {
				copyText = undefined;
			}
		});
		this._domElement.domNode.addEventListener('keydown', e => {
			console.log('onkeydown');
			console.log('e : ', e);
			const x = new StandardKeyboardEvent(e);
			if ((x.metaKey || x.ctrlKey) && x.keyCode === KeyCode.KeyV) {
				if (copyText !== undefined && this._editContextState) {
					this._handleTextUpdate(this._editContextState.positionOffset, this._editContextState.positionOffset, copyText);
					copyText = undefined;
				}
			}
		});
		console.log('this._domElement : ', this._domElement);
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
		e.preventDefault();
		if (!this._editContextState) {
			return;
		}
		this._handleTextUpdate(this._editContextState.positionOffset, this._editContextState.positionOffset, '\n');

	}

	private _handleStandardTextUpdate(e: TextUpdateEvent): void {
		this._handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text);
	}

	private _handleTextUpdate(updateRangeStart: number, updateRangeEnd: number, text: string): void {
		console.log('_handleTextUpdate');
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
		console.log('updateText');
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

		console.log('value : ', value);
		console.log('selection start : ', selection.start, ', and end : ', selection.endExclusive);

		this._ctx.updateText(0, Number.MAX_SAFE_INTEGER, value);
		this._ctx.updateSelection(selection.start, selection.endExclusive);

		const splitText = value.split('\n');
		this._domElement.domNode.replaceChildren();
		for (const line of splitText) {
			const lineDomNode = document.createElement('span');
			lineDomNode.tabIndex = 0;
			lineDomNode.textContent = line;
			lineDomNode.role = 'contenteditable';
			this._domElement.domNode.appendChild(lineDomNode);
		}
		console.log('splitText : ', splitText);
		console.log('this._domElement : ', this._domElement);

		// this._domTextAreaElement.domNode.value = value;
		// this._domTextAreaElement.domNode.setSelectionRange(selection.start, selection.endExclusive);
	}

	public override prepareRender(ctx: RenderingContext): void {
		console.log('prepareRender');
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
		console.log('onCursorStateChanged');
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
		console.log('focusTextArea');
		console.log('this._domNode.domNode : ', this._domElement.domNode);
		// console.log('this._domTextAreaElement.domNode : ', this._domTextAreaElement.domNode);
		// console.log('this._domTextAreaElement.domNode.value : ', this._domTextAreaElement.domNode.value);
		// console.log('this._domTextAreaElement.domNode.selectionStart : ', this._domTextAreaElement.domNode.selectionStart);
		// console.log('this._domTextAreaElement.domNode.selectionEnd : ', this._domTextAreaElement.domNode.selectionEnd);
		// this._domTextAreaElement.domNode.focus();

		// const child = this._domElement.domNode.children[0];
		// (child as HTMLElement).focus();

		this._domElement.domNode.focus();
	}

	private _getAriaLabel(options: IComputedEditorOptions): string {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		if (accessibilitySupport === AccessibilitySupport.Disabled) {
			const toggleKeybindingLabel = this._keybindingService.lookupKeybinding('editor.action.toggleScreenReaderAccessibilityMode')?.getAriaLabel();
			const runCommandKeybindingLabel = this._keybindingService.lookupKeybinding('workbench.action.showCommands')?.getAriaLabel();
			const keybindingEditorKeybindingLabel = this._keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings')?.getAriaLabel();
			const editorNotAccessibleMessage = nls.localize('accessibilityModeOff', "The editor is not accessible at this time.");
			if (toggleKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabel', "{0} To enable screen reader optimized mode, use {1}", editorNotAccessibleMessage, toggleKeybindingLabel);
			} else if (runCommandKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabelNoKb', "{0} To enable screen reader optimized mode, open the quick pick with {1} and run the command Toggle Screen Reader Accessibility Mode, which is currently not triggerable via keyboard.", editorNotAccessibleMessage, runCommandKeybindingLabel);
			} else if (keybindingEditorKeybindingLabel) {
				return nls.localize('accessibilityOffAriaLabelNoKbs', "{0} Please assign a keybinding for the command Toggle Screen Reader Accessibility Mode by accessing the keybindings editor with {1} and run it.", editorNotAccessibleMessage, keybindingEditorKeybindingLabel);
			} else {
				return editorNotAccessibleMessage;
			}
		}
		return options.get(EditorOption.ariaLabel);
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
