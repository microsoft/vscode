import { parentPort, workerData } from 'worker_threads';
import { _workerShellExecImpl } from './workerRawProcessApis';

_workerShellExecImpl(workerData.command, workerData.options, workerData.defaultEnv)
    .then((res) => {
        if (!parentPort) {
            throw new Error('Not in a worker thread');
        }
        parentPort.postMessage({ res });
    })
    .catch((ex) => {
        if (!parentPort) {
            throw new Error('Not in a worker thread');
        }
        parentPort.postMessage({ ex });
    });
