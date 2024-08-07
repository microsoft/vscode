/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { getMapForWordSeparators, WordCharacterClass } from 'vs/editor/common/core/wordCharacterClassifier';
import { IViewModel } from 'vs/editor/common/viewModel';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import * as browser from 'vs/base/browser/browser';
import { EditorOption, EditorOptions, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import * as strings from 'vs/base/common/strings';
import * as nls from 'vs/nls';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { ColorId, ITokenPresentation } from 'vs/editor/common/encodedTokenAttributes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IME } from 'vs/base/common/ime';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { Color } from 'vs/base/common/color';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';


export class VisibleTextAreaData {
	_visibleTextAreaBrand: void = undefined;

	public startPosition: Position | null = null;
	public endPosition: Position | null = null;

	public visibleTextareaStart: HorizontalPosition | null = null;
	public visibleTextareaEnd: HorizontalPosition | null = null;

	/**
	 * When doing composition, the currently composed text might be split up into
	 * multiple tokens, then merged again into a single token, etc. Here we attempt
	 * to keep the presentation of the <textarea> stable by using the previous used
	 * style if multiple tokens come into play. This avoids flickering.
	 */
	private _previousPresentation: ITokenPresentation | null = null;

	constructor(
		private readonly _context: ViewContext,
		public readonly modelLineNumber: number,
		public readonly distanceToModelLineStart: number,
		public readonly widthOfHiddenLineTextBefore: number,
		public readonly distanceToModelLineEnd: number,
	) {
	}

	// called mainly inside of onCompositionStart and onCompositionUpdate. In order to understand why this is needed, need to first start working with the IME issues, and make the div 0 by 0 pixels before touching this ground.
	prepareRender(visibleRangeProvider: IVisibleRangeProvider): void {
		const startModelPosition = new Position(this.modelLineNumber, this.distanceToModelLineStart + 1);
		const endModelPosition = new Position(this.modelLineNumber, this._context.viewModel.model.getLineMaxColumn(this.modelLineNumber) - this.distanceToModelLineEnd);

		this.startPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(startModelPosition);
		this.endPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(endModelPosition);

		if (this.startPosition.lineNumber === this.endPosition.lineNumber) {
			this.visibleTextareaStart = visibleRangeProvider.visibleRangeForPosition(this.startPosition);
			this.visibleTextareaEnd = visibleRangeProvider.visibleRangeForPosition(this.endPosition);
		} else {
			// TODO: what if the view positions are not on the same line?
			this.visibleTextareaStart = null;
			this.visibleTextareaEnd = null;
		}
	}

	// will need to define the presentation when the IME is used. Currently in my PR I have not touched upon this, when the time comes, need to understand what this is used for and how I should use it.
	definePresentation(tokenPresentation: ITokenPresentation | null): ITokenPresentation {
		if (!this._previousPresentation) {
			// To avoid flickering, once set, always reuse a presentation throughout the entire IME session
			if (tokenPresentation) {
				this._previousPresentation = tokenPresentation;
			} else {
				this._previousPresentation = {
					foreground: ColorId.DefaultForeground,
					italic: false,
					bold: false,
					underline: false,
					strikethrough: false,
				};
			}
		}
		return this._previousPresentation;
	}
}

export const canUseZeroSizeTextarea = (browser.isFirefox);

export function setAccessibilityOptions(options: IComputedEditorOptions, canUseZeroSizeTextarea: boolean): {
	accessibilitySupport: AccessibilitySupport;
	accessibilityPageSize: number;
	textAreaWrapping: boolean;
	textAreaWidth: number;
} {
	const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
	let accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	if (accessibilitySupport === AccessibilitySupport.Enabled && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
		// If a screen reader is attached and the default value is not set we should automatically increase the page size to 500 for a better experience
		accessibilityPageSize = 500;
	} else {
		accessibilityPageSize = accessibilityPageSize;
	}

	// When wrapping is enabled and a screen reader might be attached,
	// we will size the textarea to match the width used for wrapping points computation (see `domLineBreaksComputer.ts`).
	// This is because screen readers will read the text in the textarea and we'd like that the
	// wrapping points in the textarea match the wrapping points in the editor.
	const layoutInfo = options.get(EditorOption.layoutInfo);
	const wrappingColumn = layoutInfo.wrappingColumn;
	let textAreaWidth: number;
	let textAreaWrapping: boolean;
	if (wrappingColumn !== -1 && accessibilitySupport !== AccessibilitySupport.Disabled) {
		const fontInfo = options.get(EditorOption.fontInfo);
		textAreaWrapping = true;
		textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
	} else {
		textAreaWrapping = false;
		textAreaWidth = (canUseZeroSizeTextarea ? 0 : 1);
	}
	return {
		accessibilitySupport,
		accessibilityPageSize,
		textAreaWrapping,
		textAreaWidth
	};
}

export function getAndroidWordAtPosition(viewModel: IViewModel, position: Position): [string, number] {
	const ANDROID_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
	const lineContent = viewModel.getLineContent(position.lineNumber);
	const wordSeparators = getMapForWordSeparators(ANDROID_WORD_SEPARATORS, []);

	let goingLeft = true;
	let startColumn = position.column;
	let goingRight = true;
	let endColumn = position.column;
	let distance = 0;
	while (distance < 50 && (goingLeft || goingRight)) {
		if (goingLeft && startColumn <= 1) {
			goingLeft = false;
		}
		if (goingLeft) {
			const charCode = lineContent.charCodeAt(startColumn - 2);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular) {
				goingLeft = false;
			} else {
				startColumn--;
			}
		}
		if (goingRight && endColumn > lineContent.length) {
			goingRight = false;
		}
		if (goingRight) {
			const charCode = lineContent.charCodeAt(endColumn - 1);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular) {
				goingRight = false;
			} else {
				endColumn++;
			}
		}
		distance++;
	}

	return [lineContent.substring(startColumn - 1, endColumn - 1), position.column - startColumn];
}

export function getWordBeforePosition(viewContext: ViewContext, position: Position): string {
	const lineContent = viewContext.viewModel.getLineContent(position.lineNumber);
	const wordSeparators = getMapForWordSeparators(viewContext.configuration.options.get(EditorOption.wordSeparators), []);

	let column = position.column;
	let distance = 0;
	while (column > 1) {
		const charCode = lineContent.charCodeAt(column - 2);
		const charClass = wordSeparators.get(charCode);
		if (charClass !== WordCharacterClass.Regular || distance > 50) {
			return lineContent.substring(column - 1, position.column - 1);
		}
		distance++;
		column--;
	}
	return lineContent.substring(0, position.column - 1);
}

export function getCharacterBeforePosition(viewModel: IViewModel, position: Position): string {
	if (position.column > 1) {
		const lineContent = viewModel.getLineContent(position.lineNumber);
		const charBefore = lineContent.charAt(position.column - 2);
		if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
			return charBefore;
		}
	}
	return '';
}

export function getAriaLabel(options: IComputedEditorOptions, keybindingService: IKeybindingService): string {
	const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
	if (accessibilitySupport === AccessibilitySupport.Disabled) {

		const toggleKeybindingLabel = keybindingService.lookupKeybinding('editor.action.toggleScreenReaderAccessibilityMode')?.getAriaLabel();
		const runCommandKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.showCommands')?.getAriaLabel();
		const keybindingEditorKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings')?.getAriaLabel();
		const editorNotAccessibleMessage = nls.localize('accessibilityModeOff', "The editor is not accessible at this time.");
		if (toggleKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabel', "{0} To enable screen reader optimized mode, use {1}", editorNotAccessibleMessage, toggleKeybindingLabel);
		} else if (runCommandKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabelNoKb', "{0} To enable screen reader optimized mode, open the quick pick with {1} and run the command Toggle Screen Reader Accessibility Mode, which is currently not triggerable via keyboard.", editorNotAccessibleMessage, runCommandKeybindingLabel);
		} else if (keybindingEditorKeybindingLabel) {
			return nls.localize('accessibilityOffAriaLabelNoKbs', "{0} Please assign a keybinding for the command Toggle Screen Reader Accessibility Mode by accessing the keybindings editor with {1} and run it.", editorNotAccessibleMessage, keybindingEditorKeybindingLabel);
		} else {
			// SOS
			return editorNotAccessibleMessage;
		}
	}
	return options.get(EditorOption.ariaLabel);
}

export function setAttributes(
	domNode: HTMLElement,
	tabSize: number,
	textAreaWrapping: boolean,
	visibleTextArea: VisibleTextAreaData | null,
	options: IComputedEditorOptions,
	keybindingService: IKeybindingService
): void {
	domNode.setAttribute('wrap', textAreaWrapping && !visibleTextArea ? 'on' : 'off');
	domNode.style.tabSize = `${tabSize * options.get(EditorOption.fontInfo).spaceWidth}px`;
	domNode.setAttribute('autocorrect', 'off');
	domNode.setAttribute('autocapitalize', 'off');
	domNode.setAttribute('autocomplete', 'off');
	domNode.setAttribute('spellcheck', 'false');
	domNode.setAttribute('aria-label', getAriaLabel(options, keybindingService));
	domNode.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
	domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
	domNode.setAttribute('role', 'textbox');
	domNode.setAttribute('aria-roledescription', nls.localize('editor', "editor"));
	domNode.setAttribute('aria-multiline', 'true');
	domNode.setAttribute('aria-autocomplete', options.get(EditorOption.readOnly) ? 'none' : 'both');
}

export function changeAttributesOnConfigurationChange(
	domNode: HTMLElement,
	tabSize: number,
	textAreaWrapping: boolean,
	visibleTextArea: VisibleTextAreaData | null,
	options: IComputedEditorOptions,
	keybindingService: IKeybindingService
) {
	domNode.setAttribute('wrap', textAreaWrapping && !visibleTextArea ? 'on' : 'off');
	domNode.style.tabSize = `${tabSize * options.get(EditorOption.fontInfo).spaceWidth}px`;
	domNode.setAttribute('aria-label', getAriaLabel(options, keybindingService));
	domNode.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
	domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
}

export function ensureReadOnlyAttribute(domNode: HTMLElement, options: IComputedEditorOptions): void {
	// When someone requests to disable IME, we set the "readonly" attribute on the <textarea>.
	// This will prevent composition.
	const useReadOnly = !IME.enabled || (options.get(EditorOption.domReadOnly) && options.get(EditorOption.readOnly));
	if (useReadOnly) {
		domNode.setAttribute('readonly', 'true');
	} else {
		domNode.removeAttribute('readonly');
	}
}

export function setAriaOptions(domNode: HTMLElement, options: IEditorAriaOptions): void {
	if (options.activeDescendant) {
		domNode.setAttribute('aria-haspopup', 'true');
		domNode.setAttribute('aria-autocomplete', 'list');
		domNode.setAttribute('aria-activedescendant', options.activeDescendant);
	} else {
		domNode.setAttribute('aria-haspopup', 'false');
		domNode.setAttribute('aria-autocomplete', 'both');
		domNode.removeAttribute('aria-activedescendant');
	}
	if (options.role) {
		domNode.setAttribute('role', options.role);
	}
}

export function newlinecount(text: string): number {
	let result = 0;
	let startIndex = -1;
	do {
		startIndex = text.indexOf('\n', startIndex + 1);
		if (startIndex === -1) {
			break;
		}
		result++;
	} while (true);
	return result;
}

export interface IRenderData {
	lastRenderPosition: Position | null;
	top: number;
	left: number;
	width: number;
	height: number;
	useCover: boolean;

	color?: Color | null;
	italic?: boolean;
	bold?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
}

export function measureText(targetDocument: Document, text: string, fontInfo: FontInfo, tabSize: number): number {
	if (text.length === 0) {
		return 0;
	}

	const container = targetDocument.createElement('div');
	container.style.position = 'absolute';
	container.style.top = '-50000px';
	container.style.width = '50000px';

	const regularDomNode = targetDocument.createElement('span');
	applyFontInfo(regularDomNode, fontInfo);
	regularDomNode.style.whiteSpace = 'pre'; // just like the textarea
	regularDomNode.style.tabSize = `${tabSize * fontInfo.spaceWidth}px`; // just like the textarea
	regularDomNode.append(text);
	container.appendChild(regularDomNode);

	targetDocument.body.appendChild(container);

	const res = regularDomNode.offsetWidth;

	container.remove();

	return res;
}

export interface IVisibleRangeProvider {
	visibleRangeForPosition(position: Position): HorizontalPosition | null;
}
