// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Terminal, Uri } from 'vscode';
import { IActiveResourceService, ITerminalManager } from '../common/application/types';
import { ITerminalActivator } from '../common/terminal/types';
import { IDisposable, IDisposableRegistry } from '../common/types';
import { ITerminalAutoActivation } from './types';

@injectable()
export class TerminalAutoActivation implements ITerminalAutoActivation {
    private handler?: IDisposable;

    private readonly terminalsNotToAutoActivate = new WeakSet<Terminal>();

    constructor(
        @inject(ITerminalManager)
        private readonly terminalManager: ITerminalManager,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
        @inject(ITerminalActivator) private readonly activator: ITerminalActivator,
        @inject(IActiveResourceService)
        private readonly activeResourceService: IActiveResourceService,
    ) {
        disposableRegistry.push(this);
    }

    public dispose(): void {
        if (this.handler) {
            this.handler.dispose();
            this.handler = undefined;
        }
    }

    public register(): void {
        if (this.handler) {
            return;
        }
        this.handler = this.terminalManager.onDidOpenTerminal(this.activateTerminal, this);
    }

    public disableAutoActivation(terminal: Terminal): void {
        this.terminalsNotToAutoActivate.add(terminal);
    }

    private async activateTerminal(terminal: Terminal): Promise<void> {
        if (this.terminalsNotToAutoActivate.has(terminal)) {
            return;
        }
        if ('hideFromUser' in terminal.creationOptions && terminal.creationOptions.hideFromUser) {
            return;
        }

        const cwd =
            'cwd' in terminal.creationOptions
                ? terminal.creationOptions.cwd
                : this.activeResourceService.getActiveResource();
        const resource = typeof cwd === 'string' ? Uri.file(cwd) : cwd;

        await this.activator.activateEnvironmentInTerminal(terminal, {
            resource,
        });
    }
}
