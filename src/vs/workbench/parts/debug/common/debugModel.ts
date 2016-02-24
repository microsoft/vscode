/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import ee = require('vs/base/common/eventEmitter');
import uuid = require('vs/base/common/uuid');
import severity from 'vs/base/common/severity';
import types = require('vs/base/common/types');
import arrays = require('vs/base/common/arrays');
import debug = require('vs/workbench/parts/debug/common/debug');
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

function resolveChildren(debugService: debug.IDebugService, parent: debug.IExpressionContainer): TPromise<Variable[]> {
	const session = debugService.getActiveSession();
	// only variables with reference > 0 have children.
	if (!session || parent.reference <= 0) {
		return TPromise.as([]);
	}

	return session.variables({ variablesReference: parent.reference }).then(response => {
		return arrays.distinct(response.body.variables, v => v.name).map(
			v => new Variable(parent, v.variablesReference, v.name, v.value)
		);
	}, (e: Error) => [new Variable(parent, 0, null, e.message, false)]);
}

function massageValue(value: string): string {
	return value ? value.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') : value;
}

export function evaluateExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, expression: Expression, context: string): TPromise<Expression> {
	if (!session) {
		expression.value = context === 'repl' ? nls.localize('startDebugFirst', "Please start a debug session to evaluate") : Expression.DEFAULT_VALUE;
		expression.available = false;
		expression.reference = 0;
		return TPromise.as(expression);
	}

	return session.evaluate({
		expression: expression.name,
		frameId: stackFrame ? stackFrame.frameId : undefined,
		context
	}).then(response => {
		expression.value = response.body.result;
		expression.available = true;
		expression.reference = response.body.variablesReference;

		return expression;
	}, err => {
		expression.value = err.message;
		expression.available = false;
		expression.reference = 0;

		return expression;
	});
}

const notPropertySyntax = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const arrayElementSyntax = /\[.*\]$/;

export function getFullExpressionName(expression: debug.IExpression, sessionType: string): string {
	let names = [expression.name];
	if (expression instanceof Variable) {
		let v = (<Variable> expression).parent;
		while (v instanceof Variable || v instanceof Expression) {
			names.push((<Variable> v).name);
			v = (<Variable> v).parent;
		}
	}
	names = names.reverse();

	let result = null;
	names.forEach(name => {
		if (!result) {
			result = name;
		} else if (arrayElementSyntax.test(name) || (sessionType === 'node' && !notPropertySyntax.test(name))) {
			// use safe way to access node properties a['property_name']. Also handles array elements.
			result = name && name.indexOf('[') === 0 ? `${ result }${ name }` : `${ result }['${ name }']`;
		} else {
			result = `${ result }.${ name }`;
		}
	});

	return result;
}

export class Thread implements debug.IThread {

	public stoppedReason: string;

	constructor(public name: string, public threadId, public callStack: debug.IStackFrame[]) {
		this.stoppedReason = undefined;
	}

	public getId(): string {
		return `thread:${ this.name }:${ this.threadId }`;
	}
}

export class OutputElement implements debug.ITreeElement {

	constructor(private id = uuid.generateUuid()) {
		// noop
	}

	public getId(): string {
		return this.id;
	}
}

export class ValueOutputElement extends OutputElement {

	constructor(public value: string, public severity: severity, public category?: string, public counter:number = 1) {
		super();
	}
}

export class KeyValueOutputElement extends OutputElement {

	private static MAX_CHILDREN = 1000; // upper bound of children per value

	private children: debug.ITreeElement[];
	private _valueName: string;

	constructor(public key: string, public valueObj: any, public annotation?: string) {
		super();

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
				this.children = (<any[]>this.valueObj).slice(0, KeyValueOutputElement.MAX_CHILDREN).map((v, index) => new KeyValueOutputElement(String(index), v, null));
			} else if (types.isObject(this.valueObj)) {
				this.children = Object.getOwnPropertyNames(this.valueObj).slice(0, KeyValueOutputElement.MAX_CHILDREN).map(key => new KeyValueOutputElement(key, this.valueObj[key], null));
			} else {
				this.children = [];
			}
		}

		return this.children;
	}
}

export class ExpressionContainer implements debug.IExpressionContainer {

	private children: TPromise<debug.IExpression[]>;
	public valueChanged: boolean;
	public static allValues: { [id: string]: string } = {};

	constructor(public reference: number, private id: string, private cacheChildren: boolean) {
		this.children = null;
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

	public getId(): string {
		return this.id;
	}

}

export class Expression extends ExpressionContainer implements debug.IExpression {
	static DEFAULT_VALUE = 'not available';

	public available: boolean;
	private _value: string;

	constructor(public name: string, cacheChildren: boolean, id = uuid.generateUuid()) {
		super(0, id, cacheChildren);
		this.value = Expression.DEFAULT_VALUE;
		this.available = false;
	}

	public get value(): string {
		return this._value;
	}

	public set value(value: string) {
		this._value = massageValue(value);
		this.valueChanged = ExpressionContainer.allValues[this.getId()] &&
			ExpressionContainer.allValues[this.getId()] !== Expression.DEFAULT_VALUE && ExpressionContainer.allValues[this.getId()] !== value;
		ExpressionContainer.allValues[this.getId()] = value;
	}
}

export class Variable extends ExpressionContainer implements debug.IExpression {

	public value: string;

	constructor(public parent: debug.IExpressionContainer, reference: number, public name: string, value: string, public available = true) {
		super(reference, `variable:${ parent.getId() }:${ name }`, true);
		this.value = massageValue(value);
		this.valueChanged = ExpressionContainer.allValues[this.getId()] && ExpressionContainer.allValues[this.getId()] !== value;
		ExpressionContainer.allValues[this.getId()] = value;
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
	public verified: boolean;
	public idFromAdapter: number;
	public message: string;
	private id: string;

	constructor(public source: Source, public desiredLineNumber: number, public enabled: boolean, public condition: string) {
		if (enabled === undefined) {
			this.enabled = true;
		}
		this.lineNumber = this.desiredLineNumber;
		this.verified = false;
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class FunctionBreakpoint implements debug.IFunctionBreakpoint {

	private id: string;
	public verified: boolean;
	public idFromAdapter: number;

	constructor(public name: string, public enabled: boolean) {
		this.verified = false;
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class ExceptionBreakpoint implements debug.IExceptionBreakpoint {

	private id: string;

	constructor(public filter: string, public label: string, public enabled: boolean) {
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

	constructor(private breakpoints: debug.IBreakpoint[], private breakpointsActivated: boolean, private functionBreakpoints: debug.IFunctionBreakpoint[],
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
				this.threads[reference].stoppedReason = undefined;
			}
		} else {
			if (removeThreads) {
				this.threads = {};
				ExpressionContainer.allValues = {};
			} else {
				for (let ref in this.threads) {
					if (this.threads.hasOwnProperty(ref)) {
						this.threads[ref].callStack = [];
						this.threads[ref].stoppedReason = undefined;
					}
				}
			}
		}

		this.emit(debug.ModelEvents.CALLSTACK_UPDATED);
	}

	public getBreakpoints(): debug.IBreakpoint[] {
		return this.breakpoints;
	}

	public getFunctionBreakpoints(): debug.IFunctionBreakpoint[] {
		return this.functionBreakpoints;
	}

	public getExceptionBreakpoints(): debug.IExceptionBreakpoint[] {
		return this.exceptionBreakpoints;
	}

	public setExceptionBreakpoints(data: [{ filter: string, label: string }]): void {
		if (data) {
			this.exceptionBreakpoints = data.map(d =>
				new ExceptionBreakpoint(d.filter, d.label, this.exceptionBreakpoints.some(ebp => ebp.filter === d.filter && ebp.enabled)));
		}
	}

	public areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	public toggleBreakpointsActivated(): void {
		this.breakpointsActivated = !this.breakpointsActivated;
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public addBreakpoints(rawData: debug.IRawBreakpoint[]): void {
		this.breakpoints = this.breakpoints.concat(rawData.map(rawBp =>
			new Breakpoint(new Source(Source.toRawSource(rawBp.uri, this)), rawBp.lineNumber, rawBp.enabled, rawBp.condition)));
		this.breakpointsActivated = true;
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public removeBreakpoints(toRemove: debug.IBreakpoint[]): void {
		this.breakpoints = this.breakpoints.filter(bp => !toRemove.some(toRemove => toRemove.getId() === bp.getId()));
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public updateBreakpoints(data: { [id: string]: DebugProtocol.Breakpoint }): void {
		this.breakpoints.forEach(bp => {
			const bpData = data[bp.getId()];
			if (bpData) {
				bp.lineNumber = bpData.line ? bpData.line : bp.lineNumber;
				bp.verified = bpData.verified;
				bp.idFromAdapter = bpData.id;
				bp.message = bpData.message;
			}
		});
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public toggleEnablement(element: debug.IEnablement): void {
		element.enabled = !element.enabled;
		if (element instanceof Breakpoint && !element.enabled) {
			var breakpoint = <Breakpoint> element;
			breakpoint.lineNumber = breakpoint.desiredLineNumber;
			breakpoint.verified = false;
		}

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public enableOrDisableAllBreakpoints(enabled: boolean): void {
		this.breakpoints.forEach(bp => {
			bp.enabled = enabled;
			if (!enabled) {
				bp.lineNumber = bp.desiredLineNumber;
				bp.verified = false;
			}
		});
		this.exceptionBreakpoints.forEach(ebp => ebp.enabled = enabled);
		this.functionBreakpoints.forEach(fbp => fbp.enabled = enabled);

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public addFunctionBreakpoint(functionName: string): void {
		this.functionBreakpoints.push(new FunctionBreakpoint(functionName, true));
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public updateFunctionBreakpoints(data: { [id: string]: { name?: string, verified?: boolean; id?: number } }): void {
		this.functionBreakpoints.forEach(fbp => {
			const fbpData = data[fbp.getId()];
			if (fbpData) {
				fbp.name = fbpData.name || fbp.name;
				fbp.verified = fbpData.verified;
				fbp.idFromAdapter = fbpData.id;
			}
		});

		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public removeFunctionBreakpoints(id?: string): void {
		this.functionBreakpoints = id ? this.functionBreakpoints.filter(fbp => fbp.getId() !== id) : [];
		this.emit(debug.ModelEvents.BREAKPOINTS_UPDATED);
	}

	public getReplElements(): debug.ITreeElement[] {
		return this.replElements;
	}

	public addReplExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, name: string): TPromise<void> {
		const expression = new Expression(name, true);
		this.replElements.push(expression);
		return evaluateExpression(session, stackFrame, expression, 'repl').then(() =>
			this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED, expression)
		);
	}

	public logToRepl(value: string, severity?: severity): void;
	public logToRepl(value: { [key: string]: any }, severity?: severity): void;
	public logToRepl(value: any, severity?: severity): void {
		let elements:OutputElement[] = [];
		let previousOutput = this.replElements.length && (<ValueOutputElement>this.replElements[this.replElements.length - 1]);

		// string message
		if (typeof value === 'string') {
			if (value && value.trim() && previousOutput && previousOutput.value === value && previousOutput.severity === severity) {
				previousOutput.counter++; // we got the same output (but not an empty string when trimmed) so we just increment the counter
			} else {
				let lines = value.trim().split('\n');
				lines.forEach((line, index) => {
					elements.push(new ValueOutputElement(line, severity));
				});
			}
		}

		// key-value output
		else {
			elements.push(new KeyValueOutputElement(value.prototype, value, nls.localize('snapshotObj', "Only primitive values are shown for this object.")));
		}

		if (elements.length) {
			this.replElements.push(...elements);
			this.emit(debug.ModelEvents.REPL_ELEMENTS_UPDATED, elements);
		}
	}

	public appendReplOutput(value: string, severity?: severity): void {
		const elements: OutputElement[] = [];
		let previousOutput = this.replElements.length && (<ValueOutputElement>this.replElements[this.replElements.length - 1]);
		let lines = value.split('\n');
		let groupTogether = !!previousOutput && (previousOutput.category === 'output' && severity === previousOutput.severity);

		if (groupTogether) {
			// append to previous line if same group
			previousOutput.value += lines.shift();
		} else if (previousOutput && previousOutput.value === '') {
			// remove potential empty lines between different output types
			this.replElements.pop();
		}

		// fill in lines as output value elements
		lines.forEach((line, index) => {
			elements.push(new ValueOutputElement(line, severity, 'output'));
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

	public addWatchExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, name: string): TPromise<void> {
		const we = new Expression(name, false);
		this.watchExpressions.push(we);
		if (!name) {
			this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, we);
			return TPromise.as(null);
		}

		return this.evaluateWatchExpressions(session, stackFrame, we.getId());
	}

	public renameWatchExpression(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, id: string, newName: string): TPromise<void> {
		const filtered = this.watchExpressions.filter(we => we.getId() === id);
		if (filtered.length === 1) {
			filtered[0].name = newName;
			return evaluateExpression(session, stackFrame, filtered[0], 'watch').then(() => {
				this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, filtered[0]);
			});
		}

		return TPromise.as(null);
	}

	public evaluateWatchExpressions(session: debug.IRawDebugSession, stackFrame: debug.IStackFrame, id: string = null): TPromise<void> {
		if (id) {
			const filtered = this.watchExpressions.filter(we => we.getId() === id);
			if (filtered.length !== 1) {
				return TPromise.as(null);
			}

			return evaluateExpression(session, stackFrame, filtered[0], 'watch').then(() => {
				this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, filtered[0]);
			});
		}

		return TPromise.join(this.watchExpressions.map(we => evaluateExpression(session, stackFrame, we, 'watch'))).then(() => {
			this.emit(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED);
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
		this.watchExpressions = id ? this.watchExpressions.filter(we => we.getId() !== id) : [];
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
			// convert raw call stack into proper modelled call stack
			this.threads[data.threadId].callStack = data.callStack.map(
				(rsf, level) => {
					if (!rsf) {
						return new StackFrame(data.threadId, 0, new Source({ name: 'unknown' }), nls.localize('unknownStack', "Unknown stack location"), undefined, undefined);
					}

					return new StackFrame(data.threadId, rsf.id, rsf.source ? new Source(rsf.source) : new Source({ name: 'unknown' }), rsf.name, rsf.line, rsf.column);
				});

			this.threads[data.threadId].stoppedReason = data.stoppedReason;
		}

		this.emit(debug.ModelEvents.CALLSTACK_UPDATED);
	}

	public dispose(): void {
		super.dispose();
		this.threads = null;
		this.breakpoints = null;
		this.exceptionBreakpoints = null;
		this.functionBreakpoints = null;
		this.watchExpressions = null;
		this.replElements = null;
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}
