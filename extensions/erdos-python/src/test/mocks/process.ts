// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { ICurrentProcess } from '../../client/common/types';
import { EnvironmentVariables } from '../../client/common/variables/types';
import { createTypeMoq } from './helper';

@injectable()
export class MockProcess implements ICurrentProcess {
    constructor(public env: EnvironmentVariables = { ...process.env }) {}

    // eslint-disable-next-line @typescript-eslint/ban-types
    public on(_event: string | symbol, _listener: Function): this {
        return this;
    }

    // eslint-disable-next-line class-methods-use-this
    public get argv(): string[] {
        return [];
    }

    // eslint-disable-next-line class-methods-use-this
    public get stdout(): NodeJS.WriteStream {
        return createTypeMoq<NodeJS.WriteStream>().object;
    }

    // eslint-disable-next-line class-methods-use-this
    public get stdin(): NodeJS.ReadStream {
        return createTypeMoq<NodeJS.ReadStream>().object;
    }

    // eslint-disable-next-line class-methods-use-this
    public get execPath(): string {
        return '';
    }
}
