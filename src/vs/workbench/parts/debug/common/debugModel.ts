/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import ee = require('vs/base/common/eventEmitter');
import uri from 'vs/base/common/uri';
import uuid = require('vs/base/common/uuid');
import severity from 'vs/base/common/severity';
import types = require('vs/base/common/types');
import arrays = require('vs/base/common/arrays');
import debug = require('vs/workbench/parts/debug/common/debug');
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

function resolveChildren(debugService: debug.IDebugService, parent: debug.IExpressionContainer): TPromise<Variable[]> {
	var session = debugService.getActiveSession();
	// Only variables with reference > 0 have children.
	if (!session || parent.reference <= 0) {
		return TPromise.as([]);
	}

	return session.variables({ variablesReference: parent.reference }).then(response => {
		return arrays.distinct(response.body.variables, v => v.name).map(
			v => new Variable(parent, v.variablesReference, v.name, v.value)
		);
	}, (e: Error) => [new Variable(parent, 0, null, e.message)]);
}

function massageValue(value: string): string {
	return value ? value.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') : value;
}

export class Thread implements debug.IThread {

	public exception: boolean;

	constructor(public name: string, public threadId, public callStack: debug.IStackFrame[]) {
		this.exception = false;
	}

	public getId(): string {
		return `thread:${ this.name }:${ this.threadId }`;
	}
}

export class OutputElement implements debug.ITreeElement {

	private id: string;

	constructor(public grouped = false) {
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class ValueOutputElement extends OutputElement {

	constructor(public value: string, public severity: severity, grouped = false, public category?: string, public counter:number = 1) {
		super(grouped);
	}
}

export class KeyValueOutputElement extends OutputElement {

	private static MAX_CHILDREN = 1000; // upper bound of children per value

	private children: debug.ITreeElement[];
	private _valueName: string;

	constructor(public key: string, public valueObj: any, public annotation?: string, grouped?) {
		super(grouped);

		this._valueName = null;
	}

	public get value(): string {
		if (this._valueName === null) {
			if (this.valueObj === null) {
				this._valueName = 'null';
			} else if (Array.isArray(this.valueObj)) {
				this._valueName = `Array[${this.valueObj.length}]`;
			} else if (types.isObject(this.valueObj)) {
				this._valueName = 'Object';
			} else if (types.isString(this.valueObj)) {
				this._valueName = `"${massageValue(this.valueObj)}"`;
			} else {
				this._valueName = String(this.valueObj);
			}

			if (!this._valueName) {
				this._valueName = '';
			}
		}

		return this._valueName;
	}

	public getChildren(): debug.ITreeElement[] {
		if (!this.children) {
			if (Array.isArray(this.valueObj)) {
				this.children = (<any[]>this.valueObj).slice(0, KeyValueOutputElement.MAX_CHILDREN).map((v, index) => new KeyValueOutputElement(String(index), v, null, true));
			} else if (types.isObject(this.valueObj)) {
				this.children = Object.getOwnPropertyNames(this.valueObj).slice(0, KeyValueOutputElement.MAX_CHILDREN).map(key => new KeyValueOutputElement(key, this.valueObj[key], null, true));
			} else {
				this.children = [];
			}
		}

		return this.children;
	}
}

export class Expression implements debug.IExpression {
	static DEFAULT_VALUE = 'not available';

	public reference: number;
	public available: boolean;
	private _value: string;
	private children: TPromise<debug.IExpression[]>;

	constructor(public name: string, private cacheChildren: boolean, private id = uuid.generateUuid()) {
		this.reference = 0;
		this.value = Expression.DEFAULT_VALUE;
		this.available = false;
		this.children = null;
	}

	public get value(): string {
		return this._value;
	}

	public set value(value: string) {
		this._value = massageValue(value);
	}

	public getId(): string {
		return this.id;
	}

	public getChildren(debugService: debug.IDebugService): TPromise<debug.IExpression[]> {
		if (!this.cacheChildren) {
			return resolveChildren(debugService, this);
		}
		if (!this.children) {
			this.children = resolveChildren(debugService, this);
		}

		return this.children;
	}
}

export class Variable implements debug.IExpression {

	// Cache children to optimize debug hover behaviour.
	private children: TPromise<debug.IExpression[]>;
	public value: string;

	constructor(public parent: debug.IExpressionContainer, public reference: number, public name: string, value: string) {
		this.children = null;
		this.value = massageValue(value);
	}

	public getId(): string {
		return `variable:${ this.parent.getId() }:${ this.name }`;
	}

	public getChildren(debugService: debug.IDebugService): TPromise<debug.IExpression[]> {
		if (!this.children) {
			this.children = resolveChildren(debugService, this);
		}

		return this.children;
	}
}

export class Scope implements debug.IScope {

	private children: TPromise<Variable[]>;

	constructor(private threadId: number, public name: string, public reference: number, public expensive: boolean) {
		this.children = null;
	}

	public getId(): string {
		return `scope:${ this.threadId }:${ this.name }:${ this.reference }`;
	}

	public getChildren(debugService: debug.IDebugService): TPromise<Variable[]> {
		if (!this.children) {
			this.children = resolveChildren(debugService, this);
		}

		return this.children;
	}
}

export class StackFrame implements debug.IStackFrame {

	private internalId: string;
	private scopes: TPromise<Scope[]>;

	constructor(public threadId: number, public frameId: number, public source: Source, public name: string, public lineNumber: number, public column: number) {
		this.internalId = uuid.generateUuid();
		this.scopes = null;
	}

	public getId(): string {
		return this.internalId;
	}

	public getScopes(debugService: debug.IDebugService): TPromise<debug.IScope[]> {
		if (!this.scopes) {
			this.scopes = debugService.getActiveSession().scopes({ frameId: this.frameId }).then(response => {
				return response.body.scopes.map(rs => new Scope(this.threadId, rs.name, rs.variablesReference, rs.expensive));
			}, err => []);
		}

		return this.scopes;
	}
}

export class Breakpoint implements debug.IBreakpoint {

	public lineNumber: number;
	private id: string;

	constructor(public source: Source, public desiredLineNumber: number, public enabled: boolean) {
		this.lineNumber = this.desiredLineNumber;
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class ExceptionBreakpoint implements debug.IExceptionBreakpoint {

	private id: string;

	constructor(public name: string, public enabled: boolean) {
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class Model extends ee.EventEmitter implements debug.IModel {

	private threads: { [reference: number]: debug.IThread; };
	private toDispose: lifecycle.IDisposable[];
	private replElements: debug.ITreeElement[];

	constructor(private breakpoints: debug.IBreakpoint[], private breakpointsActivated: boolean,
		private exceptionBreakpoints: debug.IExceptionBreakpoint[], private watchExpressions: Expression[]) {

		super();
		this.threads = {};
		this.replElements = [];
		this.toDispose = [];
	}

	public getId(): string {
		return 'root';
	}

	public getThreads(): { [reference: number]: debug.IThread; } {
		return this.threads;
	}

	public clearThreads(removeThreads: boolean, reference: number = undefined): void {
		if (reference) {
			if (removeThreads) {
				delete this.threads[reference];
			} else {
				this.threads[reference].callStack = [];
				this.threads[reference].exception = false;
			}
		} else {
			if (removeThreads) {
				this.threads = {};
			} else {
				for (var ref in this.threads) {
					if (this.threads.hasOwnProperty(ref)) {
						this.threads[ref].callStack = [];
						this.threads[ref].exception = false;
					}
				}
			}
		}

		this.emit(debug.ModelEvents.CALLSTACK_UPDATED);
	}

	public getBreakpoints(): debug.IBreakpoint[] {
		return this.breakpoints;
	}

	public getExceptionBreakpoints(): debug.IExceptionBreakpoint[] {
		return this.exceptionBreakpoints;
	}

	public areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	public toggleBreakpointsActivated(): void {
		this.breakpointsActivated = !this.breakpointsActivated;
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public toggleBreakpoint(modelUri: uri, lineNumber: number): void {
		var found = false;
		for (var i = 0, len = this.breakpoints.length; i < len && !found; i++) {
			if (this.breakpoints[i].lineNumber === lineNumber && this.breakpoints[i].source.uri.toString() === modelUri.toString()) {
				this.breakpoints.splice(i, 1);
				found = true;
			}
		}

		if (!found) {
			this.breakpoints.push(new Breakpoint(Source.fromUri(modelUri), lineNumber, true));
			this.breakpointsActivated = true;
		}

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public toggleEnablement(element: debug.IEnablement): void {
		element.enabled = !element.enabled;
		if (element instanceof Breakpoint && !element.enabled) {
			var breakpoint = <Breakpoint> element;
			breakpoint.lineNumber = breakpoint.desiredLineNumber;
		}

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public enableOrDisableAllBreakpoints(enabled: boolean): void {
		this.breakpoints.forEach(bp => {
			bp.enabled = enabled;
			if (!enabled) {
				bp.lineNumber = bp.desiredLineNumber;
			}
		});
		this.exceptionBreakpoints.forEach(ebp => {
			ebp.enabled = enabled;
		});

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public setBreakpointLineNumber(breakpoint: debug.IBreakpoint, actualLineNumber: number) {
		breakpoint.lineNumber = actualLineNumber;
		var duplicates = this.breakpoints.filter(bp => bp.lineNumber === breakpoint.lineNumber && bp.desiredLineNumber === breakpoint.desiredLineNumber);
		if (duplicates.length > 1) {
			this.toggleBreakpoint(breakpoint.source.uri, breakpoint.lineNumber);
		} else {
			this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
		}
	}

	public setBreakpointsForModel(modelUri: uri, data: { lineNumber: number; enabled: boolean; }[]): void {
		this.clearBreakpoints(modelUri);
		for (var i = 0, len = data.length; i < len; i++) {
			this.breakpoints.push(new Breakpoint(Source.fromUri(modelUri), data[i].lineNumber, data[i].enabled));
		}
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public clearBreakpoints(modelUri: uri): void {
		this.breakpoints = this.breakpoints.filter(bp => modelUri && modelUri.toString() !== bp.source.uri.toString());
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public getReplElements(): debug.ITreeElement[] {
		return this.replElements;
	}

	public addReplExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, name: string): Promise {
		var expression = new Expression(name, true);
		this.replElements.push(expression);
		return this.evaluateExpression(session, stackFrame, expression, true).then(() =>
			this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED, expression)
		);
	}

	public logToRepl(value: string, severity?: severity): void;
	public logToRepl(value: { [key: string]: any }, severity?: severity): void;
	public logToRepl(value: any, severity?: severity): void {
		let elements:OutputElement[] = [];
		let previousOutput = this.replElements.length && (<ValueOutputElement>this.replElements[this.replElements.length - 1]);
		let groupTogether = !!previousOutput && severity === previousOutput.severity;

		// String message
		if (typeof value === 'string') {
			if (value && value.trim() && previousOutput && previousOutput.value === value && previousOutput.severity === severity) {
				previousOutput.counter++; // we got the same output (but not an empty string when trimmed) so we just increment the counter
			} else {
				let lines = value.split('\n');
				lines.forEach((line, index) => {
					elements.push(new ValueOutputElement(line, severity, groupTogether || index > 0));
				});
			}
		}

		// Key-Value output
		else {
			elements.push(new KeyValueOutputElement(value.prototype, value, nls.localize('snapshotObj', "Only primitive values are shown for this object."), groupTogether));
		}

		if (elements.length) {
			this.replElements.push(...elements);
			this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED, elements);
		}
	}

	public appendReplOutput(value: string, severity?: severity): void {
		var elements:OutputElement[] = [];
		let previousOutput = this.replElements.length && (<ValueOutputElement>this.replElements[this.replElements.length - 1]);
		let lines = value.split('\n');
		let groupTogether = !!previousOutput && previousOutput.category === 'output' && severity === previousOutput.severity;

		if (groupTogether) {
			previousOutput.value += lines.shift(); // append to previous line if same group
		}

		// fill in lines as output value elements
		lines.forEach((line, index) => {
			elements.push(new ValueOutputElement(line, severity, groupTogether || index > 0, 'output'));
		});

		this.replElements.push(...elements);
		this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED, elements);
	}

	public clearReplExpressions(): void {
		this.replElements = [];
		this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED);
	}

	public getWatchExpressions(): Expression[] {
		return this.watchExpressions;
	}

	public addWatchExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, name: string): Promise {
		var we = new Expression(name, false);
		this.watchExpressions.push(we);
		if (!name) {
			this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, we);
			return Promise.as(null);
		}

		return this.evaluateWatchExpressions(session, stackFrame, we.getId());
	}

	public renameWatchExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, id: string, newName: string): Promise {
		var filtered = this.watchExpressions.filter(we => we.getId() === id);
		if (filtered.length === 1) {
			filtered[0].name = newName;
			return this.evaluateExpression(session, stackFrame, filtered[0], false).then(() => {
				this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, filtered[0]);
			});
		}

		return Promise.as(null);
	}

	public evaluateWatchExpressions(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, id: string = null): Promise {
		if (id) {
			var filtered = this.watchExpressions.filter(we => we.getId() === id);
			if (filtered.length !== 1) {
				return Promise.as(null);
			}

			return this.evaluateExpression(session, stackFrame, filtered[0], false).then(() => {
				this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, filtered[0]);
			});
		}

		return Promise.join(this.watchExpressions.map(we => this.evaluateExpression(session, stackFrame, we, false))).then(() => {
			this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED);
		});
	}

	private evaluateExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, expression: Expression, fromRepl: boolean): Promise {
		if (!session) {
			expression.value = fromRepl ? nls.localize('startDebugFirst', "Please start a debug session to evaluate") : Expression.DEFAULT_VALUE;
			expression.available = false;
			expression.reference = 0;
			return Promise.as(null);
		}

		return session.evaluate({
			expression: expression.name,
			frameId: stackFrame ? stackFrame.frameId : undefined,
			context: fromRepl ? 'repl' : 'watch'
		}).then(response => {
			expression.value = response.body.result;
			expression.available = true;
			expression.reference = response.body.variablesReference;
		}, err => {
			expression.value = err.message;
			expression.available = false;
			expression.reference = 0;
		});
	}

	public clearWatchExpressionValues(): void {
		this.watchExpressions.forEach(we => {
			we.value = Expression.DEFAULT_VALUE;
			we.available = false;
			we.reference = 0;
		});

		this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED);
	}

	public clearWatchExpressions(id: string = null): void {
		if (id) {
			this.watchExpressions = this.watchExpressions.filter(we => we.getId() !== id);
		} else {
			this.watchExpressions = [];
		}

		this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED);
	}

	public sourceIsUnavailable(source: Source): void {
		Object.keys(this.threads).forEach(key => {
			this.threads[key].callStack.forEach(stackFrame => {
				if (stackFrame.source.uri.toString() === source.uri.toString()) {
					stackFrame.source.available = false;
				}
			});
		});

		this.emit(debug.ModelEvents.CALLSTACK_UPDATED);
	}

	public rawUpdate(data: debug.IRawModelUpdate): void {
		if (data.thread) {
			this.threads[data.threadId] = new Thread(data.thread.name, data.thread.id, []);
		}

		if (data.callStack) {
			// Convert raw call stack into proper modelled call stack
			this.threads[data.threadId].callStack = data.callStack.map(
				(rsf, level) => {
					if (!rsf) {
						return new StackFrame(data.threadId, 0, Source.fromUri(uri.parse('unknown')), nls.localize('unknownStack', "Unknown stack location"), undefined, undefined);
					}

					return new StackFrame(data.threadId, rsf.id, rsf.source ? Source.fromRawSource(rsf.source) : Source.fromUri(uri.parse('unknown')), rsf.name, rsf.line, rsf.column);
				});

			this.threads[data.threadId].exception = data.exception;
		}

		this.emit(debug.ModelEvents.CALLSTACK_UPDATED);
	}

	public dispose(): void {
		super.dispose();
		this.threads = null;
		this.breakpoints = null;
		this.exceptionBreakpoints = null;
		this.watchExpressions = null;
		this.replElements = null;
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}
