/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as lifecycle from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { clone } from 'vs/base/common/objects';
import severity from 'vs/base/common/severity';
import { isObject, isString } from 'vs/base/common/types';
import { distinct } from 'vs/base/common/arrays';
import { IRange } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ISuggestion } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import {
	ITreeElement, IExpression, IExpressionContainer, IProcess, IStackFrame, IExceptionBreakpoint, IBreakpoint, IFunctionBreakpoint, IModel,
	IConfig, ISession, IThread, IRawModelUpdate, IScope, IRawStoppedDetails, IEnablement, IRawBreakpoint, IExceptionInfo
} from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const MAX_REPL_LENGTH = 10000;
const UNKNOWN_SOURCE_LABEL = nls.localize('unknownSource', "Unknown Source");

export abstract class AbstractOutputElement implements ITreeElement {
	private static ID_COUNTER = 0;

	constructor(private id = AbstractOutputElement.ID_COUNTER++) {
		// noop
	}

	public getId(): string {
		return `outputelement:${this.id}`;
	}
}

export class OutputElement extends AbstractOutputElement {

	public counter: number;

	constructor(
		public value: string,
		public severity: severity,
	) {
		super();
		this.counter = 1;
	}
}

export class OutputNameValueElement extends AbstractOutputElement implements IExpression {

	private static MAX_CHILDREN = 1000; // upper bound of children per value

	constructor(public name: string, public valueObj: any, public annotation?: string) {
		super();
	}

	public get value(): string {
		if (this.valueObj === null) {
			return 'null';
		} else if (Array.isArray(this.valueObj)) {
			return `Array[${this.valueObj.length}]`;
		} else if (isObject(this.valueObj)) {
			return 'Object';
		} else if (isString(this.valueObj)) {
			return `"${this.valueObj}"`;
		}

		return String(this.valueObj) || '';
	}

	public get hasChildren(): boolean {
		return (Array.isArray(this.valueObj) && this.valueObj.length > 0) || (isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0);
	}

	public getChildren(): TPromise<IExpression[]> {
		let result: IExpression[] = [];
		if (Array.isArray(this.valueObj)) {
			result = (<any[]>this.valueObj).slice(0, OutputNameValueElement.MAX_CHILDREN)
				.map((v, index) => new OutputNameValueElement(String(index), v));
		} else if (isObject(this.valueObj)) {
			result = Object.getOwnPropertyNames(this.valueObj).slice(0, OutputNameValueElement.MAX_CHILDREN)
				.map(key => new OutputNameValueElement(key, this.valueObj[key]));
		}

		return TPromise.as(result);
	}
}

export class ExpressionContainer implements IExpressionContainer {

	public static allValues: Map<string, string> = new Map<string, string>();
	// Use chunks to support variable paging #9537
	private static BASE_CHUNK_SIZE = 100;

	public valueChanged: boolean;
	private _value: string;
	protected children: TPromise<IExpression[]>;

	constructor(
		protected process: IProcess,
		private _reference: number,
		private id: string,
		public namedVariables = 0,
		public indexedVariables = 0,
		private startOfVariables = 0
	) { }

	public get reference(): number {
		return this._reference;
	}

	public set reference(value: number) {
		this._reference = value;
		this.children = undefined; // invalidate children cache
	}

	public getChildren(): TPromise<IExpression[]> {
		if (!this.children) {
			this.children = this.doGetChildren();
		}

		return this.children;
	}

	private doGetChildren(): TPromise<IExpression[]> {
		if (!this.hasChildren) {
			return TPromise.as([]);
		}

		if (!this.getChildrenInChunks) {
			return this.fetchVariables(undefined, undefined, undefined);
		}

		// Check if object has named variables, fetch them independent from indexed variables #9670
		return (!!this.namedVariables ? this.fetchVariables(undefined, undefined, 'named') : TPromise.as([])).then(childrenArray => {
			// Use a dynamic chunk size based on the number of elements #9774
			let chunkSize = ExpressionContainer.BASE_CHUNK_SIZE;
			while (this.indexedVariables > chunkSize * ExpressionContainer.BASE_CHUNK_SIZE) {
				chunkSize *= ExpressionContainer.BASE_CHUNK_SIZE;
			}

			if (this.indexedVariables > chunkSize) {
				// There are a lot of children, create fake intermediate values that represent chunks #9537
				const numberOfChunks = Math.ceil(this.indexedVariables / chunkSize);
				for (let i = 0; i < numberOfChunks; i++) {
					const start = this.startOfVariables + i * chunkSize;
					const count = Math.min(chunkSize, this.indexedVariables - i * chunkSize);
					childrenArray.push(new Variable(this.process, this, this.reference, `[${start}..${start + count - 1}]`, '', '', null, count, null, true, start));
				}

				return childrenArray;
			}

			return this.fetchVariables(this.startOfVariables, this.indexedVariables, 'indexed')
				.then(variables => childrenArray.concat(variables));
		});
	}

	public getId(): string {
		return this.id;
	}

	public get value(): string {
		return this._value;
	}

	public get hasChildren(): boolean {
		// only variables with reference > 0 have children.
		return this.reference > 0;
	}

	private fetchVariables(start: number, count: number, filter: 'indexed' | 'named'): TPromise<Variable[]> {
		return this.process.session.variables({
			variablesReference: this.reference,
			start,
			count,
			filter
		}).then(response => {
			return response && response.body && response.body.variables ? distinct(response.body.variables.filter(v => !!v), v => v.name).map(
				v => new Variable(this.process, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.type)
			) : [];
		}, (e: Error) => [new Variable(this.process, this, 0, null, e.message, '', 0, 0, null, false)]);
	}

	// The adapter explicitly sents the children count of an expression only if there are lots of children which should be chunked.
	private get getChildrenInChunks(): boolean {
		return !!this.indexedVariables;
	}

	public set value(value: string) {
		this._value = value;
		this.valueChanged = ExpressionContainer.allValues.get(this.getId()) &&
			ExpressionContainer.allValues.get(this.getId()) !== Expression.DEFAULT_VALUE && ExpressionContainer.allValues.get(this.getId()) !== value;
		ExpressionContainer.allValues.set(this.getId(), value);
	}
}

export class Expression extends ExpressionContainer implements IExpression {
	static DEFAULT_VALUE = nls.localize('notAvailable', "not available");

	public available: boolean;
	public type: string;

	constructor(public name: string, id = generateUuid()) {
		super(null, 0, id);
		this.available = false;
		// name is not set if the expression is just being added
		// in that case do not set default value to prevent flashing #14499
		if (name) {
			this.value = Expression.DEFAULT_VALUE;
		}
	}

	public evaluate(process: IProcess, stackFrame: IStackFrame, context: string): TPromise<void> {
		if (!process || (!stackFrame && context !== 'repl')) {
			this.value = context === 'repl' ? nls.localize('startDebugFirst', "Please start a debug session to evaluate") : Expression.DEFAULT_VALUE;
			this.available = false;
			this.reference = 0;

			return TPromise.as(null);
		}

		this.process = process;
		return process.session.evaluate({
			expression: this.name,
			frameId: stackFrame ? stackFrame.frameId : undefined,
			context
		}).then(response => {
			this.available = !!(response && response.body);
			if (response && response.body) {
				this.value = response.body.result;
				this.reference = response.body.variablesReference;
				this.namedVariables = response.body.namedVariables;
				this.indexedVariables = response.body.indexedVariables;
				this.type = response.body.type;
			}
		}, err => {
			this.value = err.message;
			this.available = false;
			this.reference = 0;
		});
	}
}

export class Variable extends ExpressionContainer implements IExpression {

	// Used to show the error message coming from the adapter when setting the value #7807
	public errorMessage: string;
	private static NOT_PROPERTY_SYNTAX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
	private static ARRAY_ELEMENT_SYNTAX = /\[.*\]$/;

	constructor(
		process: IProcess,
		public parent: IExpressionContainer,
		reference: number,
		public name: string,
		private _evaluateName: string,
		value: string,
		namedVariables: number,
		indexedVariables: number,
		public type: string = null,
		public available = true,
		startOfVariables = 0
	) {
		super(process, reference, `variable:${parent.getId()}:${name}:${reference}`, namedVariables, indexedVariables, startOfVariables);
		this.value = value;
	}

	public get evaluateName(): string {
		if (this._evaluateName) {
			return this._evaluateName;
		}

		// TODO@Isidor get rid of this ugly heuristic
		let names = [this.name];
		let v = this.parent;
		while (v instanceof Variable || v instanceof Expression) {
			names.push((<Variable>v).name);
			v = (<Variable>v).parent;
		}
		names = names.reverse();

		let result = null;
		names.forEach(name => {
			if (!result) {
				result = name;
			} else if (Variable.ARRAY_ELEMENT_SYNTAX.test(name) || (this.process.configuration.type === 'node' && !Variable.NOT_PROPERTY_SYNTAX.test(name))) {
				// use safe way to access node properties a['property_name']. Also handles array elements.
				result = name && name.indexOf('[') === 0 ? `${result}${name}` : `${result}['${name}']`;
			} else {
				result = `${result}.${name}`;
			}
		});

		return result;
	}

	public setVariable(value: string): TPromise<any> {
		return this.process.session.setVariable({
			name: this.name,
			value,
			variablesReference: (<ExpressionContainer>this.parent).reference
		}).then(response => {
			if (response && response.body) {
				this.value = response.body.value;
				this.type = response.body.type || this.type;
				this.reference = response.body.variablesReference;
				this.namedVariables = response.body.namedVariables;
				this.indexedVariables = response.body.indexedVariables;
			}
		}, err => {
			this.errorMessage = err.message;
		});
	}
}

export class Scope extends ExpressionContainer implements IScope {

	constructor(
		stackFrame: IStackFrame,
		public name: string,
		reference: number,
		public expensive: boolean,
		namedVariables: number,
		indexedVariables: number,
		public range?: IRange
	) {
		super(stackFrame.thread.process, reference, `scope:${stackFrame.getId()}:${name}:${reference}`, namedVariables, indexedVariables);
	}
}

export class StackFrame implements IStackFrame {

	private scopes: TPromise<Scope[]>;

	constructor(
		public thread: IThread,
		public frameId: number,
		public source: Source,
		public name: string,
		public lineNumber: number,
		public column: number
	) {
		this.scopes = null;
	}

	public getId(): string {
		return `stackframe:${this.thread.getId()}:${this.frameId}`;
	}

	public getScopes(): TPromise<IScope[]> {
		if (!this.scopes) {
			this.scopes = this.thread.process.session.scopes({ frameId: this.frameId }).then(response => {
				return response && response.body && response.body.scopes ?
					response.body.scopes.map(rs => new Scope(this, rs.name, rs.variablesReference, rs.expensive, rs.namedVariables, rs.indexedVariables,
						rs.line && rs.column && rs.endLine && rs.endColumn ? new Range(rs.line, rs.column, rs.endLine, rs.endColumn) : null)) : [];
			}, err => []);
		}

		return this.scopes;
	}

	public getMostSpecificScopes(range: IRange): TPromise<IScope[]> {
		return this.getScopes().then(scopes => {
			scopes = scopes.filter(s => !s.expensive);
			const haveRangeInfo = scopes.some(s => !!s.range);
			if (!haveRangeInfo) {
				return scopes;
			}

			return [scopes.filter(scope => scope.range && Range.containsRange(scope.range, range))
				.sort((first, second) => (first.range.endLineNumber - first.range.startLineNumber) - (second.range.endLineNumber - second.range.startLineNumber)).shift()];
		});
	}

	public restart(): TPromise<any> {
		return this.thread.process.session.restartFrame({ frameId: this.frameId }, this.thread.threadId);
	}

	public toString(): string {
		return `${this.name} (${this.source.inMemory ? this.source.name : this.source.uri.fsPath}:${this.lineNumber})`;
	}

	public openInEditor(editorService: IWorkbenchEditorService, preserveFocus?: boolean, sideBySide?: boolean): TPromise<any> {

		return this.source.name === UNKNOWN_SOURCE_LABEL ? TPromise.as(null) : editorService.openEditor({
			resource: this.source.uri,
			description: this.source.origin,
			options: {
				preserveFocus,
				selection: { startLineNumber: this.lineNumber, startColumn: 1 },
				revealIfVisible: true,
				revealInCenterIfOutsideViewport: true,
				pinned: !preserveFocus
			}
		}, sideBySide);
	}
}

export class Thread implements IThread {
	private promisedCallStack: TPromise<IStackFrame[]>;
	private cachedCallStack: IStackFrame[];
	public stoppedDetails: IRawStoppedDetails;
	public stopped: boolean;

	constructor(public process: IProcess, public name: string, public threadId: number) {
		this.promisedCallStack = null;
		this.stoppedDetails = null;
		this.cachedCallStack = null;
		this.stopped = false;
	}

	public getId(): string {
		return `thread:${this.process.getId()}:${this.threadId}`;
	}

	public clearCallStack(): void {
		this.promisedCallStack = null;
		this.cachedCallStack = null;
	}

	public getCallStack(): IStackFrame[] {
		return this.cachedCallStack;
	}

	/**
	 * Queries the debug adapter for the callstack and returns a promise with
	 * the stack frames of the callstack.
	 * If the thread is not stopped, it returns a promise to an empty array.
	 * Only gets the first 20 stack frames. Calling this method consecutive times
	 * with getAdditionalStackFrames = true gets the remainder of the call stack.
	 */
	public fetchCallStack(getAdditionalStackFrames = false): TPromise<IStackFrame[]> {
		if (!this.stopped) {
			return TPromise.as([]);
		}

		if (!this.promisedCallStack) {
			this.promisedCallStack = this.getCallStackImpl(0).then(callStack => {
				this.cachedCallStack = callStack;
				return callStack;
			});
		} else if (getAdditionalStackFrames) {
			this.promisedCallStack = this.promisedCallStack.then(callStackFirstPart => this.getCallStackImpl(callStackFirstPart.length).then(callStackSecondPart => {
				this.cachedCallStack = callStackFirstPart.concat(callStackSecondPart);
				return this.cachedCallStack;
			}));
		}

		return this.promisedCallStack;
	}

	private getCallStackImpl(startFrame: number): TPromise<IStackFrame[]> {
		return this.process.session.stackTrace({ threadId: this.threadId, startFrame, levels: 20 }).then(response => {
			if (!response || !response.body) {
				return [];
			}

			if (this.stoppedDetails) {
				this.stoppedDetails.totalFrames = response.body.totalFrames;
			}

			return response.body.stackFrames.map((rsf, level) => {
				if (!rsf) {
					return new StackFrame(this, 0, new Source({ name: UNKNOWN_SOURCE_LABEL }, rsf.presentationHint), nls.localize('unknownStack', "Unknown stack location"), null, null);
				}
				let source = rsf.source ? new Source(rsf.source, rsf.source.presentationHint) : new Source({ name: UNKNOWN_SOURCE_LABEL }, rsf.presentationHint);
				if (this.process.sources.has(source.uri.toString())) {
					const alreadyCreatedSource = this.process.sources.get(source.uri.toString());
					alreadyCreatedSource.presenationHint = source.presenationHint;
					source = alreadyCreatedSource;
				} else {
					this.process.sources.set(source.uri.toString(), source);
				}

				return new StackFrame(this, rsf.id, source, rsf.name, rsf.line, rsf.column);
			});
		}, (err: Error) => {
			if (this.stoppedDetails) {
				this.stoppedDetails.framesErrorMessage = err.message;
			}

			return [];
		});
	}

	/**
	 * Returns exception info promise if the exception was thrown, otherwise null
	 */
	public get exceptionInfo(): TPromise<IExceptionInfo> {
		const session = this.process.session;
		if (this.stoppedDetails && this.stoppedDetails.reason === 'exception') {
			if (!session.capabilities.supportsExceptionInfoRequest) {
				return TPromise.as({
					description: this.stoppedDetails.text,
					breakMode: null
				});
			}

			return session.exceptionInfo({ threadId: this.threadId }).then(exception => ({
				id: exception.body.exceptionId,
				description: exception.body.description,
				breakMode: exception.body.breakMode,
				details: exception.body.details
			}));
		}

		return TPromise.as(null);
	}

	public next(): TPromise<any> {
		return this.process.session.next({ threadId: this.threadId });
	}

	public stepIn(): TPromise<any> {
		return this.process.session.stepIn({ threadId: this.threadId });
	}

	public stepOut(): TPromise<any> {
		return this.process.session.stepOut({ threadId: this.threadId });
	}

	public stepBack(): TPromise<any> {
		return this.process.session.stepBack({ threadId: this.threadId });
	}

	public continue(): TPromise<any> {
		return this.process.session.continue({ threadId: this.threadId });
	}

	public pause(): TPromise<any> {
		return this.process.session.pause({ threadId: this.threadId });
	}

	public reverseContinue(): TPromise<any> {
		return this.process.session.reverseContinue({ threadId: this.threadId });
	}
}

export class Process implements IProcess {

	private threads: Map<number, Thread>;
	public sources: Map<string, Source>;

	constructor(public configuration: IConfig, private _session: ISession & ITreeElement) {
		this.threads = new Map<number, Thread>();
		this.sources = new Map<string, Source>();
	}

	public get session(): ISession {
		return this._session;
	}

	public get name(): string {
		return this.configuration.name;
	}

	public isAttach(): boolean {
		return this.configuration.type === 'attach';
	}

	public getThread(threadId: number): Thread {
		return this.threads.get(threadId);
	}

	public getAllThreads(): IThread[] {
		const result = [];
		this.threads.forEach(t => result.push(t));
		return result;
	}

	public getId(): string {
		return this._session.getId();
	}

	public rawUpdate(data: IRawModelUpdate): void {

		if (data.thread && !this.threads.has(data.threadId)) {
			// A new thread came in, initialize it.
			this.threads.set(data.threadId, new Thread(this, data.thread.name, data.thread.id));
		} else if (data.thread && data.thread.name) {
			// Just the thread name got updated #18244
			this.threads.get(data.threadId).name = data.thread.name;
		}

		if (data.stoppedDetails) {
			// Set the availability of the threads' callstacks depending on
			// whether the thread is stopped or not
			if (data.allThreadsStopped) {
				this.threads.forEach(thread => {
					// Only update the details if all the threads are stopped
					// because we don't want to overwrite the details of other
					// threads that have stopped for a different reason
					thread.stoppedDetails = clone(data.stoppedDetails);
					thread.stopped = true;
					thread.clearCallStack();
				});
			} else if (this.threads.has(data.threadId)) {
				// One thread is stopped, only update that thread.
				const thread = this.threads.get(data.threadId);
				thread.stoppedDetails = data.stoppedDetails;
				thread.clearCallStack();
				thread.stopped = true;
			}
		}
	}

	public clearThreads(removeThreads: boolean, reference: number = undefined): void {
		if (reference) {
			if (this.threads.has(reference)) {
				const thread = this.threads.get(reference);
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;

				if (removeThreads) {
					this.threads.delete(reference);
				}
			}
		} else {
			this.threads.forEach(thread => {
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;
			});

			if (removeThreads) {
				this.threads.clear();
				ExpressionContainer.allValues.clear();
			}
		}
	}

	public completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]> {
		if (!this.session.capabilities.supportsCompletionsRequest) {
			return TPromise.as([]);
		}

		return this.session.completions({
			frameId,
			text,
			column: position.column,
			line: position.lineNumber
		}).then(response => {
			const result: ISuggestion[] = [];
			if (response && response.body && response.body.targets) {
				response.body.targets.forEach(item => {
					if (item && item.label) {
						result.push({
							label: item.label,
							insertText: item.text || item.label,
							type: item.type,
							filterText: item.start && item.length && text.substr(item.start, item.length).concat(item.label),
							overwriteBefore: item.length || overwriteBefore
						});
					}
				});
			}

			return result;
		}, err => []);
	}
}

export class Breakpoint implements IBreakpoint {

	public verified: boolean;
	public idFromAdapter: number;
	public message: string;
	private id: string;

	constructor(
		public uri: uri,
		public lineNumber: number,
		public column: number,
		public enabled: boolean,
		public condition: string,
		public hitCondition: string,
		public respectColumn: boolean // TODO@Isidor remove this in March
	) {
		if (enabled === undefined) {
			this.enabled = true;
		}
		this.verified = false;
		this.id = generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class FunctionBreakpoint implements IFunctionBreakpoint {

	private id: string;
	public verified: boolean;
	public idFromAdapter: number;

	constructor(public name: string, public enabled: boolean, public hitCondition: string) {
		this.verified = false;
		this.id = generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class ExceptionBreakpoint implements IExceptionBreakpoint {

	private id: string;

	constructor(public filter: string, public label: string, public enabled: boolean) {
		this.id = generateUuid();
	}

	public getId(): string {
		return this.id;
	}
}

export class ThreadAndProcessIds implements ITreeElement {
	constructor(public processId: string, public threadId: number) { }

	public getId(): string {
		return `${this.processId}:${this.threadId}`;
	}
}

export class Model implements IModel {

	private processes: Process[];
	private toDispose: lifecycle.IDisposable[];
	private replElements: ITreeElement[];
	private _onDidChangeBreakpoints: Emitter<void>;
	private _onDidChangeCallStack: Emitter<void>;
	private _onDidChangeWatchExpressions: Emitter<IExpression>;
	private _onDidChangeREPLElements: Emitter<void>;

	constructor(
		private breakpoints: Breakpoint[],
		private breakpointsActivated: boolean,
		private functionBreakpoints: FunctionBreakpoint[],
		private exceptionBreakpoints: ExceptionBreakpoint[],
		private watchExpressions: Expression[]
	) {
		this.processes = [];
		this.replElements = [];
		this.toDispose = [];
		this._onDidChangeBreakpoints = new Emitter<void>();
		this._onDidChangeCallStack = new Emitter<void>();
		this._onDidChangeWatchExpressions = new Emitter<IExpression>();
		this._onDidChangeREPLElements = new Emitter<void>();
	}

	public getId(): string {
		return 'root';
	}

	public getProcesses(): Process[] {
		return this.processes;
	}

	public addProcess(configuration: IConfig, session: ISession & ITreeElement): Process {
		const process = new Process(configuration, session);
		this.processes.push(process);

		return process;
	}

	public removeProcess(id: string): void {
		this.processes = this.processes.filter(p => p.getId() !== id);
		this._onDidChangeCallStack.fire();
	}

	public get onDidChangeBreakpoints(): Event<void> {
		return this._onDidChangeBreakpoints.event;
	}

	public get onDidChangeCallStack(): Event<void> {
		return this._onDidChangeCallStack.event;
	}

	public get onDidChangeWatchExpressions(): Event<IExpression> {
		return this._onDidChangeWatchExpressions.event;
	}

	public get onDidChangeReplElements(): Event<void> {
		return this._onDidChangeREPLElements.event;
	}

	public rawUpdate(data: IRawModelUpdate): void {
		let process = this.processes.filter(p => p.getId() === data.sessionId).pop();
		if (process) {
			process.rawUpdate(data);
			this._onDidChangeCallStack.fire();
		}
	}

	public clearThreads(id: string, removeThreads: boolean, reference: number = undefined): void {
		const process = this.processes.filter(p => p.getId() === id).pop();
		if (process) {
			process.clearThreads(removeThreads, reference);
			this._onDidChangeCallStack.fire();
		}
	}

	public getBreakpoints(): Breakpoint[] {
		return this.breakpoints;
	}

	public getFunctionBreakpoints(): IFunctionBreakpoint[] {
		return this.functionBreakpoints;
	}

	public getExceptionBreakpoints(): IExceptionBreakpoint[] {
		return this.exceptionBreakpoints;
	}

	public setExceptionBreakpoints(data: DebugProtocol.ExceptionBreakpointsFilter[]): void {
		if (data) {
			this.exceptionBreakpoints = data.map(d => {
				const ebp = this.exceptionBreakpoints.filter(ebp => ebp.filter === d.filter).pop();
				return new ExceptionBreakpoint(d.filter, d.label, ebp ? ebp.enabled : d.default);
			});
		}
	}

	public areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	public setBreakpointsActivated(activated: boolean): void {
		this.breakpointsActivated = activated;
		this._onDidChangeBreakpoints.fire();
	}

	public addBreakpoints(uri: uri, rawData: IRawBreakpoint[]): void {
		this.breakpoints = this.breakpoints.concat(rawData.map(rawBp =>
			new Breakpoint(uri, rawBp.lineNumber, rawBp.column, rawBp.enabled, rawBp.condition, rawBp.hitCondition, true)));
		this.breakpointsActivated = true;
		this._onDidChangeBreakpoints.fire();
	}

	public removeBreakpoints(toRemove: IBreakpoint[]): void {
		this.breakpoints = this.breakpoints.filter(bp => !toRemove.some(toRemove => toRemove.getId() === bp.getId()));
		this._onDidChangeBreakpoints.fire();
	}

	public updateBreakpoints(data: { [id: string]: DebugProtocol.Breakpoint }): void {
		this.breakpoints.forEach(bp => {
			const bpData = data[bp.getId()];
			if (bpData) {
				bp.lineNumber = bpData.line ? bpData.line : bp.lineNumber;
				bp.column = bpData.column ? bpData.column : bp.column;
				bp.verified = bpData.verified;
				bp.idFromAdapter = bpData.id;
				bp.message = bpData.message;
			}
		});

		this._onDidChangeBreakpoints.fire();
	}

	public setEnablement(element: IEnablement, enable: boolean): void {
		element.enabled = enable;
		if (element instanceof Breakpoint && !element.enabled) {
			var breakpoint = <Breakpoint>element;
			breakpoint.verified = false;
		}

		this._onDidChangeBreakpoints.fire();
	}

	public enableOrDisableAllBreakpoints(enable: boolean): void {
		this.breakpoints.forEach(bp => {
			bp.enabled = enable;
			if (!enable) {
				bp.verified = false;
			}
		});
		this.exceptionBreakpoints.forEach(ebp => ebp.enabled = enable);
		this.functionBreakpoints.forEach(fbp => fbp.enabled = enable);

		this._onDidChangeBreakpoints.fire();
	}

	public addFunctionBreakpoint(functionName: string): void {
		this.functionBreakpoints.push(new FunctionBreakpoint(functionName, true, null));
		this._onDidChangeBreakpoints.fire();
	}

	public updateFunctionBreakpoints(data: { [id: string]: { name?: string, verified?: boolean; id?: number; hitCondition?: string } }): void {
		this.functionBreakpoints.forEach(fbp => {
			const fbpData = data[fbp.getId()];
			if (fbpData) {
				fbp.name = fbpData.name || fbp.name;
				fbp.verified = fbpData.verified;
				fbp.idFromAdapter = fbpData.id;
				fbp.hitCondition = fbpData.hitCondition;
			}
		});

		this._onDidChangeBreakpoints.fire();
	}

	public removeFunctionBreakpoints(id?: string): void {
		this.functionBreakpoints = id ? this.functionBreakpoints.filter(fbp => fbp.getId() !== id) : [];
		this._onDidChangeBreakpoints.fire();
	}

	public getReplElements(): ITreeElement[] {
		return this.replElements;
	}

	public addReplExpression(process: IProcess, stackFrame: IStackFrame, name: string): TPromise<void> {
		const expression = new Expression(name);
		this.addReplElements([expression]);
		return expression.evaluate(process, stackFrame, 'repl')
			.then(() => this._onDidChangeREPLElements.fire());
	}

	public appendToRepl(output: string | IExpression, severity: severity): void {
		if (typeof output === 'string') {
			const previousOutput = this.replElements.length && (this.replElements[this.replElements.length - 1] as OutputElement);
			if (previousOutput instanceof OutputElement && severity === previousOutput.severity && previousOutput.value === output && output.trim() && output.length > 1) {
				// we got the same output (but not an empty string when trimmed) so we just increment the counter
				previousOutput.counter++;
			} else {
				const toAdd = output.split('\n').map(line => new OutputElement(line, severity));
				if (previousOutput instanceof OutputElement && severity === previousOutput.severity && toAdd.length) {
					previousOutput.value += toAdd.shift().value;
				}
				if (previousOutput && previousOutput.value === '') {
					// remove potential empty lines between different output types
					this.replElements.pop();
				}
				this.addReplElements(toAdd);
			}
		} else {
			// TODO@Isidor hack, we should introduce a new type which is an output that can fetch children like an expression
			(<any>output).severity = severity;
			this.addReplElements([output]);
		}

		this._onDidChangeREPLElements.fire();
	}

	private addReplElements(newElements: ITreeElement[]): void {
		this.replElements.push(...newElements);
		if (this.replElements.length > MAX_REPL_LENGTH) {
			this.replElements.splice(0, this.replElements.length - MAX_REPL_LENGTH);
		}
	}

	public removeReplExpressions(): void {
		if (this.replElements.length > 0) {
			this.replElements = [];
			this._onDidChangeREPLElements.fire();
		}
	}

	public getWatchExpressions(): Expression[] {
		return this.watchExpressions;
	}

	public addWatchExpression(process: IProcess, stackFrame: IStackFrame, name: string): TPromise<void> {
		const we = new Expression(name);
		this.watchExpressions.push(we);
		if (!name) {
			this._onDidChangeWatchExpressions.fire(we);
			return TPromise.as(null);
		}

		return this.evaluateWatchExpressions(process, stackFrame, we.getId());
	}

	public renameWatchExpression(process: IProcess, stackFrame: IStackFrame, id: string, newName: string): TPromise<void> {
		const filtered = this.watchExpressions.filter(we => we.getId() === id);
		if (filtered.length === 1) {
			filtered[0].name = newName;
			// Evaluate all watch expressions again since the new watch expression might have changed some.
			return this.evaluateWatchExpressions(process, stackFrame).then(() => {
				this._onDidChangeWatchExpressions.fire(filtered[0]);
			});
		}

		return TPromise.as(null);
	}

	public evaluateWatchExpressions(process: IProcess, stackFrame: IStackFrame, id: string = null): TPromise<void> {
		if (id) {
			const filtered = this.watchExpressions.filter(we => we.getId() === id);
			if (filtered.length !== 1) {
				return TPromise.as(null);
			}

			return filtered[0].evaluate(process, stackFrame, 'watch').then(() => {
				this._onDidChangeWatchExpressions.fire(filtered[0]);
			});
		}

		return TPromise.join(this.watchExpressions.map(we => we.evaluate(process, stackFrame, 'watch'))).then(() => {
			this._onDidChangeWatchExpressions.fire();
		});
	}

	public removeWatchExpressions(id: string = null): void {
		this.watchExpressions = id ? this.watchExpressions.filter(we => we.getId() !== id) : [];
		this._onDidChangeWatchExpressions.fire();
	}

	public moveWatchExpression(id: string, position: number): void {
		const we = this.watchExpressions.filter(we => we.getId() === id).pop();
		this.watchExpressions = this.watchExpressions.filter(we => we.getId() !== id);
		this.watchExpressions = this.watchExpressions.slice(0, position).concat(we, this.watchExpressions.slice(position));

		this._onDidChangeWatchExpressions.fire();
	}

	public deemphasizeSource(uri: uri): void {
		this.processes.forEach(p => {
			if (p.sources.has(uri.toString())) {
				p.sources.get(uri.toString()).presenationHint = 'deemphasize';
			}
		});
		this._onDidChangeCallStack.fire();
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
