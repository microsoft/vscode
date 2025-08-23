// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ICommandManager } from '../../common/application/types';
import { IDisposableRegistry } from '../../common/types';
import { IExtensionSingleActivationService } from '../types';

// This command is currently used by IntelliCode. This was used to
// trigger MPLS. Since we no longer have MPLS we are going to set
// this command to no-op temporarily until this is removed from
// IntelliCode

@injectable()
export class LoadLanguageServerExtension implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: true, virtualWorkspace: true };

    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}

    public activate(): Promise<void> {
        const disposable = this.commandManager.registerCommand('python._loadLanguageServerExtension', () => {
            /** no-op */
        });
        this.disposables.push(disposable);
        return Promise.resolve();
    }
}
