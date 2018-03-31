/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { TPromise } from 'vs/base/common/winjs.base';
import * as lifecycle from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import * as errors from 'vs/base/common/errors';
import { RunOnceScheduler } from 'vs/base/common/async';
import severity from 'vs/base/common/severity';
import { isObject, isString, isUndefinedOrNull } from 'vs/base/common/types';
import { distinct } from 'vs/base/common/arrays';
import { Range, IRange } from 'vs/editor/common/core/range';
import { ISuggestion } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import {
	ITreeElement, IExpression, IExpressionContainer, IProcess, IStackFrame, IExceptionBreakpoint, IBreakpoint, IFunctionBreakpoint, IModel, IReplElementSource,
	IConfig, ISession, IThread, IRawModelUpdate, IScope, IRawStoppedDetails, IEnablement, IBreakpointData, IExceptionInfo, IReplElement, ProcessState, IBreakpointsChangeEvent, IBreakpointUpdateData
} from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { mixin } from 'vs/base/common/objects';

const MAX_REPL_LENGTH = 10000;

export abstract class AbstractReplElement implements IReplElement {
	private static ID_COUNTER = 0;

	constructor(public sourceData: IReplElementSource, private id = AbstractReplElement.ID_COUNTER++) {
		// noop
	}

	public getId(): string {
		return `replelement:${this.id}`;
	}

	// Used by the copy all action in repl
	abstract toString(): string;
}

export class SimpleReplElement extends AbstractReplElement {

	constructor(
		public value: string,
		public severity: severity,
		source: IReplElementSource,
	) {
		super(source);
	}

	public toString(): string {
		return this.value;
	}
}

export class RawObjectReplElement extends AbstractReplElement implements IExpression {

	private static readonly MAX_CHILDREN = 1000; // upper bound of children per value

	constructor(public name: string, public valueObj: any, source?: IReplElementSource, public annotation?: string) {
		super(source);
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
			result = (<any[]>this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((v, index) => new RawObjectReplElement(String(index), v));
		} else if (isObject(this.valueObj)) {
			result = Object.getOwnPropertyNames(this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map(key => new RawObjectReplElement(key, this.valueObj[key]));
		}

		return TPromise.as(result);
	}

	public toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class ExpressionContainer implements IExpressionContainer {

	public static allValues: Map<string, string> = new Map<string, string>();
	// Use chunks to support variable paging #9537
	private static readonly BASE_CHUNK_SIZE = 100;

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
					childrenArray.push(new Variable(this.process, this, this.reference, `[${start}..${start + count - 1}]`, '', '', null, count, { kind: 'virtual' }, null, true, start));
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
		return this.process.state !== ProcessState.INACTIVE ? this.process.session.variables({
			variablesReference: this.reference,
			start,
			count,
			filter
		}).then(response => {
			return response && response.body && response.body.variables ? distinct(response.body.variables.filter(v => !!v && v.name), v => v.name).map(
				v => new Variable(this.process, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.presentationHint, v.type)
			) : [];
		}, (e: Error) => [new Variable(this.process, this, 0, null, e.message, '', 0, 0, { kind: 'virtual' }, null, false)]) : TPromise.as([]);
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

	public toString(): string {
		return this.value;
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

	public toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class Variable extends ExpressionContainer implements IExpression {

	// Used to show the error message coming from the adapter when setting the value #7807
	public errorMessage: string;

	constructor(
		process: IProcess,
		public parent: IExpressionContainer,
		reference: number,
		public name: string,
		public evaluateName: string,
		value: string,
		namedVariables: number,
		indexedVariables: number,
		public presentationHint: DebugProtocol.VariablePresentationHint,
		public type: string = null,
		public available = true,
		startOfVariables = 0
	) {
		super(process, reference, `variable:${parent.getId()}:${name}`, namedVariables, indexedVariables, startOfVariables);
		this.value = value;
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

	public toString(): string {
		return `${this.name}: ${this.value}`;
	}
}

export class Scope extends ExpressionContainer implements IScope {

	constructor(
		stackFrame: IStackFrame,
		index: number,
		public name: string,
		reference: number,
		public expensive: boolean,
		namedVariables: number,
		indexedVariables: number,
		public range?: IRange
	) {
		super(stackFrame.thread.process, reference, `scope:${stackFrame.getId()}:${name}:${index}`, namedVariables, indexedVariables);
	}
}

export class StackFrame implements IStackFrame {

	private scopes: TPromise<Scope[]>;

	constructor(
		public thread: IThread,
		public frameId: number,
		public source: Source,
		public name: string,
		public presentationHint: string,
		public range: IRange,
		private index: number
	) {
		this.scopes = null;
	}

	public getId(): string {
		return `stackframe:${this.thread.getId()}:${this.frameId}:${this.index}`;
	}

	public getScopes(): TPromise<IScope[]> {
		if (!this.scopes) {
			this.scopes = this.thread.process.session.scopes({ frameId: this.frameId }).then(response => {
				return response && response.body && response.body.scopes ?
					response.body.scopes.map((rs, index) => new Scope(this, index, rs.name, rs.variablesReference, rs.expensive, rs.namedVariables, rs.indexedVariables,
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

			const scopesContainingRange = scopes.filter(scope => scope.range && Range.containsRange(scope.range, range))
				.sort((first, second) => (first.range.endLineNumber - first.range.startLineNumber) - (second.range.endLineNumber - second.range.startLineNumber));
			return scopesContainingRange.length ? scopesContainingRange : scopes;
		});
	}

	public restart(): TPromise<any> {
		return this.thread.process.session.restartFrame({ frameId: this.frameId }, this.thread.threadId);
	}

	public toString(): string {
		return `${this.name} (${this.source.inMemory ? this.source.name : this.source.uri.fsPath}:${this.range.startLineNumber})`;
	}

	public openInEditor(editorService: IWorkbenchEditorService, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		return !this.source.available ? TPromise.as(null) :
			this.source.openInEditor(editorService, this.range, preserveFocus, sideBySide, pinned);
	}
}

export class Thread implements IThread {
	private callStack: IStackFrame[];
	private staleCallStack: IStackFrame[];
	public stoppedDetails: IRawStoppedDetails;
	public stopped: boolean;

	constructor(public process: IProcess, public name: string, public threadId: number) {
		this.stoppedDetails = null;
		this.callStack = [];
		this.staleCallStack = [];
		this.stopped = false;
	}

	public getId(): string {
		return `thread:${this.process.getId()}:${this.threadId}`;
	}

	public clearCallStack(): void {
		if (this.callStack.length) {
			this.staleCallStack = this.callStack;
		}
		this.callStack = [];
	}

	public getCallStack(): IStackFrame[] {
		return this.callStack;
	}

	public getStaleCallStack(): IStackFrame[] {
		return this.staleCallStack;
	}

	/**
	 * Queries the debug adapter for the callstack and returns a promise
	 * which completes once the call stack has been retrieved.
	 * If the thread is not stopped, it returns a promise to an empty array.
	 * Only fetches the first stack frame for performance reasons. Calling this method consecutive times
	 * gets the remainder of the call stack.
	 */
	public fetchCallStack(levels = 20): TPromise<void> {
		if (!this.stopped) {
			return TPromise.as(null);
		}

		const start = this.callStack.length;
		return this.getCallStackImpl(start, levels).then(callStack => {
			if (start < this.callStack.length) {
				// Set the stack frames for exact position we requested. To make sure no concurrent requests create duplicate stack frames #30660
				this.callStack.splice(start, this.callStack.length - start);
			}
			this.callStack = this.callStack.concat(callStack || []);
		});
	}

	private getCallStackImpl(startFrame: number, levels: number): TPromise<IStackFrame[]> {
		return this.process.session.stackTrace({ threadId: this.threadId, startFrame, levels }).then(response => {
			if (!response || !response.body) {
				return [];
			}

			if (this.stoppedDetails) {
				this.stoppedDetails.totalFrames = response.body.totalFrames;
			}

			return response.body.stackFrames.map((rsf, index) => {
				const source = this.process.getSource(rsf.source);

				return new StackFrame(this, rsf.id, source, rsf.name, rsf.presentationHint, new Range(
					rsf.line,
					rsf.column,
					rsf.endLine,
					rsf.endColumn
				), startFrame + index);
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

			return session.exceptionInfo({ threadId: this.threadId }).then(exception => {
				if (!exception) {
					return null;
				}

				return {
					id: exception.body.exceptionId,
					description: exception.body.description,
					breakMode: exception.body.breakMode,
					details: exception.body.details
				};
			});
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

	private sources: Map<string, Source>;
	private threads: Map<number, Thread>;

	public inactive = true;

	constructor(public configuration: IConfig, private _session: ISession & ITreeElement) {
		this.threads = new Map<number, Thread>();
		this.sources = new Map<string, Source>();
		this._session.onDidInitialize(() => this.inactive = false);
	}

	public get session(): ISession {
		return this._session;
	}

	public getName(includeRoot: boolean): string {
		return includeRoot && this.session.root ? `${this.configuration.name} (${resources.basenameOrAuthority(this.session.root.uri)})` : this.configuration.name;
	}

	public get state(): ProcessState {
		if (this.inactive) {
			return ProcessState.INACTIVE;
		}

		return this.configuration.type === 'attach' ? ProcessState.ATTACH : ProcessState.LAUNCH;
	}

	public getSourceForUri(modelUri: uri): Source {
		return this.sources.get(modelUri.toString());
	}

	public getSource(raw: DebugProtocol.Source): Source {
		let source = new Source(raw, this.getId());
		if (this.sources.has(source.uri.toString())) {
			source = this.sources.get(source.uri.toString());
			source.raw = mixin(source.raw, raw);
			if (source.raw && raw) {
				// Always take the latest presentation hint from adapter #42139
				source.raw.presentationHint = raw.presentationHint;
			}
		} else {
			this.sources.set(source.uri.toString(), source);
		}

		return source;
	}

	public getThread(threadId: number): Thread {
		return this.threads.get(threadId);
	}

	public getAllThreads(): IThread[] {
		const result: IThread[] = [];
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
			if (data.stoppedDetails.allThreadsStopped) {
				this.threads.forEach(thread => {
					thread.stoppedDetails = thread.threadId === data.threadId ? data.stoppedDetails : { reason: undefined };
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
		if (reference !== undefined && reference !== null) {
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
	public endLineNumber: number;
	public endColumn: number;

	constructor(
		public uri: uri,
		public lineNumber: number,
		public column: number,
		public enabled: boolean,
		public condition: string,
		public hitCondition: string,
		public logMessage: string,
		public adapterData: any,
		private id = generateUuid()
	) {
		if (enabled === undefined) {
			this.enabled = true;
		}
		this.verified = false;
	}

	public getId(): string {
		return this.id;
	}
}

export class FunctionBreakpoint implements IFunctionBreakpoint {

	public verified: boolean;
	public idFromAdapter: number;

	constructor(public name: string, public enabled: boolean, public hitCondition: string, public condition: string, public logMessage: string, private id = generateUuid()) {
		this.verified = false;
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
	private replElements: IReplElement[];
	private schedulers = new Map<string, RunOnceScheduler>();
	private readonly _onDidChangeBreakpoints: Emitter<IBreakpointsChangeEvent>;
	private readonly _onDidChangeCallStack: Emitter<void>;
	private readonly _onDidChangeWatchExpressions: Emitter<IExpression>;
	private readonly _onDidChangeREPLElements: Emitter<void>;

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
		this._onDidChangeBreakpoints = new Emitter<IBreakpointsChangeEvent>();
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

	public get onDidChangeBreakpoints(): Event<IBreakpointsChangeEvent> {
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
		this.schedulers.forEach(scheduler => scheduler.dispose());
		this.schedulers.clear();

		if (process) {
			process.clearThreads(removeThreads, reference);
			this._onDidChangeCallStack.fire();
		}
	}

	public fetchCallStack(thread: Thread): TPromise<void> {
		if (thread.process.session.capabilities.supportsDelayedStackTraceLoading) {
			// For improved performance load the first stack frame and then load the rest async.
			return thread.fetchCallStack(1).then(() => {
				if (!this.schedulers.has(thread.getId())) {
					this.schedulers.set(thread.getId(), new RunOnceScheduler(() => {
						thread.fetchCallStack(19).done(() => this._onDidChangeCallStack.fire(), errors.onUnexpectedError);
					}, 420));
				}

				this.schedulers.get(thread.getId()).schedule();
				this._onDidChangeCallStack.fire();
			});
		}

		return thread.fetchCallStack();
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
			this._onDidChangeBreakpoints.fire();
		}
	}

	public areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	public setBreakpointsActivated(activated: boolean): void {
		this.breakpointsActivated = activated;
		this._onDidChangeBreakpoints.fire();
	}

	public addBreakpoints(uri: uri, rawData: IBreakpointData[], fireEvent = true): Breakpoint[] {
		const newBreakpoints = rawData.map(rawBp => new Breakpoint(uri, rawBp.lineNumber, rawBp.column, rawBp.enabled, rawBp.condition, rawBp.hitCondition, rawBp.logMessage, undefined, rawBp.id));
		this.breakpoints = this.breakpoints.concat(newBreakpoints);
		this.breakpointsActivated = true;
		this.sortAndDeDup();

		if (fireEvent) {
			this._onDidChangeBreakpoints.fire({ added: newBreakpoints });
		}

		return newBreakpoints;
	}

	public removeBreakpoints(toRemove: IBreakpoint[]): void {
		this.breakpoints = this.breakpoints.filter(bp => !toRemove.some(toRemove => toRemove.getId() === bp.getId()));
		this._onDidChangeBreakpoints.fire({ removed: toRemove });
	}

	public updateBreakpoints(data: { [id: string]: IBreakpointUpdateData }): void {
		const updated: IBreakpoint[] = [];
		this.breakpoints.forEach(bp => {
			const bpData = data[bp.getId()];
			if (bpData) {
				if (!isUndefinedOrNull(bpData.line)) {
					bp.lineNumber = bpData.line;
				}
				bp.endLineNumber = bpData.endLine;
				bp.column = bpData.column;
				bp.endColumn = bpData.endColumn;
				if (!isUndefinedOrNull(bpData.verified)) {
					bp.verified = bpData.verified;
				}
				bp.idFromAdapter = bpData.id;
				bp.message = bpData.message;
				bp.adapterData = bpData.source ? bpData.source.adapterData : bp.adapterData;

				if (!isUndefinedOrNull(bpData.condition)) {
					bp.condition = bpData.condition;
				}
				if (!isUndefinedOrNull(bpData.hitCondition)) {
					bp.hitCondition = bpData.hitCondition;
				}
				if (!isUndefinedOrNull(bpData.logMessage)) {
					bp.logMessage = bpData.logMessage;
				}
				updated.push(bp);
			}
		});
		this.sortAndDeDup();
		this._onDidChangeBreakpoints.fire({ changed: updated });
	}

	private sortAndDeDup(): void {
		this.breakpoints = this.breakpoints.sort((first, second) => {
			if (first.uri.toString() !== second.uri.toString()) {
				return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
			}
			if (first.lineNumber === second.lineNumber) {
				return first.column - second.column;
			}

			return first.lineNumber - second.lineNumber;
		});
		this.breakpoints = distinct(this.breakpoints, bp => `${bp.uri.toString()}:${bp.lineNumber}:${bp.column}`);
	}

	public setEnablement(element: IEnablement, enable: boolean): void {

		const changed: (IBreakpoint | IFunctionBreakpoint)[] = [];
		if (element.enabled !== enable && (element instanceof Breakpoint || element instanceof FunctionBreakpoint)) {
			changed.push(element);
		}

		element.enabled = enable;
		if (element instanceof Breakpoint && !element.enabled) {
			const breakpoint = <Breakpoint>element;
			breakpoint.verified = false;
		}

		this._onDidChangeBreakpoints.fire({ changed: changed });
	}

	public enableOrDisableAllBreakpoints(enable: boolean): void {

		const changed: (IBreakpoint | IFunctionBreakpoint)[] = [];

		this.breakpoints.forEach(bp => {
			if (bp.enabled !== enable) {
				changed.push(bp);
			}
			bp.enabled = enable;
			if (!enable) {
				bp.verified = false;
			}
		});
		this.functionBreakpoints.forEach(fbp => {
			if (fbp.enabled !== enable) {
				changed.push(fbp);
			}
			fbp.enabled = enable;
		});

		this._onDidChangeBreakpoints.fire({ changed: changed });
	}

	public addFunctionBreakpoint(functionName: string, id: string): FunctionBreakpoint {
		const newFunctionBreakpoint = new FunctionBreakpoint(functionName, true, undefined, undefined, undefined, id);
		this.functionBreakpoints.push(newFunctionBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newFunctionBreakpoint] });

		return newFunctionBreakpoint;
	}

	public updateFunctionBreakpoints(data: { [id: string]: { name?: string, verified?: boolean; id?: number; hitCondition?: string } }): void {

		const changed: IFunctionBreakpoint[] = [];

		this.functionBreakpoints.forEach(fbp => {
			const fbpData = data[fbp.getId()];
			if (fbpData) {
				fbp.name = fbpData.name || fbp.name;
				fbp.verified = fbpData.verified;
				fbp.idFromAdapter = fbpData.id;
				fbp.hitCondition = fbpData.hitCondition;

				changed.push(fbp);
			}
		});

		this._onDidChangeBreakpoints.fire({ changed: changed });
	}

	public removeFunctionBreakpoints(id?: string): void {

		let removed: IFunctionBreakpoint[];
		if (id) {
			removed = this.functionBreakpoints.filter(fbp => fbp.getId() === id);
			this.functionBreakpoints = this.functionBreakpoints.filter(fbp => fbp.getId() !== id);
		} else {
			removed = this.functionBreakpoints;
			this.functionBreakpoints = [];
		}
		this._onDidChangeBreakpoints.fire({ removed: removed });
	}

	public getReplElements(): IReplElement[] {
		return this.replElements;
	}

	public addReplExpression(process: IProcess, stackFrame: IStackFrame, name: string): TPromise<void> {
		const expression = new Expression(name);
		this.addReplElements([expression]);
		return expression.evaluate(process, stackFrame, 'repl')
			.then(() => this._onDidChangeREPLElements.fire());
	}

	public appendToRepl(data: string | IExpression, severity: severity, source?: IReplElementSource): void {
		if (typeof data === 'string') {
			const previousElement = this.replElements.length && (this.replElements[this.replElements.length - 1] as SimpleReplElement);

			const toAdd = data.split('\n').map((line, index) => new SimpleReplElement(line, severity, index === 0 ? source : undefined));
			if (previousElement && previousElement.value === '') {
				// remove potential empty lines between different repl types
				this.replElements.pop();
			} else if (previousElement instanceof SimpleReplElement && severity === previousElement.severity && toAdd.length && toAdd[0].sourceData === previousElement.sourceData) {
				previousElement.value += toAdd.shift().value;
			}
			this.addReplElements(toAdd);
		} else {
			// TODO@Isidor hack, we should introduce a new type which is an output that can fetch children like an expression
			(<any>data).severity = severity;
			(<any>data).sourceData = source;
			this.addReplElements([data]);
		}

		this._onDidChangeREPLElements.fire();
	}

	private addReplElements(newElements: IReplElement[]): void {
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

	public addWatchExpression(process: IProcess, stackFrame: IStackFrame, name: string): IExpression {
		const we = new Expression(name);
		this.watchExpressions.push(we);
		this._onDidChangeWatchExpressions.fire(we);

		return we;
	}

	public renameWatchExpression(process: IProcess, stackFrame: IStackFrame, id: string, newName: string): void {
		const filtered = this.watchExpressions.filter(we => we.getId() === id);
		if (filtered.length === 1) {
			filtered[0].name = newName;
			this._onDidChangeWatchExpressions.fire(filtered[0]);
		}
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

	public sourceIsNotAvailable(uri: uri): void {
		this.processes.forEach(p => {
			if (p.sources.has(uri.toString())) {
				p.sources.get(uri.toString()).available = false;
			}
		});
		this._onDidChangeCallStack.fire();
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
