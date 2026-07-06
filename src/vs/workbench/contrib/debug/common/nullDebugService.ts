/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAdapterManager, IBreakpoint, IConfig, IConfigurationManager, IDebugModel, IDebugService, IDebugSession, IDebugSessionOptions, IEnablement, IExceptionBreakpoint, IExpression, IExpressionContainer, ILaunch, IStackFrame, IThread, IViewModel, State } from './debug.js';
import type { IDataBreakpointOptions, IFunctionBreakpointOptions, IInstructionBreakpointOptions } from './debugModel.js';
import { DebugVisualizer, IDebugVisualizerService } from './debugVisualizers.js';

const nullViewModel: IViewModel = {
	getId(): string { return 'root'; },
	focusedSession: undefined,
	focusedThread: undefined,
	focusedStackFrame: undefined,
	setVisualizedExpression(): void { },
	getVisualizedExpression(): IExpression | string | undefined { return undefined; },
	getSelectedExpression(): undefined { return undefined; },
	setSelectedExpression(): void { },
	updateViews(): void { },
	isMultiSessionView(): boolean { return false; },
	onDidFocusSession: Event.None,
	onDidFocusThread: Event.None,
	onDidFocusStackFrame: Event.None,
	onDidSelectExpression: Event.None,
	onDidEvaluateLazyExpression: Event.None,
	onDidChangeVisualization: Event.None,
	onWillUpdateViews: Event.None,
	evaluateLazyExpression(_expression: IExpressionContainer): void { },
};

const nullDebugModel: IDebugModel = {
	getId(): string { return 'root'; },
	getSession(): undefined { return undefined; },
	getSessions(): IDebugSession[] { return []; },
	getBreakpoints(): readonly IBreakpoint[] { return []; },
	areBreakpointsActivated(): boolean { return false; },
	getFunctionBreakpoints() { return []; },
	getDataBreakpoints() { return []; },
	getExceptionBreakpoints() { return []; },
	getExceptionBreakpointsForSession() { return []; },
	getInstructionBreakpoints() { return []; },
	getWatchExpressions() { return []; },
	registerBreakpointModes(): void { },
	getBreakpointModes() { return []; },
	onDidChangeBreakpoints: Event.None,
	onDidChangeCallStack: Event.None,
	onDidChangeWatchExpressions: Event.None,
	onDidChangeWatchExpressionValue: Event.None,
	async fetchCallstack(): Promise<void> { },
};

const nullConfigurationManager: IConfigurationManager = {
	selectedConfiguration: {
		launch: undefined,
		getConfig: () => Promise.resolve(undefined),
		name: undefined,
		type: undefined,
	},
	async selectConfiguration(): Promise<void> { },
	getLaunches() { return []; },
	getLaunch() { return undefined; },
	getAllConfigurations() { return []; },
	removeRecentDynamicConfigurations(): void { },
	getRecentDynamicConfigurations() { return []; },
	onDidSelectConfiguration: Event.None,
	onDidChangeConfigurationProviders: Event.None,
	hasDebugConfigurationProvider(): boolean { return false; },
	async getDynamicProviders() { return []; },
	async getDynamicConfigurationsByType() { return []; },
	registerDebugConfigurationProvider() { return Disposable.None; },
	unregisterDebugConfigurationProvider(): void { },
	async resolveConfigurationByProviders() { return undefined; },
};

const nullAdapterManager: IAdapterManager = {
	onDidRegisterDebugger: Event.None,
	hasEnabledDebuggers(): boolean { return false; },
	async getDebugAdapterDescriptor() { return undefined; },
	getDebuggerLabel() { return undefined; },
	someDebuggerInterestedInLanguage(): boolean { return false; },
	getDebugger() { return undefined; },
	async activateDebuggers(): Promise<void> { },
	registerDebugAdapterFactory() { return Disposable.None; },
	createDebugAdapter() { return undefined; },
	registerDebugAdapterDescriptorFactory() { return Disposable.None; },
	unregisterDebugAdapterDescriptorFactory(): void { },
	async substituteVariables(_debugType: string, _folder: undefined, config: IConfig) { return config; },
	async runInTerminal() { return undefined; },
	getEnabledDebugger() { return undefined; },
	async guessDebugger() { return undefined; },
	get onDidDebuggersExtPointRead() { return Event.None; },
};

export class NullDebugService implements IDebugService {

	declare readonly _serviceBrand: undefined;

	readonly state = State.Inactive;
	readonly initializingOptions = undefined;

	readonly onDidChangeState = Event.None;
	readonly onWillNewSession = Event.None;
	readonly onDidNewSession = Event.None;
	readonly onDidEndSession = Event.None;

	getConfigurationManager(): IConfigurationManager { return nullConfigurationManager; }
	getAdapterManager(): IAdapterManager { return nullAdapterManager; }
	getModel(): IDebugModel { return nullDebugModel; }
	getViewModel(): IViewModel { return nullViewModel; }

	async focusStackFrame(_focusedStackFrame: IStackFrame | undefined, _thread?: IThread, _session?: IDebugSession, _options?: { explicit?: boolean; preserveFocus?: boolean; sideBySide?: boolean; pinned?: boolean }): Promise<void> { }
	canSetBreakpointsIn(): boolean { return false; }
	async addBreakpoints(): Promise<IBreakpoint[]> { return []; }
	async updateBreakpoints(): Promise<void> { }
	async enableOrDisableBreakpoints(_enable: boolean, _breakpoint?: IEnablement): Promise<void> { }
	async setBreakpointsActivated(_activated: boolean): Promise<void> { }
	async removeBreakpoints(_id?: string | string[]): Promise<void> { }
	addFunctionBreakpoint(_opts?: IFunctionBreakpointOptions, _id?: string): void { }
	async updateFunctionBreakpoint(_id: string, _update: { name?: string; hitCondition?: string; condition?: string }): Promise<void> { }
	async removeFunctionBreakpoints(_id?: string): Promise<void> { }
	async addDataBreakpoint(_opts: IDataBreakpointOptions): Promise<void> { }
	async updateDataBreakpoint(_id: string, _update: { hitCondition?: string; condition?: string }): Promise<void> { }
	async removeDataBreakpoints(_id?: string): Promise<void> { }
	async addInstructionBreakpoint(_opts: IInstructionBreakpointOptions): Promise<void> { }
	async removeInstructionBreakpoints(_instructionReference?: string, _offset?: number, _address?: bigint): Promise<void> { }
	async setExceptionBreakpointCondition(_breakpoint: IExceptionBreakpoint, _condition: string | undefined): Promise<void> { }
	setExceptionBreakpointsForSession(_session: IDebugSession, _filters: DebugProtocol.ExceptionBreakpointsFilter[]): void { }
	async sendAllBreakpoints(_session?: IDebugSession): Promise<void> { }
	async sendBreakpoints(_modelUri: URI, _sourceModified?: boolean, _session?: IDebugSession): Promise<void> { }
	addWatchExpression(_name?: string): void { }
	renameWatchExpression(_id: string, _newName: string): void { }
	moveWatchExpression(_id: string, _position: number): void { }
	removeWatchExpressions(_id?: string): void { }
	async startDebugging(_launch: ILaunch | undefined, _configOrName?: IConfig | string, _options?: IDebugSessionOptions, _saveBeforeStart?: boolean): Promise<boolean> { return false; }
	async restartSession(_session: IDebugSession, _restartData?: unknown): Promise<void> { }
	async stopSession(_session: IDebugSession | undefined, _disconnect?: boolean, _suspend?: boolean): Promise<void> { }
	sourceIsNotAvailable(): void { }
	async runTo(): Promise<void> { }
}

export class NullDebugVisualizerService implements IDebugVisualizerService {

	declare readonly _serviceBrand: undefined;

	async getApplicableFor(): Promise<IReference<DebugVisualizer[]>> { return { object: [], dispose() { } }; }
	register(): IDisposable { return Disposable.None; }
	registerTree(): IDisposable { return Disposable.None; }
	async getVisualizedNodeFor(): Promise<undefined> { return undefined; }
	async getVisualizedChildren(): Promise<IExpression[]> { return []; }
	async editTreeItem(): Promise<void> { }
}
