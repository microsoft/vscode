/* eslint-disable max-classes-per-file */
/*
 * cancellationUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Helper methods around cancellation
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    CancellationReceiverStrategy,
    CancellationSenderStrategy,
    CancellationStrategy,
    Disposable,
    MessageConnection,
} from 'vscode-languageclient/node';

type CancellationId = string | number;

function getCancellationFolderPath(folderName: string) {
    return path.join(os.tmpdir(), 'python-languageserver-cancellation', folderName);
}

function getCancellationFilePath(folderName: string, id: CancellationId) {
    return path.join(getCancellationFolderPath(folderName), `cancellation-${String(id)}.tmp`);
}

function tryRun(callback: () => void) {
    try {
        callback();
    } catch (e) {
        // No body.
    }
}

class FileCancellationSenderStrategy implements CancellationSenderStrategy {
    constructor(readonly folderName: string) {
        const folder = getCancellationFolderPath(folderName)!;
        tryRun(() => fs.mkdirSync(folder, { recursive: true }));
    }

    public async sendCancellation(_: MessageConnection, id: CancellationId) {
        const file = getCancellationFilePath(this.folderName, id);
        tryRun(() => fs.writeFileSync(file, '', { flag: 'w' }));
    }

    public cleanup(id: CancellationId): void {
        tryRun(() => fs.unlinkSync(getCancellationFilePath(this.folderName, id)));
    }

    public dispose(): void {
        const folder = getCancellationFolderPath(this.folderName);
        tryRun(() => rimraf(folder));

        function rimraf(location: string) {
            const stat = fs.lstatSync(location);
            if (stat) {
                if (stat.isDirectory() && !stat.isSymbolicLink()) {
                    for (const dir of fs.readdirSync(location)) {
                        rimraf(path.join(location, dir));
                    }

                    fs.rmdirSync(location);
                } else {
                    fs.unlinkSync(location);
                }
            }
        }
    }
}

export class FileBasedCancellationStrategy implements CancellationStrategy, Disposable {
    private _sender: FileCancellationSenderStrategy;

    constructor() {
        const folderName = randomBytes(21).toString('hex');
        this._sender = new FileCancellationSenderStrategy(folderName);
    }

    // eslint-disable-next-line class-methods-use-this
    get receiver(): CancellationReceiverStrategy {
        return CancellationReceiverStrategy.Message;
    }

    get sender(): CancellationSenderStrategy {
        return this._sender;
    }

    public getCommandLineArguments(): string[] {
        return [`--cancellationReceive=file:${this._sender.folderName}`];
    }

    public dispose(): void {
        this._sender.dispose();
    }
}
