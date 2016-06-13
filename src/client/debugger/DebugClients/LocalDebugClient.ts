import {BaseDebugServer} from "../DebugServers/BaseDebugServer";
import {LocalDebugServer} from "../DebugServers/LocalDebugServer";
import {IPythonProcess, IPythonThread, IDebugServer} from "../Common/Contracts";
import {DebugSession, OutputEvent} from "vscode-debugadapter";
import * as path from "path";
import * as child_process from "child_process";
import {LaunchRequestArguments} from "../Common/Contracts";
import {DebugClient, DebugType} from "./DebugClient";
import * as fs from "fs";
import {open} from "../../common/open";
let fsExtra = require("fs-extra");
let tmp = require("tmp");
let prependFile = require("prepend-file");
let LineByLineReader = require("line-by-line");

const PTVS_FILES = ["visualstudio_ipython_repl.py", "visualstudio_py_debugger.py",
    "visualstudio_py_launcher.py", "visualstudio_py_repl.py", "visualstudio_py_util.py"];

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
            this.debugServer.Stop();
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
    private getPTVSToolsFilePath(): Promise<string> {
        let currentFileName = module.filename;

        return new Promise<String>((resolve, reject) => {
            tmp.dir((error, tmpDir) => {
                if (error) { return reject(error); }
                let ptVSToolsPath = path.join(path.dirname(currentFileName), "..", "..", "..", "..", "pythonFiles", "PythonTools");

                let promises = PTVS_FILES.map(ptvsFile => {
                    return new Promise((copyResolve, copyReject) => {
                        let sourceFile = path.join(ptVSToolsPath, ptvsFile);
                        let targetFile = path.join(tmpDir, ptvsFile);

                        fsExtra.copy(sourceFile, targetFile, copyError => {
                            if (copyError) { return copyReject(copyError); }
                            copyResolve(targetFile);
                        });
                    });
                });

                Promise.all(promises).then(() => {
                    resolve(path.join(tmpDir, "visualstudio_py_launcher.py"));
                }, reject);
            });
        });
    }
    private displayError(error) {
        if (!error) { return; }
        let errorMsg = typeof error === "string" ? error : ((error.message && error.message.length > 0) ? error.message : "");
        if (errorMsg.length > 0) {
            this.debugSession.sendEvent(new OutputEvent(errorMsg + "\n", "stderr"));
        }
    }
    private getShebangLines(program: string): Promise<string[]> {
        const MAX_SHEBANG_LINES = 2;
        return new Promise<string[]>((resolve, reject) => {
            let lr = new LineByLineReader(program);
            let shebangLines: string[] = [];

            lr.on("error", err => {
                reject(err);
            });
            lr.on("line", (line: string) => {
                if (shebangLines.length >= MAX_SHEBANG_LINES) {
                    lr.close();
                    return false;
                }
                let trimmedLine = line.trim();
                if (trimmedLine.startsWith("#")) {
                    shebangLines.push(line);
                }
                else {
                    shebangLines.push("#");
                }
            });
            lr.on("end", function() {
                // Ensure we always have two lines, even if no shebangLines
                // This way if ever we get lines numbers in errors for the python file, we have a consistency
                while (shebangLines.length < MAX_SHEBANG_LINES) {
                    shebangLines.push("#");
                }
                resolve(shebangLines);
            });
        });
    }
    private prependShebangToPTVSFile(ptVSToolsFilePath: string, program: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.getShebangLines(program).then(lines => {
                let linesToPrepend = lines.join("\n") + "\n";
                prependFile(ptVSToolsFilePath, linesToPrepend, error => {
                    if (error) { reject(error); }
                    else { resolve(ptVSToolsFilePath); }
                });
            }, reject);
        });
    }
    public LaunchApplicationToDebug(dbgServer: IDebugServer): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let fileDir = path.dirname(this.args.program);
            let processCwd = fileDir;
            if (typeof this.args.cwd === "string" && this.args.cwd.length > 0) {
                processCwd = this.args.cwd;
            }
            let fileNameWithoutPath = path.basename(this.args.program);
            let pythonPath = "python";
            if (typeof this.args.pythonPath === "string" && this.args.pythonPath.trim().length > 0) {
                pythonPath = this.args.pythonPath;
            }
            let environmentVariables = this.args.env ? this.args.env : null;
            if (environmentVariables) {
                for (let setting in process.env) {
                    if (!environmentVariables[setting]) {
                        environmentVariables[setting] = process.env[setting];
                    }
                }
            }

            let currentFileName = module.filename;

            this.getPTVSToolsFilePath().then((ptVSToolsFilePath) => {
                return this.prependShebangToPTVSFile(ptVSToolsFilePath, this.args.program);
            }, error => {
                this.displayError(error);
                reject(error);
            }).then((ptVSToolsFilePath) => {
                let launcherArgs = this.buildLauncherArguments();

                let args = [ptVSToolsFilePath, processCwd, dbgServer.port.toString(), "34806ad9-833a-4524-8cd6-18ca4aa74f14"].concat(launcherArgs);
                if (this.args.externalConsole === true) {
                    open({ wait: false, app: [pythonPath].concat(args), cwd: processCwd, env: environmentVariables }).then(proc => {
                        this.pyProc = proc;
                        resolve();
                    }, error => {
                        if (!this.debugServer && this.debugServer.IsRunning) {
                            return;
                        }
                        this.displayError(error);
                        reject(error);
                    });

                    return;
                }

                this.pyProc = child_process.spawn(pythonPath, args, { cwd: processCwd, env: environmentVariables });
                this.pyProc.on("error", error => {
                    if (!this.debugServer && this.debugServer.IsRunning) {
                        return;
                    }
                    this.displayError(error);
                });
                this.pyProc.on("stderr", error => {
                    if (!this.debugServer && this.debugServer.IsRunning) {
                        return;
                    }
                    this.displayError(error);
                });

                resolve();
            }, error => {
                this.displayError(error);
                reject(error);
            });
        });
    }
    protected buildLauncherArguments(): string[] {
        let vsDebugOptions = "WaitOnAbnormalExit,WaitOnNormalExit,RedirectOutput";
        if (Array.isArray(this.args.debugOptions)) {
            vsDebugOptions = this.args.debugOptions.join(",");
        }

        let programArgs = Array.isArray(this.args.args) && this.args.args.length > 0 ? this.args.args : [];
        return [vsDebugOptions, this.args.program].concat(programArgs);
    }
}
