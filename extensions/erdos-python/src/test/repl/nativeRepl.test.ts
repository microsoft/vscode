// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable no-unused-expressions */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { Disposable, EventEmitter, NotebookDocument, Uri } from 'vscode';
import { expect } from 'chai';

import { IInterpreterService } from '../../client/interpreter/contracts';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';
import * as NativeReplModule from '../../client/repl/nativeRepl';
import * as persistentState from '../../client/common/persistentState';
import * as PythonServer from '../../client/repl/pythonServer';
import * as vscodeWorkspaceApis from '../../client/common/vscodeApis/workspaceApis';
import * as replController from '../../client/repl/replController';
import { executeCommand } from '../../client/common/vscodeApis/commandApis';

suite('REPL - Native REPL', () => {
    let interpreterService: TypeMoq.IMock<IInterpreterService>;

    let disposable: TypeMoq.IMock<Disposable>;
    let disposableArray: Disposable[] = [];
    let setReplDirectoryStub: sinon.SinonStub;
    let setReplControllerSpy: sinon.SinonSpy;
    let getWorkspaceStateValueStub: sinon.SinonStub;
    let updateWorkspaceStateValueStub: sinon.SinonStub;
    let createReplControllerStub: sinon.SinonStub;
    let mockNotebookController: any;

    setup(() => {
        (NativeReplModule as any).nativeRepl = undefined;

        mockNotebookController = {
            id: 'mockController',
            dispose: sinon.stub(),
            updateNotebookAffinity: sinon.stub(),
            createNotebookCellExecution: sinon.stub(),
            variableProvider: null,
        };

        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        disposable = TypeMoq.Mock.ofType<Disposable>();
        disposableArray = [disposable.object];

        createReplControllerStub = sinon.stub(replController, 'createReplController').returns(mockNotebookController);
        setReplDirectoryStub = sinon.stub(NativeReplModule.NativeRepl.prototype as any, 'setReplDirectory').resolves();
        setReplControllerSpy = sinon.spy(NativeReplModule.NativeRepl.prototype, 'setReplController');
        updateWorkspaceStateValueStub = sinon.stub(persistentState, 'updateWorkspaceStateValue').resolves();
    });

    teardown(async () => {
        disposableArray.forEach((d) => {
            if (d) {
                d.dispose();
            }
        });
        disposableArray = [];
        sinon.restore();
        executeCommand('workbench.action.closeActiveEditor');
    });

    test('getNativeRepl should call create constructor', async () => {
        const createMethodStub = sinon.stub(NativeReplModule.NativeRepl, 'create');
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        const interpreter = await interpreterService.object.getActiveInterpreter();
        await NativeReplModule.getNativeRepl(interpreter as PythonEnvironment, disposableArray);

        expect(createMethodStub.calledOnce).to.be.true;
    });

    test('sendToNativeRepl should look for memento URI if notebook document is undefined', async () => {
        getWorkspaceStateValueStub = sinon.stub(persistentState, 'getWorkspaceStateValue').returns(undefined);
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        const interpreter = await interpreterService.object.getActiveInterpreter();
        const nativeRepl = await NativeReplModule.getNativeRepl(interpreter as PythonEnvironment, disposableArray);

        nativeRepl.sendToNativeRepl(undefined, false);

        expect(getWorkspaceStateValueStub.calledOnce).to.be.true;
    });

    test('sendToNativeRepl should call updateWorkspaceStateValue', async () => {
        getWorkspaceStateValueStub = sinon.stub(persistentState, 'getWorkspaceStateValue').returns('myNameIsMemento');
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        const interpreter = await interpreterService.object.getActiveInterpreter();
        const nativeRepl = await NativeReplModule.getNativeRepl(interpreter as PythonEnvironment, disposableArray);

        nativeRepl.sendToNativeRepl(undefined, false);

        expect(updateWorkspaceStateValueStub.calledOnce).to.be.true;
    });

    test('create should call setReplDirectory, setReplController', async () => {
        const interpreter = await interpreterService.object.getActiveInterpreter();
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));

        await NativeReplModule.NativeRepl.create(interpreter as PythonEnvironment);

        expect(setReplDirectoryStub.calledOnce).to.be.true;
        expect(setReplControllerSpy.calledOnce).to.be.true;
        expect(createReplControllerStub.calledOnce).to.be.true;
    });

    test('watchNotebookClosed should clean up resources when notebook is closed', async () => {
        const notebookCloseEmitter = new EventEmitter<NotebookDocument>();
        sinon.stub(vscodeWorkspaceApis, 'onDidCloseNotebookDocument').callsFake((handler) => {
            const disposable = notebookCloseEmitter.event(handler);
            return disposable;
        });

        const mockPythonServer = {
            onCodeExecuted: new EventEmitter<void>().event,
            execute: sinon.stub().resolves({ status: true, output: 'test output' }),
            executeSilently: sinon.stub().resolves({ status: true, output: 'test output' }),
            interrupt: sinon.stub(),
            input: sinon.stub(),
            checkValidCommand: sinon.stub().resolves(true),
            dispose: sinon.stub(),
        };

        // Track the number of times createPythonServer was called
        let createPythonServerCallCount = 0;
        sinon.stub(PythonServer, 'createPythonServer').callsFake(() => {
            // eslint-disable-next-line no-plusplus
            createPythonServerCallCount++;
            return mockPythonServer;
        });

        const interpreter = await interpreterService.object.getActiveInterpreter();

        // Create NativeRepl directly to have more control over its state, go around private constructor.
        const nativeRepl = new (NativeReplModule.NativeRepl as any)();
        nativeRepl.interpreter = interpreter as PythonEnvironment;
        nativeRepl.cwd = '/helloJustMockedCwd/cwd';
        nativeRepl.pythonServer = mockPythonServer;
        nativeRepl.replController = mockNotebookController;
        nativeRepl.disposables = [];

        // Make the singleton point to our instance for testing
        // Otherwise, it gets mixed with Native Repl from .create from test above.
        (NativeReplModule as any).nativeRepl = nativeRepl;

        // Reset call count after initial setup
        createPythonServerCallCount = 0;

        // Set notebookDocument to a mock document
        const mockReplUri = Uri.parse('untitled:Untitled-999.ipynb?jupyter-notebook');
        const mockNotebookDocument = ({
            uri: mockReplUri,
            toString: () => mockReplUri.toString(),
        } as unknown) as NotebookDocument;

        nativeRepl.notebookDocument = mockNotebookDocument;

        // Create a mock notebook document for closing event with same URI
        const closingNotebookDocument = ({
            uri: mockReplUri,
            toString: () => mockReplUri.toString(),
        } as unknown) as NotebookDocument;

        notebookCloseEmitter.fire(closingNotebookDocument);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(
            updateWorkspaceStateValueStub.calledWith(NativeReplModule.NATIVE_REPL_URI_MEMENTO, undefined),
            'updateWorkspaceStateValue should be called with NATIVE_REPL_URI_MEMENTO and undefined',
        ).to.be.true;
        expect(mockPythonServer.dispose.calledOnce, 'pythonServer.dispose() should be called once').to.be.true;
        expect(createPythonServerCallCount, 'createPythonServer should be called to create a new server').to.equal(1);
        expect(nativeRepl.notebookDocument, 'notebookDocument should be undefined after closing').to.be.undefined;
        expect(nativeRepl.newReplSession, 'newReplSession should be set to true after closing').to.be.true;
        expect(mockNotebookController.dispose.calledOnce, 'replController.dispose() should be called once').to.be.true;
    });
});
