// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Event, EventEmitter, Uri } from 'vscode';
import { IDisposableRegistry, Resource } from '../../common/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { IInterpreterAutoSelectionProxyService } from './types';

@injectable()
export class InterpreterAutoSelectionProxyService implements IInterpreterAutoSelectionProxyService {
    private readonly didAutoSelectedInterpreterEmitter = new EventEmitter<void>();

    private instance?: IInterpreterAutoSelectionProxyService;

    constructor(@inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry) {}

    public registerInstance(instance: IInterpreterAutoSelectionProxyService): void {
        this.instance = instance;
        this.disposables.push(
            this.instance.onDidChangeAutoSelectedInterpreter(() => this.didAutoSelectedInterpreterEmitter.fire()),
        );
    }

    public get onDidChangeAutoSelectedInterpreter(): Event<void> {
        return this.didAutoSelectedInterpreterEmitter.event;
    }

    public getAutoSelectedInterpreter(resource: Resource): PythonEnvironment | undefined {
        return this.instance ? this.instance.getAutoSelectedInterpreter(resource) : undefined;
    }

    public async setWorkspaceInterpreter(resource: Uri, interpreter: PythonEnvironment | undefined): Promise<void> {
        return this.instance ? this.instance.setWorkspaceInterpreter(resource, interpreter) : undefined;
    }
}
