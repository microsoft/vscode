/* eslint-disable class-methods-use-this */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { CancellationToken, TestItem, Uri, TestController } from 'vscode';
import { IWorkspaceService } from '../../../common/application/types';
import { asyncForEach } from '../../../common/utils/arrayUtils';
import { Deferred } from '../../../common/utils/async';
import {
    createWorkspaceRootTestItem,
    getWorkspaceNode,
    removeItemByIdFromChildren,
    updateTestItemFromRawData,
} from '../common/testItemUtilities';
import { ITestFrameworkController, TestData, RawDiscoveredTests } from '../common/types';

@injectable()
export class PytestController implements ITestFrameworkController {
    private readonly testData: Map<string, RawDiscoveredTests[]> = new Map();

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
                // Refresh each node with new data
                if (rawTestData.length === 0) {
                    const items: TestItem[] = [];
                    testController.items.forEach((i) => items.push(i));
                    items.forEach((i) => testController.items.delete(i.id));
                    return Promise.resolve();
                }

                const root = rawTestData.length === 1 ? rawTestData[0].root : workspace.uri.fsPath;
                if (root === item.id) {
                    // This is the workspace root node
                    if (rawTestData.length === 1) {
                        if (rawTestData[0].tests.length > 0) {
                            await updateTestItemFromRawData(
                                item,
                                testController,
                                this.idToRawData,
                                item.id,
                                rawTestData,
                                token,
                            );
                        } else {
                            this.idToRawData.delete(item.id);
                            testController.items.delete(item.id);
                            return Promise.resolve();
                        }
                    } else {
                        // To figure out which top level nodes have to removed. First we get all the
                        // existing nodes. Then if they have data we keep those nodes, Nodes without
                        // data will be removed after we check the raw data.
                        let subRootWithNoData: string[] = [];
                        item.children.forEach((c) => subRootWithNoData.push(c.id));

                        await asyncForEach(rawTestData, async (data) => {
                            let subRootId = data.root;
                            let rawId;
                            if (data.root === root) {
                                const subRoot = data.parents.filter((p) => p.parentid === '.' || p.parentid === root);
                                subRootId = path.join(data.root, subRoot.length > 0 ? subRoot[0].id : '');
                                rawId = subRoot.length > 0 ? subRoot[0].id : undefined;
                            }

                            if (data.tests.length > 0) {
                                let subRootItem = item.children.get(subRootId);
                                if (!subRootItem) {
                                    subRootItem = createWorkspaceRootTestItem(testController, this.idToRawData, {
                                        id: subRootId,
                                        label: path.basename(subRootId),
                                        uri: Uri.file(subRootId),
                                        runId: subRootId,
                                        parentId: item.id,
                                        rawId,
                                    });
                                    item.children.add(subRootItem);
                                }

                                // We found data for a node. Remove its id from the no-data list.
                                subRootWithNoData = subRootWithNoData.filter((s) => s !== subRootId);
                                await updateTestItemFromRawData(
                                    subRootItem,
                                    testController,
                                    this.idToRawData,
                                    root, // All the file paths are based on workspace root.
                                    [data],
                                    token,
                                );
                            } else {
                                // This means there are no tests under this node
                                removeItemByIdFromChildren(this.idToRawData, item, [subRootId]);
                            }
                        });

                        // We did not find any data for these nodes, delete them.
                        removeItemByIdFromChildren(this.idToRawData, item, subRootWithNoData);
                    }
                } else {
                    const workspaceNode = getWorkspaceNode(item, this.idToRawData);
                    if (workspaceNode) {
                        await updateTestItemFromRawData(
                            item,
                            testController,
                            this.idToRawData,
                            workspaceNode.id,
                            rawTestData,
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
