/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { HoverOperation, IHoverComputer } from './hoverOperation';
import { GlyphHoverWidget } from './hoverWidgets';
import { $ } from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { IOpenerService, NullOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModeService } from 'vs/editor/common/services/modeService';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IMarkdownString, isEmptyMarkdownString } from 'vs/base/common/htmlContent';

export interface IHoverMessage {
	value: IMarkdownString;
}

class MarginComputer implements IHoverComputer<IHoverMessage[]> {

	private _editor: ICodeEditor;
	private _lineNumber: number;
	private _result: IHoverMessage[];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._lineNumber = -1;
	}

	public setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		this._result = [];
	}

	public clearResult(): void {
		this._result = [];
	}

	public computeSync(): IHoverMessage[] {

		const toHoverMessage = (contents: IMarkdownString): IHoverMessage => {
			return {
				value: contents
			};
		};

		let lineDecorations = this._editor.getLineDecorations(this._lineNumber);

		let result: IHoverMessage[] = [];
		for (let i = 0, len = lineDecorations.length; i < len; i++) {
			let d = lineDecorations[i];

			if (!d.options.glyphMarginClassName) {
				continue;
			}

			let hoverMessage = d.options.glyphMarginHoverMessage;

			if (isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			if (Array.isArray(hoverMessage)) {
				result = result.concat(hoverMessage.map(toHoverMessage));
			} else {
				result.push(toHoverMessage(hoverMessage));
			}
		}

		return result;
	}

	public onResult(result: IHoverMessage[], isFromSynchronousComputation: boolean): void {
		this._result = this._result.concat(result);
	}

	public getResult(): IHoverMessage[] {
		return this._result;
	}

	public getResultWithLoadingMessage(): IHoverMessage[] {
		return this.getResult();
	}
}

export class ModesGlyphHoverWidget extends GlyphHoverWidget {

	public static ID = 'editor.contrib.modesGlyphHoverWidget';
	private _messages: IHoverMessage[];
	private _lastLineNumber: number;

	private _computer: MarginComputer;
	private _hoverOperation: HoverOperation<IHoverMessage[]>;

	constructor(editor: ICodeEditor, private openerService: IOpenerService, private modeService: IModeService) {
		super(ModesGlyphHoverWidget.ID, editor);

		this.openerService = openerService || NullOpenerService;

		this._lastLineNumber = -1;

		this._computer = new MarginComputer(this._editor);

		this._hoverOperation = new HoverOperation(
			this._computer,
			(result: IHoverMessage[]) => this._withResult(result),
			null,
			(result: any) => this._withResult(result)
		);

	}

	public dispose(): void {
		this._hoverOperation.cancel();
		super.dispose();
	}

	public onModelDecorationsChanged(): void {
		if (this.isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start();
		}
	}

	public startShowingAt(lineNumber: number): void {
		if (this._lastLineNumber === lineNumber) {
			// We have to show the widget at the exact same line number as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();

		this.hide();

		this._lastLineNumber = lineNumber;
		this._computer.setLineNumber(lineNumber);
		this._hoverOperation.start();
	}

	public hide(): void {
		this._lastLineNumber = -1;
		this._hoverOperation.cancel();
		super.hide();
	}

	public _withResult(result: IHoverMessage[]): void {
		this._messages = result;

		if (this._messages.length > 0) {
			this._renderMessages(this._lastLineNumber, this._messages);
		} else {
			this.hide();
		}
	}

	private _renderMessages(lineNumber: number, messages: IHoverMessage[]): void {

		const fragment = document.createDocumentFragment();

		messages.forEach((msg) => {
			const renderedContents = renderMarkdown(msg.value, {
				actionCallback: content => this.openerService.open(URI.parse(content)).then(undefined, onUnexpectedError),
				codeBlockRenderer: (languageAlias, value): string | TPromise<string> => {
					// In markdown, it is possible that we stumble upon language aliases (e.g. js instead of javascript)
					const modeId = this.modeService.getModeIdForLanguageName(languageAlias);
					return this.modeService.getOrCreateMode(modeId).then(_ => {
						return tokenizeToString(value, modeId);
					});
				}
			});

			fragment.appendChild($('div.hover-row', null, renderedContents));
		});

		this.updateContents(fragment);
		this.showAt(lineNumber);
	}
}
