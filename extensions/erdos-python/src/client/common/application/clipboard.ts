// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { env } from 'vscode';
import { IClipboard } from './types';

@injectable()
export class ClipboardService implements IClipboard {
    public async readText(): Promise<string> {
        return env.clipboard.readText();
    }
    public async writeText(value: string): Promise<void> {
        await env.clipboard.writeText(value);
    }
}
