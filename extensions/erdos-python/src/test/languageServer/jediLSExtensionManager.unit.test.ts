// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { ILanguageServerOutputChannel } from '../../client/activation/types';
import { IWorkspaceService, ICommandManager } from '../../client/common/application/types';
import { IExperimentService, IConfigurationService, IInterpreterPathService } from '../../client/common/types';
import { IEnvironmentVariablesProvider } from '../../client/common/variables/types';
import { IInterpreterService } from '../../client/interpreter/contracts';
import { IServiceContainer } from '../../client/ioc/types';
import { JediLSExtensionManager } from '../../client/languageServer/jediLSExtensionManager';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';

suite('Language Server - Jedi LS extension manager', () => {
    let manager: JediLSExtensionManager;

    setup(() => {
        manager = new JediLSExtensionManager(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {} as IExperimentService,
            {} as IWorkspaceService,
            {} as IConfigurationService,
            {} as IInterpreterPathService,
            {} as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
        );
    });

    test('Constructor should create a client proxy, a server manager and a server proxy', () => {
        assert.notStrictEqual(manager.clientFactory, undefined);
        assert.notStrictEqual(manager.serverManager, undefined);
    });

    test('canStartLanguageServer should return true if an interpreter is passed in', () => {
        const result = manager.canStartLanguageServer(({
            path: 'path/to/interpreter',
        } as unknown) as PythonEnvironment);

        assert.strictEqual(result, true);
    });

    test('canStartLanguageServer should return false otherwise', () => {
        const result = manager.canStartLanguageServer(undefined);

        assert.strictEqual(result, false);
    });
});
