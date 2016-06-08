'use strict';

import {FrameKind, IPythonProcess, IPythonThread, IPythonModule, IPythonEvaluationResult, IPythonStackFrame} from './Common/Contracts';
import {IDjangoStackFrame, PythonEvaluationResultFlags, PythonLanguageVersion, IChildEnumCommand, IPythonException, IExecutionCommand} from './Common/Contracts';
import * as utils from './Common/Utils';
import {EventEmitter} from 'events';
import {Commands} from './ProxyCommands';
import {SocketStream} from './Common/SocketStream';
import {ExtractTryStatements} from './Common/TryParser';
import * as path from 'path';

export class PythonProcessCallbackHandler extends EventEmitter {
    private process: IPythonProcess;
    private idDispenser: utils.IdDispenser;
    private stream: SocketStream;
    private _stoppedForException: boolean;
    constructor(process: IPythonProcess, stream: SocketStream, idDispenser: utils.IdDispenser) {
        super();
        this.process = process;
        this.stream = stream;
        this.idDispenser = idDispenser;
    }

    public HandleIncomingData() {
        if (this.stream.Length === 0) {
            return;
        }
        this.stream.BeginTransaction();

        var cmd = this.stream.ReadAsciiString(4);
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        switch (cmd) {
            case "MODL": this.HandleModuleLoad(); break;
            case "LOAD": this.HandleProcessLoad(); break;
            case "STPD": this.HandleStepDone(); break;
            case "NEWT": this.HandleThreadCreate(); break;
            case "EXTT": this.HandleThreadExit(); break;
            case "THRF": this.HandleThreadFrameList(); break;
            case "OUTP": this.HandleDebuggerOutput(); break;
            case "BRKS": this.HandleBreakPointSet(); break;
            case "BRKF": this.HandleBreakPointFailed(); break;
            case "BRKH": this.HandleBreakPointHit(); break;
            case "DETC": this.HandleDetach(); break; // detach, report process exit
            case "LAST": this.HandleLast(); break;
            case "CHLD": this.HandleEnumChildren(); break;
            case "REQH": this.HandleRequestHandlers(); break;
            case "EXCP": this.HandleException(); break;
            case "EXCR": this.HandleExecutionResult(); break;
            case "EXCE": this.HandleExecutionException(); break;
            case "ASBR": this.HandleAsyncBreak(); break;
            default: {

                this.emit("error", `Unhandled command '${cmd}'`);
            }
        }

        if (this.stream.HasInsufficientDataForReading) {
            //Most possibly due to insufficient data
            this.stream.RollBackTransaction();
            return;
        }

        this.stream.EndTransaction();
        if (this.stream.Length > 0) {
            this.HandleIncomingData();
        }
    }

    private get LanguageVersion(): PythonLanguageVersion {
        return PythonLanguageVersion.Is2;
    }
    private HandleDetach() {
        this.emit("detach");
    }
    private HandleLast() {
        this.stream.Write(Commands.LastAckCommandBytes);
        this.emit("last");
    }
    private HandleModuleLoad() {
        var moduleId = this.stream.ReadInt32();
        var filename = this.stream.ReadString();

        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        if (filename != null) {
            this.emit("moduleLoaded", utils.CreatePythonModule(moduleId, filename));
        }
    }
    private HandleDebuggerOutput() {
        var threadId = this.stream.ReadInt64();
        var output = this.stream.ReadString();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }
        this.emit("output", pyThread, output);
    }

    private _createdFirstThread: boolean;
    private HandleThreadCreate() {
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var pyThread = utils.CreatePythonThread(threadId, this._createdFirstThread, this.process);
        this._createdFirstThread = true;
        this.process.Threads.set(threadId, pyThread);
        this.emit("threadCreated", pyThread);
    }

    private HandleThreadExit() {
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var thread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            thread = this.process.Threads.get(threadId);
            this.emit("threadExited", thread);
            // this.process.Threads.delete(threadId);
        }
    }

    private HandleProcessLoad() {
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }
        this.emit("processLoaded", pyThread);
    }

    private HandleStepDone() {
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }
        this.emit("stepCompleted", pyThread);
    }
    private HandleAsyncBreak() {
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }
        this.emit("asyncBreakCompleted", pyThread);
    }
    private HandleBreakPointFailed() {
        var id = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        this.emit("breakpointNotSet", id);
    }
    private HandleBreakPointSet() {
        var id = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }
        this.emit("breakpointSet", id);
    }
    private HandleBreakPointHit() {
        var breakId = this.stream.ReadInt32();
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }
        this.emit("breakpointHit", pyThread, breakId);
    }
    private HandleRequestHandlers() {
        var filename = this.stream.ReadString();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var fullyQualifiedFileName = filename;
        if (!path.isAbsolute(fullyQualifiedFileName)) {
            fullyQualifiedFileName = path.join(this.process.ProgramDirectory, filename);
        }

        this.GetHandledExceptionRanges(fullyQualifiedFileName).then(statements=> {
            this.stream.Write(Commands.SetExceptionHandlerInfoCommandBytes);
            this.stream.WriteString(filename);

            this.stream.WriteInt32(statements.length);

            statements.forEach(statement=> {
                this.stream.WriteInt32(statement.startLine);
                this.stream.WriteInt32(statement.endLine);

                statement.expressions.forEach(expr=> {
                    this.stream.WriteString(expr);
                });
                this.stream.WriteString("-");
            });
        });
    }
    private GetHandledExceptionRanges(fileName: string): Promise<{ startLine: number, endLine: number, expressions: string[] }[]> {
        return new Promise<{ startLine: number, endLine: number, expressions: string[] }[]>(resolve=> {
            ExtractTryStatements(fileName).then(statements=> {
                var exceptionRanges: { startLine: number, endLine: number, expressions: string[] }[] = []
                statements.forEach(statement=> {
                    var expressions = [];
                    if (statement.Exceptions.length === 0 || statement.Exceptions.indexOf("*") >= 0) {
                        expressions = ["*"];
                    }
                    else {
                        statement.Exceptions.forEach(ex=> {
                            if (expressions.indexOf(ex) === -1) {
                                expressions.push(ex);
                            }
                        });
                    }

                    exceptionRanges.push({
                        endLine: statement.EndLineNumber,
                        startLine: statement.StartLineNumber,
                        expressions: expressions
                    });
                });

                resolve(exceptionRanges);
            });
        });
    }

    private HandleException() {
        var typeName = this.stream.ReadString();
        var threadId = this.stream.ReadInt64();
        var breakType = this.stream.ReadInt32();
        var desc = this.stream.ReadString();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        if (typeName != null && desc != null) {
            var ex: IPythonException = {
                TypeName: typeName,
                Description: desc
            };
            var pyThread: IPythonThread;
            if (this.process.Threads.has(threadId)) {
                pyThread = this.process.Threads.get(threadId);
            }
            this.emit("exceptionRaised", pyThread, ex, breakType == 1 /* BREAK_TYPE_UNHANLDED */);
        }
        this._stoppedForException = true;
    }
    private HandleExecutionException() {
        var execId = this.stream.ReadInt32();
        var exceptionText = this.stream.ReadString();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var cmd: IExecutionCommand = null;
        if (this.process.PendingExecuteCommands.has(execId)) {
            cmd = this.process.PendingExecuteCommands.get(execId);
            if (this.process.PendingExecuteCommands.has(execId)) {
                this.process.PendingExecuteCommands.delete(execId);
            }
            cmd.PromiseReject(exceptionText);
        }
        this.idDispenser.Free(execId);
    }
    private HandleExecutionResult() {
        var execId = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var cmd: IExecutionCommand = null;
        if (this.process.PendingExecuteCommands.has(execId)) {
            cmd = this.process.PendingExecuteCommands.get(execId);
        }

        if (cmd === null) {
            // Passing null for parameters other than stream is okay as long
            // as we drop the result.
            this.ReadPythonObject(null, null, null);
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }
        }
        else {
            var evalResult = this.ReadPythonObject(cmd.Text, null, cmd.Frame);
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }

            cmd.PromiseResolve(evalResult);
        }

        if (cmd != null) {
            if (this.process.PendingExecuteCommands.has(execId)) {
                this.process.PendingExecuteCommands.delete(execId);
            }
        }
        this.idDispenser.Free(execId);
    }

    private HandleEnumChildren() {
        var execId = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var cmd: IChildEnumCommand = null;
        if (this.process.PendingChildEnumCommands.has(execId)) {
            cmd = this.process.PendingChildEnumCommands.get(execId);
        }

        var childrenCount = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        const children: IPythonEvaluationResult[] = [];
        for (var childCount = 0; childCount < childrenCount; childCount++) {
            const childName = this.stream.ReadString();
            const childExpr = this.stream.ReadString();
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }

            var obj = this.ReadPythonObject(childExpr, childName, cmd === null ? null : cmd.Frame);
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }
            children.push(obj);
        }

        if (cmd != null) {
            cmd.PromiseResolve(children);
            if (this.process.PendingChildEnumCommands.has(execId)) {
                this.process.PendingChildEnumCommands.delete(execId);
            }
        }
        this.idDispenser.Free(execId);
    }
    private HandleThreadFrameList() {
        var frames: IPythonStackFrame[] = [];
        var threadId = this.stream.ReadInt64();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        var pyThread: IPythonThread;
        if (this.process.Threads.has(threadId)) {
            pyThread = this.process.Threads.get(threadId);
        }

        var threadName = this.stream.ReadString();
        var frameCount = this.stream.ReadInt32();
        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        for (var i = 0; i < frameCount; i++) {
            var startLine = this.stream.ReadInt32();
            var endLine = this.stream.ReadInt32();
            var lineNo = this.stream.ReadInt32();
            var frameName = this.stream.ReadString();
            var filename = this.stream.ReadString();
            var argCount = this.stream.ReadInt32();
            var frameKind = <FrameKind>this.stream.ReadInt32();
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }

            var frame: IPythonStackFrame = null;
            if (pyThread != null) {
                switch (frameKind) {
                    case FrameKind.Django: {
                        var sourceFile = this.stream.ReadString();
                        var sourceLine = this.stream.ReadInt32();
                        if (this.stream.HasInsufficientDataForReading) {
                            return;
                        }

                        var djangoFrame: IDjangoStackFrame = {
                            EndLine: endLine, FileName: filename,
                            FrameId: i, FunctionName: frameName,
                            Kind: frameKind, LineNo: lineNo,
                            Locals: [], Parameters: [],
                            Thread: pyThread, SourceFile: sourceFile,
                            SourceLine: sourceLine, StartLine: startLine
                        };

                        frame = djangoFrame;
                        break;
                    }
                    default: {
                        frame = {
                            EndLine: endLine, FileName: filename,
                            FrameId: i, FunctionName: frameName,
                            Kind: frameKind, LineNo: lineNo,
                            Locals: [], Parameters: [],
                            Thread: pyThread, StartLine: startLine
                        };
                        break;
                    }
                }

            }

            var varCount = this.stream.ReadInt32();
            if (this.stream.HasInsufficientDataForReading) {
                return;
            }

            var variables: IPythonEvaluationResult[] = [];
            for (var j = 0; j < varCount; j++) {
                var name = this.stream.ReadString();
                if (this.stream.HasInsufficientDataForReading) {
                    return;
                }

                if (frame != null) {
                    var variableObj = this.ReadPythonObject(name, name, frame);
                    if (this.stream.HasInsufficientDataForReading) {
                        return;
                    }

                    variables.push(variableObj);
                }
            }
            if (frame != null) {
                frame.Parameters = variables.splice(0, argCount);
                frame.Locals = variables;
                frames.push(frame);
            }
        }

        if (pyThread != null) {
            pyThread.Frames = frames;
            if (typeof threadName === "string" && threadName.length > 0) {
                pyThread.Name = threadName;
            }
        }
    }

    private ReadPythonObject(expr: string, childName: string, frame: IPythonStackFrame): IPythonEvaluationResult {
        var objRepr = this.stream.ReadString();
        var hexRepr = this.stream.ReadString();
        var typeName = this.stream.ReadString();
        var length = this.stream.ReadInt64();
        var flags = <PythonEvaluationResultFlags>this.stream.ReadInt32();

        if (this.stream.HasInsufficientDataForReading) {
            return;
        }

        if ((flags & PythonEvaluationResultFlags.Raw) == 0 && ((typeName === "unicode" && this.LanguageVersion === PythonLanguageVersion.Is2)
            || (typeName === "str" && this.LanguageVersion === PythonLanguageVersion.Is3))) {
            objRepr = utils.FixupEscapedUnicodeChars(objRepr);
        }

        if (typeName == "bool") {
            hexRepr = null;
        }

        var pythonEvaluationResult: IPythonEvaluationResult = {
            ChildName: childName,
            Process: this.process,
            IsExpandable: (flags & PythonEvaluationResultFlags.Expandable) > 0,
            Flags: flags,
            StringRepr: objRepr,
            HexRepr: hexRepr,
            TypeName: typeName,
            Expression: expr,
            Length: length,
            Frame: frame
        };

        return pythonEvaluationResult;
    }
}
