/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import * as lifecycle from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { RunOnceScheduler } from 'vs/base/common/async';
import severity from 'vs/base/common/severity';
import { isObject, isString, isUndefinedOrNull } from 'vs/base/common/types';
import { distinct, lastIndex } from 'vs/base/common/arrays';
import { Range, IRange } from 'vs/editor/common/core/range';
import {
	ITreeElement, IExpression, IExpressionContainer, IDebugSession, IStackFrame, IExceptionBreakpoint, IBreakpoint, IFunctionBreakpoint, IDebugModel, IReplElementSource,
	IThread, IRawModelUpdate, IScope, IRawStoppedDetails, IEnablement, IBreakpointData, IExceptionInfo, IReplElement, IBreakpointsChangeEvent, IBreakpointUpdateData, IBaseBreakpoint, State, IDataBreakpoint
} from 'vs/workbench/contrib/debug/common/debug';
import { Source, UNKNOWN_SOURCE_LABEL } from 'vs/workbench/contrib/debug/common/debugSource';
import { commonSuffixLength } from 'vs/base/common/strings';
import { posix } from 'vs/base/common/path';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextEditor } from 'vs/workbench/common/editor';

export class SimpleReplElement implements IReplElement {
	constructor(
		private id: string,
		public value: string,
		public severity: severity,
		public sourceData?: IReplElementSource,
	) { }

	toString(): string {
		return this.value;
	}

	getId(): string {
		return this.id;
	}
}

export class RawObjectReplElement implements IExpression {

	private static readonly MAX_CHILDREN = 1000; // upper bound of children per value

	constructor(private id: string, public name: string, public valueObj: any, public sourceData?: IReplElementSource, public annotation?: string) { }

	getId(): string {
		return this.id;
	}

	get value(): string {
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

	get hasChildren(): boolean {
		return (Array.isArray(this.valueObj) && this.valueObj.length > 0) || (isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0);
	}

	getChildren(): Promise<IExpression[]> {
		let result: IExpression[] = [];
		if (Array.isArray(this.valueObj)) {
			result = (<any[]>this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((v, index) => new RawObjectReplElement(`${this.id}:${index}`, String(index), v));
		} else if (isObject(this.valueObj)) {
			result = Object.getOwnPropertyNames(this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((key, index) => new RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
		}

		return Promise.resolve(result);
	}

	toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class ExpressionContainer implements IExpressionContainer {

	public static allValues = new Map<string, string>();
	// Use chunks to support variable paging #9537
	private static readonly BASE_CHUNK_SIZE = 100;

	public valueChanged = false;
	private _value: string = '';
	protected children?: Promise<IExpression[]>;

	constructor(
		protected session: IDebugSession | undefined,
		private _reference: number | undefined,
		private id: string,
		public namedVariables: number | undefined = 0,
		public indexedVariables: number | undefined = 0,
		private startOfVariables: number | undefined = 0
	) { }

	get reference(): number | undefined {
		return this._reference;
	}

	set reference(value: number | undefined) {
		this._reference = value;
		this.children = undefined; // invalidate children cache
	}

	getChildren(): Promise<IExpression[]> {
		if (!this.children) {
			this.children = this.doGetChildren();
		}

		return this.children;
	}

	private async doGetChildren(): Promise<IExpression[]> {
		if (!this.hasChildren) {
			return Promise.resolve([]);
		}

		if (!this.getChildrenInChunks) {
			return this.fetchVariables(undefined, undefined, undefined);
		}

		// Check if object has named variables, fetch them independent from indexed variables #9670
		const children = this.namedVariables ? await this.fetchVariables(undefined, undefined, 'named') : [];

		// Use a dynamic chunk size based on the number of elements #9774
		let chunkSize = ExpressionContainer.BASE_CHUNK_SIZE;
		while (!!this.indexedVariables && this.indexedVariables > chunkSize * ExpressionContainer.BASE_CHUNK_SIZE) {
			chunkSize *= ExpressionContainer.BASE_CHUNK_SIZE;
		}

		if (!!this.indexedVariables && this.indexedVariables > chunkSize) {
			// There are a lot of children, create fake intermediate values that represent chunks #9537
			const numberOfChunks = Math.ceil(this.indexedVariables / chunkSize);
			for (let i = 0; i < numberOfChunks; i++) {
				const start = (this.startOfVariables || 0) + i * chunkSize;
				const count = Math.min(chunkSize, this.indexedVariables - i * chunkSize);
				children.push(new Variable(this.session, this, this.reference, `[${start}..${start + count - 1}]`, '', '', undefined, count, { kind: 'virtual' }, undefined, true, start));
			}

			return children;
		}

		const variables = await this.fetchVariables(this.startOfVariables, this.indexedVariables, 'indexed');
		return children.concat(variables);
	}

	getId(): string {
		return this.id;
	}

	get value(): string {
		return this._value;
	}

	get hasChildren(): boolean {
		// only variables with reference > 0 have children.
		return !!this.reference && this.reference > 0;
	}

	private fetchVariables(start: number | undefined, count: number | undefined, filter: 'indexed' | 'named' | undefined): Promise<Variable[]> {
		return this.session!.variables(this.reference || 0, filter, start, count).then(response => {
			return response && response.body && response.body.variables
				? distinct(response.body.variables.filter(v => !!v && isString(v.name)), (v: DebugProtocol.Variable) => v.name).map((v: DebugProtocol.Variable) =>
					new Variable(this.session, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.presentationHint, v.type))
				: [];
		}, (e: Error) => [new Variable(this.session, this, 0, e.message, e.message, '', 0, 0, { kind: 'virtual' }, undefined, false)]);
	}

	// The adapter explicitly sents the children count of an expression only if there are lots of children which should be chunked.
	private get getChildrenInChunks(): boolean {
		return !!this.indexedVariables;
	}

	set value(value: string) {
		this._value = value;
		this.valueChanged = !!ExpressionContainer.allValues.get(this.getId()) &&
			ExpressionContainer.allValues.get(this.getId()) !== Expression.DEFAULT_VALUE && ExpressionContainer.allValues.get(this.getId()) !== value;
		ExpressionContainer.allValues.set(this.getId(), value);
	}

	toString(): string {
		return this.value;
	}
}

export class Expression extends ExpressionContainer implements IExpression {
	static DEFAULT_VALUE = nls.localize('notAvailable', "not available");

	public available: boolean;
	public type: string | undefined;

	constructor(public name: string, id = generateUuid()) {
		super(undefined, 0, id);
		this.available = false;
		// name is not set if the expression is just being added
		// in that case do not set default value to prevent flashing #14499
		if (name) {
			this.value = Expression.DEFAULT_VALUE;
		}
	}

	async evaluate(session: IDebugSession | undefined, stackFrame: IStackFrame | undefined, context: string): Promise<void> {
		if (!session || (!stackFrame && context !== 'repl')) {
			this.value = context === 'repl' ? nls.localize('startDebugFirst', "Please start a debug session to evaluate expressions") : Expression.DEFAULT_VALUE;
			this.available = false;
			this.reference = 0;

			return Promise.resolve(undefined);
		}

		this.session = session;
		try {
			const response = await session.evaluate(this.name, stackFrame ? stackFrame.frameId : undefined, context);
			this.available = !!(response && response.body);
			if (response && response.body) {
				this.value = response.body.result || '';
				this.reference = response.body.variablesReference;
				this.namedVariables = response.body.namedVariables;
				this.indexedVariables = response.body.indexedVariables;
				this.type = response.body.type || this.type;
			}
		} catch (e) {
			this.value = e.message || '';
			this.available = false;
			this.reference = 0;
		}
	}

	toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class Variable extends ExpressionContainer implements IExpression {

	// Used to show the error message coming from the adapter when setting the value #7807
	public errorMessage: string | undefined;

	constructor(
		session: IDebugSession | undefined,
		public parent: IExpressionContainer,
		reference: number | undefined,
		public name: string,
		public evaluateName: string | undefined,
		value: string | undefined,
		namedVariables: number | undefined,
		indexedVariables: number | undefined,
		public presentationHint: DebugProtocol.VariablePresentationHint | undefined,
		public type: string | undefined = undefined,
		public available = true,
		startOfVariables = 0
	) {
		super(session, reference, `variable:${parent.getId()}:${name}`, namedVariables, indexedVariables, startOfVariables);
		this.value = value || '';
	}

	async setVariable(value: string): Promise<any> {
		if (!this.session) {
			return Promise.resolve(undefined);
		}

		try {
			const response = await this.session.setVariable((<ExpressionContainer>this.parent).reference, this.name, value);
			if (response && response.body) {
				this.value = response.body.value || '';
				this.type = response.body.type || this.type;
				this.reference = response.body.variablesReference;
				this.namedVariables = response.body.namedVariables;
				this.indexedVariables = response.body.indexedVariables;
			}
		} catch (err) {
			this.errorMessage = err.message;
		}
	}

	toString(): string {
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
		namedVariables?: number,
		indexedVariables?: number,
		public range?: IRange
	) {
		super(stackFrame.thread.session, reference, `scope:${name}:${index}`, namedVariables, indexedVariables);
	}

	toString(): string {
		return this.name;
	}
}

export class StackFrame implements IStackFrame {

	private scopes: Promise<Scope[]> | undefined;

	constructor(
		public thread: IThread,
		public frameId: number,
		public source: Source,
		public name: string,
		public presentationHint: string | undefined,
		public range: IRange,
		private index: number
	) { }

	getId(): string {
		return `stackframe:${this.thread.getId()}:${this.frameId}:${this.index}`;
	}

	getScopes(): Promise<IScope[]> {
		if (!this.scopes) {
			this.scopes = this.thread.session.scopes(this.frameId).then(response => {
				return response && response.body && response.body.scopes ?
					response.body.scopes.map((rs, index) => new Scope(this, index, rs.name, rs.variablesReference, rs.expensive, rs.namedVariables, rs.indexedVariables,
						rs.line && rs.column && rs.endLine && rs.endColumn ? new Range(rs.line, rs.column, rs.endLine, rs.endColumn) : undefined)) : [];
			}, err => []);
		}

		return this.scopes;
	}

	getSpecificSourceName(): string {
		// To reduce flashing of the path name and the way we fetch stack frames
		// We need to compute the source name based on the other frames in the stale call stack
		let callStack = (<Thread>this.thread).getStaleCallStack();
		callStack = callStack.length > 0 ? callStack : this.thread.getCallStack();
		const otherSources = callStack.map(sf => sf.source).filter(s => s !== this.source);
		let suffixLength = 0;
		otherSources.forEach(s => {
			if (s.name === this.source.name) {
				suffixLength = Math.max(suffixLength, commonSuffixLength(this.source.uri.path, s.uri.path));
			}
		});
		if (suffixLength === 0) {
			return this.source.name;
		}

		const from = Math.max(0, this.source.uri.path.lastIndexOf(posix.sep, this.source.uri.path.length - suffixLength - 1));
		return (from > 0 ? '...' : '') + this.source.uri.path.substr(from);
	}

	getMostSpecificScopes(range: IRange): Promise<IScope[]> {
		return this.getScopes().then(scopes => {
			scopes = scopes.filter(s => !s.expensive);
			const haveRangeInfo = scopes.some(s => !!s.range);
			if (!haveRangeInfo) {
				return scopes;
			}

			const scopesContainingRange = scopes.filter(scope => scope.range && Range.containsRange(scope.range, range))
				.sort((first, second) => (first.range!.endLineNumber - first.range!.startLineNumber) - (second.range!.endLineNumber - second.range!.startLineNumber));
			return scopesContainingRange.length ? scopesContainingRange : scopes;
		});
	}

	restart(): Promise<void> {
		return this.thread.session.restartFrame(this.frameId, this.thread.threadId);
	}

	forgetScopes(): void {
		this.scopes = undefined;
	}

	toString(): string {
		const lineNumberToString = typeof this.range.startLineNumber === 'number' ? `:${this.range.startLineNumber}` : '';
		const sourceToString = `${this.source.inMemory ? this.source.name : this.source.uri.fsPath}${lineNumberToString}`;

		return sourceToString === UNKNOWN_SOURCE_LABEL ? this.name : `${this.name} (${sourceToString})`;
	}

	openInEditor(editorService: IEditorService, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<ITextEditor | null> {
		return !this.source.available ? Promise.resolve(null) :
			this.source.openInEditor(editorService, this.range, preserveFocus, sideBySide, pinned);
	}
}

export class Thread implements IThread {
	private callStack: IStackFrame[];
	private staleCallStack: IStackFrame[];
	public stoppedDetails: IRawStoppedDetails | undefined;
	public stopped: boolean;

	constructor(public session: IDebugSession, public name: string, public threadId: number) {
		this.callStack = [];
		this.staleCallStack = [];
		this.stopped = false;
	}

	getId(): string {
		return `thread:${this.session.getId()}:${this.threadId}`;
	}

	clearCallStack(): void {
		if (this.callStack.length) {
			this.staleCallStack = this.callStack;
		}
		this.callStack = [];
	}

	getCallStack(): IStackFrame[] {
		return this.callStack;
	}

	getStaleCallStack(): ReadonlyArray<IStackFrame> {
		return this.staleCallStack;
	}

	get stateLabel(): string {
		if (this.stoppedDetails) {
			return this.stoppedDetails.description ||
				this.stoppedDetails.reason ? nls.localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", this.stoppedDetails.reason) : nls.localize('paused', "Paused");
		}

		return nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	/**
	 * Queries the debug adapter for the callstack and returns a promise
	 * which completes once the call stack has been retrieved.
	 * If the thread is not stopped, it returns a promise to an empty array.
	 * Only fetches the first stack frame for performance reasons. Calling this method consecutive times
	 * gets the remainder of the call stack.
	 */
	fetchCallStack(levels = 20): Promise<void> {
		if (!this.stopped) {
			return Promise.resolve(undefined);
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

	private getCallStackImpl(startFrame: number, levels: number): Promise<IStackFrame[]> {
		return this.session.stackTrace(this.threadId, startFrame, levels).then(response => {
			if (!response || !response.body) {
				return [];
			}

			if (this.stoppedDetails) {
				this.stoppedDetails.totalFrames = response.body.totalFrames;
			}

			return response.body.stackFrames.map((rsf, index) => {
				const source = this.session.getSource(rsf.source);

				return new StackFrame(this, rsf.id, source, rsf.name, rsf.presentationHint, new Range(
					rsf.line,
					rsf.column,
					rsf.endLine || rsf.line,
					rsf.endColumn || rsf.column
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
	 * Returns exception info promise if the exception was thrown, otherwise undefined
	 */
	get exceptionInfo(): Promise<IExceptionInfo | undefined> {
		if (this.stoppedDetails && this.stoppedDetails.reason === 'exception') {
			if (this.session.capabilities.supportsExceptionInfoRequest) {
				return this.session.exceptionInfo(this.threadId);
			}
			return Promise.resolve({
				description: this.stoppedDetails.text,
				breakMode: null
			});
		}
		return Promise.resolve(undefined);
	}

	next(): Promise<any> {
		return this.session.next(this.threadId);
	}

	stepIn(): Promise<any> {
		return this.session.stepIn(this.threadId);
	}

	stepOut(): Promise<any> {
		return this.session.stepOut(this.threadId);
	}

	stepBack(): Promise<any> {
		return this.session.stepBack(this.threadId);
	}

	continue(): Promise<any> {
		return this.session.continue(this.threadId);
	}

	pause(): Promise<any> {
		return this.session.pause(this.threadId);
	}

	terminate(): Promise<any> {
		return this.session.terminateThreads([this.threadId]);
	}

	reverseContinue(): Promise<any> {
		return this.session.reverseContinue(this.threadId);
	}
}

export class Enablement implements IEnablement {
	constructor(
		public enabled: boolean,
		private id: string
	) { }

	getId(): string {
		return this.id;
	}
}

export class BaseBreakpoint extends Enablement implements IBaseBreakpoint {

	private sessionData = new Map<string, DebugProtocol.Breakpoint>();
	private sessionId: string | undefined;

	constructor(
		enabled: boolean,
		public hitCondition: string | undefined,
		public condition: string | undefined,
		public logMessage: string | undefined,
		id: string
	) {
		super(enabled, id);
		if (enabled === undefined) {
			this.enabled = true;
		}
	}

	protected getSessionData(): DebugProtocol.Breakpoint | undefined {
		return this.sessionId ? this.sessionData.get(this.sessionId) : undefined;
	}

	setSessionData(sessionId: string, data: DebugProtocol.Breakpoint): void {
		this.sessionData.set(sessionId, data);
	}

	setSessionId(sessionId: string | undefined): void {
		this.sessionId = sessionId;
	}

	get verified(): boolean {
		const data = this.getSessionData();
		return data ? data.verified : true;
	}

	get idFromAdapter(): number | undefined {
		const data = this.getSessionData();
		return data ? data.id : undefined;
	}

	toJSON(): any {
		const result = Object.create(null);
		result.enabled = this.enabled;
		result.condition = this.condition;
		result.hitCondition = this.hitCondition;
		result.logMessage = this.logMessage;

		return result;
	}
}

export class Breakpoint extends BaseBreakpoint implements IBreakpoint {

	constructor(
		public uri: uri,
		private _lineNumber: number,
		private _column: number | undefined,
		enabled: boolean,
		condition: string | undefined,
		hitCondition: string | undefined,
		logMessage: string | undefined,
		private _adapterData: any,
		private textFileService: ITextFileService,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	get lineNumber(): number {
		const data = this.getSessionData();
		return this.verified && data && typeof data.line === 'number' ? data.line : this._lineNumber;
	}

	get verified(): boolean {
		const data = this.getSessionData();
		if (data) {
			return data.verified && !this.textFileService.isDirty(this.uri);
		}

		return true;
	}

	get column(): number | undefined {
		const data = this.getSessionData();
		// Only respect the column if the user explictly set the column to have an inline breakpoint
		return data && typeof data.column === 'number' && typeof this._column === 'number' ? data.column : this._column;
	}

	get message(): string | undefined {
		const data = this.getSessionData();
		if (!data) {
			return undefined;
		}
		if (this.textFileService.isDirty(this.uri)) {
			return nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session.");
		}

		return data.message;
	}

	get adapterData(): any {
		const data = this.getSessionData();
		return data && data.source && data.source.adapterData ? data.source.adapterData : this._adapterData;
	}

	get endLineNumber(): number | undefined {
		const data = this.getSessionData();
		return data ? data.endLine : undefined;
	}

	get endColumn(): number | undefined {
		const data = this.getSessionData();
		return data ? data.endColumn : undefined;
	}

	get sessionAgnosticData(): { lineNumber: number, column: number | undefined } {
		return {
			lineNumber: this._lineNumber,
			column: this._column
		};
	}

	setSessionData(sessionId: string, data: DebugProtocol.Breakpoint): void {
		super.setSessionData(sessionId, data);
		if (!this._adapterData) {
			this._adapterData = this.adapterData;
		}
	}

	toJSON(): any {
		const result = super.toJSON();
		result.uri = this.uri;
		result.lineNumber = this._lineNumber;
		result.column = this._column;
		result.adapterData = this.adapterData;

		return result;
	}

	toString(): string {
		return resources.basenameOrAuthority(this.uri);
	}

	update(data: IBreakpointUpdateData): void {
		if (!isUndefinedOrNull(data.lineNumber)) {
			this._lineNumber = data.lineNumber;
		}
		if (!isUndefinedOrNull(data.column)) {
			this._column = data.column;
		}
		if (!isUndefinedOrNull(data.condition)) {
			this.condition = data.condition;
		}
		if (!isUndefinedOrNull(data.hitCondition)) {
			this.hitCondition = data.hitCondition;
		}
		if (!isUndefinedOrNull(data.logMessage)) {
			this.logMessage = data.logMessage;
		}
	}
}

export class FunctionBreakpoint extends BaseBreakpoint implements IFunctionBreakpoint {

	constructor(
		public name: string,
		enabled: boolean,
		hitCondition: string | undefined,
		condition: string | undefined,
		logMessage: string | undefined,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	toJSON(): any {
		const result = super.toJSON();
		result.name = this.name;

		return result;
	}

	toString(): string {
		return this.name;
	}
}

export class DataBreakpoint extends BaseBreakpoint implements IDataBreakpoint {

	constructor(
		public label: string,
		public dataId: string,
		public canPersist: boolean,
		enabled: boolean,
		hitCondition: string | undefined,
		condition: string | undefined,
		logMessage: string | undefined,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	toJSON(): any {
		const result = super.toJSON();
		result.label = this.label;
		result.dataid = this.dataId;

		return result;
	}

	toString(): string {
		return this.label;
	}
}

export class ExceptionBreakpoint extends Enablement implements IExceptionBreakpoint {

	constructor(public filter: string, public label: string, enabled: boolean) {
		super(enabled, generateUuid());
	}

	toJSON(): any {
		const result = Object.create(null);
		result.filter = this.filter;
		result.label = this.label;
		result.enabled = this.enabled;

		return result;
	}

	toString(): string {
		return this.label;
	}
}

export class ThreadAndSessionIds implements ITreeElement {
	constructor(public sessionId: string, public threadId: number) { }

	getId(): string {
		return `${this.sessionId}:${this.threadId}`;
	}
}

export class DebugModel implements IDebugModel {

	private sessions: IDebugSession[];
	private toDispose: lifecycle.IDisposable[];
	private schedulers = new Map<string, RunOnceScheduler>();
	private breakpointsSessionId: string | undefined;
	private readonly _onDidChangeBreakpoints: Emitter<IBreakpointsChangeEvent | undefined>;
	private readonly _onDidChangeCallStack: Emitter<void>;
	private readonly _onDidChangeWatchExpressions: Emitter<IExpression | undefined>;

	constructor(
		private breakpoints: Breakpoint[],
		private breakpointsActivated: boolean,
		private functionBreakpoints: FunctionBreakpoint[],
		private exceptionBreakpoints: ExceptionBreakpoint[],
		private dataBreakopints: DataBreakpoint[],
		private watchExpressions: Expression[],
		private textFileService: ITextFileService
	) {
		this.sessions = [];
		this.toDispose = [];
		this._onDidChangeBreakpoints = new Emitter<IBreakpointsChangeEvent>();
		this._onDidChangeCallStack = new Emitter<void>();
		this._onDidChangeWatchExpressions = new Emitter<IExpression>();
	}

	getId(): string {
		return 'root';
	}

	getSession(sessionId: string | undefined, includeInactive = false): IDebugSession | undefined {
		if (sessionId) {
			return this.getSessions(includeInactive).filter(s => s.getId() === sessionId).pop();
		}
		return undefined;
	}

	getSessions(includeInactive = false): IDebugSession[] {
		// By default do not return inactive sesions.
		// However we are still holding onto inactive sessions due to repl and debug service session revival (eh scenario)
		return this.sessions.filter(s => includeInactive || s.state !== State.Inactive);
	}

	addSession(session: IDebugSession): void {
		this.sessions = this.sessions.filter(s => {
			if (s.getId() === session.getId()) {
				// Make sure to de-dupe if a session is re-intialized. In case of EH debugging we are adding a session again after an attach.
				return false;
			}
			if (s.state === State.Inactive && s.configuration.name === session.configuration.name) {
				// Make sure to remove all inactive sessions that are using the same configuration as the new session
				return false;
			}

			return true;
		});

		let index = -1;
		if (session.parentSession) {
			// Make sure that child sessions are placed after the parent session
			index = lastIndex(this.sessions, s => s.parentSession === session.parentSession || s === session.parentSession);
		}
		if (index >= 0) {
			this.sessions.splice(index + 1, 0, session);
		} else {
			this.sessions.push(session);
		}
		this._onDidChangeCallStack.fire(undefined);
	}

	get onDidChangeBreakpoints(): Event<IBreakpointsChangeEvent | undefined> {
		return this._onDidChangeBreakpoints.event;
	}

	get onDidChangeCallStack(): Event<void> {
		return this._onDidChangeCallStack.event;
	}

	get onDidChangeWatchExpressions(): Event<IExpression | undefined> {
		return this._onDidChangeWatchExpressions.event;
	}

	rawUpdate(data: IRawModelUpdate): void {
		let session = this.sessions.filter(p => p.getId() === data.sessionId).pop();
		if (session) {
			session.rawUpdate(data);
			this._onDidChangeCallStack.fire(undefined);
		}
	}

	clearThreads(id: string, removeThreads: boolean, reference: number | undefined = undefined): void {
		const session = this.sessions.filter(p => p.getId() === id).pop();
		this.schedulers.forEach(scheduler => scheduler.dispose());
		this.schedulers.clear();

		if (session) {
			session.clearThreads(removeThreads, reference);
			this._onDidChangeCallStack.fire(undefined);
		}
	}

	fetchCallStack(thread: Thread): { topCallStack: Promise<void>, wholeCallStack: Promise<void> } {
		if (thread.session.capabilities.supportsDelayedStackTraceLoading) {
			// For improved performance load the first stack frame and then load the rest async.
			let topCallStack = Promise.resolve();
			const wholeCallStack = new Promise<void>((c, e) => {
				topCallStack = thread.fetchCallStack(1).then(() => {
					if (!this.schedulers.has(thread.getId())) {
						this.schedulers.set(thread.getId(), new RunOnceScheduler(() => {
							thread.fetchCallStack(19).then(() => {
								this._onDidChangeCallStack.fire();
								c();
							});
						}, 420));
					}

					this.schedulers.get(thread.getId())!.schedule();
				});
				this._onDidChangeCallStack.fire();
			});

			return { topCallStack, wholeCallStack };
		}

		const wholeCallStack = thread.fetchCallStack();
		return { wholeCallStack, topCallStack: wholeCallStack };
	}

	getBreakpoints(filter?: { uri?: uri, lineNumber?: number, column?: number, enabledOnly?: boolean }): IBreakpoint[] {
		if (filter) {
			const uriStr = filter.uri ? filter.uri.toString() : undefined;
			return this.breakpoints.filter(bp => {
				if (uriStr && bp.uri.toString() !== uriStr) {
					return false;
				}
				if (filter.lineNumber && bp.lineNumber !== filter.lineNumber) {
					return false;
				}
				if (filter.column && bp.column !== filter.column) {
					return false;
				}
				if (filter.enabledOnly && (!this.breakpointsActivated || !bp.enabled)) {
					return false;
				}

				return true;
			});
		}

		return this.breakpoints;
	}

	getFunctionBreakpoints(): IFunctionBreakpoint[] {
		return this.functionBreakpoints;
	}

	getDataBreakpoints(): IDataBreakpoint[] {
		return this.dataBreakopints;
	}

	getExceptionBreakpoints(): IExceptionBreakpoint[] {
		return this.exceptionBreakpoints;
	}

	setExceptionBreakpoints(data: DebugProtocol.ExceptionBreakpointsFilter[]): void {
		if (data) {
			if (this.exceptionBreakpoints.length === data.length && this.exceptionBreakpoints.every((exbp, i) => exbp.filter === data[i].filter && exbp.label === data[i].label)) {
				// No change
				return;
			}

			this.exceptionBreakpoints = data.map(d => {
				const ebp = this.exceptionBreakpoints.filter(ebp => ebp.filter === d.filter).pop();
				return new ExceptionBreakpoint(d.filter, d.label, ebp ? ebp.enabled : !!d.default);
			});
			this._onDidChangeBreakpoints.fire(undefined);
		}
	}

	areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	setBreakpointsActivated(activated: boolean): void {
		this.breakpointsActivated = activated;
		this._onDidChangeBreakpoints.fire(undefined);
	}

	addBreakpoints(uri: uri, rawData: IBreakpointData[], fireEvent = true): IBreakpoint[] {
		const newBreakpoints = rawData.map(rawBp => new Breakpoint(uri, rawBp.lineNumber, rawBp.column, rawBp.enabled === false ? false : true, rawBp.condition, rawBp.hitCondition, rawBp.logMessage, undefined, this.textFileService, rawBp.id));
		newBreakpoints.forEach(bp => bp.setSessionId(this.breakpointsSessionId));
		this.breakpoints = this.breakpoints.concat(newBreakpoints);
		this.breakpointsActivated = true;
		this.sortAndDeDup();

		if (fireEvent) {
			this._onDidChangeBreakpoints.fire({ added: newBreakpoints });
		}

		return newBreakpoints;
	}

	removeBreakpoints(toRemove: IBreakpoint[]): void {
		this.breakpoints = this.breakpoints.filter(bp => !toRemove.some(toRemove => toRemove.getId() === bp.getId()));
		this._onDidChangeBreakpoints.fire({ removed: toRemove });
	}

	updateBreakpoints(data: Map<string, IBreakpointUpdateData>): void {
		const updated: IBreakpoint[] = [];
		this.breakpoints.forEach(bp => {
			const bpData = data.get(bp.getId());
			if (bpData) {
				bp.update(bpData);
				updated.push(bp);
			}
		});
		this.sortAndDeDup();
		this._onDidChangeBreakpoints.fire({ changed: updated });
	}

	setBreakpointSessionData(sessionId: string, data: Map<string, DebugProtocol.Breakpoint>): void {
		this.breakpoints.forEach(bp => {
			const bpData = data.get(bp.getId());
			if (bpData) {
				bp.setSessionData(sessionId, bpData);
			}
		});
		this.functionBreakpoints.forEach(fbp => {
			const fbpData = data.get(fbp.getId());
			if (fbpData) {
				fbp.setSessionData(sessionId, fbpData);
			}
		});
		this.dataBreakopints.forEach(dbp => {
			const dbpData = data.get(dbp.getId());
			if (dbpData) {
				dbp.setSessionData(sessionId, dbpData);
			}
		});

		this._onDidChangeBreakpoints.fire({
			sessionOnly: true
		});
	}

	setBreakpointsSessionId(sessionId: string | undefined): void {
		this.breakpointsSessionId = sessionId;
		this.breakpoints.forEach(bp => bp.setSessionId(sessionId));
		this.functionBreakpoints.forEach(fbp => fbp.setSessionId(sessionId));
		this.dataBreakopints.forEach(dbp => dbp.setSessionId(sessionId));

		this._onDidChangeBreakpoints.fire({
			sessionOnly: true
		});
	}

	private sortAndDeDup(): void {
		this.breakpoints = this.breakpoints.sort((first, second) => {
			if (first.uri.toString() !== second.uri.toString()) {
				return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
			}
			if (first.lineNumber === second.lineNumber) {
				if (first.column && second.column) {
					return first.column - second.column;
				}
				return -1;
			}

			return first.lineNumber - second.lineNumber;
		});
		this.breakpoints = distinct(this.breakpoints, bp => `${bp.uri.toString()}:${bp.lineNumber}:${bp.column}`);
	}

	setEnablement(element: IEnablement, enable: boolean): void {
		if (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof ExceptionBreakpoint) {
			const changed: Array<IBreakpoint | IFunctionBreakpoint> = [];
			if (element.enabled !== enable && (element instanceof Breakpoint || element instanceof FunctionBreakpoint)) {
				changed.push(element);
			}

			element.enabled = enable;

			this._onDidChangeBreakpoints.fire({ changed: changed });
		}
	}

	enableOrDisableAllBreakpoints(enable: boolean): void {
		const changed: Array<IBreakpoint | IFunctionBreakpoint | IDataBreakpoint> = [];

		this.breakpoints.forEach(bp => {
			if (bp.enabled !== enable) {
				changed.push(bp);
			}
			bp.enabled = enable;
		});
		this.functionBreakpoints.forEach(fbp => {
			if (fbp.enabled !== enable) {
				changed.push(fbp);
			}
			fbp.enabled = enable;
		});
		this.dataBreakopints.forEach(dbp => {
			if (dbp.enabled !== enable) {
				changed.push(dbp);
			}
			dbp.enabled = enable;
		});

		this._onDidChangeBreakpoints.fire({ changed: changed });
	}

	addFunctionBreakpoint(functionName: string, id?: string): IFunctionBreakpoint {
		const newFunctionBreakpoint = new FunctionBreakpoint(functionName, true, undefined, undefined, undefined, id);
		this.functionBreakpoints.push(newFunctionBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newFunctionBreakpoint] });

		return newFunctionBreakpoint;
	}

	renameFunctionBreakpoint(id: string, name: string): void {
		const functionBreakpoint = this.functionBreakpoints.filter(fbp => fbp.getId() === id).pop();
		if (functionBreakpoint) {
			functionBreakpoint.name = name;
			this._onDidChangeBreakpoints.fire({ changed: [functionBreakpoint] });
		}
	}

	removeFunctionBreakpoints(id?: string): void {
		let removed: FunctionBreakpoint[];
		if (id) {
			removed = this.functionBreakpoints.filter(fbp => fbp.getId() === id);
			this.functionBreakpoints = this.functionBreakpoints.filter(fbp => fbp.getId() !== id);
		} else {
			removed = this.functionBreakpoints;
			this.functionBreakpoints = [];
		}
		this._onDidChangeBreakpoints.fire({ removed });
	}

	addDataBreakpoint(label: string, dataId: string, canPersist: boolean): void {
		const newDataBreakpoint = new DataBreakpoint(label, dataId, canPersist, true, undefined, undefined, undefined);
		this.dataBreakopints.push(newDataBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newDataBreakpoint] });
	}

	removeDataBreakpoints(id?: string): void {
		let removed: DataBreakpoint[];
		if (id) {
			removed = this.dataBreakopints.filter(fbp => fbp.getId() === id);
			this.dataBreakopints = this.dataBreakopints.filter(fbp => fbp.getId() !== id);
		} else {
			removed = this.dataBreakopints;
			this.dataBreakopints = [];
		}
		this._onDidChangeBreakpoints.fire({ removed });
	}

	getWatchExpressions(): Expression[] {
		return this.watchExpressions;
	}

	addWatchExpression(name: string): IExpression {
		const we = new Expression(name);
		this.watchExpressions.push(we);
		this._onDidChangeWatchExpressions.fire(we);

		return we;
	}

	renameWatchExpression(id: string, newName: string): void {
		const filtered = this.watchExpressions.filter(we => we.getId() === id);
		if (filtered.length === 1) {
			filtered[0].name = newName;
			this._onDidChangeWatchExpressions.fire(filtered[0]);
		}
	}

	removeWatchExpressions(id: string | null = null): void {
		this.watchExpressions = id ? this.watchExpressions.filter(we => we.getId() !== id) : [];
		this._onDidChangeWatchExpressions.fire(undefined);
	}

	moveWatchExpression(id: string, position: number): void {
		const we = this.watchExpressions.filter(we => we.getId() === id).pop();
		if (we) {
			this.watchExpressions = this.watchExpressions.filter(we => we.getId() !== id);
			this.watchExpressions = this.watchExpressions.slice(0, position).concat(we, this.watchExpressions.slice(position));
			this._onDidChangeWatchExpressions.fire(undefined);
		}
	}

	sourceIsNotAvailable(uri: uri): void {
		this.sessions.forEach(s => {
			const source = s.getSourceForUri(uri);
			if (source) {
				source.available = false;
			}
		});
		this._onDidChangeCallStack.fire(undefined);
	}

	dispose(): void {
		// Make sure to shutdown each session, such that no debugged process is left laying around
		this.sessions.forEach(s => s.shutdown());
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
