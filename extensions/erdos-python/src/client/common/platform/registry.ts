import { injectable } from 'inversify';
import { Options } from 'winreg';
import { traceError } from '../../logging';
import { Architecture } from '../utils/platform';
import { IRegistry, RegistryHive } from './types';

enum RegistryArchitectures {
    x86 = 'x86',
    x64 = 'x64',
}

@injectable()
export class RegistryImplementation implements IRegistry {
    public async getKeys(key: string, hive: RegistryHive, arch?: Architecture) {
        return getRegistryKeys({ hive: translateHive(hive)!, arch: translateArchitecture(arch), key }).catch((ex) => {
            traceError('Fetching keys from windows registry resulted in an error', ex);
            return [];
        });
    }
    public async getValue(key: string, hive: RegistryHive, arch?: Architecture, name: string = '') {
        return getRegistryValue({ hive: translateHive(hive)!, arch: translateArchitecture(arch), key }, name).catch(
            (ex) => {
                traceError('Fetching key value from windows registry resulted in an error', ex);
                return undefined;
            },
        );
    }
}

export function getArchitectureDisplayName(arch?: Architecture) {
    switch (arch) {
        case Architecture.x64:
            return '64-bit';
        case Architecture.x86:
            return '32-bit';
        default:
            return '';
    }
}

async function getRegistryValue(options: Options, name: string = '') {
    const Registry = require('winreg') as typeof import('winreg');
    return new Promise<string | undefined | null>((resolve) => {
        new Registry(options).get(name, (error, result) => {
            if (error || !result || typeof result.value !== 'string') {
                return resolve(undefined);
            }
            resolve(result.value);
        });
    });
}

async function getRegistryKeys(options: Options): Promise<string[]> {
    const Registry = require('winreg') as typeof import('winreg');
    // https://github.com/python/peps/blob/master/pep-0514.txt#L85
    return new Promise<string[]>((resolve) => {
        new Registry(options).keys((error, result) => {
            if (error || !Array.isArray(result)) {
                return resolve([]);
            }
            resolve(result.filter((item) => typeof item.key === 'string').map((item) => item.key));
        });
    });
}
function translateArchitecture(arch?: Architecture): RegistryArchitectures | undefined {
    switch (arch) {
        case Architecture.x86:
            return RegistryArchitectures.x86;
        case Architecture.x64:
            return RegistryArchitectures.x64;
        default:
            return;
    }
}
function translateHive(hive: RegistryHive): string | undefined {
    const Registry = require('winreg') as typeof import('winreg');
    switch (hive) {
        case RegistryHive.HKCU:
            return Registry.HKCU;
        case RegistryHive.HKLM:
            return Registry.HKLM;
        default:
            return;
    }
}
