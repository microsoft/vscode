/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { ariaLabelForScreenReaderContent, ISimpleModel, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/editContext/editContext';
import { EditorOption, EditorOptions, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as dom from 'vs/base/browser/dom';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { Position } from 'vs/editor/common/core/position';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { Disposable } from 'vs/base/common/lifecycle';

export class ScreenReaderContentHandler extends Disposable {

	private readonly _domElement: FastDomNode<HTMLDivElement>;

	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;
	private _primarySelection: Selection;
	private _context: ViewContext;

	public screenReaderContentSelectionOffsetRange: OffsetRange | null = null;

	constructor(
		domElement: FastDomNode<HTMLDivElement>,
		context: ViewContext,
		viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		console.log('screen reader content handler constructor');

		super();
		this._context = context;
		this._domElement = domElement;
		const options = this._context.configuration.options;
		this._setAccessibilityOptions(options);

		this._primarySelection = new Selection(1, 1, 1, 1);

		domElement.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		domElement.setAttribute('role', 'textbox');

		this.writeScreenReaderContent('ctor');
	}

	public writeScreenReaderContent(reason: string): void {
		console.log('writeScreenReaderContent');
		this._writeScreenReaderContent(reason);
	}

	private _writeScreenReaderContent(reason: string): void {
		console.log('_writeScreenReaderContent');
		if (this._accessibilitySupport === AccessibilitySupport.Enabled) {
			const screenReaderContentState = this._getScreenReaderContentState();
			console.log('screenReaderContentState.value : ', screenReaderContentState.value);
			this._setScreenReaderContent(reason, screenReaderContentState.value); // can we allow empty string?
			this._setSelectionOfScreenReaderContent(reason, screenReaderContentState.selectionStart, screenReaderContentState.selectionEnd);
		}
	}

	public override dispose(): void {
		super.dispose();
		this._domElement.domNode.remove();
	}

	private _setAccessibilityOptions(options: IComputedEditorOptions): void {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		let accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
		if (accessibilitySupport === AccessibilitySupport.Enabled && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
			// If a screen reader is attached and the default value is not set we should automatically increase the page size to 500 for a better experience
			accessibilityPageSize = 500;
		} else {
			accessibilityPageSize = accessibilityPageSize;
		}
		this._accessibilitySupport = accessibilitySupport;
		this._accessibilityPageSize = accessibilityPageSize;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		this._setAccessibilityOptions(options);
		this._domElement.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this._writeScreenReaderContent('strategy changed');
		}
		return true;
	}

	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.selections.slice(0)[0] ?? new Selection(1, 1, 1, 1);
		// We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
		// See https://github.com/microsoft/vscode/issues/165821
		this._writeScreenReaderContent('selection changed');
		return true;
	}

	// --- end view API

	private _getScreenReaderContentState(): {
		value: string;
		selectionStart: number;
		selectionEnd: number;
	} {
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};
		console.log('_getScreenReaderContentState');
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
	}

	private _setScreenReaderContent(reason: string, value: string): void {

		console.log('setValue : ', value);
		console.log('value : ', value);

		if (this._domElement.domNode.textContent === value) {
			// No change
			return;
		}
		this._domElement.domNode.textContent = value;
	}

	private _setSelectionOfScreenReaderContent(reason: string, selectionStart: number, selectionEnd: number): void {

		console.log('_setSelectionOfScreenReaderContent');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		this.screenReaderContentSelectionOffsetRange = new OffsetRange(selectionStart, selectionEnd);

		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		console.log('activeDocumentSelection : ', activeDocumentSelection);
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = this._domElement.domNode.firstChild;
			console.log('this._domElement.domNode : ', this._domElement.domNode);
			console.log('firstChild : ', firstChild);
			if (firstChild) {
				range.setStart(firstChild, selectionStart);
				range.setEnd(firstChild, selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
				console.log('activeDocumentSelection updated : ', activeDocumentSelection);
			}
		}

		console.log('dom.getActiveElement() in _setSelectionOfScreenReaderContent : ', dom.getActiveElement());
	}
}
