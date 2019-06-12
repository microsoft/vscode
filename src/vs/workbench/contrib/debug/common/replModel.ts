/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import severity from 'vs/base/common/severity';
import { IReplElement, IStackFrame, IExpression, IReplElementSource, IDebugSession } from 'vs/workbench/contrib/debug/common/debug';
import { Expression, SimpleReplElement, RawObjectReplElement } from 'vs/workbench/contrib/debug/common/debugModel';
import { isUndefinedOrNull, isObject } from 'vs/base/common/types';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { endsWith } from 'vs/base/common/strings';

const MAX_REPL_LENGTH = 10000;
let topReplElementCounter = 0;

export class ReplModel {
	private replElements: IReplElement[] = [];

	constructor(private session: IDebugSession) { }

	getReplElements(): IReplElement[] {
		return this.replElements;
	}

	addReplExpression(stackFrame: IStackFrame | undefined, name: string): Promise<void> {
		const expression = new Expression(name);
		this.addReplElement(expression);
		return expression.evaluate(this.session, stackFrame, 'repl');
	}

	appendToRepl(data: string | IExpression, sev: severity, source?: IReplElementSource): void {
		const clearAnsiSequence = '\u001b[2J';
		if (typeof data === 'string' && data.indexOf(clearAnsiSequence) >= 0) {
			// [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
			this.removeReplExpressions();
			this.appendToRepl(nls.localize('consoleCleared', "Console was cleared"), severity.Ignore);
			data = data.substr(data.lastIndexOf(clearAnsiSequence) + clearAnsiSequence.length);
		}

		if (typeof data === 'string') {
			const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
			if (previousElement instanceof SimpleReplElement && previousElement.severity === sev && !endsWith(previousElement.value, '\n') && !endsWith(previousElement.value, '\r\n')) {
				previousElement.value += data;
			} else {
				const element = new SimpleReplElement(`topReplElement:${topReplElementCounter++}`, data, sev, source);
				this.addReplElement(element);
			}
		} else {
			// TODO@Isidor hack, we should introduce a new type which is an output that can fetch children like an expression
			(<any>data).severity = sev;
			(<any>data).sourceData = source;
			this.addReplElement(data);
		}
	}

	private addReplElement(newElement: IReplElement): void {
		this.replElements.push(newElement);
		if (this.replElements.length > MAX_REPL_LENGTH) {
			this.replElements.splice(0, this.replElements.length - MAX_REPL_LENGTH);
		}
	}

	logToRepl(sev: severity, args: any[], frame?: { uri: URI, line: number, column: number }) {

		let source: IReplElementSource | undefined;
		if (frame) {
			source = {
				column: frame.column,
				lineNumber: frame.line,
				source: this.session.getSource({
					name: basenameOrAuthority(frame.uri),
					path: frame.uri.fsPath
				})
			};
		}

		// add output for each argument logged
		let simpleVals: any[] = [];
		for (let i = 0; i < args.length; i++) {
			let a = args[i];

			// undefined gets printed as 'undefined'
			if (typeof a === 'undefined') {
				simpleVals.push('undefined');
			}

			// null gets printed as 'null'
			else if (a === null) {
				simpleVals.push('null');
			}

			// objects & arrays are special because we want to inspect them in the REPL
			else if (isObject(a) || Array.isArray(a)) {

				// flush any existing simple values logged
				if (simpleVals.length) {
					this.appendToRepl(simpleVals.join(' '), sev, source);
					simpleVals = [];
				}

				// show object
				this.appendToRepl(new RawObjectReplElement(`topReplElement:${topReplElementCounter++}`, (<any>a).prototype, a, undefined, nls.localize('snapshotObj', "Only primitive values are shown for this object.")), sev, source);
			}

			// string: watch out for % replacement directive
			// string substitution and formatting @ https://developer.chrome.com/devtools/docs/console
			else if (typeof a === 'string') {
				let buf = '';

				for (let j = 0, len = a.length; j < len; j++) {
					if (a[j] === '%' && (a[j + 1] === 's' || a[j + 1] === 'i' || a[j + 1] === 'd' || a[j + 1] === 'O')) {
						i++; // read over substitution
						buf += !isUndefinedOrNull(args[i]) ? args[i] : ''; // replace
						j++; // read over directive
					} else {
						buf += a[j];
					}
				}

				simpleVals.push(buf);
			}

			// number or boolean is joined together
			else {
				simpleVals.push(a);
			}
		}

		// flush simple values
		// always append a new line for output coming from an extension such that separate logs go to separate lines #23695
		if (simpleVals.length) {
			this.appendToRepl(simpleVals.join(' ') + '\n', sev, source);
		}
	}

	removeReplExpressions(): void {
		if (this.replElements.length > 0) {
			this.replElements = [];
		}
	}
}
