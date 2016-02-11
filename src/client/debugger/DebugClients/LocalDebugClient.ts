import {BaseDebugServer} from '../DebugServers/BaseDebugServer';
import {LocalDebugServer} from '../DebugServers/LocalDebugServer';
import {IPythonProcess, IPythonThread, IDebugServer} from '../Common/Contracts';
import {DebugSession, OutputEvent} from 'vscode-debugadapter';
import * as path from 'path';
import * as child_process from 'child_process';
import {LaunchRequestArguments} from '../Common/Contracts';
import {DebugClient, DebugType} from './DebugClient';
import * as fs from 'fs';

export class LocalDebugClient extends DebugClient {
    protected args: LaunchRequestArguments;
    constructor(args: any, debugSession: DebugSession) {
        super(args, debugSession);
        this.args = args;
    }

    private pyProc: child_process.ChildProcess;
    private pythonProcess: IPythonProcess;
    private debugServer: BaseDebugServer;
    public CreateDebugServer(pythonProcess: IPythonProcess): BaseDebugServer {
        this.pythonProcess = pythonProcess;
        this.debugServer = new LocalDebugServer(this.debugSession, this.pythonProcess);
        return this.debugServer;
    }

    public get DebugType(): DebugType {
        return DebugType.Local;
    }

    public Stop() {
        if (this.debugServer) {
            this.debugServer.Stop()
            this.debugServer = null;
        }

        if (this.pyProc) {
            try { this.pyProc.send("EXIT"); }
            catch (ex) { }
            try { this.pyProc.stdin.write("EXIT"); }
            catch (ex) { }
            try { this.pyProc.disconnect(); }
            catch (ex) { }
            this.pyProc = null;
        }
    }
    public LaunchApplicationToDebug(dbgServer: IDebugServer): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            var fileDir = path.dirname(this.args.program);
            var processCwd = fileDir;
            var fileNameWithoutPath = path.basename(this.args.program);
            var pythonPath = "python";
            if (typeof this.args.pythonPath === "string" && this.args.pythonPath.trim().length > 0) {
                pythonPath = this.args.pythonPath;
            }

            //GUID is hardcoded for now, will have to be fixed  
            var currentFileName = module.filename;
            var ptVSToolsFilePath = path.join(path.dirname(currentFileName), "..", "..", "..", "..", "pythonFiles", "PythonTools", "visualstudio_py_launcher.py");
            var launcherArgs = this.buildLauncherArguments();
        
            //If this is a windows pc and if console is to be launched, then do so
            
            if (this.args.externalConsole === true) {
                if (!fs.existsSync(pythonPath)) {
                    return reject("Please provide a valid and fully qualified path to the python executable");
                }

                processCwd = path.dirname(pythonPath);
                pythonPath = path.basename(pythonPath);
                
                //Only include the file name, the path to the file is specified in cwd
                //we don't need to fully qualify 
                pythonPath = `start ${pythonPath}`;
            }
            else {
                //This could be the full path, we need to quote it
                pythonPath = `\"${pythonPath}\"`;
            }

            var commandLine = `${pythonPath} \"${ptVSToolsFilePath}\" \"${fileDir}" ${dbgServer.port} 34806ad9-833a-4524-8cd6-18ca4aa74f14 ${launcherArgs}`;
            console.log(commandLine);

            this.pyProc = child_process.exec(commandLine, { cwd: processCwd }, (error, stdout, stderr) => {
                if (!this.debugServer && this.debugServer.IsRunning) {
                    return;
                }
                var hasErrors = (error && error.message.length > 0) || (stderr && stderr.length > 0);
                if (hasErrors && (typeof stdout !== "string" || stdout.length === 0)) {
                    var errorMsg = (error && error.message) ? error.message : (stderr && stderr.length > 0 ? stderr.toString("utf-8") : "");
                    this.debugSession.sendEvent(new OutputEvent(errorMsg + "\n", "stderr"));
                    console.error(errorMsg);
                }
            });

            resolve();
        });
    }
    protected buildLauncherArguments(): string {
        var vsDebugOptions = "WaitOnAbnormalExit, WaitOnNormalExit, RedirectOutput";
        if (Array.isArray(this.args.debugOptions)) {
            vsDebugOptions = this.args.debugOptions.join(", ");
        }

        var programArgs = Array.isArray(this.args.args) && this.args.args.length > 0 ? this.args.args.join(" ") : "";
        return `\"${vsDebugOptions}\" \"${this.args.program}\" ${programArgs}`;
    }
}