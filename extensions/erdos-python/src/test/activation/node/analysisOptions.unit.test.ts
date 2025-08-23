// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { assert, expect } from 'chai';
import * as typemoq from 'typemoq';
import { WorkspaceFolder } from 'vscode';
import { DocumentFilter } from 'vscode-languageclient/node';

import { NodeLanguageServerAnalysisOptions } from '../../../client/activation/node/analysisOptions';
import { ILanguageServerOutputChannel } from '../../../client/activation/types';
import { IWorkspaceService } from '../../../client/common/application/types';
import { PYTHON, PYTHON_LANGUAGE } from '../../../client/common/constants';
import { ILogOutputChannel } from '../../../client/common/types';

suite('Pylance Language Server - Analysis Options', () => {
    class TestClass extends NodeLanguageServerAnalysisOptions {
        public getWorkspaceFolder(): WorkspaceFolder | undefined {
            return super.getWorkspaceFolder();
        }

        public getDocumentFilters(workspaceFolder?: WorkspaceFolder): DocumentFilter[] {
            return super.getDocumentFilters(workspaceFolder);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public async getInitializationOptions(): Promise<any> {
            return super.getInitializationOptions();
        }
    }

    let analysisOptions: TestClass;
    let outputChannel: ILogOutputChannel;
    let lsOutputChannel: typemoq.IMock<ILanguageServerOutputChannel>;
    let workspace: typemoq.IMock<IWorkspaceService>;

    setup(() => {
        outputChannel = typemoq.Mock.ofType<ILogOutputChannel>().object;
        workspace = typemoq.Mock.ofType<IWorkspaceService>();
        workspace.setup((w) => w.isVirtualWorkspace).returns(() => false);
        lsOutputChannel = typemoq.Mock.ofType<ILanguageServerOutputChannel>();
        lsOutputChannel.setup((l) => l.channel).returns(() => outputChannel);
        analysisOptions = new TestClass(lsOutputChannel.object, workspace.object);
    });

    test('Workspace folder is undefined', () => {
        const workspaceFolder = analysisOptions.getWorkspaceFolder();
        expect(workspaceFolder).to.be.equal(undefined);
    });

    test('Document filter matches expected python language schemes', () => {
        const filter = analysisOptions.getDocumentFilters();
        expect(filter).to.be.equal(PYTHON);
    });

    test('Document filter matches all python language schemes when in virtual workspace', () => {
        workspace.reset();
        workspace.setup((w) => w.isVirtualWorkspace).returns(() => true);
        const filter = analysisOptions.getDocumentFilters();
        assert.deepEqual(filter, [{ language: PYTHON_LANGUAGE }]);
    });

    test('Initialization options include experimentation capability', async () => {
        const options = await analysisOptions.getInitializationOptions();
        expect(options?.experimentationSupport).to.be.equal(true);
    });
});
