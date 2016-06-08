'use strict';

//import {Variable, DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
import {DebugSession, OutputEvent} from 'vscode-debugadapter';
import {IPythonProcess, IDebugServer} from '../Common/Contracts';
import * as net from 'net';
import {BaseDebugServer} from './BaseDebugServer';

export class LocalDebugServer extends BaseDebugServer {
    private debugSocketServer: net.Server = null;

    constructor(debugSession: DebugSession, pythonProcess: IPythonProcess) {
        super(debugSession, pythonProcess);
    }

    public Stop() {
        if (this.debugSocketServer === null) return;
        try {
            this.debugSocketServer.close();
        }
        catch (ex) { }
        this.debugSocketServer = null;
    }

    public Start(): Promise<IDebugServer> {
        return new Promise<IDebugServer>((resolve, reject) => {
            var that = this;
            this.debugSocketServer = net.createServer(c => { //'connection' listener
                var connected = false;
                c.on("data", (buffer: Buffer) => {
                    if (!connected) {
                        connected = true;
                        that.pythonProcess.Connect(buffer, c, false);
                    }
                    else {
                        that.pythonProcess.HandleIncomingData(buffer)
                        that.isRunning = true;
                    }
                });
                c.on("close", d=> {
                    var msg = "Debugger client closed, " + d;
                    that.emit("detach", d);
                });
                c.on("timeout", d=> {
                    var msg = "Debugger client timedout, " + d;
                    that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                });
            });
            this.debugSocketServer.on("error", ex=> {
                var exMessage = JSON.stringify(ex);
                var msg = "";
                if (ex.code === "EADDRINUSE") {
                    msg = `The port used for debugging is in use, please try again or try restarting Visual Studio Code, Error = ${exMessage}`;
                }
                else {
                    msg = `There was an error in starting the debug server. Error = ${exMessage}`;
                }
                that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                reject(msg);
            });

            this.debugSocketServer.listen(0, () => {
                var server = that.debugSocketServer.address();
                resolve({ port: server.port });
            });
        });
    }
}