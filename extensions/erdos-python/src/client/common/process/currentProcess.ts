// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { injectable } from 'inversify';
import { ICurrentProcess } from '../types';
import { EnvironmentVariables } from '../variables/types';

@injectable()
export class CurrentProcess implements ICurrentProcess {
    public on = (event: string | symbol, listener: Function): this => {
        process.on(event as any, listener as any);
        return process as any;
    };
    public get env(): EnvironmentVariables {
        return (process.env as any) as EnvironmentVariables;
    }
    public get argv(): string[] {
        return process.argv;
    }
    public get stdout(): NodeJS.WriteStream {
        return process.stdout;
    }
    public get stdin(): NodeJS.ReadStream {
        return process.stdin;
    }

    public get execPath(): string {
        return process.execPath;
    }
}
