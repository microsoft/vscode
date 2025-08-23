import * as path from 'path';
import * as ch from 'child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { Disposable, Event, EventEmitter, window } from 'vscode';
import { EXTENSION_ROOT_DIR } from '../constants';
import { traceError, traceLog } from '../logging';
import { captureTelemetry } from '../telemetry';
import { EventName } from '../telemetry/constants';

const SERVER_PATH = path.join(EXTENSION_ROOT_DIR, 'python_files', 'python_server.py');
let serverInstance: PythonServer | undefined;
export interface ExecutionResult {
    status: boolean;
    output: string;
}

export interface PythonServer extends Disposable {
    onCodeExecuted: Event<void>;
    execute(code: string): Promise<ExecutionResult | undefined>;
    executeSilently(code: string): Promise<ExecutionResult | undefined>;
    interrupt(): void;
    input(): void;
    checkValidCommand(code: string): Promise<boolean>;
}

class PythonServerImpl implements PythonServer, Disposable {
    private readonly disposables: Disposable[] = [];

    private readonly _onCodeExecuted = new EventEmitter<void>();

    onCodeExecuted = this._onCodeExecuted.event;

    constructor(private connection: rpc.MessageConnection, private pythonServer: ch.ChildProcess) {
        this.initialize();
        this.input();
    }

    private initialize(): void {
        this.disposables.push(
            this.connection.onNotification('log', (message: string) => {
                traceLog('Log:', message);
            }),
        );
        this.connection.listen();
    }

    public input(): void {
        // Register input request handler
        this.connection.onRequest('input', async (request) => {
            // Ask for user input via popup quick input, send it back to Python
            let userPrompt = 'Enter your input here: ';
            if (request && request.prompt) {
                userPrompt = request.prompt;
            }
            const input = await window.showInputBox({
                title: 'Input Request',
                prompt: userPrompt,
                ignoreFocusOut: true,
            });
            return { userInput: input };
        });
    }

    @captureTelemetry(EventName.EXECUTION_CODE, { scope: 'selection' }, false)
    public async execute(code: string): Promise<ExecutionResult | undefined> {
        const result = await this.executeCode(code);
        if (result?.status) {
            this._onCodeExecuted.fire();
        }
        return result;
    }

    public executeSilently(code: string): Promise<ExecutionResult | undefined> {
        return this.executeCode(code);
    }

    private async executeCode(code: string): Promise<ExecutionResult | undefined> {
        try {
            const result = await this.connection.sendRequest('execute', code);
            return result as ExecutionResult;
        } catch (err) {
            const error = err as Error;
            traceError(`Error getting response from REPL server:`, error);
        }
        return undefined;
    }

    public interrupt(): void {
        // Passing SIGINT to interrupt only would work for Mac and Linux
        if (this.pythonServer.kill('SIGINT')) {
            traceLog('Python REPL server interrupted');
        }
    }

    public async checkValidCommand(code: string): Promise<boolean> {
        const completeCode: ExecutionResult = await this.connection.sendRequest('check_valid_command', code);
        if (completeCode.output === 'True') {
            return new Promise((resolve) => resolve(true));
        }
        return new Promise((resolve) => resolve(false));
    }

    public dispose(): void {
        this.connection.sendNotification('exit');
        this.disposables.forEach((d) => d.dispose());
        this.connection.dispose();
        serverInstance = undefined;
    }
}

export function createPythonServer(interpreter: string[], cwd?: string): PythonServer {
    if (serverInstance) {
        return serverInstance;
    }

    const pythonServer = ch.spawn(interpreter[0], [...interpreter.slice(1), SERVER_PATH], {
        cwd, // Launch with correct workspace directory
    });

    pythonServer.stderr.on('data', (data) => {
        traceError(data.toString());
    });
    pythonServer.on('exit', (code) => {
        traceError(`Python server exited with code ${code}`);
    });
    pythonServer.on('error', (err) => {
        traceError(err);
    });
    const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(pythonServer.stdout),
        new rpc.StreamMessageWriter(pythonServer.stdin),
    );
    serverInstance = new PythonServerImpl(connection, pythonServer);
    return serverInstance;
}
