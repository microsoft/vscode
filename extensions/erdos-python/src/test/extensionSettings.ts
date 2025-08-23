/* eslint-disable global-require */
/* eslint-disable class-methods-use-this */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Event, Uri } from 'vscode';
import { IApplicationEnvironment } from '../client/common/application/types';
import { WorkspaceService } from '../client/common/application/workspace';
import { InterpreterPathService } from '../client/common/interpreterPathService';
import { PersistentStateFactory } from '../client/common/persistentState';
import { IPythonSettings, Resource } from '../client/common/types';
import { PythonEnvironment } from '../client/pythonEnvironments/info';
import { MockMemento } from './mocks/mementos';
import { MockExtensions } from './mocks/extensions';

export function getExtensionSettings(resource: Uri | undefined): IPythonSettings {
    const vscode = require('vscode') as typeof import('vscode');
    class AutoSelectionService {
        get onDidChangeAutoSelectedInterpreter(): Event<void> {
            return new vscode.EventEmitter<void>().event;
        }

        public autoSelectInterpreter(_resource: Resource): Promise<void> {
            return Promise.resolve();
        }

        public getAutoSelectedInterpreter(_resource: Resource): PythonEnvironment | undefined {
            return undefined;
        }

        public async setWorkspaceInterpreter(
            _resource: Uri,
            _interpreter: PythonEnvironment | undefined,
        ): Promise<void> {
            return undefined;
        }
    }
    const pythonSettings = require('../client/common/configSettings') as typeof import('../client/common/configSettings');
    const workspaceService = new WorkspaceService();
    const workspaceMemento = new MockMemento();
    const globalMemento = new MockMemento();
    const persistentStateFactory = new PersistentStateFactory(globalMemento, workspaceMemento);
    const extensions = new MockExtensions();
    return pythonSettings.PythonSettings.getInstance(
        resource,
        new AutoSelectionService(),
        workspaceService,
        new InterpreterPathService(persistentStateFactory, workspaceService, [], {
            remoteName: undefined,
        } as IApplicationEnvironment),
        undefined,
        extensions,
    );
}
