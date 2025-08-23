// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as sinon from 'sinon';
import * as path from 'path';
import { Uri } from 'vscode';
import { assert } from 'chai';
import * as fs from '../../../../../client/common/platform/fs-paths';
import { getConfigurationsForWorkspace } from '../../../../../client/debugger/extension/configuration/launch.json/launchJsonReader';
import * as vscodeApis from '../../../../../client/common/vscodeApis/workspaceApis';

suite('Launch Json Reader', () => {
    let pathExistsStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;
    const workspacePath = 'path/to/workspace';
    const workspaceFolder = {
        name: 'workspace',
        uri: Uri.file(workspacePath),
        index: 0,
    };

    setup(() => {
        pathExistsStub = sinon.stub(fs, 'pathExists');
        readFileStub = sinon.stub(fs, 'readFile');
        getConfigurationStub = sinon.stub(vscodeApis, 'getConfiguration');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Return the config in the launch.json file', async () => {
        const launchPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
        pathExistsStub.withArgs(launchPath).resolves(true);
        const launchJson = `{
            "version": "0.1.0",
            "configurations": [
                {
                    "name": "Python: Launch.json",
                    "type": "python",
                    "request": "launch",
                    "purpose": ["debug-test"],
                },
            ]
        }`;
        readFileStub.withArgs(launchPath, 'utf-8').returns(launchJson);

        const config = await getConfigurationsForWorkspace(workspaceFolder);

        assert.deepStrictEqual(config, [
            {
                name: 'Python: Launch.json',
                type: 'python',
                request: 'launch',
                purpose: ['debug-test'],
            },
        ]);
    });

    test('If there is no launch.json return the config in the workspace file', async () => {
        getConfigurationStub.withArgs('launch').returns({
            configurations: [
                {
                    name: 'Python: Workspace File',
                    type: 'python',
                    request: 'launch',
                    purpose: ['debug-test'],
                },
            ],
        });

        const config = await getConfigurationsForWorkspace(workspaceFolder);

        assert.deepStrictEqual(config, [
            {
                name: 'Python: Workspace File',
                type: 'python',
                request: 'launch',
                purpose: ['debug-test'],
            },
        ]);
    });
});
