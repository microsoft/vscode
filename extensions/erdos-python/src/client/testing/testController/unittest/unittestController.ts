// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { CancellationToken, TestController, TestItem } from 'vscode';
import { IWorkspaceService } from '../../../common/application/types';
import { Deferred } from '../../../common/utils/async';
import { ITestFrameworkController, RawDiscoveredTests, TestData } from '../common/types';
import { getWorkspaceNode, updateTestItemFromRawData } from '../common/testItemUtilities';

@injectable()
export class UnittestController implements ITestFrameworkController {
    private readonly testData: Map<string, RawDiscoveredTests> = new Map();

    private discovering: Map<string, Deferred<void>> = new Map();

    private idToRawData: Map<string, TestData> = new Map();

    constructor(@inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService) {}

    public async resolveChildren(
        testController: TestController,
        item: TestItem,
        token?: CancellationToken,
    ): Promise<void> {
        const workspace = this.workspaceService.getWorkspaceFolder(item.uri);
        if (workspace) {
            // if we are still discovering then wait
            const discovery = this.discovering.get(workspace.uri.fsPath);
            if (discovery) {
                await discovery.promise;
            }

            // see if we have raw test data
            const rawTestData = this.testData.get(workspace.uri.fsPath);
            if (rawTestData) {
                if (rawTestData.root === item.id) {
                    if (rawTestData.tests.length === 0) {
                        testController.items.delete(item.id);
                        return Promise.resolve();
                    }

                    if (rawTestData.tests.length > 0) {
                        await updateTestItemFromRawData(
                            item,
                            testController,
                            this.idToRawData,
                            item.id,
                            [rawTestData],
                            token,
                        );
                    } else {
                        this.idToRawData.delete(item.id);
                        testController.items.delete(item.id);
                    }
                } else {
                    const workspaceNode = getWorkspaceNode(item, this.idToRawData);
                    if (workspaceNode) {
                        await updateTestItemFromRawData(
                            item,
                            testController,
                            this.idToRawData,
                            workspaceNode.id,
                            [rawTestData],
                            token,
                        );
                    }
                }
            } else {
                const workspaceNode = getWorkspaceNode(item, this.idToRawData);
                if (workspaceNode) {
                    testController.items.delete(workspaceNode.id);
                }
            }
        }
        return Promise.resolve();
    }
}
