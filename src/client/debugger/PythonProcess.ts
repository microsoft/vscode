'use strict';

import * as net from 'net';
import {EventEmitter} from 'events';
import {FrameKind, IPythonProcess, IPythonThread, IPythonModule, IPythonEvaluationResult, IPythonStackFrame, IStepCommand} from './Common/Contracts';
import {IPythonBreakpoint, PythonBreakpointConditionKind, PythonBreakpointPassCountKind, IBreakpointCommand, IChildEnumCommand} from './Common/Contracts';
import {PythonEvaluationResultReprKind, IExecutionCommand, enum_EXCEPTION_STATE} from './Common/Contracts';
import {Commands} from './ProxyCommands';
import * as utils from './Common/Utils';
import {PythonProcessCallbackHandler} from './PythonProcessCallbackHandler';
import {SocketStream} from './Common/SocketStream';

export class PythonProcess extends EventEmitter implements IPythonProcess {
    private id: number;
    public get Id(): number {
        return this.id;
    }
    private guid: string;
    public get Guid(): string {
        return this.guid;
    }

    private hasExited: boolean;
    public get HasExited(): boolean {
        return this.hasExited;
    }

    private _mainThread: IPythonThread;
    public get MainThread(): IPythonThread {
        return this._mainThread;
    }

    private _lastExecutedThread: IPythonThread;
    public get LastExecutedThread(): IPythonThread {
        return this._lastExecutedThread;
    }
    private _idDispenser: utils.IdDispenser;
    private _threads: Map<number, IPythonThread>;
    public get Threads(): Map<number, IPythonThread> {
        return this._threads;
    }

    public PendingChildEnumCommands: Map<number, IChildEnumCommand>;
    public PendingExecuteCommands: Map<number, IExecutionCommand>;
    private callbackHandler: PythonProcessCallbackHandler;
    private stream: SocketStream = null;
    private programDirectory: string;
    public get ProgramDirectory(): string {
        return this.programDirectory;
    }
    constructor(id: number, guid: string, programDirectory: string) {
        super();
        this.id = id;
        this.guid = guid;
        this._threads = new Map<number, IPythonThread>();
        this._idDispenser = new utils.IdDispenser();
        this.PendingChildEnumCommands = new Map<number, IChildEnumCommand>();
        this.PendingExecuteCommands = new Map<number, IExecutionCommand>();
        this.programDirectory = programDirectory;
    }

    public Kill() {
        if (!this.isRemoteProcess && typeof this.pid === "number") {
            try {
                var kill = require('tree-kill');
                kill(this.pid);
                this.pid = null;
            }
            catch (ex) { }
        }
    }

    public Terminate() {
        this.stream.Write(Commands.ExitCommandBytes);
    }

    public Detach() {
        this.stream.Write(Commands.DetachCommandBytes);
    }

    private guidRead: boolean;
    private statusRead: boolean;
    private pidRead: boolean;
    private pid: number = 0;
    private isRemoteProcess: Boolean;
    public Connect(buffer: Buffer, socket: net.Socket, isRemoteProcess: boolean = false) {
        this.isRemoteProcess = isRemoteProcess;
        this.stream = new SocketStream(socket, buffer);
        if (!isRemoteProcess) {
            this.stream.BeginTransaction();
            var guid = this.stream.ReadString();
            if (this.stream.HasInsufficientDataForReading) {
                this.stream.RollBackTransaction();
                return;
            }
            this.guidRead = true;
            this.stream.EndTransaction();

            this.stream.BeginTransaction();
            var result = this.stream.ReadInt32();
            if (this.stream.HasInsufficientDataForReading) {
                this.stream.RollBackTransaction();
                return;
            }
            this.statusRead = true;
            this.stream.EndTransaction();

            this.stream.BeginTransaction();
            this.pid = this.stream.ReadInt32();
            if (this.stream.HasInsufficientDataForReading) {
                this.stream.RollBackTransaction();
                return;
            }
            this.pidRead = true;
            this.stream.EndTransaction();
        }

        this.callbackHandler = new PythonProcessCallbackHandler(this, this.stream, this._idDispenser);
        this.callbackHandler.on("detach", () => this.emit("detach"));
        this.callbackHandler.on("last", () => this.emit("last"));
        this.callbackHandler.on("moduleLoaded", arg=> this.emit("moduleLoaded", arg));
        this.callbackHandler.on("asyncBreakCompleted", arg=> this.emit("asyncBreakCompleted", arg));
        this.callbackHandler.on("threadCreated", arg=> this.emit("threadCreated", arg));
        this.callbackHandler.on("threadExited", arg=> this.emit("threadExited", arg));
        this.callbackHandler.on("stepCompleted", arg=> this.onPythonStepCompleted(arg));
        this.callbackHandler.on("breakpointSet", arg=> this.onBreakpointSet(arg, true));
        this.callbackHandler.on("breakpointNotSet", arg=> this.onBreakpointSet(arg, false));
        this.callbackHandler.on("output", (pyThread, output) => this.emit("output", pyThread, output));
        this.callbackHandler.on("exceptionRaised", (pyThread, ex, brkType) => {
            this._lastExecutedThread = pyThread;
            this.emit("exceptionRaised", pyThread, ex, brkType);
        });
        this.callbackHandler.on("breakpointHit", (pyThread, breakpointId) => this.onBreakpointHit(pyThread, breakpointId));
        this.callbackHandler.on("processLoaded", arg=> {
            this._mainThread = <IPythonThread>arg;
            this._lastExecutedThread = this._mainThread;
            this.emit("processLoaded", arg);
        });
        this.callbackHandler.HandleIncomingData();
    }

    public HandleIncomingData(buffer: Buffer) {
        this.stream.Append(buffer);

        if (!this.isRemoteProcess) {
            if (!this.guidRead) {
                this.stream.RollBackTransaction();
                var guid = this.stream.ReadString();
                if (this.stream.HasInsufficientDataForReading) {
                    return;
                }
                this.guidRead = true;
                this.stream.EndTransaction();
            }
            if (!this.statusRead) {
                this.stream.BeginTransaction();
                var result = this.stream.ReadInt32();
                if (this.stream.HasInsufficientDataForReading) {
                    this.stream.RollBackTransaction();
                    return;
                }
                this.statusRead = true;
                this.stream.EndTransaction();
            }
            if (!this.pidRead) {
                this.stream.BeginTransaction();
                this.pid = this.stream.ReadInt32();
                if (this.stream.HasInsufficientDataForReading) {
                    this.stream.RollBackTransaction();
                    return;
                }
                this.pidRead = true;
                this.stream.EndTransaction();
            }
        }

        this.callbackHandler.HandleIncomingData();
    }
    
    //#region Step Commands
    private onPythonStepCompleted(pyThread: IPythonThread) {
        this._lastExecutedThread = pyThread;
        this.emit("stepCompleted", pyThread);
    }
    private sendStepCommand(threadId: number, command: Buffer) {
        this.stream.Write(command);
        this.stream.WriteInt64(threadId);
    }

    public SendExceptionInfo(defaultBreakOnMode: enum_EXCEPTION_STATE, breakOn: Map<string, enum_EXCEPTION_STATE>) {
        this.stream.Write(Commands.SetExceptionInfoCommandBytes);
        this.stream.WriteInt32(defaultBreakOnMode);
        if (breakOn === null || breakOn === undefined) {
            this.stream.WriteInt32(0);
        }
        else {
            this.stream.WriteInt32(breakOn.size);
            breakOn.forEach((value,key)=>{
                this.stream.WriteInt32(value);
                this.stream.WriteString(key);
            });
        }
    }

    public SendStepOver(threadId: number) {
        return this.sendStepCommand(threadId, Commands.StepOverCommandBytes);
    }
    public SendStepOut(threadId: number) {
        return this.sendStepCommand(threadId, Commands.StepOutCommandBytes);
    }
    public SendStepInto(threadId: number) {
        return this.sendStepCommand(threadId, Commands.StepIntoCommandBytes);
    }
    //#endregion    
    private onBreakpointHit(pyThread: IPythonThread, breakpointId: number) {
        this._lastExecutedThread = pyThread;
        this.emit("breakpointHit", pyThread, breakpointId);
    }
    private onBreakpointSet(breakpointId: number, success: boolean) {
        //Find the last breakpoint command associated with this breakpoint
        var index = this.breakpointCommands.findIndex(cmd=> cmd.Id === breakpointId);
        if (index === -1) {
            //Hmm this is not possible, log this exception and carry on
            this.emit("error", "command.breakpoint.hit", `Uknown Breakpoit Id ${breakpointId}`);
            return;
        }

        var cmd = this.breakpointCommands.splice(index, 1)[0];
        if (success) {
            cmd.PromiseResolve();
        }
        else {
            cmd.PromiseReject();
        }
    }

    private breakpointCommands: IBreakpointCommand[] = [];
    public DisableBreakPoint(breakpoint: IPythonBreakpoint) {
        if (breakpoint.IsDjangoBreakpoint) {
            this.stream.Write(Commands.RemoveDjangoBreakPointCommandBytes);
        } else {
            this.stream.Write(Commands.RemoveBreakPointCommandBytes);
        }
        this.stream.WriteInt32(breakpoint.LineNo);
        this.stream.WriteInt32(breakpoint.Id);
        if (breakpoint.IsDjangoBreakpoint) {
            this.stream.WriteString(breakpoint.Filename);
        }
    }

    public BindBreakpoint(brkpoint: IPythonBreakpoint): Promise<any> {
        return new Promise<IPythonThread>((resolve, reject) => {
            var bkCmd: IBreakpointCommand = {
                Id: brkpoint.Id,
                PromiseResolve: resolve,
                PromiseReject: reject
            };
            this.breakpointCommands.push(bkCmd);

            if (brkpoint.IsDjangoBreakpoint) {
                this.stream.Write(Commands.AddDjangoBreakPointCommandBytes);
            }
            else {
                this.stream.Write(Commands.SetBreakPointCommandBytes);
            }
            this.stream.WriteInt32(brkpoint.Id);
            this.stream.WriteInt32(brkpoint.LineNo);
            this.stream.WriteString(brkpoint.Filename);

            if (!brkpoint.IsDjangoBreakpoint) {
                this.SendCondition(brkpoint);
                this.SendPassCount(brkpoint);
            }
        });
    }

    private SendCondition(breakpoint: IPythonBreakpoint) {
        this.stream.WriteInt32(<number>breakpoint.ConditionKind);
        this.stream.WriteString(breakpoint.Condition || "");
    }
    private SendPassCount(breakpoint: IPythonBreakpoint) {
        // DebugWriteCommand("Send BP pass count");
        this.stream.WriteInt32(<number>breakpoint.PassCountKind);
        this.stream.WriteInt32(breakpoint.PassCount);
    }

    public SendResumeThread(threadId: number) {
        return this.sendStepCommand(threadId, Commands.ResumeThreadCommandBytes);
    }
    public SendContinue(): Promise<IPythonThread> {
        return new Promise<IPythonThread>(resolve => {
            this.stream.Write(Commands.ResumeAllCommandBytes);
            resolve();
        })
    }
    public AutoResumeThread(threadId: number) {

    }
    public SendClearStepping(threadId: number) {

    }
    public Break() {
        this.stream.Write(Commands.BreakAllCommandBytes);
    }
    public ExecuteText(text: string, reprKind: PythonEvaluationResultReprKind, stackFrame: IPythonStackFrame): Promise<IPythonEvaluationResult> {
        return new Promise<IPythonEvaluationResult>((resolve, reject) => {
            var executeId = this._idDispenser.Allocate();
            var cmd: IExecutionCommand = {
                Id: executeId,
                Text: text,
                Frame: stackFrame,
                PromiseResolve: resolve,
                PromiseReject: reject
            };
            this.PendingExecuteCommands.set(executeId, cmd);
            this.stream.Write(Commands.ExecuteTextCommandBytes);
            this.stream.WriteString(text);
            this.stream.WriteInt64(stackFrame.Thread.Id);
            this.stream.WriteInt32(stackFrame.FrameId);
            this.stream.WriteInt32(executeId);
            this.stream.WriteInt32(<number>stackFrame.Kind);
            this.stream.WriteInt32(<number>reprKind);
        });
    }

    public EnumChildren(text: string, stackFrame: IPythonStackFrame, timeout: number): Promise<IPythonEvaluationResult[]> {
        return new Promise<IPythonEvaluationResult[]>((resolve, reject) => {
            var executeId = this._idDispenser.Allocate();
            if (typeof (executeId) !== "number") {
                var y = "";
            }
            var cmd: IChildEnumCommand = {
                Id: executeId,
                Frame: stackFrame,
                PromiseResolve: resolve,
                PromiseReject: reject
            };
            this.PendingChildEnumCommands.set(executeId, cmd);
            setTimeout(() => {
                if (this.PendingChildEnumCommands.has(executeId)) {
                    this.PendingChildEnumCommands.delete(executeId);
                }
                var seconds = timeout / 1000;
                reject(`Enumerating children for ${text} timed out after ${seconds} seconds.`);
            }, timeout);

            this.stream.Write(Commands.GetChildrenCommandBytes);
            this.stream.WriteString(text);
            this.stream.WriteInt64(stackFrame.Thread.Id);
            this.stream.WriteInt32(stackFrame.FrameId);
            this.stream.WriteInt32(executeId);
            this.stream.WriteInt32(stackFrame.Kind);
        });
    }
    public SetLineNumber(pythonStackFrame: IPythonStackFrame, lineNo: number) {

    }
}
