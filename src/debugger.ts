// /*---------------------------------------------------------
//  ** Copyright (C) Microsoft Corporation. All rights reserved.
//  *--------------------------------------------------------*/
// 
// import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
// import {DebugProtocol} from 'vscode-debugprotocol';
// import {readFileSync} from 'fs';
// import {basename} from 'path';
// import * as path from 'path';
// import * as pty from 'pty.js';
// import * as os from 'os';
// import * as fs from 'fs';
// 
// /**
//  * This interface should always match the schema found in the mock-debug extension manifest.
//  */
// export interface LaunchRequestArguments {
// 	/** An absolute path to the program to debug. */
// 	program: string;
// 	/** Automatically stop target after launch. If not specified, target does not stop. */
// 	stopOnEntry?: boolean;
// }
// 
// interface ICommand {
//     name:string;
//     resolve:(values:string[])=>void;
//     reject:(any)=>void;
//     promptResponse?:string;
//     commandLineDetected?:boolean;
//     commandLine:string;
// }
// 
// interface ICurrentStack {
//     fileName:string,
//     lineNumber:number,
//     function:string
// }
// 
// function ignoreEmpty(line){
//     return line.trim() !== "" && line.trim() !== "(Pdb)" && line.trim() !== "\n" && line.trim() !== "\r" && line.trim() !== "\r\n";
// }
// function ignorePrefix(line){
//     line = line.trim();
//     return line !== "->" && line!== ">" && line;
// }
// function parseWhere(data:string[]):ICurrentStack{
// 	//this.sendEvent(new OutputEvent(data.length + "\n"));
// 	//this.sendEvent(new OutputEvent(data + "\n"));
//     data = data.reverse().filter(ignoreEmpty).filter(ignorePrefix);
//     var currentLine = data[1];
// 
//     var parts = currentLine.trim().split(/\s+/)[1].match(/(.*)\((\d+)\)(.*)/);
//             //var src = lines[1].split(/\s+/)[1];
//     var currentStack:ICurrentStack = {
//             fileName : parts[1],
//             lineNumber : parseInt(parts[2], 10),
//             function : parts[3]
//     };
//    return currentStack;
// }
// interface ICommandToExecute {
//     name:string
//     responseProtocol?:DebugProtocol.Response
// }
// class MockDebugSession extends DebugSession {
// 
// 	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
// 	private static THREAD_ID = 1;
// 	private commands:ICommand[] = [];
// 	private __currentLine: number;
// 	private get _currentLine() : number {
//         return this.__currentLine;
//     }
// 	private set _currentLine(line: number) {
//         this.__currentLine = line;
// 		this.sendEvent(new OutputEvent(`line: ${line}\n`));	// print current line on debug console
//     }
// 
// 	private _sourceFile: string;
// 	private _sourceLines: string[];
// 	private _breakPoints: any;
// 	private _variableHandles: Handles<string>;
// 
// 
// 	public constructor(debuggerLinesStartAt1: boolean, isServer: boolean = false) {
// 		super(debuggerLinesStartAt1, isServer);
// 		this._sourceFile = null;
// 		this._sourceLines = [];
// 		this._currentLine = 0;
// 		this._breakPoints = {};
// 		this._variableHandles = new Handles<string>();
// 	}
// 
// 	private pythonProc:pty.Terminal;
// 
// 	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
// 		this.sendResponse(response);
// 
// 		// now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
// 		this.sendEvent(new InitializedEvent());
// 	}
// 	private sendCmd(cmd:string){
//     	this.pythonProc.stdin.write(cmd + "\n");
// 	}
// 
// 	private startedPromise:Promise<string[]>;
// 
// 	private createCommand(cmd:string, promptResponse?:string):Promise<string[]> {
// 		var promiseCmd = new Promise<string[]>((resolve, reject)=>{
// 			var command:ICommand = {
// 			name:cmd,
// 			resolve:resolve,
// 			reject:reject,
// 			commandLine:cmd
// 			};
// 			if (typeof promptResponse === "string"){
// 				command.promptResponse = promptResponse;
// 			}
// 
// 			this.commands.push(command);
// 			this.sendCmd(command.name);
// 		});
// 
// 		return promiseCmd;
// 	}
//     private outputBuffer:string = "";
//     private readyToAcceptCommands:boolean;
//     private startResolve:()=>void;    
//     private launchResponse:DebugProtocol.LaunchResponse;
// 	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
// 		//this.sendEvent(new OutputEvent("Started\n"));
// 		this._sourceFile = args.program;
// 		this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
// 
// 		if (args.stopOnEntry) {
//             this.launchResponse = response;
// // 			this._currentLine = 0;
// // 			this.sendResponse(response);
// // 
// // 			// we stop on the first line
// // 			this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
// 		} else {
// 			// we just start to run until we hit a breakpoint or an exception
// 			this.continueRequest(response, { threadId: MockDebugSession.THREAD_ID });
// 		}
// 		this.sendEvent(new OutputEvent("Started2\n"));
//         var fileDir = path.dirname(this._sourceFile);
//         this.sendEvent(new OutputEvent(fileDir));
//         this.sendEvent(new OutputEvent(this._sourceFile));
// 		this.pythonProc = pty.spawn("python", ["-u", "-m", "pdb", this._sourceFile], {
// 			cwd:fileDir
// 		});
// 		this.sendEvent(new OutputEvent(this._sourceFile + "\n"));
// 
//         var that = this;
// 		this.startedPromise = new Promise((startResolve, startReject)=>{        
// //             var onCommand = function(data){
// //                 //this.sendEvent(new OutputEvent("Started3\n"));
// //                     this.outputBuffer = this.outputBuffer + data;
// //                     if (!this.readyToAcceptCommands){
// //                         var lines = this.outputBuffer.split(os.EOL).reverse().filter(line=>line.length === 0 || line === os.EOL || line === "\n").map(line=>line.trim());
// //                         if (lines.length === 0 ){
// //                             return;
// //                         }
// //                         if (lines[0] === "(Pdb)"){
// //                             startResolve();
// //                             this.readyToAcceptCommands = true;
// //                         }
// //                     }
// //                     //startResolve();
// //                     this.sendEvent(new OutputEvent(data + "\n"));
// //                     if (this.commands.length === 0){
// //                         return;
// //                     }
// //                     var dataStr = "" + data;
// //                     var lastCmd = this.commands[this.commands.length-1];
// //                     if (typeof lastCmd.promptResponse === "string"){
// //                         this.sendCmd(lastCmd.promptResponse);
// //                         lastCmd.promptResponse = null;
// //                         return;
// //                     }
// // 
// //                     if (lastCmd.commandLineDetected !== true){
// //                         lastCmd.commandLineDetected = dataStr.trim().indexOf(lastCmd.commandLine) === 0;
// //                         return;
// //                     }
// //                     this.commands.pop();
// //                     lastCmd.resolve(dataStr.split(os.EOL));
// //             };
// //             onCommand = onCommand.bind(this); 
//             that.startResolve = startResolve;
// 			that.pythonProc.stdout.on("data", (data)=>{
//                 
//             //this.sendEvent(new OutputEvent("Started3\n"));
//                 that.outputBuffer = that.outputBuffer + data;
//                 var lines = that.outputBuffer.split(os.EOL).reverse().filter(line=>line.length > 0 && line !== os.EOL && line !== "\n").map(line=>line.trim());
//                 if (!that.readyToAcceptCommands){
//                     if (lines.length === 0 ){
//                         return;
//                     }
//                     if (lines[0] === "(Pdb)"){
//                         that.startResolve();
//                         that.readyToAcceptCommands = true;
//                         that.outputBuffer = "";
//                     }
//                     return;
//                 }
//                 //startResolve();
//                 that.sendEvent(new OutputEvent(data + "\n"));
//                 if (that.commands.length === 0){
//                     return;
//                 }
//                 var dataStr = "" + that.outputBuffer;
//                 var lastCmd = that.commands[that.commands.length-1];
//                 if (typeof lastCmd.promptResponse === "string"){
//                     that.sendCmd(lastCmd.promptResponse);
//                     lastCmd.promptResponse = null;
//                     return;
//                 }
// 
//                 if (lastCmd.commandLineDetected !== true){
//                     lastCmd.commandLineDetected = dataStr.trim().indexOf(lastCmd.commandLine) === 0;
//                     that.outputBuffer = "";
//                     return;
//                 }
//                 if (lines.length === 0 ){
//                     return;
//                 }
//                 if (lines[0] === "(Pdb)"){
//                     that.commands.pop();
//                     lastCmd.resolve(dataStr.split(os.EOL));
//                     that.outputBuffer = "";
//                 }        
//             });
// 		}); 
// 
// 		this.startedPromise.then(()=>{
// 			this.createCommand("where").then((data)=>{
// 				this.sendEvent(new OutputEvent("Where Completed\n"));
// 				this.sendEvent(new OutputEvent(data + "\n"));
// 
// 				var stack = parseWhere(data);
//                 this._currentLine = stack.lineNumber - 1;
//                 this.sendResponse(response);
// 
//                 // we stop on the first line
//                 this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
//                 this.sendCommands();
// 				// this._currentLine = stack.lineNumber;
// 				//this.sendEvent(new OutputEvent(JSON.stringify(stack, null, 4) + "\n"));
// 			});
// 		})
// 	}
//     
//     private commandsToSend:ICommandToExecute[] = [];
//     private isExecutingCommand:boolean;
//     private sendCommands(){
//         if (this.commandsToSend.length === 0 || this.isExecutingCommand){
//             return;
//         }
//         
//         this.isExecutingCommand = true;
//         var cmd = this.commandsToSend.shift();
//         this.createCommand(cmd.name).then((data)=>{
// 				var stack = parseWhere(data);
//                 this._currentLine = stack.lineNumber - 1;
//                 if (cmd.responseProtocol){
//                     this.sendResponse(cmd.responseProtocol);
// 				    this.sendEvent(new StoppedEvent("step", MockDebugSession.THREAD_ID));
//                 }
//                 this.isExecutingCommand = false;
//                 this.sendCommands();
// 			},
//             (error)=>{ 
// 				var stack = parseWhere(error);
//                 var ln = this._currentLine = stack.lineNumber - 1;
//                 if (cmd.responseProtocol){
//                     this.sendResponse(cmd.responseProtocol);
//                 }
// 				this.sendEvent(new StoppedEvent("exception", MockDebugSession.THREAD_ID));
// 				this.sendEvent(new OutputEvent(`exception in line: ${ln}\n`, 'stderr'));                
//                 this.isExecutingCommand = false;
//                 this.sendCommands();
//             });
//     }
//     
// 	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
// 
// 		var path = args.source.path;
// 		var clientLines = args.lines;
// 
// 		// read file contents into array for direct access
// 		var lines = readFileSync(path).toString().split('\n');
// 
// 		var newPositions = [clientLines.length];
// 		var breakpoints = [];
// 
// 		// verify breakpoint locations
// 		for (var i = 0; i < clientLines.length; i++) {
// 			var l = this.convertClientLineToDebugger(clientLines[i]);
// 			var verified = false;
// 			if (l < lines.length) {
// 				// if a line starts with '+' we don't allow to set a breakpoint but move the breakpoint down
// 				if (lines[l].indexOf("+") == 0)
// 					l++;
// 				// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
// 				if (lines[l].indexOf("-") == 0)
// 					l--;
// 				verified = true;    // this breakpoint has been validated
// 			}
// 			newPositions[i] = l;
// 			breakpoints.push({ verified: verified, line: this.convertDebuggerLineToClient(l)});
// 		}
// 		this._breakPoints[path] = newPositions;
// 
// 		// send back the actual breakpoints
// 		response.body = {
// 			breakpoints: breakpoints
// 		};
// 		this.sendResponse(response);
// 	}
// 
// 	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
// 
// 		// return the default thread
// 		response.body = {
// 			threads: [
// 				new Thread(MockDebugSession.THREAD_ID, "thread 1")
// 			]
// 		};
// 		this.sendResponse(response);
// 	}
// 
// 	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
// 
// 		const frames = new Array<StackFrame>();
// 		const words = this._sourceLines[this._currentLine].trim().split(/\s+/);
// 		// create three fake stack frames.
// 		for (let i= 0; i < 3; i++) {
// 			// use a word of the line as the stackframe name
// 			const name = words.length > i ? words[i] : "frame";
// 			frames.push(new StackFrame(i, `${name}(${i})`, new Source(basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile)), this.convertDebuggerLineToClient(this._currentLine), 0));
// 		}
// 		response.body = {
// 			stackFrames: frames
// 		};
// 		this.sendResponse(response);
// 	}
// 
// 	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
// 
// 		const frameReference = args.frameId;
// 		const scopes = new Array<Scope>();
// 		scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
// 		scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
// 		scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));
// 
// 		response.body = {
// 			scopes: scopes
// 		};
// 		this.sendResponse(response);
// 	}
// 
// 	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
// 
// 		const variables = [];
// 		const id = this._variableHandles.get(args.variablesReference);
// 		if (id != null) {
// 			variables.push({
// 				name: id + "_i",
// 				value: "123",
// 				variablesReference: 0
// 			});
// 			variables.push({
// 				name: id + "_f",
// 				value: "3.14",
// 				variablesReference: 0
// 			});
// 			variables.push({
// 				name: id + "_s",
// 				value: "hello world",
// 				variablesReference: 0
// 			});
// 			variables.push({
// 				name: id + "_o",
// 				value: "Object",
// 				variablesReference: this._variableHandles.create("object_")
// 			});
// 		}
// 
// 		response.body = {
// 			variables: variables
// 		};
// 		this.sendResponse(response);
// 	}
// 
// 	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
// this.commandsToSend.push({name:"step"});
// this.commandsToSend.push({name:"where", responseProtocol:response});
// this.sendCommands();
// 		// const lines = this._breakPoints[this._sourceFile];
// 		// for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
// 		// 	// is breakpoint on this line?
// 		// 	if (lines && lines.indexOf(ln) >= 0) {
// 		// 		this._currentLine = ln;
// 		// 		this.sendResponse(response);
// 		// 		this.sendEvent(new StoppedEvent("step", MockDebugSession.THREAD_ID));
// 		// 		return;
// 		// 	}
// 		// 	// if word 'exception' found in source -> throw exception
// 		// 	if (this._sourceLines[ln].indexOf("exception") >= 0) {
// 		// 		this._currentLine = ln;
// 		// 		this.sendResponse(response);
// 		// 		this.sendEvent(new StoppedEvent("exception", MockDebugSession.THREAD_ID));
// 		// 		this.sendEvent(new OutputEvent(`exception in line: ${ln}\n`, 'stderr'));
// 		// 		return;
// 		// 	}
// 		// }
// 		// this.sendResponse(response);
// 		// // no more lines: run to end
// 		// this.sendEvent(new TerminatedEvent());
// 	}
// 
// 	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
// this.commandsToSend.push({name:"step"});
// this.commandsToSend.push({name:"where", responseProtocol:response});
// this.sendCommands(); 
// // 
// // 		for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
// // 			if (this._sourceLines[ln].trim().length > 0) {   // find next non-empty line
// // 				this._currentLine = ln;
// // 				this.sendResponse(response);
// // 				this.sendEvent(new StoppedEvent("step", MockDebugSession.THREAD_ID));
// // 				return;
// // 			}
// // 		}
// // 		this.sendResponse(response);
// // 		// no more lines: run to end
// // 		this.sendEvent(new TerminatedEvent());
// 	}
// 
// 	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
// 		response.body = {
// 			result: `evaluate(${args.expression})`,
// 			variablesReference: 0
// 		};
// 		this.sendResponse(response);
// 	}
// }
// 
// DebugSession.run(MockDebugSession);
