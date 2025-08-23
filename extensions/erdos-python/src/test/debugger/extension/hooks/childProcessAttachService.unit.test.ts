// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { Uri, WorkspaceFolder } from 'vscode';
import { DebugService } from '../../../../client/common/application/debugService';
import { IDebugService } from '../../../../client/common/application/types';
import * as workspaceApis from '../../../../client/common/vscodeApis/workspaceApis';
import { ChildProcessAttachService } from '../../../../client/debugger/extension/hooks/childProcessAttachService';
import { AttachRequestArguments, LaunchRequestArguments } from '../../../../client/debugger/types';
import * as windowApis from '../../../../client/common/vscodeApis/windowApis';

suite('Debug - Attach to Child Process', () => {
    let debugService: IDebugService;
    let attachService: ChildProcessAttachService;
    let getWorkspaceFoldersStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    setup(() => {
        debugService = mock(DebugService);
        attachService = new ChildProcessAttachService(instance(debugService));
        getWorkspaceFoldersStub = sinon.stub(workspaceApis, 'getWorkspaceFolders');
        showErrorMessageStub = sinon.stub(windowApis, 'showErrorMessage');
    });
    teardown(() => {
        sinon.restore();
    });

    test('Message is not displayed if debugger is launched', async () => {
        const data: AttachRequestArguments = {
            name: 'Attach',
            type: 'python',
            request: 'attach',
            port: 1234,
            subProcessId: 2,
        };
        const session: any = {};
        getWorkspaceFoldersStub.returns(undefined);
        when(debugService.startDebugging(anything(), anything(), anything())).thenResolve(true as any);
        showErrorMessageStub.returns(undefined);

        await attachService.attach(data, session);

        sinon.assert.calledOnce(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(anything(), anything(), anything())).once();
        sinon.assert.notCalled(showErrorMessageStub);
    });
    test('Message is displayed if debugger is not launched', async () => {
        const data: AttachRequestArguments = {
            name: 'Attach',
            type: 'python',
            request: 'attach',
            port: 1234,
            subProcessId: 2,
        };

        const session: any = {};
        getWorkspaceFoldersStub.returns(undefined);
        when(debugService.startDebugging(anything(), anything(), anything())).thenResolve(false as any);
        showErrorMessageStub.resolves(() => {});

        await attachService.attach(data, session);

        sinon.assert.calledOnce(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(anything(), anything(), anything())).once();
        sinon.assert.calledOnce(showErrorMessageStub);
    });
    test('Use correct workspace folder', async () => {
        const rightWorkspaceFolder: WorkspaceFolder = { name: '1', index: 1, uri: Uri.file('a') };
        const wkspace1: WorkspaceFolder = { name: '0', index: 0, uri: Uri.file('0') };
        const wkspace2: WorkspaceFolder = { name: '2', index: 2, uri: Uri.file('2') };

        const data: AttachRequestArguments = {
            name: 'Attach',
            type: 'python',
            request: 'attach',
            port: 1234,
            subProcessId: 2,
            workspaceFolder: rightWorkspaceFolder.uri.fsPath,
        };

        const session: any = {};
        getWorkspaceFoldersStub.returns([wkspace1, rightWorkspaceFolder, wkspace2]);
        when(debugService.startDebugging(rightWorkspaceFolder, anything(), anything())).thenResolve(true as any);

        await attachService.attach(data, session);

        sinon.assert.called(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(rightWorkspaceFolder, anything(), anything())).once();
        sinon.assert.notCalled(showErrorMessageStub);
    });
    test('Use empty workspace folder if right one is not found', async () => {
        const rightWorkspaceFolder: WorkspaceFolder = { name: '1', index: 1, uri: Uri.file('a') };
        const wkspace1: WorkspaceFolder = { name: '0', index: 0, uri: Uri.file('0') };
        const wkspace2: WorkspaceFolder = { name: '2', index: 2, uri: Uri.file('2') };

        const data: AttachRequestArguments = {
            name: 'Attach',
            type: 'python',
            request: 'attach',
            port: 1234,
            subProcessId: 2,
            workspaceFolder: rightWorkspaceFolder.uri.fsPath,
        };

        const session: any = {};
        getWorkspaceFoldersStub.returns([wkspace1, wkspace2]);
        when(debugService.startDebugging(undefined, anything(), anything())).thenResolve(true as any);

        await attachService.attach(data, session);

        sinon.assert.called(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(undefined, anything(), anything())).once();
        sinon.assert.notCalled(showErrorMessageStub);
    });
    test('Validate debug config is passed with the correct params', async () => {
        const data: LaunchRequestArguments | AttachRequestArguments = {
            request: 'attach',
            type: 'python',
            name: 'Attach',
            port: 1234,
            subProcessId: 2,
            host: 'localhost',
        };

        const debugConfig = JSON.parse(JSON.stringify(data));
        debugConfig.host = 'localhost';
        const session: any = {};

        getWorkspaceFoldersStub.returns(undefined);
        when(debugService.startDebugging(undefined, anything(), anything())).thenResolve(true as any);

        await attachService.attach(data, session);

        sinon.assert.calledOnce(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(undefined, anything(), anything())).once();
        const [, secondArg, thirdArg] = capture(debugService.startDebugging).last();
        expect(secondArg).to.deep.equal(debugConfig);
        expect(thirdArg).to.deep.equal({ parentSession: session, lifecycleManagedByParent: true });
        sinon.assert.notCalled(showErrorMessageStub);
    });
    test('Pass data as is if data is attach debug configuration', async () => {
        const data: AttachRequestArguments = {
            type: 'python',
            request: 'attach',
            name: '',
        };
        const session: any = {};
        const debugConfig = JSON.parse(JSON.stringify(data));

        getWorkspaceFoldersStub.returns(undefined);
        when(debugService.startDebugging(undefined, anything(), anything())).thenResolve(true as any);

        await attachService.attach(data, session);

        sinon.assert.calledOnce(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(undefined, anything(), anything())).once();
        const [, secondArg, thirdArg] = capture(debugService.startDebugging).last();
        expect(secondArg).to.deep.equal(debugConfig);
        expect(thirdArg).to.deep.equal({ parentSession: session, lifecycleManagedByParent: true });
        sinon.assert.notCalled(showErrorMessageStub);
    });
    test('Validate debug config when parent/root parent was attached', async () => {
        const data: AttachRequestArguments = {
            request: 'attach',
            type: 'python',
            name: 'Attach',
            host: '123.123.123.123',
            port: 1234,
            subProcessId: 2,
        };

        const debugConfig = JSON.parse(JSON.stringify(data));
        debugConfig.host = data.host;
        debugConfig.port = data.port;
        debugConfig.request = 'attach';
        const session: any = {};

        getWorkspaceFoldersStub.returns(undefined);
        when(debugService.startDebugging(undefined, anything(), anything())).thenResolve(true as any);

        await attachService.attach(data, session);

        sinon.assert.calledOnce(getWorkspaceFoldersStub);
        verify(debugService.startDebugging(undefined, anything(), anything())).once();
        const [, secondArg, thirdArg] = capture(debugService.startDebugging).last();
        expect(secondArg).to.deep.equal(debugConfig);
        expect(thirdArg).to.deep.equal({ parentSession: session, lifecycleManagedByParent: true });
        sinon.assert.notCalled(showErrorMessageStub);
    });
});
