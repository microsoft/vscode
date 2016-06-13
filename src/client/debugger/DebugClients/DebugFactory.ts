import {BaseDebugServer} from "../DebugServers/BaseDebugServer";
import {LocalDebugServer} from "../DebugServers/LocalDebugServer";
import {IPythonProcess, IPythonThread, IDebugServer} from "../Common/Contracts";
import {DebugSession, OutputEvent} from "vscode-debugadapter";
import * as path from "path";
import * as child_process from "child_process";
import {DjangoApp, LaunchRequestArguments, AttachRequestArguments} from "../Common/Contracts";
import {LocalDebugClient} from "./LocalDebugClient";
import {RemoteDebugClient} from "./RemoteDebugClient";
import {DebugClient} from "./DebugClient";

export function CreateLaunchDebugClient(launchRequestOptions: LaunchRequestArguments, debugSession: DebugSession): DebugClient {
    return new LocalDebugClient(launchRequestOptions, debugSession);
}
export function CreateAttachDebugClient(attachRequestOptions: AttachRequestArguments, debugSession: DebugSession): DebugClient {
    return new RemoteDebugClient(attachRequestOptions, debugSession);
}