// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import * as sinon from 'sinon';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import * as typemoq from 'typemoq';
import { TextDocument, Uri, WorkspaceFolder } from 'vscode';
import { ExtensionActivationManager } from '../../client/activation/activationManager';
import { IApplicationDiagnostics } from '../../client/application/types';
import { ActiveResourceService } from '../../client/common/application/activeResource';
import { IActiveResourceService, IDocumentManager, IWorkspaceService } from '../../client/common/application/types';
import { WorkspaceService } from '../../client/common/application/workspace';
import { PYTHON_LANGUAGE } from '../../client/common/constants';
import { FileSystem } from '../../client/common/platform/fileSystem';
import { IFileSystem } from '../../client/common/platform/types';
import { IDisposable, IInterpreterPathService } from '../../client/common/types';
import { IInterpreterAutoSelectionService } from '../../client/interpreter/autoSelection/types';
import * as EnvFileTelemetry from '../../client/telemetry/envFileTelemetry';
import { sleep } from '../core';

suite('Activation Manager', () => {
    suite('Language Server Activation - ActivationManager', () => {
        class ExtensionActivationManagerTest extends ExtensionActivationManager {
            public addHandlers() {
                return super.addHandlers();
            }

            public async initialize() {
                return super.initialize();
            }

            public addRemoveDocOpenedHandlers() {
                super.addRemoveDocOpenedHandlers();
            }
        }
        let managerTest: ExtensionActivationManagerTest;
        let workspaceService: IWorkspaceService;
        let appDiagnostics: typemoq.IMock<IApplicationDiagnostics>;
        let autoSelection: typemoq.IMock<IInterpreterAutoSelectionService>;
        let activeResourceService: IActiveResourceService;
        let documentManager: typemoq.IMock<IDocumentManager>;
        let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
        let fileSystem: IFileSystem;
        setup(() => {
            interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>();
            interpreterPathService
                .setup((i) => i.copyOldInterpreterStorageValuesToNew(typemoq.It.isAny()))
                .returns(() => Promise.resolve());
            workspaceService = mock(WorkspaceService);
            activeResourceService = mock(ActiveResourceService);
            appDiagnostics = typemoq.Mock.ofType<IApplicationDiagnostics>();
            autoSelection = typemoq.Mock.ofType<IInterpreterAutoSelectionService>();
            documentManager = typemoq.Mock.ofType<IDocumentManager>();
            fileSystem = mock(FileSystem);
            interpreterPathService
                .setup((i) => i.onDidChange(typemoq.It.isAny()))
                .returns(() => typemoq.Mock.ofType<IDisposable>().object);
            when(workspaceService.isTrusted).thenReturn(true);
            when(workspaceService.isVirtualWorkspace).thenReturn(false);
            managerTest = new ExtensionActivationManagerTest(
                [],
                [],
                documentManager.object,
                autoSelection.object,
                appDiagnostics.object,
                instance(workspaceService),
                instance(fileSystem),
                instance(activeResourceService),
                interpreterPathService.object,
            );

            sinon.stub(EnvFileTelemetry, 'sendActivationTelemetry').resolves();
        });

        teardown(() => {
            sinon.restore();
        });

        test('If running in a virtual workspace, do not activate services that do not support it', async () => {
            when(workspaceService.isVirtualWorkspace).thenReturn(true);
            const resource = Uri.parse('two');
            const workspaceFolder = {
                index: 0,
                name: 'one',
                uri: resource,
            };
            when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);

            autoSelection
                .setup((a) => a.autoSelectInterpreter(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            appDiagnostics
                .setup((a) => a.performPreStartupHealthCheck(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());

            managerTest = new ExtensionActivationManagerTest(
                [],
                [],
                documentManager.object,
                autoSelection.object,
                appDiagnostics.object,
                instance(workspaceService),
                instance(fileSystem),
                instance(activeResourceService),
                interpreterPathService.object,
            );
            await managerTest.activateWorkspace(resource);

            autoSelection.verifyAll();
            appDiagnostics.verifyAll();
        });

        test('If running in a untrusted workspace, do not activate services that do not support it', async () => {
            when(workspaceService.isTrusted).thenReturn(false);
            const resource = Uri.parse('two');
            const workspaceFolder = {
                index: 0,
                name: 'one',
                uri: resource,
            };
            when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);

            autoSelection
                .setup((a) => a.autoSelectInterpreter(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.never());
            appDiagnostics
                .setup((a) => a.performPreStartupHealthCheck(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());

            managerTest = new ExtensionActivationManagerTest(
                [],
                [],
                documentManager.object,
                autoSelection.object,
                appDiagnostics.object,
                instance(workspaceService),
                instance(fileSystem),
                instance(activeResourceService),
                interpreterPathService.object,
            );
            await managerTest.activateWorkspace(resource);

            appDiagnostics.verifyAll();
        });

        test('Otherwise activate all services filtering to the current resource', async () => {
            const resource = Uri.parse('two');

            autoSelection
                .setup((a) => a.autoSelectInterpreter(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            appDiagnostics
                .setup((a) => a.performPreStartupHealthCheck(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());

            const workspaceFolder = {
                index: 0,
                name: 'one',
                uri: resource,
            };
            when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);

            await managerTest.activateWorkspace(resource);

            autoSelection.verifyAll();
            appDiagnostics.verifyAll();
        });

        test('Initialize will add event handlers and will dispose them when running dispose', async () => {
            const disposable = typemoq.Mock.ofType<IDisposable>();
            const disposable2 = typemoq.Mock.ofType<IDisposable>();
            when(workspaceService.onDidChangeWorkspaceFolders).thenReturn(() => disposable.object);
            when(workspaceService.workspaceFolders).thenReturn([
                (1 as unknown) as WorkspaceFolder,
                (2 as unknown) as WorkspaceFolder,
            ]);
            const eventDef = () => disposable2.object;
            documentManager
                .setup((d) => d.onDidOpenTextDocument)
                .returns(() => eventDef)
                .verifiable(typemoq.Times.once());

            await managerTest.initialize();

            verify(workspaceService.workspaceFolders).once();
            verify(workspaceService.onDidChangeWorkspaceFolders).once();

            documentManager.verifyAll();

            disposable.setup((d) => d.dispose()).verifiable(typemoq.Times.once());
            disposable2.setup((d) => d.dispose()).verifiable(typemoq.Times.once());

            managerTest.dispose();

            disposable.verifyAll();
            disposable2.verifyAll();
        });
        test('Remove text document opened handler if there is only one workspace', async () => {
            const disposable = typemoq.Mock.ofType<IDisposable>();
            const disposable2 = typemoq.Mock.ofType<IDisposable>();
            when(workspaceService.onDidChangeWorkspaceFolders).thenReturn(() => disposable.object);
            when(workspaceService.workspaceFolders).thenReturn([
                (1 as unknown) as WorkspaceFolder,
                (2 as unknown) as WorkspaceFolder,
            ]);
            const eventDef = () => disposable2.object;
            documentManager
                .setup((d) => d.onDidOpenTextDocument)
                .returns(() => eventDef)
                .verifiable(typemoq.Times.once());
            disposable.setup((d) => d.dispose());
            disposable2.setup((d) => d.dispose());

            await managerTest.initialize();

            verify(workspaceService.workspaceFolders).once();
            verify(workspaceService.onDidChangeWorkspaceFolders).once();
            documentManager.verifyAll();
            disposable.verify((d) => d.dispose(), typemoq.Times.never());
            disposable2.verify((d) => d.dispose(), typemoq.Times.never());

            when(workspaceService.workspaceFolders).thenReturn([]);

            await managerTest.initialize();

            disposable.verify((d) => d.dispose(), typemoq.Times.never());
            disposable2.verify((d) => d.dispose(), typemoq.Times.once());

            managerTest.dispose();

            disposable.verify((d) => d.dispose(), typemoq.Times.atLeast(1));
            disposable2.verify((d) => d.dispose(), typemoq.Times.once());
        });
        test('Activate workspace specific to the resource in case of Multiple workspaces when a file is opened', async () => {
            const disposable1 = typemoq.Mock.ofType<IDisposable>();
            const disposable2 = typemoq.Mock.ofType<IDisposable>();
            let fileOpenedHandler!: (e: TextDocument) => Promise<void>;
            // eslint-disable-next-line @typescript-eslint/ban-types
            let workspaceFoldersChangedHandler!: Function;
            const documentUri = Uri.file('a');
            const document = typemoq.Mock.ofType<TextDocument>();
            document.setup((d) => d.uri).returns(() => documentUri);
            document.setup((d) => d.languageId).returns(() => PYTHON_LANGUAGE);

            when(workspaceService.onDidChangeWorkspaceFolders).thenReturn((cb) => {
                workspaceFoldersChangedHandler = cb;
                return disposable1.object;
            });
            documentManager
                .setup((w) => w.onDidOpenTextDocument(typemoq.It.isAny(), typemoq.It.isAny()))
                .callback((cb) => {
                    fileOpenedHandler = cb;
                })
                .returns(() => disposable2.object)
                .verifiable(typemoq.Times.once());

            const resource = Uri.parse('two');
            const folder1 = { name: 'one', uri: Uri.parse('one'), index: 1 };
            const folder2 = { name: 'two', uri: resource, index: 2 };
            when(workspaceService.getWorkspaceFolderIdentifier(anything(), anything())).thenReturn('one');
            when(workspaceService.workspaceFolders).thenReturn([folder1, folder2]);
            when(workspaceService.getWorkspaceFolder(document.object.uri)).thenReturn(folder2);

            when(workspaceService.getWorkspaceFolder(resource)).thenReturn(folder2);
            autoSelection
                .setup((a) => a.autoSelectInterpreter(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            appDiagnostics
                .setup((a) => a.performPreStartupHealthCheck(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            // Add workspaceFoldersChangedHandler
            managerTest.addHandlers();
            expect(workspaceFoldersChangedHandler).not.to.be.equal(undefined, 'Handler not set');

            // Add fileOpenedHandler
            workspaceFoldersChangedHandler.call(managerTest);
            expect(fileOpenedHandler).not.to.be.equal(undefined, 'Handler not set');

            // Check if activate workspace is called on opening a file
            await fileOpenedHandler.call(managerTest, document.object);
            await sleep(1);

            documentManager.verifyAll();
            verify(workspaceService.onDidChangeWorkspaceFolders).once();
            verify(workspaceService.workspaceFolders).atLeast(1);
            verify(workspaceService.getWorkspaceFolder(anything())).atLeast(1);
        });

        test("The same workspace isn't activated more than once", async () => {
            const resource = Uri.parse('two');

            autoSelection
                .setup((a) => a.autoSelectInterpreter(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            appDiagnostics
                .setup((a) => a.performPreStartupHealthCheck(resource))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            const workspaceFolder = {
                index: 0,
                name: 'one',
                uri: resource,
            };
            when(workspaceService.getWorkspaceFolder(resource)).thenReturn(workspaceFolder);

            await managerTest.activateWorkspace(resource);
            await managerTest.activateWorkspace(resource);

            autoSelection.verifyAll();
            appDiagnostics.verifyAll();
        });

        test('If doc opened is not python, return', async () => {
            const doc = {
                uri: Uri.parse('doc'),
                languageId: 'NOT PYTHON',
            };

            managerTest.onDocOpened((doc as unknown) as TextDocument);
            verify(workspaceService.getWorkspaceFolderIdentifier(doc.uri, anything())).never();
        });

        test('If we have opened a doc that does not belong to workspace, then do nothing', async () => {
            const doc = {
                uri: Uri.parse('doc'),
                languageId: PYTHON_LANGUAGE,
            };
            when(workspaceService.getWorkspaceFolderIdentifier(doc.uri, anything())).thenReturn('');

            managerTest.onDocOpened((doc as unknown) as TextDocument);

            verify(workspaceService.getWorkspaceFolderIdentifier(doc.uri, anything())).once();
            verify(workspaceService.getWorkspaceFolder(doc.uri)).once();
        });

        test('If workspace corresponding to the doc has already been activated, then do nothing', async () => {
            const doc = {
                uri: Uri.parse('doc'),
                languageId: PYTHON_LANGUAGE,
            };
            when(workspaceService.getWorkspaceFolderIdentifier(doc.uri, anything())).thenReturn('key');
            managerTest.activatedWorkspaces.add('key');

            managerTest.onDocOpened((doc as unknown) as TextDocument);

            verify(workspaceService.getWorkspaceFolderIdentifier(doc.uri, anything())).once();
            verify(workspaceService.getWorkspaceFolder(doc.uri)).never();
        });

        test('List of activated workspaces is updated & Handler docOpenedHandler is disposed in case no. of workspace folders decreases to one', async () => {
            const disposable1 = typemoq.Mock.ofType<IDisposable>();
            const disposable2 = typemoq.Mock.ofType<IDisposable>();
            let docOpenedHandler!: (e: TextDocument) => Promise<void>;
            // eslint-disable-next-line @typescript-eslint/ban-types
            let workspaceFoldersChangedHandler!: Function;
            const documentUri = Uri.file('a');
            const document = typemoq.Mock.ofType<TextDocument>();
            document.setup((d) => d.uri).returns(() => documentUri);

            when(workspaceService.onDidChangeWorkspaceFolders).thenReturn((cb) => {
                workspaceFoldersChangedHandler = cb;
                return disposable1.object;
            });
            documentManager
                .setup((w) => w.onDidOpenTextDocument(typemoq.It.isAny(), typemoq.It.isAny()))
                .callback((cb) => {
                    docOpenedHandler = cb;
                })
                .returns(() => disposable2.object)
                .verifiable(typemoq.Times.once());

            const resource = Uri.parse('two');
            const folder1 = { name: 'one', uri: Uri.parse('one'), index: 1 };
            const folder2 = { name: 'two', uri: resource, index: 2 };
            when(workspaceService.workspaceFolders).thenReturn([folder1, folder2]);

            when(workspaceService.getWorkspaceFolderIdentifier(folder1.uri, anything())).thenReturn('one');
            when(workspaceService.getWorkspaceFolderIdentifier(folder2.uri, anything())).thenReturn('two');
            // Assume the two workspaces are already activated, so their keys will be present in `activatedWorkspaces` set
            managerTest.activatedWorkspaces.add('one');
            managerTest.activatedWorkspaces.add('two');

            // Add workspaceFoldersChangedHandler
            managerTest.addHandlers();
            expect(workspaceFoldersChangedHandler).not.to.be.equal(undefined, 'Handler not set');

            // Add docOpenedHandler
            workspaceFoldersChangedHandler.call(managerTest);
            expect(docOpenedHandler).not.to.be.equal(undefined, 'Handler not set');

            documentManager.verifyAll();
            verify(workspaceService.onDidChangeWorkspaceFolders).once();
            verify(workspaceService.workspaceFolders).atLeast(1);

            // Removed no. of folders to one
            when(workspaceService.workspaceFolders).thenReturn([folder1]);
            disposable2.setup((d) => d.dispose()).verifiable(typemoq.Times.once());

            workspaceFoldersChangedHandler.call(managerTest);

            verify(workspaceService.workspaceFolders).atLeast(1);
            disposable2.verifyAll();

            assert.deepEqual(Array.from(managerTest.activatedWorkspaces.keys()), ['one']);
        });
    });
});
