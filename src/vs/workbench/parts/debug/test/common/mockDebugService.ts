/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import debug = require('vs/workbench/parts/debug/common/debug');
import editor = require('vs/editor/common/editorCommon');
import ee = require('vs/base/common/eventEmitter');
import uri from 'vs/base/common/uri';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

export class MockDebugService extends ee.EventEmitter implements debug.IDebugService {
	private session: MockRawSession;
	public serviceId = debug.IDebugService;

	constructor() {
		super();
		this.session = new MockRawSession();
	}

	public getState(): debug.State {
		return null;
	}

	public canSetBreakpointsIn(model: editor.IModel): boolean {
		return false;
	}

	public getConfigurationName(): string {
		return null;
	}

	public setConfiguration(name: string): TPromise<void> {
		return TPromise.as(null);
	}

	public openConfigFile(sideBySide: boolean): TPromise<boolean> {
		return TPromise.as(false);
	}

	public loadLaunchConfig(): TPromise<debug.IGlobalConfig> {
		return TPromise.as(null);
	}

	public setFocusedStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame): void {}

	public setBreakpointsForModel(modelUri: uri, rawData: debug.IRawBreakpoint[]): void {}

	public toggleBreakpoint(IRawBreakpoint): TPromise<void> {
		return TPromise.as(null);
	}

	public enableOrDisableAllBreakpoints(enabled: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public toggleEnablement(element: debug.IEnablement): TPromise<void> {
		return TPromise.as(null);
	}

	public toggleBreakpointsActivated(): TPromise<void> {
		return TPromise.as(null);
	}

	public removeAllBreakpoints(): TPromise<any> {
		return TPromise.as(null);
	}

	public sendAllBreakpoints(): TPromise<any> {
		return TPromise.as(null);
	}

	public editBreakpoint(editor: editorbrowser.ICodeEditor, lineNumber: number): TPromise<void> {
		return TPromise.as(null);
	}

	public addFunctionBreakpoint(): void {}

	public renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeFunctionBreakpoints(id?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public addReplExpression(name: string): TPromise<void> {
		return TPromise.as(null);
	}

	public clearReplExpressions(): void {}

	public logToRepl(value: string, severity?: severity): void;
	public logToRepl(value: { [key: string]: any }, severity?: severity): void;
	public logToRepl(value: any, severity?: severity): void {}

	public appendReplOutput(value: string, severity?: severity): void {}

	public addWatchExpression(name?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public clearWatchExpressions(id?: string): void {}

	public createSession(noDebug: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	public restartSession(): TPromise<any> {
		return TPromise.as(null);
	}

	public getActiveSession(): debug.IRawDebugSession {
		return this.session;
	}

	public getModel(): debug.IModel {
		return null;
	}

	public getViewModel(): debug.IViewModel {
		return null
	}

	public openOrRevealEditor(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	public revealRepl(focus?: boolean): TPromise<void> {
		return TPromise.as(null);
	}
}


class MockRawSession extends ee.EventEmitter implements debug.IRawDebugSession {
	public isAttach: boolean = false;
	public capabilities: DebugProtocol.Capabilites;

	public getType(): string {
		return null;
	}

	public disconnect(restart?: boolean, force?: boolean): TPromise<DebugProtocol.DisconnectResponse> {
		return TPromise.as(null);
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return TPromise.as(null);
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return TPromise.as(null);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return TPromise.as(null);
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return TPromise.as(null);
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return TPromise.as(null);
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return TPromise.as({
			body: {
				stackFrames: []
			}
		});
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return TPromise.as(null);
	}

	public variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return TPromise.as(null);
	}

	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return TPromise.as(null);
	}
}
