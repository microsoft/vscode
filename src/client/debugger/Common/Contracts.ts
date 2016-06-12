"use strict";
import * as net from "net";
import {DebugProtocol} from "vscode-debugprotocol";

export const DjangoApp = "DJANGO";
export enum DebugFlags {
    None = 0,
    IgnoreCommandBursts = 1
}

export class DebugOptions {
    public static get WaitOnAbnormalExit(): string { return "WaitOnAbnormalExit"; }
    public static get WaitOnNormalExit(): string { return "WaitOnNormalExit"; }
    public static get RedirectOutput(): string { return "RedirectOutput"; }
    public static get DjangoDebugging(): string { return "DjangoDebugging"; }
    public static get DebugStdLib(): string { return "DebugStdLib"; }
    public static get BreakOnSystemExitZero(): string { return "BreakOnSystemExitZero"; }
}

export interface ExceptionHandling {
    ignore: string[];
    always: string[];
    unhandled: string[];
}

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
    pythonPath: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
    args: string[];
    applicationType?: string;
    externalConsole?: boolean;
    cwd?: string;
    debugOptions?: string[];
    env?: Object;
    exceptionHandling?: ExceptionHandling;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
    /** An absolute path to local directory with source. */
    localRoot: string;
    remoteRoot: string;
    port?: number;
    host?: string;
    secret?: string;
}

export interface IDebugServer {
    port: number;
    host?: string;
}

export enum FrameKind {
    None,
    Python,
    Django
};
export enum enum_EXCEPTION_STATE {
    BREAK_MODE_NEVER = 0,
    BREAK_MODE_ALWAYS = 1,
    BREAK_MODE_UNHANDLED = 32
}
export enum PythonLanguageVersion {
    Is2,
    Is3
}

export enum PythonEvaluationResultReprKind {
    Normal,
    Raw,
    RawLen
}

export enum PythonEvaluationResultFlags {
    None = 0,
    Expandable = 1,
    MethodCall = 2,
    SideEffects = 4,
    Raw = 8,
    HasRawRepr = 16,
}

export interface IPythonProcess extends NodeJS.EventEmitter {
    Connect(buffer: Buffer, socket: net.Socket, isRemoteProcess: boolean);
    HandleIncomingData(buffer: Buffer);
    Detach();
    Kill();
    SendStepInto(threadId: number);
    SendStepOver(threadId: number);
    SendStepOut(threadId: number);
    SendResumeThread(threadId: number);
    AutoResumeThread(threadId: number);
    SendClearStepping(threadId: number);
    ExecuteText(text: string, reprKind: any, stackFrame: IPythonStackFrame): Promise<IPythonEvaluationResult>;
    EnumChildren(text: string, stackFrame: IPythonStackFrame, timeout: number): Promise<IPythonEvaluationResult[]>;
    SetLineNumber(pythonStackFrame: IPythonStackFrame, lineNo: number);
    Threads: Map<number, IPythonThread>;
    ProgramDirectory: string;
    PendingChildEnumCommands: Map<number, IChildEnumCommand>;
    PendingExecuteCommands: Map<number, IExecutionCommand>;
}

export interface IPythonEvaluationResult {
    Flags: PythonEvaluationResultFlags;
    IsExpandable: boolean;
    StringRepr: string;
    HexRepr: string;
    TypeName: string;
    Length: number;
    ExceptionText?: string;
    Expression: string;
    ChildName: string;
    Process: IPythonProcess;
    Frame: IPythonStackFrame;
}


export interface IPythonModule {
    ModuleId: number;
    Name: string;
    Filename: string;
}


export interface IPythonThread {
    IsWorkerThread: boolean;
    Process: IPythonProcess;
    Name: string;
    Id: number;
    Frames: IPythonStackFrame[];
}

export interface IPythonStackFrame {
    StartLine: number;
    EndLine: number;
    Thread: IPythonThread;
    LineNo: number;
    FunctionName: string;
    FileName: string;
    Kind: FrameKind;
    FrameId: number;
    Locals: IPythonEvaluationResult[];
    Parameters: IPythonEvaluationResult[];
}

export interface IDjangoStackFrame extends IPythonStackFrame {
    SourceFile: string;
    SourceLine: number;
}

export interface IStepCommand {
    PromiseResolve: (pyThread: IPythonThread) => void;
    PythonThreadId: number;
}

export interface IBreakpointCommand {
    Id: number;
    PromiseResolve: () => void;
    PromiseReject: () => void;
}
export interface IChildEnumCommand {
    Id: number;
    Frame: IPythonStackFrame;
    PromiseResolve: (value: IPythonEvaluationResult[]) => void;
    PromiseReject: () => void;
}
export interface IExecutionCommand {
    Id: number;
    Text: string;
    Frame: IPythonStackFrame;
    PromiseResolve: (value: IPythonEvaluationResult) => void;
    PromiseReject: (error: string) => void;
}
// Must be in sync with BREAKPOINT_CONDITION_* constants in visualstudio_py_debugger.py.
export enum PythonBreakpointConditionKind {
    Always = 0,
    WhenTrue = 1,
    WhenChanged = 2
}

// Must be in sync with BREAKPOINT_PASS_COUNT_* constants in visualstudio_py_debugger.py.
export enum PythonBreakpointPassCountKind {
    Always = 0,
    Every = 1,
    WhenEqual = 2,
    WhenEqualOrGreater = 3
}

export interface IPythonBreakpoint {
    IsDjangoBreakpoint?: boolean;
    Id: number;
    Filename: string;
    LineNo: number;
    ConditionKind: PythonBreakpointConditionKind;
    Condition: string;
    PassCountKind: PythonBreakpointPassCountKind;
    PassCount: number;
    Enabled: boolean;
}
export interface IPythonException {
    TypeName: string;
    Description: string;
}
