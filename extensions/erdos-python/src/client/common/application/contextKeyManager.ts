// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ExtensionContextKey } from './contextKeys';
import { ICommandManager, IContextKeyManager } from './types';

@injectable()
export class ContextKeyManager implements IContextKeyManager {
    private values: Map<ExtensionContextKey, boolean> = new Map();

    constructor(@inject(ICommandManager) private readonly commandManager: ICommandManager) {}

    public async setContext(key: ExtensionContextKey, value: boolean): Promise<void> {
        if (this.values.get(key) === value) {
            return Promise.resolve();
        }
        this.values.set(key, value);
        return this.commandManager.executeCommand('setContext', key, value);
    }
}
