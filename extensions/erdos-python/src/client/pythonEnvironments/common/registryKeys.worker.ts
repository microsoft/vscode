import { Registry } from 'winreg';
import { parentPort, workerData } from 'worker_threads';
import { IRegistryKey } from './windowsRegistry';

const WinReg = require('winreg');

const regKey = new WinReg(workerData);

function copyRegistryKeys(keys: IRegistryKey[]): IRegistryKey[] {
    // Use the map function to create a new array with copies of the specified properties.
    return keys.map((key) => ({
        hive: key.hive,
        arch: key.arch,
        key: key.key,
    }));
}

regKey.keys((err: Error, res: Registry[]) => {
    if (!parentPort) {
        throw new Error('Not in a worker thread');
    }
    const messageRes = copyRegistryKeys(res);
    parentPort.postMessage({ err, res: messageRes });
});
