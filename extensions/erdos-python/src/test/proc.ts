// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as cp from 'child_process';
import { sleep } from '../client/common/utils/async';

type OutStream = 'stdout' | 'stderr';

export class ProcOutput {
    private readonly output: [OutStream, Buffer][] = [];
    public get stdout(): string {
        return this.dump('stdout');
    }
    public get stderr(): string {
        return this.dump('stderr');
    }
    public get combined(): string {
        return this.dump();
    }
    public addStdout(data: Buffer) {
        this.output.push(['stdout', data]);
    }
    public addStderr(data: Buffer) {
        this.output.push(['stdout', data]);
    }
    private dump(which?: OutStream) {
        let out = '';
        for (const [stream, data] of this.output) {
            if (!which || which !== stream) {
                continue;
            }
            out += data.toString();
        }
        return out;
    }
}

export type ProcResult = {
    exitCode: number;
    stdout: string;
};

interface IRawProc extends cp.ChildProcess {
    // Apparently the type declaration doesn't expose exitCode.
    // See: https://nodejs.org/api/child_process.html#child_process_subprocess_exitcode
    exitCode: number | null;
}

export class Proc {
    public readonly raw: IRawProc;
    private readonly output: ProcOutput;
    private result: ProcResult | undefined;
    constructor(raw: cp.ChildProcess, output: ProcOutput) {
        this.raw = (raw as unknown) as IRawProc;
        this.output = output;
    }
    public get pid(): number | undefined {
        return this.raw.pid;
    }
    public get exited(): boolean {
        return this.raw.exitCode !== null;
    }
    public async waitUntilDone(): Promise<ProcResult> {
        if (this.result) {
            return this.result;
        }
        while (this.raw.exitCode === null) {
            await sleep(10); // milliseconds
        }
        this.result = {
            exitCode: this.raw.exitCode,
            stdout: this.output.stdout,
        };
        return this.result;
    }
}

export function spawn(executable: string, ...args: string[]) {
    // Un-comment this to see the executed command:
    //console.log(`|${executable} ${args.join(' ')}|`);
    const output = new ProcOutput();
    const raw = cp.spawn(executable, args);
    raw.stdout.on('data', (data: Buffer) => output.addStdout(data));
    raw.stderr.on('data', (data: Buffer) => output.addStderr(data));
    return new Proc(raw, output);
}
