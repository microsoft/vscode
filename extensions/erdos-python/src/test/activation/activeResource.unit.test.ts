// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import { instance, mock, verify, when } from 'ts-mockito';
import { Uri } from 'vscode';
import { ActiveResourceService } from '../../client/common/application/activeResource';
import { DocumentManager } from '../../client/common/application/documentManager';
import { IDocumentManager, IWorkspaceService } from '../../client/common/application/types';
import { WorkspaceService } from '../../client/common/application/workspace';

suite('Active resource service', () => {
    let documentManager: IDocumentManager;
    let workspaceService: IWorkspaceService;
    let activeResourceService: ActiveResourceService;
    setup(() => {
        documentManager = mock(DocumentManager);
        workspaceService = mock(WorkspaceService);
        activeResourceService = new ActiveResourceService(instance(documentManager), instance(workspaceService));
    });

    test('Return document uri if the active document is not new (has been saved)', async () => {
        const activeTextEditor = {
            document: {
                isUntitled: false,
                uri: Uri.parse('a'),
            },
        };

        when(documentManager.activeTextEditor).thenReturn(activeTextEditor as any);

        const activeResource = activeResourceService.getActiveResource();

        assert.deepEqual(activeResource, activeTextEditor.document.uri);
        verify(documentManager.activeTextEditor).atLeast(1);
        verify(workspaceService.workspaceFolders).never();
    });

    test("Don't return document uri if the active document is new (still unsaved)", async () => {
        const activeTextEditor = {
            document: {
                isUntitled: true,
                uri: Uri.parse('a'),
            },
        };

        when(documentManager.activeTextEditor).thenReturn(activeTextEditor as any);
        when(workspaceService.workspaceFolders).thenReturn([]);

        const activeResource = activeResourceService.getActiveResource();

        assert.notDeepEqual(activeResource, activeTextEditor.document.uri);
        verify(documentManager.activeTextEditor).atLeast(1);
        verify(workspaceService.workspaceFolders).atLeast(1);
    });

    test('If no document is currently opened & the workspace opened contains workspace folders, return the uri of the first workspace folder', async () => {
        const workspaceFolders = [
            {
                uri: Uri.parse('a'),
            },
            {
                uri: Uri.parse('b'),
            },
        ];
        when(documentManager.activeTextEditor).thenReturn(undefined);

        when(workspaceService.workspaceFolders).thenReturn(workspaceFolders as any);

        const activeResource = activeResourceService.getActiveResource();

        assert.deepEqual(activeResource, workspaceFolders[0].uri);
        verify(documentManager.activeTextEditor).atLeast(1);
        verify(workspaceService.workspaceFolders).atLeast(1);
    });

    test('If no document is currently opened & no folder is opened, return undefined', async () => {
        when(documentManager.activeTextEditor).thenReturn(undefined);
        when(workspaceService.workspaceFolders).thenReturn(undefined);

        const activeResource = activeResourceService.getActiveResource();

        assert.deepEqual(activeResource, undefined);
        verify(documentManager.activeTextEditor).atLeast(1);
        verify(workspaceService.workspaceFolders).atLeast(1);
    });

    test('If no document is currently opened & workspace contains no workspace folders, return undefined', async () => {
        when(documentManager.activeTextEditor).thenReturn(undefined);
        when(workspaceService.workspaceFolders).thenReturn([]);

        const activeResource = activeResourceService.getActiveResource();

        assert.deepEqual(activeResource, undefined);
        verify(documentManager.activeTextEditor).atLeast(1);
        verify(workspaceService.workspaceFolders).atLeast(1);
    });
});
