// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import { TextDocument } from 'vscode';
import * as cmdApis from '../../../client/common/vscodeApis/commandApis';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import { IDisposableRegistry } from '../../../client/common/types';
import { registerPyProjectTomlFeatures } from '../../../client/pythonEnvironments/creation/pyProjectTomlContext';

chaiUse(chaiAsPromised.default);

class FakeDisposable {
    public dispose() {
        // Do nothing
    }
}

function getInstallableToml(): typemoq.IMock<TextDocument> {
    const pyprojectTomlPath = 'pyproject.toml';
    const pyprojectToml = typemoq.Mock.ofType<TextDocument>();
    pyprojectToml.setup((p) => p.fileName).returns(() => pyprojectTomlPath);
    pyprojectToml
        .setup((p) => p.getText(typemoq.It.isAny()))
        .returns(
            () =>
                '[project]\nname = "spam"\nversion = "2020.0.0"\n[build-system]\nrequires = ["setuptools ~= 58.0", "cython ~= 0.29.0"]\n[project.optional-dependencies]\ntest = ["pytest"]\ndoc = ["sphinx", "furo"]',
        );
    return pyprojectToml;
}

function getNonInstallableToml(): typemoq.IMock<TextDocument> {
    const pyprojectTomlPath = 'pyproject.toml';
    const pyprojectToml = typemoq.Mock.ofType<TextDocument>();
    pyprojectToml.setup((p) => p.fileName).returns(() => pyprojectTomlPath);
    pyprojectToml
        .setup((p) => p.getText(typemoq.It.isAny()))
        .returns(() => '[project]\nname = "spam"\nversion = "2020.0.0"\n');
    return pyprojectToml;
}

function getSomeFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'something.py';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile.setup((p) => p.getText(typemoq.It.isAny())).returns(() => 'print("Hello World")');
    return someFile;
}

suite('PyProject.toml Create Env Features', () => {
    let executeCommandStub: sinon.SinonStub;
    const disposables: IDisposableRegistry = [];
    let getOpenTextDocumentsStub: sinon.SinonStub;
    let onDidOpenTextDocumentStub: sinon.SinonStub;
    let onDidSaveTextDocumentStub: sinon.SinonStub;

    setup(() => {
        executeCommandStub = sinon.stub(cmdApis, 'executeCommand');
        getOpenTextDocumentsStub = sinon.stub(workspaceApis, 'getOpenTextDocuments');
        onDidOpenTextDocumentStub = sinon.stub(workspaceApis, 'onDidOpenTextDocument');
        onDidSaveTextDocumentStub = sinon.stub(workspaceApis, 'onDidSaveTextDocument');

        onDidOpenTextDocumentStub.returns(new FakeDisposable());
        onDidSaveTextDocumentStub.returns(new FakeDisposable());
    });

    teardown(() => {
        sinon.restore();
        disposables.forEach((d) => d.dispose());
    });

    test('Installable pyproject.toml is already open in the editor on extension activate', async () => {
        const pyprojectToml = getInstallableToml();
        getOpenTextDocumentsStub.returns([pyprojectToml.object]);

        registerPyProjectTomlFeatures(disposables);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', true));
    });

    test('Non installable pyproject.toml is already open in the editor on extension activate', async () => {
        const pyprojectToml = getNonInstallableToml();
        getOpenTextDocumentsStub.returns([pyprojectToml.object]);

        registerPyProjectTomlFeatures(disposables);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
    });

    test('Some random file open in the editor on extension activate', async () => {
        const someFile = getSomeFile();
        getOpenTextDocumentsStub.returns([someFile.object]);

        registerPyProjectTomlFeatures(disposables);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
    });

    test('Installable pyproject.toml is opened in the editor', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (doc: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidOpenTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const pyprojectToml = getInstallableToml();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.neverCalledWith('setContext', 'pipInstallableToml', true));

        handler(pyprojectToml.object);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', true));
    });

    test('Non Installable pyproject.toml is opened in the editor', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (doc: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidOpenTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const pyprojectToml = getNonInstallableToml();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        handler(pyprojectToml.object);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
    });

    test('Some random file is opened in the editor', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (doc: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidOpenTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const someFile = getSomeFile();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        handler(someFile.object);

        assert.ok(executeCommandStub.neverCalledWith('setContext', 'pipInstallableToml', false));
    });

    test('Installable pyproject.toml is changed', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (d: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidSaveTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const pyprojectToml = getInstallableToml();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));

        handler(pyprojectToml.object);

        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', true));
    });

    test('Non Installable pyproject.toml is changed', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (d: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidSaveTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const pyprojectToml = getNonInstallableToml();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        handler(pyprojectToml.object);

        assert.ok(executeCommandStub.calledOnceWithExactly('setContext', 'pipInstallableToml', false));
    });

    test('Non Installable pyproject.toml is changed to Installable', async () => {
        getOpenTextDocumentsStub.returns([]);

        let openHandler: (doc: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidOpenTextDocumentStub.callsFake((callback) => {
            openHandler = callback;
            return new FakeDisposable();
        });

        let changeHandler: (d: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidSaveTextDocumentStub.callsFake((callback) => {
            changeHandler = callback;
            return new FakeDisposable();
        });

        const nonInatallablePyprojectToml = getNonInstallableToml();
        const installablePyprojectToml = getInstallableToml();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        openHandler(nonInatallablePyprojectToml.object);
        assert.ok(executeCommandStub.calledOnceWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        changeHandler(installablePyprojectToml.object);

        assert.ok(executeCommandStub.calledOnceWithExactly('setContext', 'pipInstallableToml', true));
    });

    test('Some random file is changed', async () => {
        getOpenTextDocumentsStub.returns([]);

        let handler: (d: TextDocument) => void = () => {
            /* do nothing */
        };
        onDidSaveTextDocumentStub.callsFake((callback) => {
            handler = callback;
            return new FakeDisposable();
        });

        const someFile = getSomeFile();

        registerPyProjectTomlFeatures(disposables);
        assert.ok(executeCommandStub.calledWithExactly('setContext', 'pipInstallableToml', false));
        executeCommandStub.reset();

        handler(someFile.object);

        assert.ok(executeCommandStub.notCalled);
    });
});
