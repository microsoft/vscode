/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, findLastIndex } from 'vs/base/common/arrays';
import { DeferredPromise, RunOnceScheduler } from 'vs/base/common/async';
import { decodeBase64, encodeBase64, VSBuffer } from 'vs/base/common/buffer';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { stringHash } from 'vs/base/common/hash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { mixin } from 'vs/base/common/objects';
import * as resources from 'vs/base/common/resources';
import { isString, isUndefinedOrNull } from 'vs/base/common/types';
import { URI, URI as uri } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IRange, Range } from 'vs/editor/common/core/range';
import * as nls from 'vs/nls';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IEditorPane } from 'vs/workbench/common/editor';
import { DEBUG_MEMORY_SCHEME, IBaseBreakpoint, IBreakpoint, IBreakpointData, IBreakpointsChangeEvent, IBreakpointUpdateData, IDataBreakpoint, IDebugModel, IDebugSession, IEnablement, IExceptionBreakpoint, IExceptionInfo, IExpression, IExpressionContainer, IFunctionBreakpoint, IInstructionBreakpoint, IMemoryInvalidationEvent, IMemoryRegion, IRawModelUpdate, IRawStoppedDetails, IScope, IStackFrame, IThread, ITreeElement, MemoryRange, MemoryRangeType, State } from 'vs/workbench/contrib/debug/common/debug';
import { getUriFromSource, Source, UNKNOWN_SOURCE_LABEL } from 'vs/workbench/contrib/debug/common/debugSource';
import { DebugStorage } from 'vs/workbench/contrib/debug/common/debugStorage';
import { DisassemblyViewInput } from 'vs/workbench/contrib/debug/common/disassemblyViewInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILogService } from 'vs/platform/log/common/log';

interface IDebugProtocolVariableWithContext extends DebugProtocol.Variable {
	__vscodeVariableMenuContext?: string;
}

export class ExpressionContainer implements IExpressionContainer {

	public static readonly allValues = new Map<string, string>();
	// Use chunks to support variable paging #9537
	private static readonly BASE_CHUNK_SIZE = 100;

	public type: string | undefined;
	public valueChanged = false;
	private _value: string = '';
	protected children?: Promise<IExpression[]>;

	constructor(
		protected session: IDebugSession | undefined,
		protected readonly threadId: number | undefined,
		private _reference: number | undefined,
		private readonly id: string,
		public namedVariables: number | undefined = 0,
		public indexedVariables: number | undefined = 0,
		public memoryReference: string | undefined = undefined,
		private startOfVariables: number | undefined = 0,
		public presentationHint: DebugProtocol.VariablePresentationHint | undefined = undefined
	) { }

	get reference(): number | undefined {
		return this._reference;
	}

	set reference(value: number | undefined) {
		this._reference = value;
		this.children = undefined; // invalidate children cache
	}

	async evaluateLazy(): Promise<void> {
		if (typeof this.reference === 'undefined') {
			return;
		}

		const response = await this.session!.variables(this.reference, this.threadId, undefined, undefined, undefined);
		if (!response || !response.body || !response.body.variables || response.body.variables.length !== 1) {
			return;
		}

		const dummyVar = response.body.variables[0];
		this.reference = dummyVar.variablesReference;
		this._value = dummyVar.value;
		this.namedVariables = dummyVar.namedVariables;
		this.indexedVariables = dummyVar.indexedVariables;
		this.memoryReference = dummyVar.memoryReference;
		this.presentationHint = dummyVar.presentationHint;
		// Also call overridden method to adopt subclass props
		this.adoptLazyResponse(dummyVar);
	}

	protected adoptLazyResponse(response: DebugProtocol.Variable): void {
	}

	getChildren(): Promise<IExpression[]> {
		if (!this.children) {
			this.children = this.doGetChildren();
		}

		return this.children;
	}

	private async doGetChildren(): Promise<IExpression[]> {
		if (!this.hasChildren) {
			return [];
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
				children.push(new Variable(this.session, this.threadId, this, this.reference, `[${start}..${start + count - 1}]`, '', '', undefined, count, undefined, { kind: 'virtual' }, undefined, undefined, true, start));
			}

			return children;
		}

		const variables = await this.fetchVariables(this.startOfVariables, this.indexedVariables, 'indexed');
		return children.concat(variables);
	}

	getId(): string {
		return this.id;
	}

	getSession(): IDebugSession | undefined {
		return this.session;
	}

	get value(): string {
		return this._value;
	}

	get hasChildren(): boolean {
		// only variables with reference > 0 have children.
		return !!this.reference && this.reference > 0 && !this.presentationHint?.lazy;
	}

	private async fetchVariables(start: number | undefined, count: number | undefined, filter: 'indexed' | 'named' | undefined): Promise<Variable[]> {
		try {
			const response = await this.session!.variables(this.reference || 0, this.threadId, filter, start, count);
			if (!response || !response.body || !response.body.variables) {
				return [];
			}

			const nameCount = new Map<string, number>();
			const vars = response.body.variables.filter(v => !!v).map((v: IDebugProtocolVariableWithContext) => {
				if (isString(v.value) && isString(v.name) && typeof v.variablesReference === 'number') {
					const count = nameCount.get(v.name) || 0;
					const idDuplicationIndex = count > 0 ? count.toString() : '';
					nameCount.set(v.name, count + 1);
					return new Variable(this.session, this.threadId, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.memoryReference, v.presentationHint, v.type, v.__vscodeVariableMenuContext, true, 0, idDuplicationIndex);
				}
				return new Variable(this.session, this.threadId, this, 0, '', undefined, nls.localize('invalidVariableAttributes', "Invalid variable attributes"), 0, 0, undefined, { kind: 'virtual' }, undefined, undefined, false);
			});

			if (this.session!.autoExpandLazyVariables) {
				await Promise.all(vars.map(v => v.presentationHint?.lazy && v.evaluateLazy()));
			}

			return vars;
		} catch (e) {
			return [new Variable(this.session, this.threadId, this, 0, '', undefined, e.message, 0, 0, undefined, { kind: 'virtual' }, undefined, undefined, false)];
		}
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

	async evaluateExpression(
		expression: string,
		session: IDebugSession | undefined,
		stackFrame: IStackFrame | undefined,
		context: string,
		keepLazyVars = false): Promise<boolean> {

		if (!session || (!stackFrame && context !== 'repl')) {
			this.value = context === 'repl' ? nls.localize('startDebugFirst', "Please start a debug session to evaluate expressions") : Expression.DEFAULT_VALUE;
			this.reference = 0;
			return false;
		}

		this.session = session;
		try {
			const response = await session.evaluate(expression, stackFrame ? stackFrame.frameId : undefined, context);

			if (response && response.body) {
				this.value = response.body.result || '';
				this.reference = response.body.variablesReference;
				this.namedVariables = response.body.namedVariables;
				this.indexedVariables = response.body.indexedVariables;
				this.memoryReference = response.body.memoryReference;
				this.type = response.body.type || this.type;
				this.presentationHint = response.body.presentationHint;

				if (!keepLazyVars && response.body.presentationHint?.lazy) {
					await this.evaluateLazy();
				}

				return true;
			}
			return false;
		} catch (e) {
			this.value = e.message || '';
			this.reference = 0;
			return false;
		}
	}
}

function handleSetResponse(expression: ExpressionContainer, response: DebugProtocol.SetVariableResponse | DebugProtocol.SetExpressionResponse | undefined): void {
	if (response && response.body) {
		expression.value = response.body.value || '';
		expression.type = response.body.type || expression.type;
		expression.reference = response.body.variablesReference;
		expression.namedVariables = response.body.namedVariables;
		expression.indexedVariables = response.body.indexedVariables;
		// todo @weinand: the set responses contain most properties, but not memory references. Should they?
	}
}

export class Expression extends ExpressionContainer implements IExpression {
	static readonly DEFAULT_VALUE = nls.localize('notAvailable', "not available");

	public available: boolean;

	constructor(public name: string, id = generateUuid()) {
		super(undefined, undefined, 0, id);
		this.available = false;
		// name is not set if the expression is just being added
		// in that case do not set default value to prevent flashing #14499
		if (name) {
			this.value = Expression.DEFAULT_VALUE;
		}
	}

	async evaluate(session: IDebugSession | undefined, stackFrame: IStackFrame | undefined, context: string, keepLazyVars?: boolean): Promise<void> {
		this.available = await this.evaluateExpression(this.name, session, stackFrame, context, keepLazyVars);
	}

	override toString(): string {
		return `${this.name}\n${this.value}`;
	}

	async setExpression(value: string, stackFrame: IStackFrame): Promise<void> {
		if (!this.session) {
			return;
		}

		const response = await this.session.setExpression(stackFrame.frameId, this.name, value);
		handleSetResponse(this, response);
	}
}

export class Variable extends ExpressionContainer implements IExpression {

	// Used to show the error message coming from the adapter when setting the value #7807
	public errorMessage: string | undefined;

	constructor(
		session: IDebugSession | undefined,
		threadId: number | undefined,
		public readonly parent: IExpressionContainer,
		reference: number | undefined,
		public readonly name: string,
		public evaluateName: string | undefined,
		value: string | undefined,
		namedVariables: number | undefined,
		indexedVariables: number | undefined,
		memoryReference: string | undefined,
		presentationHint: DebugProtocol.VariablePresentationHint | undefined,
		type: string | undefined = undefined,
		public readonly variableMenuContext: string | undefined = undefined,
		public readonly available = true,
		startOfVariables = 0,
		idDuplicationIndex = '',
	) {
		super(session, threadId, reference, `variable:${parent.getId()}:${name}:${idDuplicationIndex}`, namedVariables, indexedVariables, memoryReference, startOfVariables, presentationHint);
		this.value = value || '';
		this.type = type;
	}

	async setVariable(value: string, stackFrame: IStackFrame): Promise<any> {
		if (!this.session) {
			return;
		}

		try {
			// Send out a setExpression for debug extensions that do not support set variables https://github.com/microsoft/vscode/issues/124679#issuecomment-869844437
			if (this.session.capabilities.supportsSetExpression && !this.session.capabilities.supportsSetVariable && this.evaluateName) {
				return this.setExpression(value, stackFrame);
			}

			const response = await this.session.setVariable((<ExpressionContainer>this.parent).reference, this.name, value);
			handleSetResponse(this, response);
		} catch (err) {
			this.errorMessage = err.message;
		}
	}

	async setExpression(value: string, stackFrame: IStackFrame): Promise<void> {
		if (!this.session || !this.evaluateName) {
			return;
		}

		const response = await this.session.setExpression(stackFrame.frameId, this.evaluateName, value);
		handleSetResponse(this, response);
	}

	override toString(): string {
		return this.name ? `${this.name}: ${this.value}` : this.value;
	}

	protected override adoptLazyResponse(response: DebugProtocol.Variable): void {
		this.evaluateName = response.evaluateName;
	}

	toDebugProtocolObject(): DebugProtocol.Variable {
		return {
			name: this.name,
			variablesReference: this.reference || 0,
			memoryReference: this.memoryReference,
			value: this.value,
			evaluateName: this.evaluateName
		};
	}
}

export class Scope extends ExpressionContainer implements IScope {

	constructor(
		stackFrame: IStackFrame,
		id: number,
		public readonly name: string,
		reference: number,
		public expensive: boolean,
		namedVariables?: number,
		indexedVariables?: number,
		public readonly range?: IRange
	) {
		super(stackFrame.thread.session, stackFrame.thread.threadId, reference, `scope:${name}:${id}`, namedVariables, indexedVariables);
	}

	override toString(): string {
		return this.name;
	}

	toDebugProtocolObject(): DebugProtocol.Scope {
		return {
			name: this.name,
			variablesReference: this.reference || 0,
			expensive: this.expensive
		};
	}
}

export class ErrorScope extends Scope {

	constructor(
		stackFrame: IStackFrame,
		index: number,
		message: string,
	) {
		super(stackFrame, index, message, 0, false);
	}

	override toString(): string {
		return this.name;
	}
}

export class StackFrame implements IStackFrame {

	private scopes: Promise<Scope[]> | undefined;

	constructor(
		public readonly thread: Thread,
		public readonly frameId: number,
		public readonly source: Source,
		public readonly name: string,
		public readonly presentationHint: string | undefined,
		public readonly range: IRange,
		private readonly index: number,
		public readonly canRestart: boolean,
		public readonly instructionPointerReference?: string
	) { }

	getId(): string {
		return `stackframe:${this.thread.getId()}:${this.index}:${this.source.name}`;
	}

	getScopes(): Promise<IScope[]> {
		if (!this.scopes) {
			this.scopes = this.thread.session.scopes(this.frameId, this.thread.threadId).then(response => {
				if (!response || !response.body || !response.body.scopes) {
					return [];
				}

				const usedIds = new Set<number>();
				return response.body.scopes.map(rs => {
					// form the id based on the name and location so that it's the
					// same across multiple pauses to retain expansion state
					let id = 0;
					do {
						id = stringHash(`${rs.name}:${rs.line}:${rs.column}`, id);
					} while (usedIds.has(id));

					usedIds.add(id);
					return new Scope(this, id, rs.name, rs.variablesReference, rs.expensive, rs.namedVariables, rs.indexedVariables,
						rs.line && rs.column && rs.endLine && rs.endColumn ? new Range(rs.line, rs.column, rs.endLine, rs.endColumn) : undefined);

				});
			}, err => [new ErrorScope(this, 0, err.message)]);
		}

		return this.scopes;
	}

	async getMostSpecificScopes(range: IRange): Promise<IScope[]> {
		const scopes = await this.getScopes();
		const nonExpensiveScopes = scopes.filter(s => !s.expensive);
		const haveRangeInfo = nonExpensiveScopes.some(s => !!s.range);
		if (!haveRangeInfo) {
			return nonExpensiveScopes;
		}

		const scopesContainingRange = nonExpensiveScopes.filter(scope => scope.range && Range.containsRange(scope.range, range))
			.sort((first, second) => (first.range!.endLineNumber - first.range!.startLineNumber) - (second.range!.endLineNumber - second.range!.startLineNumber));
		return scopesContainingRange.length ? scopesContainingRange : nonExpensiveScopes;
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

	async openInEditor(editorService: IEditorService, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<IEditorPane | undefined> {
		const threadStopReason = this.thread.stoppedDetails?.reason;
		if (this.instructionPointerReference &&
			(threadStopReason === 'instruction breakpoint' ||
				(threadStopReason === 'step' && this.thread.lastSteppingGranularity === 'instruction'))) {
			return editorService.openEditor(DisassemblyViewInput.instance, { pinned: true });
		}

		if (this.source.available) {
			return this.source.openInEditor(editorService, this.range, preserveFocus, sideBySide, pinned);
		}
		return undefined;
	}

	equals(other: IStackFrame): boolean {
		return (this.name === other.name) && (other.thread === this.thread) && (this.frameId === other.frameId) && (other.source === this.source) && (Range.equalsRange(this.range, other.range));
	}
}

export class Thread implements IThread {
	private callStack: IStackFrame[];
	private staleCallStack: IStackFrame[];
	private callStackCancellationTokens: CancellationTokenSource[] = [];
	public stoppedDetails: IRawStoppedDetails | undefined;
	public stopped: boolean;
	public reachedEndOfCallStack = false;
	public lastSteppingGranularity: DebugProtocol.SteppingGranularity | undefined;

	constructor(public readonly session: IDebugSession, public name: string, public readonly threadId: number) {
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
		this.callStackCancellationTokens.forEach(c => c.dispose(true));
		this.callStackCancellationTokens = [];
	}

	getCallStack(): IStackFrame[] {
		return this.callStack;
	}

	getStaleCallStack(): ReadonlyArray<IStackFrame> {
		return this.staleCallStack;
	}

	getTopStackFrame(): IStackFrame | undefined {
		const callStack = this.getCallStack();
		// Allow stack frame without source and with instructionReferencePointer as top stack frame when using disassembly view.
		const firstAvailableStackFrame = callStack.find(sf => !!(sf &&
			((this.stoppedDetails?.reason === 'instruction breakpoint' || (this.stoppedDetails?.reason === 'step' && this.lastSteppingGranularity === 'instruction')) && sf.instructionPointerReference) ||
			(sf.source && sf.source.available && sf.source.presentationHint !== 'deemphasize')));
		return firstAvailableStackFrame;
	}

	get stateLabel(): string {
		if (this.stoppedDetails) {
			return this.stoppedDetails.description ||
				(this.stoppedDetails.reason ? nls.localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", this.stoppedDetails.reason) : nls.localize('paused', "Paused"));
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
	async fetchCallStack(levels = 20): Promise<void> {
		if (this.stopped) {
			const start = this.callStack.length;
			const callStack = await this.getCallStackImpl(start, levels);
			this.reachedEndOfCallStack = callStack.length < levels;
			if (start < this.callStack.length) {
				// Set the stack frames for exact position we requested. To make sure no concurrent requests create duplicate stack frames #30660
				this.callStack.splice(start, this.callStack.length - start);
			}
			this.callStack = this.callStack.concat(callStack || []);
			if (typeof this.stoppedDetails?.totalFrames === 'number' && this.stoppedDetails.totalFrames === this.callStack.length) {
				this.reachedEndOfCallStack = true;
			}
		}
	}

	private async getCallStackImpl(startFrame: number, levels: number): Promise<IStackFrame[]> {
		try {
			const tokenSource = new CancellationTokenSource();
			this.callStackCancellationTokens.push(tokenSource);
			const response = await this.session.stackTrace(this.threadId, startFrame, levels, tokenSource.token);
			if (!response || !response.body || tokenSource.token.isCancellationRequested) {
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
				), startFrame + index, typeof rsf.canRestart === 'boolean' ? rsf.canRestart : true, rsf.instructionPointerReference);
			});
		} catch (err) {
			if (this.stoppedDetails) {
				this.stoppedDetails.framesErrorMessage = err.message;
			}

			return [];
		}
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

	next(granularity?: DebugProtocol.SteppingGranularity): Promise<any> {
		return this.session.next(this.threadId, granularity);
	}

	stepIn(granularity?: DebugProtocol.SteppingGranularity): Promise<any> {
		return this.session.stepIn(this.threadId, undefined, granularity);
	}

	stepOut(granularity?: DebugProtocol.SteppingGranularity): Promise<any> {
		return this.session.stepOut(this.threadId, granularity);
	}

	stepBack(granularity?: DebugProtocol.SteppingGranularity): Promise<any> {
		return this.session.stepBack(this.threadId, granularity);
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

/**
 * Gets a URI to a memory in the given session ID.
 */
export const getUriForDebugMemory = (
	sessionId: string,
	memoryReference: string,
	range?: { fromOffset: number; toOffset: number },
	displayName = 'memory'
) => {
	return URI.from({
		scheme: DEBUG_MEMORY_SCHEME,
		authority: sessionId,
		path: '/' + encodeURIComponent(memoryReference) + `/${encodeURIComponent(displayName)}.bin`,
		query: range ? `?range=${range.fromOffset}:${range.toOffset}` : undefined,
	});
};

export class MemoryRegion extends Disposable implements IMemoryRegion {
	private readonly invalidateEmitter = this._register(new Emitter<IMemoryInvalidationEvent>());

	/** @inheritdoc */
	public readonly onDidInvalidate = this.invalidateEmitter.event;

	/** @inheritdoc */
	public readonly writable = !!this.session.capabilities.supportsWriteMemoryRequest;

	constructor(private readonly memoryReference: string, private readonly session: IDebugSession) {
		super();
		this._register(session.onDidInvalidateMemory(e => {
			if (e.body.memoryReference === memoryReference) {
				this.invalidate(e.body.offset, e.body.count - e.body.offset);
			}
		}));
	}

	public async read(fromOffset: number, toOffset: number): Promise<MemoryRange[]> {
		const length = toOffset - fromOffset;
		const offset = fromOffset;
		const result = await this.session.readMemory(this.memoryReference, offset, length);

		if (result === undefined || !result.body?.data) {
			return [{ type: MemoryRangeType.Unreadable, offset, length }];
		}

		let data: VSBuffer;
		try {
			data = decodeBase64(result.body.data);
		} catch {
			return [{ type: MemoryRangeType.Error, offset, length, error: 'Invalid base64 data from debug adapter' }];
		}

		const unreadable = result.body.unreadableBytes || 0;
		const dataLength = length - unreadable;
		if (data.byteLength < dataLength) {
			const pad = VSBuffer.alloc(dataLength - data.byteLength);
			pad.buffer.fill(0);
			data = VSBuffer.concat([data, pad], dataLength);
		} else if (data.byteLength > dataLength) {
			data = data.slice(0, dataLength);
		}

		if (!unreadable) {
			return [{ type: MemoryRangeType.Valid, offset, length, data }];
		}

		return [
			{ type: MemoryRangeType.Valid, offset, length: dataLength, data },
			{ type: MemoryRangeType.Unreadable, offset: offset + dataLength, length: unreadable },
		];
	}

	public async write(offset: number, data: VSBuffer): Promise<number> {
		const result = await this.session.writeMemory(this.memoryReference, offset, encodeBase64(data), true);
		const written = result?.body?.bytesWritten ?? data.byteLength;
		this.invalidate(offset, offset + written);
		return written;
	}

	public override dispose() {
		super.dispose();
	}

	private invalidate(fromOffset: number, toOffset: number) {
		this.invalidateEmitter.fire({ fromOffset, toOffset });
	}
}

export class Enablement implements IEnablement {
	constructor(
		public enabled: boolean,
		private readonly id: string
	) { }

	getId(): string {
		return this.id;
	}
}

interface IBreakpointSessionData extends DebugProtocol.Breakpoint {
	supportsConditionalBreakpoints: boolean;
	supportsHitConditionalBreakpoints: boolean;
	supportsLogPoints: boolean;
	supportsFunctionBreakpoints: boolean;
	supportsDataBreakpoints: boolean;
	supportsInstructionBreakpoints: boolean;
	sessionId: string;
}

function toBreakpointSessionData(data: DebugProtocol.Breakpoint, capabilities: DebugProtocol.Capabilities): IBreakpointSessionData {
	return mixin({
		supportsConditionalBreakpoints: !!capabilities.supportsConditionalBreakpoints,
		supportsHitConditionalBreakpoints: !!capabilities.supportsHitConditionalBreakpoints,
		supportsLogPoints: !!capabilities.supportsLogPoints,
		supportsFunctionBreakpoints: !!capabilities.supportsFunctionBreakpoints,
		supportsDataBreakpoints: !!capabilities.supportsDataBreakpoints,
		supportsInstructionBreakpoints: !!capabilities.supportsInstructionBreakpoints
	}, data);
}

export abstract class BaseBreakpoint extends Enablement implements IBaseBreakpoint {

	private sessionData = new Map<string, IBreakpointSessionData>();
	protected data: IBreakpointSessionData | undefined;

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

	setSessionData(sessionId: string, data: IBreakpointSessionData | undefined): void {
		if (!data) {
			this.sessionData.delete(sessionId);
		} else {
			data.sessionId = sessionId;
			this.sessionData.set(sessionId, data);
		}

		const allData = Array.from(this.sessionData.values());
		const verifiedData = distinct(allData.filter(d => d.verified), d => `${d.line}:${d.column}`);
		if (verifiedData.length) {
			// In case multiple session verified the breakpoint and they provide different data show the intial data that the user set (corner case)
			this.data = verifiedData.length === 1 ? verifiedData[0] : undefined;
		} else {
			// No session verified the breakpoint
			this.data = allData.length ? allData[0] : undefined;
		}
	}

	get message(): string | undefined {
		if (!this.data) {
			return undefined;
		}

		return this.data.message;
	}

	get verified(): boolean {
		return this.data ? this.data.verified : true;
	}

	get sessionsThatVerified() {
		const sessionIds: string[] = [];
		for (const [sessionId, data] of this.sessionData) {
			if (data.verified) {
				sessionIds.push(sessionId);
			}
		}

		return sessionIds;
	}

	abstract get supported(): boolean;

	getIdFromAdapter(sessionId: string): number | undefined {
		const data = this.sessionData.get(sessionId);
		return data ? data.id : undefined;
	}

	getDebugProtocolBreakpoint(sessionId: string): DebugProtocol.Breakpoint | undefined {
		const data = this.sessionData.get(sessionId);
		if (data) {
			const bp: DebugProtocol.Breakpoint = {
				id: data.id,
				verified: data.verified,
				message: data.message,
				source: data.source,
				line: data.line,
				column: data.column,
				endLine: data.endLine,
				endColumn: data.endColumn,
				instructionReference: data.instructionReference,
				offset: data.offset
			};
			return bp;
		}
		return undefined;
	}

	toJSON(): any {
		const result = Object.create(null);
		result.id = this.getId();
		result.enabled = this.enabled;
		result.condition = this.condition;
		result.hitCondition = this.hitCondition;
		result.logMessage = this.logMessage;

		return result;
	}
}

export class Breakpoint extends BaseBreakpoint implements IBreakpoint {

	constructor(
		private readonly _uri: uri,
		private _lineNumber: number,
		private _column: number | undefined,
		enabled: boolean,
		condition: string | undefined,
		hitCondition: string | undefined,
		logMessage: string | undefined,
		private _adapterData: any,
		private readonly textFileService: ITextFileService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly logService: ILogService,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	get originalUri() {
		return this._uri;
	}

	get lineNumber(): number {
		return this.verified && this.data && typeof this.data.line === 'number' ? this.data.line : this._lineNumber;
	}

	override get verified(): boolean {
		if (this.data) {
			return this.data.verified && !this.textFileService.isDirty(this._uri);
		}

		return true;
	}

	get uri(): uri {
		return this.verified && this.data && this.data.source ? getUriFromSource(this.data.source, this.data.source.path, this.data.sessionId, this.uriIdentityService, this.logService) : this._uri;
	}

	get column(): number | undefined {
		return this.verified && this.data && typeof this.data.column === 'number' ? this.data.column : this._column;
	}

	override get message(): string | undefined {
		if (this.textFileService.isDirty(this.uri)) {
			return nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session.");
		}

		return super.message;
	}

	get adapterData(): any {
		return this.data && this.data.source && this.data.source.adapterData ? this.data.source.adapterData : this._adapterData;
	}

	get endLineNumber(): number | undefined {
		return this.verified && this.data ? this.data.endLine : undefined;
	}

	get endColumn(): number | undefined {
		return this.verified && this.data ? this.data.endColumn : undefined;
	}

	get sessionAgnosticData(): { lineNumber: number; column: number | undefined } {
		return {
			lineNumber: this._lineNumber,
			column: this._column
		};
	}

	get supported(): boolean {
		if (!this.data) {
			return true;
		}
		if (this.logMessage && !this.data.supportsLogPoints) {
			return false;
		}
		if (this.condition && !this.data.supportsConditionalBreakpoints) {
			return false;
		}
		if (this.hitCondition && !this.data.supportsHitConditionalBreakpoints) {
			return false;
		}

		return true;
	}

	override setSessionData(sessionId: string, data: IBreakpointSessionData | undefined): void {
		super.setSessionData(sessionId, data);
		if (!this._adapterData) {
			this._adapterData = this.adapterData;
		}
	}

	override toJSON(): any {
		const result = super.toJSON();
		result.uri = this._uri;
		result.lineNumber = this._lineNumber;
		result.column = this._column;
		result.adapterData = this.adapterData;

		return result;
	}

	override toString(): string {
		return `${resources.basenameOrAuthority(this.uri)} ${this.lineNumber}`;
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

	override toJSON(): any {
		const result = super.toJSON();
		result.name = this.name;

		return result;
	}

	get supported(): boolean {
		if (!this.data) {
			return true;
		}

		return this.data.supportsFunctionBreakpoints;
	}

	override toString(): string {
		return this.name;
	}
}

export class DataBreakpoint extends BaseBreakpoint implements IDataBreakpoint {

	constructor(
		public readonly description: string,
		public readonly dataId: string,
		public readonly canPersist: boolean,
		enabled: boolean,
		hitCondition: string | undefined,
		condition: string | undefined,
		logMessage: string | undefined,
		public readonly accessTypes: DebugProtocol.DataBreakpointAccessType[] | undefined,
		public readonly accessType: DebugProtocol.DataBreakpointAccessType,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	override toJSON(): any {
		const result = super.toJSON();
		result.description = this.description;
		result.dataId = this.dataId;
		result.accessTypes = this.accessTypes;
		result.accessType = this.accessType;
		return result;
	}

	get supported(): boolean {
		if (!this.data) {
			return true;
		}

		return this.data.supportsDataBreakpoints;
	}

	override toString(): string {
		return this.description;
	}
}

export class ExceptionBreakpoint extends BaseBreakpoint implements IExceptionBreakpoint {

	private supportedSessions: Set<string> = new Set();

	constructor(
		public readonly filter: string,
		public readonly label: string,
		enabled: boolean,
		public readonly supportsCondition: boolean,
		condition: string | undefined,
		public readonly description: string | undefined,
		public readonly conditionDescription: string | undefined,
		private fallback: boolean = false
	) {
		super(enabled, undefined, condition, undefined, generateUuid());
	}

	override toJSON(): any {
		const result = Object.create(null);
		result.filter = this.filter;
		result.label = this.label;
		result.enabled = this.enabled;
		result.supportsCondition = this.supportsCondition;
		result.conditionDescription = this.conditionDescription;
		result.condition = this.condition;
		result.fallback = this.fallback;
		result.description = this.description;

		return result;
	}

	setSupportedSession(sessionId: string, supported: boolean): void {
		if (supported) {
			this.supportedSessions.add(sessionId);
		}
		else {
			this.supportedSessions.delete(sessionId);
		}
	}

	/**
	 * Used to specify which breakpoints to show when no session is specified.
	 * Useful when no session is active and we want to show the exception breakpoints from the last session.
	 */
	setFallback(isFallback: boolean) {
		this.fallback = isFallback;
	}

	get supported(): boolean {
		return true;
	}

	/**
	 * Checks if the breakpoint is applicable for the specified session.
	 * If sessionId is undefined, returns true if this breakpoint is a fallback breakpoint.
	 */
	isSupportedSession(sessionId?: string): boolean {
		return sessionId ? this.supportedSessions.has(sessionId) : this.fallback;
	}

	matches(filter: DebugProtocol.ExceptionBreakpointsFilter) {
		return this.filter === filter.filter && this.label === filter.label && this.supportsCondition === !!filter.supportsCondition && this.conditionDescription === filter.conditionDescription && this.description === filter.description;
	}

	override toString(): string {
		return this.label;
	}
}

export class InstructionBreakpoint extends BaseBreakpoint implements IInstructionBreakpoint {

	constructor(
		public readonly instructionReference: string,
		public readonly offset: number,
		public readonly canPersist: boolean,
		enabled: boolean,
		hitCondition: string | undefined,
		condition: string | undefined,
		logMessage: string | undefined,
		id = generateUuid()
	) {
		super(enabled, hitCondition, condition, logMessage, id);
	}

	override toJSON(): any {
		const result = super.toJSON();
		result.instructionReference = this.instructionReference;
		result.offset = this.offset;
		return result;
	}

	get supported(): boolean {
		if (!this.data) {
			return true;
		}

		return this.data.supportsInstructionBreakpoints;
	}

	override toString(): string {
		return this.instructionReference;
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
	private schedulers = new Map<string, { scheduler: RunOnceScheduler; completeDeferred: DeferredPromise<void> }>();
	private breakpointsActivated = true;
	private readonly _onDidChangeBreakpoints = new Emitter<IBreakpointsChangeEvent | undefined>();
	private readonly _onDidChangeCallStack = new Emitter<void>();
	private readonly _onDidChangeWatchExpressions = new Emitter<IExpression | undefined>();
	private breakpoints: Breakpoint[];
	private functionBreakpoints: FunctionBreakpoint[];
	private exceptionBreakpoints: ExceptionBreakpoint[];
	private dataBreakpoints: DataBreakpoint[];
	private watchExpressions: Expression[];
	private instructionBreakpoints: InstructionBreakpoint[];

	constructor(
		debugStorage: DebugStorage,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		this.breakpoints = debugStorage.loadBreakpoints();
		this.functionBreakpoints = debugStorage.loadFunctionBreakpoints();
		this.exceptionBreakpoints = debugStorage.loadExceptionBreakpoints();
		this.dataBreakpoints = debugStorage.loadDataBreakpoints();
		this.watchExpressions = debugStorage.loadWatchExpressions();
		this.instructionBreakpoints = [];
		this.sessions = [];
	}

	getId(): string {
		return 'root';
	}

	getSession(sessionId: string | undefined, includeInactive = false): IDebugSession | undefined {
		if (sessionId) {
			return this.getSessions(includeInactive).find(s => s.getId() === sessionId);
		}
		return undefined;
	}

	getSessions(includeInactive = false): IDebugSession[] {
		// By default do not return inactive sessions.
		// However we are still holding onto inactive sessions due to repl and debug service session revival (eh scenario)
		return this.sessions.filter(s => includeInactive || s.state !== State.Inactive);
	}

	addSession(session: IDebugSession): void {
		this.sessions = this.sessions.filter(s => {
			if (s.getId() === session.getId()) {
				// Make sure to de-dupe if a session is re-initialized. In case of EH debugging we are adding a session again after an attach.
				return false;
			}
			if (s.state === State.Inactive && s.configuration.name === session.configuration.name) {
				// Make sure to remove all inactive sessions that are using the same configuration as the new session
				return false;
			}

			return true;
		});

		let i = 1;
		while (this.sessions.some(s => s.getLabel() === session.getLabel())) {
			session.setName(`${session.configuration.name} ${++i}`);
		}

		let index = -1;
		if (session.parentSession) {
			// Make sure that child sessions are placed after the parent session
			index = findLastIndex(this.sessions, s => s.parentSession === session.parentSession || s === session.parentSession);
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
		const session = this.sessions.find(p => p.getId() === data.sessionId);
		if (session) {
			session.rawUpdate(data);
			this._onDidChangeCallStack.fire(undefined);
		}
	}

	clearThreads(id: string, removeThreads: boolean, reference: number | undefined = undefined): void {
		const session = this.sessions.find(p => p.getId() === id);
		this.schedulers.forEach(entry => {
			entry.scheduler.dispose();
			entry.completeDeferred.complete();
		});
		this.schedulers.clear();

		if (session) {
			session.clearThreads(removeThreads, reference);
			this._onDidChangeCallStack.fire(undefined);
		}
	}

	/**
	 * Update the call stack and notify the call stack view that changes have occurred.
	 */
	async fetchCallstack(thread: IThread, levels?: number): Promise<void> {

		if ((<Thread>thread).reachedEndOfCallStack) {
			return;
		}

		const totalFrames = thread.stoppedDetails?.totalFrames;
		const remainingFrames = (typeof totalFrames === 'number') ? (totalFrames - thread.getCallStack().length) : undefined;

		if (!levels || (remainingFrames && levels > remainingFrames)) {
			levels = remainingFrames;
		}

		if (levels && levels > 0) {
			await (<Thread>thread).fetchCallStack(levels);
			this._onDidChangeCallStack.fire();
		}

		return;
	}

	refreshTopOfCallstack(thread: Thread): { topCallStack: Promise<void>; wholeCallStack: Promise<void> } {
		if (thread.session.capabilities.supportsDelayedStackTraceLoading) {
			// For improved performance load the first stack frame and then load the rest async.
			let topCallStack = Promise.resolve();
			const wholeCallStack = new Promise<void>((c, e) => {
				topCallStack = thread.fetchCallStack(1).then(() => {
					if (!this.schedulers.has(thread.getId())) {
						const deferred = new DeferredPromise<void>();
						this.schedulers.set(thread.getId(), {
							completeDeferred: deferred,
							scheduler: new RunOnceScheduler(() => {
								thread.fetchCallStack(19).then(() => {
									const stale = thread.getStaleCallStack();
									const current = thread.getCallStack();
									let bottomOfCallStackChanged = stale.length !== current.length;
									for (let i = 1; i < stale.length && !bottomOfCallStackChanged; i++) {
										bottomOfCallStackChanged = !stale[i].equals(current[i]);
									}

									if (bottomOfCallStackChanged) {
										this._onDidChangeCallStack.fire();
									}
								}).finally(() => {
									deferred.complete();
									this.schedulers.delete(thread.getId());
								});
							}, 420)
						});
					}

					const entry = this.schedulers.get(thread.getId())!;
					entry.scheduler.schedule();
					entry.completeDeferred.p.then(c, e);
					this._onDidChangeCallStack.fire();
				});
			});

			return { topCallStack, wholeCallStack };
		}

		const wholeCallStack = thread.fetchCallStack();
		return { wholeCallStack, topCallStack: wholeCallStack };
	}

	getBreakpoints(filter?: { uri?: uri; originalUri?: uri; lineNumber?: number; column?: number; enabledOnly?: boolean }): IBreakpoint[] {
		if (filter) {
			const uriStr = filter.uri?.toString();
			const originalUriStr = filter.originalUri?.toString();
			return this.breakpoints.filter(bp => {
				if (uriStr && bp.uri.toString() !== uriStr) {
					return false;
				}
				if (originalUriStr && bp.originalUri.toString() !== originalUriStr) {
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
		return this.dataBreakpoints;
	}

	getExceptionBreakpoints(): IExceptionBreakpoint[] {
		return this.exceptionBreakpoints;
	}

	getExceptionBreakpointsForSession(sessionId?: string): IExceptionBreakpoint[] {
		return this.exceptionBreakpoints.filter(ebp => ebp.isSupportedSession(sessionId));
	}

	getInstructionBreakpoints(): IInstructionBreakpoint[] {
		return this.instructionBreakpoints;
	}

	setExceptionBreakpointsForSession(sessionId: string, data: DebugProtocol.ExceptionBreakpointsFilter[]): void {
		if (data) {
			let didChangeBreakpoints = false;
			data.forEach(d => {
				let ebp = this.exceptionBreakpoints.filter((exbp) => exbp.matches(d)).pop();

				if (!ebp) {
					didChangeBreakpoints = true;
					ebp = new ExceptionBreakpoint(d.filter, d.label, !!d.default, !!d.supportsCondition, undefined /* condition */, d.description, d.conditionDescription);
					this.exceptionBreakpoints.push(ebp);
				}

				ebp.setSupportedSession(sessionId, true);
			});

			if (didChangeBreakpoints) {
				this._onDidChangeBreakpoints.fire(undefined);
			}
		}
	}

	removeExceptionBreakpointsForSession(sessionId: string): void {
		this.exceptionBreakpoints.forEach(ebp => ebp.setSupportedSession(sessionId, false));
	}

	// Set last focused session as fallback session.
	// This is done to keep track of the exception breakpoints to show when no session is active.
	setExceptionBreakpointFallbackSession(sessionId: string): void {
		this.exceptionBreakpoints.forEach(ebp => ebp.setFallback(ebp.isSupportedSession(sessionId)));
	}

	setExceptionBreakpointCondition(exceptionBreakpoint: IExceptionBreakpoint, condition: string | undefined): void {
		(exceptionBreakpoint as ExceptionBreakpoint).condition = condition;
		this._onDidChangeBreakpoints.fire(undefined);
	}

	areBreakpointsActivated(): boolean {
		return this.breakpointsActivated;
	}

	setBreakpointsActivated(activated: boolean): void {
		this.breakpointsActivated = activated;
		this._onDidChangeBreakpoints.fire(undefined);
	}

	addBreakpoints(uri: uri, rawData: IBreakpointData[], fireEvent = true): IBreakpoint[] {
		const newBreakpoints = rawData.map(rawBp => new Breakpoint(uri, rawBp.lineNumber, rawBp.column, rawBp.enabled === false ? false : true, rawBp.condition, rawBp.hitCondition, rawBp.logMessage, undefined, this.textFileService, this.uriIdentityService, this.logService, rawBp.id));
		this.breakpoints = this.breakpoints.concat(newBreakpoints);
		this.breakpointsActivated = true;
		this.sortAndDeDup();

		if (fireEvent) {
			this._onDidChangeBreakpoints.fire({ added: newBreakpoints, sessionOnly: false });
		}

		return newBreakpoints;
	}

	removeBreakpoints(toRemove: IBreakpoint[]): void {
		this.breakpoints = this.breakpoints.filter(bp => !toRemove.some(toRemove => toRemove.getId() === bp.getId()));
		this._onDidChangeBreakpoints.fire({ removed: toRemove, sessionOnly: false });
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
		this._onDidChangeBreakpoints.fire({ changed: updated, sessionOnly: false });
	}

	setBreakpointSessionData(sessionId: string, capabilites: DebugProtocol.Capabilities, data: Map<string, DebugProtocol.Breakpoint> | undefined): void {
		this.breakpoints.forEach(bp => {
			if (!data) {
				bp.setSessionData(sessionId, undefined);
			} else {
				const bpData = data.get(bp.getId());
				if (bpData) {
					bp.setSessionData(sessionId, toBreakpointSessionData(bpData, capabilites));
				}
			}
		});
		this.functionBreakpoints.forEach(fbp => {
			if (!data) {
				fbp.setSessionData(sessionId, undefined);
			} else {
				const fbpData = data.get(fbp.getId());
				if (fbpData) {
					fbp.setSessionData(sessionId, toBreakpointSessionData(fbpData, capabilites));
				}
			}
		});
		this.dataBreakpoints.forEach(dbp => {
			if (!data) {
				dbp.setSessionData(sessionId, undefined);
			} else {
				const dbpData = data.get(dbp.getId());
				if (dbpData) {
					dbp.setSessionData(sessionId, toBreakpointSessionData(dbpData, capabilites));
				}
			}
		});
		this.exceptionBreakpoints.forEach(ebp => {
			if (!data) {
				ebp.setSessionData(sessionId, undefined);
			} else {
				const ebpData = data.get(ebp.getId());
				if (ebpData) {
					ebp.setSessionData(sessionId, toBreakpointSessionData(ebpData, capabilites));
				}
			}
		});
		this.instructionBreakpoints.forEach(ibp => {
			if (!data) {
				ibp.setSessionData(sessionId, undefined);
			} else {
				const ibpData = data.get(ibp.getId());
				if (ibpData) {
					ibp.setSessionData(sessionId, toBreakpointSessionData(ibpData, capabilites));
				}
			}
		});

		this._onDidChangeBreakpoints.fire({
			sessionOnly: true
		});
	}

	getDebugProtocolBreakpoint(breakpointId: string, sessionId: string): DebugProtocol.Breakpoint | undefined {
		const bp = this.breakpoints.find(bp => bp.getId() === breakpointId);
		if (bp) {
			return bp.getDebugProtocolBreakpoint(sessionId);
		}
		return undefined;
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
				return 1;
			}

			return first.lineNumber - second.lineNumber;
		});
		this.breakpoints = distinct(this.breakpoints, bp => `${bp.uri.toString()}:${bp.lineNumber}:${bp.column}`);
	}

	setEnablement(element: IEnablement, enable: boolean): void {
		if (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof ExceptionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint) {
			const changed: Array<IBreakpoint | IFunctionBreakpoint | IDataBreakpoint | IInstructionBreakpoint> = [];
			if (element.enabled !== enable && (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint)) {
				changed.push(element);
			}

			element.enabled = enable;
			if (enable) {
				this.breakpointsActivated = true;
			}

			this._onDidChangeBreakpoints.fire({ changed: changed, sessionOnly: false });
		}
	}

	enableOrDisableAllBreakpoints(enable: boolean): void {
		const changed: Array<IBreakpoint | IFunctionBreakpoint | IDataBreakpoint | IInstructionBreakpoint> = [];

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
		this.dataBreakpoints.forEach(dbp => {
			if (dbp.enabled !== enable) {
				changed.push(dbp);
			}
			dbp.enabled = enable;
		});
		this.instructionBreakpoints.forEach(ibp => {
			if (ibp.enabled !== enable) {
				changed.push(ibp);
			}
			ibp.enabled = enable;
		});

		if (enable) {
			this.breakpointsActivated = true;
		}

		this._onDidChangeBreakpoints.fire({ changed: changed, sessionOnly: false });
	}

	addFunctionBreakpoint(functionName: string, id?: string): IFunctionBreakpoint {
		const newFunctionBreakpoint = new FunctionBreakpoint(functionName, true, undefined, undefined, undefined, id);
		this.functionBreakpoints.push(newFunctionBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newFunctionBreakpoint], sessionOnly: false });

		return newFunctionBreakpoint;
	}

	updateFunctionBreakpoint(id: string, update: { name?: string; hitCondition?: string; condition?: string }): void {
		const functionBreakpoint = this.functionBreakpoints.find(fbp => fbp.getId() === id);
		if (functionBreakpoint) {
			if (typeof update.name === 'string') {
				functionBreakpoint.name = update.name;
			}
			if (typeof update.condition === 'string') {
				functionBreakpoint.condition = update.condition;
			}
			if (typeof update.hitCondition === 'string') {
				functionBreakpoint.hitCondition = update.hitCondition;
			}
			this._onDidChangeBreakpoints.fire({ changed: [functionBreakpoint], sessionOnly: false });
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
		this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
	}

	addDataBreakpoint(label: string, dataId: string, canPersist: boolean, accessTypes: DebugProtocol.DataBreakpointAccessType[] | undefined, accessType: DebugProtocol.DataBreakpointAccessType): void {
		const newDataBreakpoint = new DataBreakpoint(label, dataId, canPersist, true, undefined, undefined, undefined, accessTypes, accessType);
		this.dataBreakpoints.push(newDataBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newDataBreakpoint], sessionOnly: false });
	}

	removeDataBreakpoints(id?: string): void {
		let removed: DataBreakpoint[];
		if (id) {
			removed = this.dataBreakpoints.filter(fbp => fbp.getId() === id);
			this.dataBreakpoints = this.dataBreakpoints.filter(fbp => fbp.getId() !== id);
		} else {
			removed = this.dataBreakpoints;
			this.dataBreakpoints = [];
		}
		this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
	}

	addInstructionBreakpoint(address: string, offset: number, condition?: string, hitCondition?: string): void {
		const newInstructionBreakpoint = new InstructionBreakpoint(address, offset, false, true, hitCondition, condition, undefined);
		this.instructionBreakpoints.push(newInstructionBreakpoint);
		this._onDidChangeBreakpoints.fire({ added: [newInstructionBreakpoint], sessionOnly: true });
	}

	removeInstructionBreakpoints(address?: string): void {
		let removed: InstructionBreakpoint[];
		if (address) {
			removed = this.instructionBreakpoints.filter(fbp => fbp.instructionReference === address);
			this.instructionBreakpoints = this.instructionBreakpoints.filter(fbp => fbp.instructionReference !== address);
		} else {
			removed = this.instructionBreakpoints;
			this.instructionBreakpoints = [];
		}
		this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
	}

	getWatchExpressions(): Expression[] {
		return this.watchExpressions;
	}

	addWatchExpression(name?: string): IExpression {
		const we = new Expression(name || '');
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
		const we = this.watchExpressions.find(we => we.getId() === id);
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
}
