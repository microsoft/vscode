"use strict";

import {DebugSession, OutputEvent} from "vscode-debugadapter";
import {IPythonProcess, IDebugServer} from "../Common/Contracts";
import * as net from "net";
import {BaseDebugServer} from "./BaseDebugServer";

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
            let that = this;
            this.debugSocketServer = net.createServer(c => {
                // "connection" listener
                let connected = false;
                c.on("data", (buffer: Buffer) => {
                    if (!connected) {
                        connected = true;
                        that.pythonProcess.Connect(buffer, c, false);
                    }
                    else {
                        that.pythonProcess.HandleIncomingData(buffer);
                        that.isRunning = true;
                    }
                });
                c.on("close", d => {
                    let msg = "Debugger client closed, " + d;
                    that.emit("detach", d);
                });
                c.on("timeout", d => {
                    let msg = "Debugger client timedout, " + d;
                    that.debugSession.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                });
            });
            this.debugSocketServer.on("error", ex => {
                let exMessage = JSON.stringify(ex);
                let msg = "";
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
                let server = that.debugSocketServer.address();
                resolve({ port: server.port });
            });
        });
    }
}