import { RegistryItem } from 'winreg';
import { parentPort, workerData } from 'worker_threads';
import { IRegistryValue } from './windowsRegistry';

const WinReg = require('winreg');

const regKey = new WinReg(workerData);

function copyRegistryValues(values: IRegistryValue[]): IRegistryValue[] {
    // Use the map function to create a new array with copies of the specified properties.
    return values.map((value) => ({
        hive: value.hive,
        arch: value.arch,
        key: value.key,
        name: value.name,
        type: value.type,
        value: value.value,
    }));
}

regKey.values((err: Error, res: RegistryItem[]) => {
    if (!parentPort) {
        throw new Error('Not in a worker thread');
    }
    const messageRes = copyRegistryValues(res);
    parentPort.postMessage({ err, res: messageRes });
});
