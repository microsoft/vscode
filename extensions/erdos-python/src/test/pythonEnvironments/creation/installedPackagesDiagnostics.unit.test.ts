// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { assert, use as chaiUse } from 'chai';
import { Diagnostic, DiagnosticCollection, TextEditor, Range, Uri, TextDocument } from 'vscode';
import * as cmdApis from '../../../client/common/vscodeApis/commandApis';
import * as workspaceApis from '../../../client/common/vscodeApis/workspaceApis';
import * as languageApis from '../../../client/common/vscodeApis/languageApis';
import * as windowApis from '../../../client/common/vscodeApis/windowApis';
import { IDisposableRegistry } from '../../../client/common/types';
import * as installUtils from '../../../client/pythonEnvironments/creation/common/installCheckUtils';
import {
    DEPS_NOT_INSTALLED_KEY,
    registerInstalledPackagesDiagnosticsProvider,
} from '../../../client/pythonEnvironments/creation/installedPackagesDiagnostic';
import { IInterpreterService } from '../../../client/interpreter/contracts';

chaiUse(chaiAsPromised.default);

class FakeDisposable {
    public dispose() {
        // Do nothing
    }
}

const MISSING_PACKAGES: Diagnostic[] = [
    {
        range: new Range(8, 34, 8, 44),
        message: 'Package `flake8-csv` is not installed in the selected environment.',
        source: 'Python-InstalledPackagesChecker',
        code: { value: 'not-installed', target: Uri.parse(`https://pypi.org/p/flake8-csv`) },
        severity: 3,
        relatedInformation: [],
    },
];

function getSomeFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'something.py';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile.setup((p) => p.getText(typemoq.It.isAny())).returns(() => 'print("Hello World")');
    return someFile;
}

function getSomeRequirementFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'requirements.txt';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.languageId).returns(() => 'pip-requirements');
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile.setup((p) => p.getText(typemoq.It.isAny())).returns(() => 'flake8-csv');
    return someFile;
}

function getPyProjectTomlFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'pyproject.toml';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.languageId).returns(() => 'toml');
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile
        .setup((p) => p.getText(typemoq.It.isAny()))
        .returns(
            () =>
                '[build-system]\nrequires = ["flit_core >=3.2,<4"]\nbuild-backend = "flit_core.buildapi"\n\n[project]\nname = "something"\nversion = "2023.0.0"\nrequires-python = ">=3.8"\ndependencies = ["attrs>=21.3.0", "flake8-csv"]\n    ',
        );
    return someFile;
}

function getSomeTomlFile(): typemoq.IMock<TextDocument> {
    const someFilePath = 'something.toml';
    const someFile = typemoq.Mock.ofType<TextDocument>();
    someFile.setup((p) => p.languageId).returns(() => 'toml');
    someFile.setup((p) => p.fileName).returns(() => someFilePath);
    someFile
        .setup((p) => p.getText(typemoq.It.isAny()))
        .returns(
            () =>
                '[build-system]\nrequires = ["flit_core >=3.2,<4"]\nbuild-backend = "flit_core.buildapi"\n\n[something]\nname = "something"\nversion = "2023.0.0"\nrequires-python = ">=3.8"\ndependencies = ["attrs>=21.3.0", "flake8-csv"]\n    ',
        );
    return someFile;
}

suite('Create Env content button settings tests', () => {
    let executeCommandStub: sinon.SinonStub;
    const disposables: IDisposableRegistry = [];
    let getOpenTextDocumentsStub: sinon.SinonStub;
    let onDidOpenTextDocumentStub: sinon.SinonStub;
    let onDidSaveTextDocumentStub: sinon.SinonStub;
    let onDidCloseTextDocumentStub: sinon.SinonStub;
    let onDidChangeDiagnosticsStub: sinon.SinonStub;
    let onDidChangeActiveTextEditorStub: sinon.SinonStub;
    let createDiagnosticCollectionStub: sinon.SinonStub;
    let diagnosticCollection: typemoq.IMock<DiagnosticCollection>;
    let getActiveTextEditorStub: sinon.SinonStub;
    let textEditor: typemoq.IMock<TextEditor>;
    let getInstalledPackagesDiagnosticsStub: sinon.SinonStub;
    let interpreterService: typemoq.IMock<IInterpreterService>;

    setup(() => {
        executeCommandStub = sinon.stub(cmdApis, 'executeCommand');

        getOpenTextDocumentsStub = sinon.stub(workspaceApis, 'getOpenTextDocuments');
        getOpenTextDocumentsStub.returns([]);

        onDidOpenTextDocumentStub = sinon.stub(workspaceApis, 'onDidOpenTextDocument');
        onDidSaveTextDocumentStub = sinon.stub(workspaceApis, 'onDidSaveTextDocument');
        onDidCloseTextDocumentStub = sinon.stub(workspaceApis, 'onDidCloseTextDocument');
        onDidOpenTextDocumentStub.returns(new FakeDisposable());
        onDidSaveTextDocumentStub.returns(new FakeDisposable());
        onDidCloseTextDocumentStub.returns(new FakeDisposable());

        onDidChangeDiagnosticsStub = sinon.stub(languageApis, 'onDidChangeDiagnostics');
        onDidChangeDiagnosticsStub.returns(new FakeDisposable());
        createDiagnosticCollectionStub = sinon.stub(languageApis, 'createDiagnosticCollection');
        diagnosticCollection = typemoq.Mock.ofType<DiagnosticCollection>();
        diagnosticCollection.setup((d) => d.set(typemoq.It.isAny(), typemoq.It.isAny())).returns(() => undefined);
        diagnosticCollection.setup((d) => d.clear()).returns(() => undefined);
        diagnosticCollection.setup((d) => d.delete(typemoq.It.isAny())).returns(() => undefined);
        diagnosticCollection.setup((d) => d.has(typemoq.It.isAny())).returns(() => false);
        createDiagnosticCollectionStub.returns(diagnosticCollection.object);

        onDidChangeActiveTextEditorStub = sinon.stub(windowApis, 'onDidChangeActiveTextEditor');
        onDidChangeActiveTextEditorStub.returns(new FakeDisposable());
        getActiveTextEditorStub = sinon.stub(windowApis, 'getActiveTextEditor');
        textEditor = typemoq.Mock.ofType<TextEditor>();
        getActiveTextEditorStub.returns(textEditor.object);

        getInstalledPackagesDiagnosticsStub = sinon.stub(installUtils, 'getInstalledPackagesDiagnostics');
        interpreterService = typemoq.Mock.ofType<IInterpreterService>();
        interpreterService
            .setup((i) => i.onDidChangeInterpreter(typemoq.It.isAny(), undefined, undefined))
            .returns(() => new FakeDisposable());
    });

    teardown(() => {
        sinon.restore();
        disposables.forEach((d) => d.dispose());
    });

    test('Ensure nothing is run if there are no open documents', () => {
        registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
        assert.ok(executeCommandStub.notCalled);
        assert.ok(getInstalledPackagesDiagnosticsStub.notCalled);
    });

    test('Should not run packages check if opened files are not dep files', () => {
        const someFile = getSomeFile();
        const someTomlFile = getSomeTomlFile();
        getOpenTextDocumentsStub.returns([someFile.object, someTomlFile.object]);
        registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
        assert.ok(executeCommandStub.notCalled);
        assert.ok(getInstalledPackagesDiagnosticsStub.notCalled);
    });

    test('Should run packages check if opened files are dep files', () => {
        const reqFile = getSomeRequirementFile();
        const tomlFile = getPyProjectTomlFile();
        getOpenTextDocumentsStub.returns([reqFile.object, tomlFile.object]);
        registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
        assert.ok(getInstalledPackagesDiagnosticsStub.calledTwice);
    });

    [getSomeRequirementFile().object, getPyProjectTomlFile().object].forEach((file) => {
        test(`Should run packages check on open of a dep file: ${file.fileName}`, () => {
            let handler: (doc: TextDocument) => void = () => {
                /* do nothing */
            };
            onDidOpenTextDocumentStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
            getInstalledPackagesDiagnosticsStub.reset();

            getInstalledPackagesDiagnosticsStub.returns(Promise.resolve(MISSING_PACKAGES));

            handler(file);
            assert.ok(getInstalledPackagesDiagnosticsStub.calledOnce);
        });

        test(`Should run packages check on save of a dep file: ${file.fileName}`, () => {
            let handler: (doc: TextDocument) => void = () => {
                /* do nothing */
            };
            onDidSaveTextDocumentStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
            getInstalledPackagesDiagnosticsStub.reset();

            getInstalledPackagesDiagnosticsStub.returns(Promise.resolve(MISSING_PACKAGES));

            handler(file);
            assert.ok(getInstalledPackagesDiagnosticsStub.calledOnce);
        });

        test(`Should run packages check on close of a dep file: ${file.fileName}`, () => {
            let handler: (doc: TextDocument) => void = () => {
                /* do nothing */
            };
            onDidCloseTextDocumentStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);

            diagnosticCollection.reset();
            diagnosticCollection.setup((d) => d.delete(typemoq.It.isAny())).verifiable(typemoq.Times.once());
            diagnosticCollection
                .setup((d) => d.has(typemoq.It.isAny()))
                .returns(() => true)
                .verifiable(typemoq.Times.once());

            handler(file);
            diagnosticCollection.verifyAll();
        });

        test(`Should trigger a context update on active editor switch to dep file: ${file.fileName}`, () => {
            let handler: () => void = () => {
                /* do nothing */
            };
            onDidChangeActiveTextEditorStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);

            getActiveTextEditorStub.returns({ document: file });
            diagnosticCollection.setup((d) => d.get(typemoq.It.isAny())).returns(() => MISSING_PACKAGES);

            handler();
            assert.ok(executeCommandStub.calledOnceWithExactly('setContext', DEPS_NOT_INSTALLED_KEY, true));
        });

        test(`Should trigger a context update to true on diagnostic change to dep file: ${file.fileName}`, () => {
            let handler: () => void = () => {
                /* do nothing */
            };
            onDidChangeDiagnosticsStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);

            getActiveTextEditorStub.returns({ document: file });
            diagnosticCollection.setup((d) => d.get(typemoq.It.isAny())).returns(() => MISSING_PACKAGES);

            handler();
            assert.ok(executeCommandStub.calledOnceWithExactly('setContext', DEPS_NOT_INSTALLED_KEY, true));
        });
    });

    [getSomeFile().object, getSomeTomlFile().object].forEach((file) => {
        test(`Should not run packages check on open of a non dep file: ${file.fileName}`, () => {
            let handler: (doc: TextDocument) => void = () => {
                /* do nothing */
            };
            onDidOpenTextDocumentStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
            getInstalledPackagesDiagnosticsStub.reset();

            getInstalledPackagesDiagnosticsStub.returns(Promise.resolve(MISSING_PACKAGES));

            handler(file);
            assert.ok(getInstalledPackagesDiagnosticsStub.notCalled);
        });

        test(`Should not run packages check on save of a non dep file: ${file.fileName}`, () => {
            let handler: (doc: TextDocument) => void = () => {
                /* do nothing */
            };
            onDidSaveTextDocumentStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);
            getInstalledPackagesDiagnosticsStub.reset();

            getInstalledPackagesDiagnosticsStub.returns(Promise.resolve(MISSING_PACKAGES));

            handler(file);
            assert.ok(getInstalledPackagesDiagnosticsStub.notCalled);
        });

        test(`Should trigger a context update on active editor switch to non-dep file: ${file.fileName}`, () => {
            let handler: () => void = () => {
                /* do nothing */
            };
            onDidChangeActiveTextEditorStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);

            getActiveTextEditorStub.returns({ document: file });
            diagnosticCollection.setup((d) => d.get(typemoq.It.isAny())).returns(() => []);

            handler();
            assert.ok(executeCommandStub.calledOnceWithExactly('setContext', DEPS_NOT_INSTALLED_KEY, false));
        });

        test(`Should trigger a context update to false on diagnostic change to non-dep file: ${file.fileName}`, () => {
            let handler: () => void = () => {
                /* do nothing */
            };
            onDidChangeDiagnosticsStub.callsFake((callback) => {
                handler = callback;
                return new FakeDisposable();
            });

            registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService.object);

            getActiveTextEditorStub.returns({ document: file });
            diagnosticCollection.setup((d) => d.get(typemoq.It.isAny())).returns(() => []);

            handler();
            assert.ok(executeCommandStub.calledOnceWithExactly('setContext', DEPS_NOT_INSTALLED_KEY, false));
        });
    });
});
