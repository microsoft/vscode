// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IApplicationShell, ICommandManager } from '../../../common/application/types';
import { Commands } from '../../../common/constants';
import { IPlatformService } from '../../../common/platform/types';
import { IProcessServiceFactory } from '../../../common/process/types';
import { IDisposableRegistry } from '../../../common/types';
import { AttachPicker } from './picker';
import { AttachProcessProvider } from './provider';
import { IAttachProcessProviderFactory } from './types';

@injectable()
export class AttachProcessProviderFactory implements IAttachProcessProviderFactory {
    constructor(
        @inject(IApplicationShell) private readonly applicationShell: IApplicationShell,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IProcessServiceFactory) private readonly processServiceFactory: IProcessServiceFactory,
        @inject(IDisposableRegistry) private readonly disposableRegistry: IDisposableRegistry,
    ) {}

    public registerCommands() {
        const provider = new AttachProcessProvider(this.platformService, this.processServiceFactory);
        const picker = new AttachPicker(this.applicationShell, provider);
        const disposable = this.commandManager.registerCommand(
            Commands.PickLocalProcess,
            () => picker.showQuickPick(),
            this,
        );
        this.disposableRegistry.push(disposable);
    }
}
