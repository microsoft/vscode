/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { TokenizationRegistry, ITokenizationSupport } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { renderLine, RenderLineInput } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { LineParts } from 'vs/editor/common/core/lineParts';

export interface IColorizerOptions {
	tabSize?: number;
}

export interface IColorizerElementOptions extends IColorizerOptions {
	theme?: string;
	mimeType?: string;
}

export class Colorizer {

	public static colorizeElement(modeService: IModeService, domNode: HTMLElement, options: IColorizerElementOptions): TPromise<void> {
		options = options || {};
		let theme = options.theme || 'vs';
		let mimeType = options.mimeType || domNode.getAttribute('lang') || domNode.getAttribute('data-lang');
		if (!mimeType) {
			console.error('Mode not detected');
			return;
		}
		let text = domNode.firstChild.nodeValue;
		domNode.className += 'monaco-editor ' + theme;
		let render = (str: string) => {
			domNode.innerHTML = str;
		};
		return this.colorize(modeService, text, mimeType, options).then(render, (err) => console.error(err), render);
	}

	private static _tokenizationSupportChangedPromise(languageId: string): TPromise<void> {
		let listener: IDisposable = null;
		let stopListening = () => {
			if (listener) {
				listener.dispose();
				listener = null;
			}
		};

		return new TPromise<void>((c, e, p) => {
			listener = TokenizationRegistry.onDidChange((e) => {
				if (e.languageId === languageId) {
					stopListening();
					c(void 0);
				}
			});
		}, stopListening);
	}

	public static colorize(modeService: IModeService, text: string, mimeType: string, options: IColorizerOptions): TPromise<string> {
		let lines = text.split('\n');
		let languageId = modeService.getModeId(mimeType);

		options = options || {};
		if (typeof options.tabSize === 'undefined') {
			options.tabSize = 4;
		}

		// Send out the event to create the mode
		modeService.getOrCreateMode(languageId);

		let tokenizationSupport = TokenizationRegistry.get(languageId);
		if (tokenizationSupport) {
			return TPromise.as(_colorize(lines, options.tabSize, tokenizationSupport));
		}

		// wait 500ms for mode to load, then give up
		return TPromise.any([this._tokenizationSupportChangedPromise(languageId), TPromise.timeout(500)]).then(_ => {
			let tokenizationSupport = TokenizationRegistry.get(languageId);
			if (tokenizationSupport) {
				return _colorize(lines, options.tabSize, tokenizationSupport);
			}
			return _fakeColorize(lines, options.tabSize);
		});
	}

	public static colorizeLine(line: string, tokens: ViewLineToken[], tabSize: number = 4): string {
		let renderResult = renderLine(new RenderLineInput(
			line,
			tabSize,
			0,
			-1,
			'none',
			false,
			new LineParts(tokens, line.length + 1)
		));
		return renderResult.output;
	}

	public static colorizeModelLine(model: IModel, lineNumber: number, tabSize: number = 4): string {
		let content = model.getLineContent(lineNumber);
		let tokens = model.getLineTokens(lineNumber, false);
		let inflatedTokens = tokens.inflate();
		return this.colorizeLine(content, inflatedTokens, tabSize);
	}
}

function _colorize(lines: string[], tabSize: number, tokenizationSupport: ITokenizationSupport): string {
	return _actualColorize(lines, tabSize, tokenizationSupport);
}

function _fakeColorize(lines: string[], tabSize: number): string {
	let html: string[] = [];

	for (let i = 0, length = lines.length; i < length; i++) {
		let line = lines[i];

		let renderResult = renderLine(new RenderLineInput(
			line,
			tabSize,
			0,
			-1,
			'none',
			false,
			new LineParts([], line.length + 1)
		));

		html = html.concat(renderResult.output);
		html.push('<br/>');
	}

	return html.join('');
}

function _actualColorize(lines: string[], tabSize: number, tokenizationSupport: ITokenizationSupport): string {
	let html: string[] = [];
	let state = tokenizationSupport.getInitialState();

	for (let i = 0, length = lines.length; i < length; i++) {
		let line = lines[i];

		let tokenizeResult = tokenizationSupport.tokenize(line, state);

		let renderResult = renderLine(new RenderLineInput(
			line,
			tabSize,
			0,
			-1,
			'none',
			false,
			new LineParts(tokenizeResult.tokens.map(t => new ViewLineToken(t.startIndex, t.type)), line.length + 1)
		));

		html = html.concat(renderResult.output);
		html.push('<br/>');

		state = tokenizeResult.endState;
	}

	return html.join('');
}
