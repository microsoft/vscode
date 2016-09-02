/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel} from 'vs/editor/common/editorCommon';
import {ILineTokens, IMode} from 'vs/editor/common/modes';
import {IModeService} from 'vs/editor/common/services/modeService';
import {RenderLineOutput, renderLine, RenderLineInput} from 'vs/editor/common/viewLayout/viewLineRenderer';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';

export interface IColorizerOptions {
	tabSize?: number;
}

export interface IColorizerElementOptions extends IColorizerOptions {
	theme?: string;
	mimeType?: string;
}

export class Colorizer {

	public static colorizeElement(modeService:IModeService, domNode:HTMLElement, options:IColorizerElementOptions): TPromise<void> {
		options = options || {};
		let theme = options.theme || 'vs';
		let mimeType = options.mimeType || domNode.getAttribute('lang') || domNode.getAttribute('data-lang');
		if (!mimeType) {
			console.error('Mode not detected');
			return;
		}
		let text = domNode.firstChild.nodeValue;
		domNode.className += 'monaco-editor ' + theme;
		let render = (str:string) => {
			domNode.innerHTML = str;
		};
		return this.colorize(modeService, text, mimeType, options).then(render, (err) => console.error(err), render);
	}

	private static _tokenizationSupportChangedPromise(target:IMode): TPromise<void> {
		let listener: IDisposable = null;
		let stopListening = () => {
			if (listener) {
				listener.dispose();
				listener = null;
			}
		};

		return new TPromise<void>((c, e, p) => {
			listener = target.addSupportChangedListener((e) => {
				if (e.tokenizationSupport) {
					stopListening();
					c(void 0);
				}
			});
		}, stopListening);
	}

	public static colorize(modeService:IModeService, text:string, mimeType:string, options:IColorizerOptions): TPromise<string> {
		options = options || {};
		if (typeof options.tabSize === 'undefined') {
			options.tabSize = 4;
		}

		let lines = text.split('\n');
		let c: (v:string)=>void;
		let e: (err:any)=>void;
		let p: (v:string)=>void;
		let isCanceled = false;
		let mode: IMode;

		let result = new TPromise<string>((_c, _e, _p) => {
			c = _c;
			e = _e;
			p = _p;
		}, () => {
			isCanceled = true;
		});

		let colorize = new RunOnceScheduler(() => {
			if (isCanceled) {
				return;
			}
			let r = actualColorize(lines, mode, options.tabSize);
			if (r.retokenize.length > 0) {
				// There are retokenization requests
				r.retokenize.forEach((p) => p.then(scheduleColorize));
				p(r.result);
			} else {
				// There are no (more) retokenization requests
				c(r.result);
			}
		}, 0);
		let scheduleColorize = () => colorize.schedule();

		modeService.getOrCreateMode(mimeType).then((_mode) => {
			if (!_mode) {
				e('Mode not found: "' + mimeType + '".');
				return;
			}
			if (!_mode.tokenizationSupport) {
				// wait 500ms for mode to load, then give up
				TPromise.any([this._tokenizationSupportChangedPromise(_mode), TPromise.timeout(500)]).then(_ => {
					if (!_mode.tokenizationSupport) {
						e('Mode found ("' + _mode.getId() + '"), but does not support tokenization.');
						return;
					}
					mode = _mode;
					scheduleColorize();
				});
				return;
			}
			mode = _mode;
			scheduleColorize();
		});

		return result;
	}

	public static colorizeLine(line:string, tokens:ViewLineToken[], tabSize:number = 4): string {
		let renderResult = renderLine(new RenderLineInput(
			line,
			tabSize,
			0,
			-1,
			false,
			false,
			tokens
		));
		return renderResult.output;
	}

	public static colorizeModelLine(model:IModel, lineNumber:number, tabSize:number = 4): string {
		let content = model.getLineContent(lineNumber);
		let tokens = model.getLineTokens(lineNumber, false);
		let inflatedTokens = tokens.inflate();
		return this.colorizeLine(content, inflatedTokens, tabSize);
	}
}


interface IActualColorizeResult {
	result:string;
	retokenize:TPromise<void>[];
}

function actualColorize(lines:string[], mode:IMode, tabSize:number): IActualColorizeResult {
	let tokenization = mode.tokenizationSupport,
		html:string[] = [],
		state = tokenization.getInitialState(),
		i:number,
		length:number,
		line: string,
		tokenizeResult: ILineTokens,
		renderResult: RenderLineOutput,
		retokenize: TPromise<void>[] = [];

	for (i = 0, length = lines.length; i < length; i++) {
		line = lines[i];

		tokenizeResult = tokenization.tokenize(line, state);
		if (tokenizeResult.retokenize) {
			retokenize.push(tokenizeResult.retokenize);
		}

		renderResult = renderLine(new RenderLineInput(
			line,
			tabSize,
			0,
			-1,
			false,
			false,
			tokenizeResult.tokens.map(t => new ViewLineToken(t.startIndex, t.type))
		));

		html = html.concat(renderResult.output);
		html.push('<br/>');

		state = tokenizeResult.endState;
	}

	return {
		result: html.join(''),
		retokenize: retokenize
	};
}