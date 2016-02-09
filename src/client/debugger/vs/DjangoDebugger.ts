'use strict';

import {IPythonThread, IPythonBreakpoint, PythonBreakpointConditionKind, PythonBreakpointPassCountKind} from './Common/Contracts';
import {BaseDebugger, LaunchRequestArguments} from './BaseDebugger';
import {DebugSession, StoppedEvent, OutputEvent, InitializedEvent} from 'vscode-debugadapter';
import {WaitForPortToOpen} from './Common/OnPortOpenedHandler';


export interface LaunchDjangoRequestArguments extends LaunchRequestArguments {
    port: number;
    noReload: boolean;
    settings?: string;
}

export class DjangoDebugSession extends BaseDebugger {
    protected canStartDebugger(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            //Check if the port is already in use
            var djangoArgs = <LaunchDjangoRequestArguments>this.launchArgs;
            if (typeof djangoArgs.port !== "number" || djangoArgs.port <= 0) {
                return Promise.resolve(true);
            }

            WaitForPortToOpen(djangoArgs.port, 5000).then(() => {
                reject(`Port is already in use, please terminate relevant process`);
            }, error=> {
                resolve(true);
            });
        });
    }
    protected onPythonProcessLoaded(pyThread: IPythonThread) {
        var djangoArgs = <LaunchDjangoRequestArguments>this.launchArgs;

        this.sendResponse(this.entryResponse);
        this.pythonProcess.SendResumeThread(pyThread.Id);
         
        //Wait for the port to open before loading breakpoints
        var djangoArgs = <LaunchDjangoRequestArguments>this.launchArgs;
        WaitForPortToOpen(djangoArgs.port, 60000).then(() => {
            this.debuggerLoadedPromiseResolve();    
            // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
            this.sendEvent(new InitializedEvent());
        }, error=> {
            this.sendEvent(new OutputEvent(error, "stderr"));
        });
    }

    protected buildLauncherArguments(args: LaunchRequestArguments): string {
        var djangoArgs = <LaunchDjangoRequestArguments>args;
        var vsDebugOptions = "RedirectOutput";
        vsDebugOptions = "WaitOnAbnormalExit, WaitOnNormalExit, RedirectOutput, DjangoDebugging";

        var argsList = ["runserver"];
        if (djangoArgs.noReload === true) {
            argsList.push("--noreload");
        }
        if (typeof djangoArgs.settings === "string" && djangoArgs.settings.length > 0) {
            argsList.push("--settings");
            argsList.push(djangoArgs.settings);
        }
        if (typeof djangoArgs.port === "number" && djangoArgs.port > 0) {
            argsList.push(djangoArgs.port.toString());
        }

        var programArgs = argsList.join(" ");
        return `\"${vsDebugOptions}\" \"${args.program}\" ${programArgs}`;
    }
}

DebugSession.run(DjangoDebugSession);