import {BaseDebugServer} from "./BaseDebugServer";
import {LocalDebugServer} from "./LocalDebugServer";
import {RemoteDebugServer} from "./RemoteDebugServer";
import {DebugSession, OutputEvent} from "vscode-debugadapter";
import {IPythonProcess, IDebugServer} from "../Common/Contracts";

export function CreateDebugServer(debugSession: DebugSession, pythonProcess: IPythonProcess): BaseDebugServer {
    return new LocalDebugServer(debugSession, pythonProcess);
}
