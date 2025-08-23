// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { Event, EventEmitter } from 'vscode';
import { Resource } from '../../client/common/types';
import {
    IInterpreterAutoSelectionService,
    IInterpreterAutoSelectionProxyService,
} from '../../client/interpreter/autoSelection/types';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';

@injectable()
export class MockAutoSelectionService
    implements IInterpreterAutoSelectionService, IInterpreterAutoSelectionProxyService {
    // eslint-disable-next-line class-methods-use-this
    public async setWorkspaceInterpreter(_resource: Resource, _interpreter: PythonEnvironment): Promise<void> {
        return Promise.resolve();
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
    public async setGlobalInterpreter(_interpreter: PythonEnvironment): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    get onDidChangeAutoSelectedInterpreter(): Event<void> {
        return new EventEmitter<void>().event;
    }

    // eslint-disable-next-line class-methods-use-this
    public autoSelectInterpreter(_resource: Resource): Promise<void> {
        return Promise.resolve();
    }

    // eslint-disable-next-line class-methods-use-this
    public getAutoSelectedInterpreter(_resource: Resource): PythonEnvironment | undefined {
        return undefined;
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
    public registerInstance(_instance: IInterpreterAutoSelectionProxyService): void {}
}
