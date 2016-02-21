/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {TPromise} from 'vs/base/common/winjs.base';
import {ILineToken, IModel, LineTokensBinaryEncoding} from 'vs/editor/common/editorCommon';
import {ILineTokens, IMode} from 'vs/editor/common/modes';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IRenderLineOutput, renderLine} from 'vs/editor/common/viewLayout/viewLineRenderer';

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
		var theme = options.theme || 'vs';
		var mimeType = options.mimeType || domNode.getAttribute('lang') || domNode.getAttribute('data-lang');
		if (!mimeType) {
			console.error('Mode not detected');
			return;
		}
		var text = domNode.firstChild.nodeValue;
		domNode.className += 'monaco-editor ' + theme;
		var render = (str:string) => {
			domNode.innerHTML = str;
		};
		return this.colorize(modeService, text, mimeType, options).then(render, (err) => console.error(err), render);
	}

	public static colorize(modeService:IModeService, text:string, mimeType:string, options:IColorizerOptions): TPromise<string> {
		options = options || {};
		if (typeof options.tabSize === 'undefined') {
			options.tabSize = 4;
		}

		var lines = text.split('\n'),
			c: (v:string)=>void,
			e: (err:any)=>void,
			p: (v:string)=>void,
			isCancelled = false,
			mode: IMode;

		var result = new TPromise<string>((_c, _e, _p) => {
			c = _c;
			e = _e;
			p = _p;
		}, () => {
			isCancelled = true;
		});

		var colorize = new RunOnceScheduler(() => {
			if (isCancelled) {
				return;
			}
			var r = actualColorize(lines, mode, options.tabSize);
			if (r.retokenize.length > 0) {
				// There are retokenization requests
				r.retokenize.forEach((p) => p.then(scheduleColorize));
				p(r.result);
			} else {
				// There are no (more) retokenization requests
				c(r.result);
			}
		}, 0);
		var scheduleColorize = () => colorize.schedule();

		modeService.getOrCreateMode(mimeType).then((_mode) => {
			if (!_mode) {
				e('Mode not found: "' + mimeType + '".');
				return;
			}
			if (!_mode.tokenizationSupport) {
				e('Mode found ("' + _mode.getId() + '"), but does not support tokenization.');
				return;
			}
			mode = _mode;
			scheduleColorize();
		});

		return result;
	}

	public static colorizeLine(line:string, tokens:ILineToken[], tabSize:number = 4): string {
		var renderResult = renderLine({
			lineContent: line,
			parts: tokens,
			stopRenderingLineAfter: -1,
			renderWhitespace: false,
			tabSize: tabSize
		});
		return renderResult.output.join('');
	}

	public static colorizeModelLine(model:IModel, lineNumber:number, tabSize:number = 4): string {
		var content = model.getLineContent(lineNumber);
		var tokens = model.getLineTokens(lineNumber, false);
		var inflatedTokens = LineTokensBinaryEncoding.inflateArr(tokens.getBinaryEncodedTokensMap(), tokens.getBinaryEncodedTokens());
		return this.colorizeLine(content, inflatedTokens, tabSize);
	}
}


interface IActualColorizeResult {
	result:string;
	retokenize:TPromise<void>[];
}

function actualColorize(lines:string[], mode:IMode, tabSize:number): IActualColorizeResult {
	var tokenization = mode.tokenizationSupport,
		html:string[] = [],
		state = tokenization.getInitialState(),
		i:number,
		length:number,
		line: string,
		tokenizeResult: ILineTokens,
		renderResult: IRenderLineOutput,
		retokenize: TPromise<void>[] = [];

	for (i = 0, length = lines.length; i < length; i++) {
		line = lines[i];

		tokenizeResult = tokenization.tokenize(line, state);
		if (tokenizeResult.retokenize) {
			retokenize.push(tokenizeResult.retokenize);
		}

		renderResult = renderLine({
			lineContent: line,
			parts: tokenizeResult.tokens,
			stopRenderingLineAfter: -1,
			renderWhitespace: false,
			tabSize: tabSize
		});

		html = html.concat(renderResult.output);
		html.push('<br/>');

		state = tokenizeResult.endState;
	}

	return {
		result: html.join(''),
		retokenize: retokenize
	};
}