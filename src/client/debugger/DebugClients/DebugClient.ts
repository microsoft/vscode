import {BaseDebugServer} from "../DebugServers/BaseDebugServer";
import {LocalDebugServer} from "../DebugServers/LocalDebugServer";
import {IPythonProcess, IPythonThread, IDebugServer} from "../Common/Contracts";
import {DebugSession, OutputEvent} from "vscode-debugadapter";
import * as path from "path";
import * as child_process from "child_process";
import {DjangoApp, LaunchRequestArguments, AttachRequestArguments} from "../Common/Contracts";

export enum DebugType {
    Local,
    Remote
}
export abstract class DebugClient {
    protected debugSession: DebugSession;
    constructor(args: any, debugSession: DebugSession) {
        this.debugSession = debugSession;
    }
    public abstract CreateDebugServer(pythonProcess: IPythonProcess): BaseDebugServer;
    public get DebugType(): DebugType {
        return DebugType.Local;
    }

    public Stop() {
    }

    public LaunchApplicationToDebug(dbgServer: IDebugServer): Promise<any> {
        return Promise.resolve();
    }
}
