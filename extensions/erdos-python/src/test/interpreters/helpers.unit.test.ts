// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { SemVer } from 'semver';
import * as TypeMoq from 'typemoq';
import { ConfigurationTarget, TextDocument, TextEditor, Uri } from 'vscode';
import { IDocumentManager, IWorkspaceService } from '../../client/common/application/types';
import { IComponentAdapter } from '../../client/interpreter/contracts';
import { InterpreterHelper } from '../../client/interpreter/helpers';
import { IServiceContainer } from '../../client/ioc/types';

suite('Interpreters Display Helper', () => {
    let documentManager: TypeMoq.IMock<IDocumentManager>;
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let helper: InterpreterHelper;
    let pyenvs: TypeMoq.IMock<IComponentAdapter>;
    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
        pyenvs = TypeMoq.Mock.ofType<IComponentAdapter>();

        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IWorkspaceService)))
            .returns(() => workspaceService.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IDocumentManager)))
            .returns(() => documentManager.object);

        helper = new InterpreterHelper(serviceContainer.object, pyenvs.object);
    });
    test('getActiveWorkspaceUri should return undefined if there are no workspaces', () => {
        workspaceService.setup((w) => w.workspaceFolders).returns(() => []);
        documentManager.setup((doc) => doc.activeTextEditor).returns(() => undefined);
        const workspace = helper.getActiveWorkspaceUri(undefined);
        expect(workspace).to.be.equal(undefined, 'incorrect value');
    });
    test('getActiveWorkspaceUri should return the workspace if there is only one', () => {
        const folderUri = Uri.file('abc');

        workspaceService.setup((w) => w.workspaceFolders).returns(() => [{ uri: folderUri } as any]);

        const workspace = helper.getActiveWorkspaceUri(undefined);
        expect(workspace).to.be.not.equal(undefined, 'incorrect value');
        expect(workspace!.folderUri).to.be.equal(folderUri);
        expect(workspace!.configTarget).to.be.equal(ConfigurationTarget.Workspace);
    });
    test('getActiveWorkspaceUri should return undefined if we no active editor and have more than one workspace folder', () => {
        const folderUri = Uri.file('abc');

        workspaceService.setup((w) => w.workspaceFolders).returns(() => [{ uri: folderUri } as any, undefined as any]);
        documentManager.setup((d) => d.activeTextEditor).returns(() => undefined);

        const workspace = helper.getActiveWorkspaceUri(undefined);
        expect(workspace).to.be.equal(undefined, 'incorrect value');
    });
    test('getActiveWorkspaceUri should return undefined of the active editor does not belong to a workspace and if we have more than one workspace folder', () => {
        const folderUri = Uri.file('abc');
        const documentUri = Uri.file('file');

        workspaceService.setup((w) => w.workspaceFolders).returns(() => [{ uri: folderUri } as any, undefined as any]);
        const textEditor = TypeMoq.Mock.ofType<TextEditor>();
        const document = TypeMoq.Mock.ofType<TextDocument>();
        textEditor.setup((t) => t.document).returns(() => document.object);
        document.setup((d) => d.uri).returns(() => documentUri);
        documentManager.setup((d) => d.activeTextEditor).returns(() => textEditor.object);
        workspaceService.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(documentUri))).returns(() => undefined);

        const workspace = helper.getActiveWorkspaceUri(undefined);
        expect(workspace).to.be.equal(undefined, 'incorrect value');
    });
    test('getActiveWorkspaceUri should return workspace folder of the active editor if belongs to a workspace and if we have more than one workspace folder', () => {
        const folderUri = Uri.file('abc');
        const documentWorkspaceFolderUri = Uri.file('file.abc');
        const documentUri = Uri.file('file');

        workspaceService.setup((w) => w.workspaceFolders).returns(() => [{ uri: folderUri } as any, undefined as any]);
        const textEditor = TypeMoq.Mock.ofType<TextEditor>();
        const document = TypeMoq.Mock.ofType<TextDocument>();
        textEditor.setup((t) => t.document).returns(() => document.object);
        document.setup((d) => d.uri).returns(() => documentUri);
        documentManager.setup((d) => d.activeTextEditor).returns(() => textEditor.object);

        workspaceService
            .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(documentUri)))
            .returns(() => {
                return { uri: documentWorkspaceFolderUri } as any;
            });

        const workspace = helper.getActiveWorkspaceUri(undefined);
        expect(workspace).to.be.not.equal(undefined, 'incorrect value');
        expect(workspace!.folderUri).to.be.equal(documentWorkspaceFolderUri);
        expect(workspace!.configTarget).to.be.equal(ConfigurationTarget.WorkspaceFolder);
    });
    test('getBestInterpreter should return undefined for an empty list', () => {
        expect(helper.getBestInterpreter([])).to.be.equal(undefined, 'should be undefined');
        expect(helper.getBestInterpreter(undefined)).to.be.equal(undefined, 'should be undefined');
    });
    test('getBestInterpreter should return first item if there is only one', () => {
        expect(helper.getBestInterpreter(['a'] as any)).to.be.equal('a', 'should be undefined');
    });
    test('getBestInterpreter should return interpreter with highest version', () => {
        const interpreter1 = { version: JSON.parse(JSON.stringify(new SemVer('1.0.0-alpha'))) };
        const interpreter2 = { version: JSON.parse(JSON.stringify(new SemVer('3.6.0'))) };
        const interpreter3 = { version: JSON.parse(JSON.stringify(new SemVer('3.7.1-alpha'))) };
        const interpreter4 = { version: JSON.parse(JSON.stringify(new SemVer('3.6.0-alpha'))) };
        const interpreters = [interpreter1, interpreter2, interpreter3, interpreter4] as any;
        expect(helper.getBestInterpreter(interpreters)).to.be.deep.equal(interpreter3);
    });
});
