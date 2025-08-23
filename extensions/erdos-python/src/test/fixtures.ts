// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from '../client/common/platform/fs-paths';
import { sleep } from '../client/common/utils/async';
import { PYTHON_PATH } from './common';
import { Proc, spawn } from './proc';

export type CleanupFunc = (() => void) | (() => Promise<void>);

export class CleanupFixture {
    private cleanups: CleanupFunc[];
    constructor() {
        this.cleanups = [];
    }

    public addCleanup(cleanup: CleanupFunc) {
        this.cleanups.push(cleanup);
    }
    public addFSCleanup(filename: string) {
        this.addCleanup(async () => {
            try {
                await fs.unlink(filename);
            } catch {
                // The file is already gone.
            }
        });
    }

    public async cleanUp() {
        const cleanups = this.cleanups;
        this.cleanups = [];

        return Promise.all(
            cleanups.map(async (cleanup, i) => {
                try {
                    const res = cleanup();
                    if (res) {
                        await res;
                    }
                } catch (err) {
                    console.error(`cleanup ${i + 1} failed: ${err}`);

                    console.error('moving on...');
                }
            }),
        );
    }
}

export class PythonFixture extends CleanupFixture {
    public readonly python: string;
    constructor(
        // If not provided, we will use the global default.
        python?: string,
    ) {
        super();
        if (python) {
            this.python = python;
        } else {
            this.python = PYTHON_PATH;
        }
    }

    public runScript(filename: string, ...args: string[]): Proc {
        return this.spawn(filename, ...args);
    }

    public runModule(name: string, ...args: string[]): Proc {
        return this.spawn('-m', name, ...args);
    }

    private spawn(...args: string[]) {
        const proc = spawn(this.python, ...args);
        this.addCleanup(async () => {
            if (!proc.exited) {
                await sleep(1000); // Wait a sec before the hammer falls.
                try {
                    proc.raw.kill();
                } catch {
                    // It already finished.
                }
            }
        });
        return proc;
    }
}
