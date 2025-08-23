// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Worker } from 'worker_threads';
import * as path from 'path';
import { traceVerbose, traceError } from '../../../logging/index';

/**
 * Executes a worker file. Make sure to declare the worker file as a entry in the webpack config.
 * @param workerFileName Filename of the worker file to execute, it has to end with ".worker.js" for webpack to bundle it.
 * @param workerData Arguments to the worker file.
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export async function executeWorkerFile(workerFileName: string, workerData: any): Promise<any> {
    if (!workerFileName.endsWith('.worker.js')) {
        throw new Error('Worker file must end with ".worker.js" for webpack to bundle webworkers');
    }
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerFileName, { workerData });
        const id = worker.threadId;
        traceVerbose(
            `Worker id ${id} for file ${path.basename(workerFileName)} with data ${JSON.stringify(workerData)}`,
        );
        worker.on('message', (msg: { err: Error; res: unknown }) => {
            if (msg.err) {
                reject(msg.err);
            }
            resolve(msg.res);
        });
        worker.on('error', (ex: Error) => {
            traceError(`Error in worker ${workerFileName}`, ex);
            reject(ex);
        });
        worker.on('exit', (code) => {
            traceVerbose(`Worker id ${id} exited with code ${code}`);
            if (code !== 0) {
                reject(new Error(`Worker ${workerFileName} stopped with exit code ${code}`));
            }
        });
    });
}
