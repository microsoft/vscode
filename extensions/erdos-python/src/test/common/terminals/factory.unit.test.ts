// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { Disposable, Uri, WorkspaceFolder } from 'vscode';
import { ITerminalManager, IWorkspaceService } from '../../../client/common/application/types';
import { IFileSystem } from '../../../client/common/platform/types';
import { TerminalServiceFactory } from '../../../client/common/terminal/factory';
import { TerminalService } from '../../../client/common/terminal/service';
import { SynchronousTerminalService } from '../../../client/common/terminal/syncTerminalService';
import { ITerminalHelper, ITerminalServiceFactory } from '../../../client/common/terminal/types';
import { IDisposableRegistry } from '../../../client/common/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';

suite('Terminal Service Factory', () => {
    let factory: ITerminalServiceFactory;
    let disposables: Disposable[] = [];
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let fs: TypeMoq.IMock<IFileSystem>;
    setup(() => {
        const serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        const interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        fs = TypeMoq.Mock.ofType<IFileSystem>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterService), TypeMoq.It.isAny()))
            .returns(() => interpreterService.object);
        disposables = [];
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IDisposableRegistry), TypeMoq.It.isAny()))
            .returns(() => disposables);
        const terminalHelper = TypeMoq.Mock.ofType<ITerminalHelper>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(ITerminalHelper), TypeMoq.It.isAny()))
            .returns(() => terminalHelper.object);
        const terminalManager = TypeMoq.Mock.ofType<ITerminalManager>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(ITerminalManager), TypeMoq.It.isAny()))
            .returns(() => terminalManager.object);
        factory = new TerminalServiceFactory(serviceContainer.object, fs.object, interpreterService.object);

        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IWorkspaceService), TypeMoq.It.isAny()))
            .returns(() => workspaceService.object);
    });
    teardown(() => {
        disposables.forEach((disposable) => {
            if (disposable) {
                disposable.dispose();
            }
        });
    });

    test('Ensure same instance of terminal service is returned', () => {
        const instance = factory.getTerminalService({}) as SynchronousTerminalService;
        const sameInstance =
            (factory.getTerminalService({}) as SynchronousTerminalService).terminalService === instance.terminalService;
        expect(sameInstance).to.equal(true, 'Instances are not the same');

        const differentInstance = factory.getTerminalService({ resource: undefined, title: 'New Title' });
        const notTheSameInstance = differentInstance === instance;
        expect(notTheSameInstance).not.to.equal(true, 'Instances are the same');
    });

    test('Ensure different instance of terminal service is returned when title is provided', () => {
        const defaultInstance = factory.getTerminalService({});
        expect(defaultInstance instanceof SynchronousTerminalService).to.equal(
            true,
            'Not an instance of Terminal service',
        );

        const notSameAsDefaultInstance =
            factory.getTerminalService({ resource: undefined, title: 'New Title' }) === defaultInstance;
        expect(notSameAsDefaultInstance).to.not.equal(true, 'Instances are the same as default instance');

        const instance = factory.getTerminalService({
            resource: undefined,
            title: 'New Title',
        }) as SynchronousTerminalService;
        const sameInstance =
            (factory.getTerminalService({ resource: undefined, title: 'New Title' }) as SynchronousTerminalService)
                .terminalService === instance.terminalService;
        expect(sameInstance).to.equal(true, 'Instances are not the same');

        const differentInstance = factory.getTerminalService({ resource: undefined, title: 'Another New Title' });
        const notTheSameInstance = differentInstance === instance;
        expect(notTheSameInstance).not.to.equal(true, 'Instances are the same');
    });

    test('Ensure different instance of terminal services are created', () => {
        const instance1 = factory.createTerminalService();
        expect(instance1 instanceof TerminalService).to.equal(true, 'Not an instance of Terminal service');

        const notSameAsFirstInstance = factory.createTerminalService() === instance1;
        expect(notSameAsFirstInstance).to.not.equal(true, 'Instances are the same');

        const instance2 = factory.createTerminalService(Uri.file('a'), 'Title');
        const notSameAsSecondInstance = instance1 === instance2;
        expect(notSameAsSecondInstance).to.not.equal(true, 'Instances are the same');

        const instance3 = factory.createTerminalService(Uri.file('a'), 'Title');
        const notSameAsThirdInstance = instance2 === instance3;
        expect(notSameAsThirdInstance).to.not.equal(true, 'Instances are the same');
    });

    test('Ensure same terminal is returned when using different resources from the same workspace', () => {
        const file1A = Uri.file('1a');
        const file2A = Uri.file('2a');
        const fileB = Uri.file('b');
        const workspaceUriA = Uri.file('A');
        const workspaceUriB = Uri.file('B');
        const workspaceFolderA = TypeMoq.Mock.ofType<WorkspaceFolder>();
        workspaceFolderA.setup((w) => w.uri).returns(() => workspaceUriA);
        const workspaceFolderB = TypeMoq.Mock.ofType<WorkspaceFolder>();
        workspaceFolderB.setup((w) => w.uri).returns(() => workspaceUriB);

        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(file1A)))
            .returns(() => workspaceFolderA.object);
        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(file2A)))
            .returns(() => workspaceFolderA.object);
        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(fileB)))
            .returns(() => workspaceFolderB.object);

        const terminalForFile1A = factory.getTerminalService({ resource: file1A }) as SynchronousTerminalService;
        const terminalForFile2A = factory.getTerminalService({ resource: file2A }) as SynchronousTerminalService;
        const terminalForFileB = factory.getTerminalService({ resource: fileB }) as SynchronousTerminalService;

        const terminalsAreSameForWorkspaceA = terminalForFile1A.terminalService === terminalForFile2A.terminalService;
        expect(terminalsAreSameForWorkspaceA).to.equal(true, 'Instances are not the same for Workspace A');

        const terminalsForWorkspaceABAreDifferent =
            terminalForFile1A.terminalService === terminalForFileB.terminalService;
        expect(terminalsForWorkspaceABAreDifferent).to.equal(
            false,
            'Instances should be different for different workspaces',
        );
    });

    test('When `newTerminalPerFile` is true, ensure different terminal is returned when using different resources from the same workspace', () => {
        const file1A = Uri.file('1a');
        const file2A = Uri.file('2a');
        const fileB = Uri.file('b');
        const workspaceUriA = Uri.file('A');
        const workspaceUriB = Uri.file('B');
        const workspaceFolderA = TypeMoq.Mock.ofType<WorkspaceFolder>();
        workspaceFolderA.setup((w) => w.uri).returns(() => workspaceUriA);
        const workspaceFolderB = TypeMoq.Mock.ofType<WorkspaceFolder>();
        workspaceFolderB.setup((w) => w.uri).returns(() => workspaceUriB);

        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(file1A)))
            .returns(() => workspaceFolderA.object);
        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(file2A)))
            .returns(() => workspaceFolderA.object);
        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(fileB)))
            .returns(() => workspaceFolderB.object);

        const terminalForFile1A = factory.getTerminalService({
            resource: file1A,
            newTerminalPerFile: true,
        }) as SynchronousTerminalService;
        const terminalForFile2A = factory.getTerminalService({
            resource: file2A,
            newTerminalPerFile: true,
        }) as SynchronousTerminalService;
        const terminalForFileB = factory.getTerminalService({
            resource: fileB,
            newTerminalPerFile: true,
        }) as SynchronousTerminalService;

        const terminalsAreSameForWorkspaceA = terminalForFile1A.terminalService === terminalForFile2A.terminalService;
        expect(terminalsAreSameForWorkspaceA).to.equal(false, 'Instances are the same for Workspace A');

        const terminalsForWorkspaceABAreDifferent =
            terminalForFile1A.terminalService === terminalForFileB.terminalService;
        expect(terminalsForWorkspaceABAreDifferent).to.equal(
            false,
            'Instances should be different for different workspaces',
        );
    });
});
