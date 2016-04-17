'use strict';

import {DebugSession, OutputEvent} from 'vscode-debugadapter';
import {IPythonProcess, IDebugServer, AttachRequestArguments} from '../Common/Contracts';
import * as net from 'net';
import {BaseDebugServer} from './BaseDebugServer';
import {SocketStream} from '../Common/SocketStream';

const DebuggerProtocolVersion = 6; // must be kept in sync with PTVSDBG_VER in attach_server.py
const DebuggerSignature = "PTVSDBG";
const Accepted = "ACPT";
const Rejected = "RJCT";
const DebuggerSignatureBytes: Buffer = new Buffer(DebuggerSignature, "ascii");
const InfoCommandBytes: Buffer = new Buffer("INFO", "ascii");
const AttachCommandBytes: Buffer = new Buffer("ATCH", "ascii");
const ReplCommandBytes: Buffer = new Buffer("REPL", "ascii");

export class RemoteDebugServer extends BaseDebugServer {
    private socket: net.Socket = null;
    private args: AttachRequestArguments;
    constructor(debugSession: DebugSession, pythonProcess: IPythonProcess, args: AttachRequestArguments) {
        super(debugSession, pythonProcess);
        this.args = args;
    }

    public Stop() {
        if (this.socket === null) return;
        try {
            this.socket.end();
        }
        catch (ex) { }
        this.socket = null;
    }
    private stream: SocketStream = null;
    public Start(): Promise<IDebugServer> {
        return new Promise<IDebugServer>((resolve, reject) => {
            var that = this;
            var connected = false;
            var secretWrittenToDebugProgram = false;
            var secretConfirmedByDebugProgram = false;
            var infoBytesWritten = false;
            var versionRead = false;
            var commandBytesWritten = false;
            var languageVersionRead = false;
            var portNumber = this.args.port;
            var debugCommandsAccepted = false;
            var options = <any>{ port: portNumber};
            if (typeof this.args.host === "string" && this.args.host.length > 0) {
                options.host = this.args.host;
            }
            this.socket = net.connect(options, () => {
                console.log('client connected');
                console.log(`Debug server started, listening on port ${portNumber}`);
                resolve(options);
            });
            this.socket.on('end', (ex) => {
                var msg = `Debugger client disconneced, ex`;
                that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                console.log(msg);
            });
            this.socket.on("data", (buffer: Buffer) => {
                if (connected) {
                    that.pythonProcess.HandleIncomingData(buffer);
                    return;
                }

                if (that.stream === null) {
                    that.stream = new SocketStream(that.socket, buffer);
                }
                else {
                    if (!connected) {
                        if (that.stream.Length === 0) {
                            that.stream = new SocketStream(that.socket, buffer);
                        }
                        else {
                            that.stream.Append(buffer);
                        }
                    }
                }

                if (!secretWrittenToDebugProgram) {
                    that.stream.BeginTransaction();
                    var sig = that.stream.ReadAsciiString(DebuggerSignature.length);
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }
                    if (sig != DebuggerSignature) {
                        throw new Error("ConnErrorMessages.RemoteUnsupportedServer");
                    }

                    var ver = that.stream.ReadInt64();
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }

                    // If we are talking the same protocol but different version, reply with signature + version before bailing out
                    // so that ptvsd has a chance to gracefully close the socket on its side. 
                    that.stream.EndTransaction();
                    that.stream.Write(DebuggerSignatureBytes);
                    that.stream.WriteInt64(DebuggerProtocolVersion);

                    if (ver != DebuggerProtocolVersion) {
                        throw new Error("ConnErrorMessages.RemoteUnsupportedServer");
                    }


                    that.stream.WriteString(that.args.secret || "");
                    secretWrittenToDebugProgram = true;
                    that.stream.EndTransaction();

                    var secretResp = that.stream.ReadAsciiString(Accepted.length);
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }
                    if (secretResp != Accepted) {
                        throw new Error("ConnErrorMessages.RemoteSecretMismatch");
                    }

                    secretConfirmedByDebugProgram = true;
                    that.stream.EndTransaction();
                }

                if (!secretConfirmedByDebugProgram) {
                    var secretResp = that.stream.ReadAsciiString(Accepted.length);
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }
                    if (secretResp != Accepted) {
                        throw new Error("ConnErrorMessages.RemoteSecretMismatch");
                    }

                    secretConfirmedByDebugProgram = true;
                    that.stream.EndTransaction();
                }

                if (!commandBytesWritten) {
                    that.stream.Write(AttachCommandBytes);
                    var debugOptions = "WaitOnAbnormalExit, WaitOnNormalExit, RedirectOutput";
                    that.stream.WriteString(debugOptions);
                    commandBytesWritten = true;
                }

                if (commandBytesWritten && !debugCommandsAccepted) {
                    var attachResp = that.stream.ReadAsciiString(Accepted.length);
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }

                    if (attachResp != Accepted) {
                        throw new Error("ConnErrorMessages.RemoteAttachRejected");
                    }
                    debugCommandsAccepted = true;
                    that.stream.EndTransaction();
                }

                if (debugCommandsAccepted && !languageVersionRead) {
                    that.stream.EndTransaction();
                    var pid = that.stream.ReadInt32();
                    var langMajor = that.stream.ReadInt32();
                    var langMinor = that.stream.ReadInt32();
                    var langMicro = that.stream.ReadInt32();
                    var langVer = ((langMajor << 8) | langMinor);
                    if (that.stream.HasInsufficientDataForReading) {
                        that.stream.RollBackTransaction()
                        return;
                    }

                    that.stream.EndTransaction();
                    languageVersionRead = true;
                }

                if (languageVersionRead) {
                    if (connected) {
                        that.pythonProcess.HandleIncomingData(buffer);
                    }
                    else {
                        that.pythonProcess.Connect(that.stream.Buffer, this.socket, true);
                        connected = true;
                    }
                }
            });
            this.socket.on("close", d => {
                var msg = `Debugger client closed, ${d}`;
                console.log(msg);
                that.emit("detach", d);
            });
            this.socket.on("timeout", d => {
                var msg = `Debugger client timedout, ${d}`;
                that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                console.log(msg);
            });
            this.socket.on("error", ex => {
                var exMessage = JSON.stringify(ex);
                var msg = `There was an error in starting the debug server. Error = ${exMessage}`;
                that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                console.log(msg);
                reject(msg);
            });
        });
    }
}