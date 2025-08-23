// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import * as os from 'os';
import { coerce, SemVer } from 'semver';
import { getSearchPathEnvVarNames } from '../utils/exec';
import { Architecture, getArchitecture, getOSType, isWindows, OSType } from '../utils/platform';
import { parseSemVerSafe } from '../utils/version';
import { IPlatformService } from './types';

@injectable()
export class PlatformService implements IPlatformService {
    public readonly osType: OSType = getOSType();

    public version?: SemVer;

    public get pathVariableName(): 'Path' | 'PATH' {
        return getSearchPathEnvVarNames(this.osType)[0];
    }

    public get virtualEnvBinName(): 'Scripts' | 'bin' {
        return this.isWindows ? 'Scripts' : 'bin';
    }

    public async getVersion(): Promise<SemVer> {
        if (this.version) {
            return this.version;
        }
        switch (this.osType) {
            case OSType.Windows:
            case OSType.OSX:
                // Release section of https://en.wikipedia.org/wiki/MacOS_Sierra.
                // Version 10.12 maps to Darwin 16.0.0.
                // Using os.relase() we get the darwin release #.
                try {
                    const ver = coerce(os.release());
                    if (ver) {
                        this.version = ver;
                        return this.version;
                    }
                    throw new Error('Unable to parse version');
                } catch (ex) {
                    return parseSemVerSafe(os.release());
                }
            default:
                throw new Error('Not Supported');
        }
    }

    // eslint-disable-next-line class-methods-use-this
    public get isWindows(): boolean {
        return isWindows();
    }

    public get isMac(): boolean {
        return this.osType === OSType.OSX;
    }

    public get isLinux(): boolean {
        return this.osType === OSType.Linux;
    }

    // eslint-disable-next-line class-methods-use-this
    public get osRelease(): string {
        return os.release();
    }

    // eslint-disable-next-line class-methods-use-this
    public get is64bit(): boolean {
        return getArchitecture() === Architecture.x64;
    }
}
