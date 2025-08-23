// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiPromise from 'chai-as-promised';
import * as typeMoq from 'typemoq';
import { Uri, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { IWorkspaceService } from '../../../../client/common/application/types';
import { Product } from '../../../../client/common/types';
import { getNamesAndValues } from '../../../../client/common/utils/enum';
import { IServiceContainer } from '../../../../client/ioc/types';
import { UNIT_TEST_PRODUCTS } from '../../../../client/testing/common/constants';
import { TestConfigSettingsService } from '../../../../client/testing/common/configSettingService';
import { ITestConfigSettingsService, UnitTestProduct } from '../../../../client/testing/common/types';
import { BufferedTestConfigSettingsService } from '../../../../client/testing/common/bufferedTestConfigSettingService';

use(chaiPromise.default);

const updateMethods: (keyof Omit<ITestConfigSettingsService, 'getTestEnablingSetting'>)[] = [
    'updateTestArgs',
    'disable',
    'enable',
];

suite('Unit Tests - ConfigSettingsService', () => {
    UNIT_TEST_PRODUCTS.forEach((product) => {
        const prods = getNamesAndValues(Product);
        const productName = prods.filter((item) => item.value === product)[0];
        const workspaceUri = Uri.file(__filename);
        updateMethods.forEach((updateMethod) => {
            suite(`Test '${updateMethod}' method with ${productName.name}`, () => {
                let testConfigSettingsService: ITestConfigSettingsService;
                let workspaceService: typeMoq.IMock<IWorkspaceService>;
                setup(() => {
                    const serviceContainer = typeMoq.Mock.ofType<IServiceContainer>();
                    workspaceService = typeMoq.Mock.ofType<IWorkspaceService>();

                    serviceContainer
                        .setup((c) => c.get(typeMoq.It.isValue(IWorkspaceService)))
                        .returns(() => workspaceService.object);
                    testConfigSettingsService = new TestConfigSettingsService(serviceContainer.object);
                });
                function getTestArgSetting(prod: UnitTestProduct) {
                    switch (prod) {
                        case Product.unittest:
                            return 'testing.unittestArgs';
                        case Product.pytest:
                            return 'testing.pytestArgs';
                        default:
                            throw new Error('Invalid Test Product');
                    }
                }
                function getTestEnablingSetting(prod: UnitTestProduct) {
                    switch (prod) {
                        case Product.unittest:
                            return 'testing.unittestEnabled';
                        case Product.pytest:
                            return 'testing.pytestEnabled';
                        default:
                            throw new Error('Invalid Test Product');
                    }
                }
                function getExpectedValueAndSettings(): { configValue: any; configName: string } {
                    switch (updateMethod) {
                        case 'disable': {
                            return { configValue: false, configName: getTestEnablingSetting(product) };
                        }
                        case 'enable': {
                            return { configValue: true, configName: getTestEnablingSetting(product) };
                        }
                        case 'updateTestArgs': {
                            return { configValue: ['one', 'two', 'three'], configName: getTestArgSetting(product) };
                        }
                        default: {
                            throw new Error('Invalid Method');
                        }
                    }
                }
                test('Update Test Arguments with workspace Uri without workspaces', async () => {
                    const pythonConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>();
                    workspaceService
                        .setup((w) => w.getConfiguration(typeMoq.It.isValue('python')))
                        .returns(() => pythonConfig.object)
                        .verifiable(typeMoq.Times.once());

                    const { configValue, configName } = getExpectedValueAndSettings();

                    pythonConfig
                        .setup((p) => p.update(typeMoq.It.isValue(configName), typeMoq.It.isValue(configValue)))
                        .returns(() => Promise.resolve())
                        .verifiable(typeMoq.Times.once());

                    if (updateMethod === 'updateTestArgs') {
                        await testConfigSettingsService.updateTestArgs(workspaceUri, product, configValue);
                    } else {
                        await testConfigSettingsService[updateMethod](workspaceUri, product);
                    }
                    workspaceService.verifyAll();
                    pythonConfig.verifyAll();
                });
                test('Update Test Arguments with workspace Uri with one workspace', async () => {
                    const workspaceFolder = typeMoq.Mock.ofType<WorkspaceFolder>();
                    workspaceFolder
                        .setup((w) => w.uri)
                        .returns(() => workspaceUri)
                        .verifiable(typeMoq.Times.atLeastOnce());
                    workspaceService
                        .setup((w) => w.workspaceFolders)
                        .returns(() => [workspaceFolder.object])
                        .verifiable(typeMoq.Times.atLeastOnce());

                    const pythonConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>();
                    workspaceService
                        .setup((w) =>
                            w.getConfiguration(typeMoq.It.isValue('python'), typeMoq.It.isValue(workspaceUri)),
                        )
                        .returns(() => pythonConfig.object)
                        .verifiable(typeMoq.Times.once());

                    const { configValue, configName } = getExpectedValueAndSettings();
                    pythonConfig
                        .setup((p) => p.update(typeMoq.It.isValue(configName), typeMoq.It.isValue(configValue)))
                        .returns(() => Promise.resolve())
                        .verifiable(typeMoq.Times.once());

                    if (updateMethod === 'updateTestArgs') {
                        await testConfigSettingsService.updateTestArgs(workspaceUri, product, configValue);
                    } else {
                        await testConfigSettingsService[updateMethod](workspaceUri, product);
                    }

                    workspaceService.verifyAll();
                    pythonConfig.verifyAll();
                });
                test('Update Test Arguments with workspace Uri with more than one workspace and uri belongs to a workspace', async () => {
                    const workspaceFolder = typeMoq.Mock.ofType<WorkspaceFolder>();
                    workspaceFolder
                        .setup((w) => w.uri)
                        .returns(() => workspaceUri)
                        .verifiable(typeMoq.Times.atLeastOnce());
                    workspaceService
                        .setup((w) => w.workspaceFolders)
                        .returns(() => [workspaceFolder.object, workspaceFolder.object])
                        .verifiable(typeMoq.Times.atLeastOnce());
                    workspaceService
                        .setup((w) => w.getWorkspaceFolder(typeMoq.It.isValue(workspaceUri)))
                        .returns(() => workspaceFolder.object)
                        .verifiable(typeMoq.Times.once());

                    const pythonConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>();
                    workspaceService
                        .setup((w) =>
                            w.getConfiguration(typeMoq.It.isValue('python'), typeMoq.It.isValue(workspaceUri)),
                        )
                        .returns(() => pythonConfig.object)
                        .verifiable(typeMoq.Times.once());

                    const { configValue, configName } = getExpectedValueAndSettings();
                    pythonConfig
                        .setup((p) => p.update(typeMoq.It.isValue(configName), typeMoq.It.isValue(configValue)))
                        .returns(() => Promise.resolve())
                        .verifiable(typeMoq.Times.once());

                    if (updateMethod === 'updateTestArgs') {
                        await testConfigSettingsService.updateTestArgs(workspaceUri, product, configValue);
                    } else {
                        await testConfigSettingsService[updateMethod](workspaceUri, product);
                    }

                    workspaceService.verifyAll();
                    pythonConfig.verifyAll();
                });
                test('Expect an exception when updating Test Arguments with workspace Uri with more than one workspace and uri does not belong to a workspace', async () => {
                    const workspaceFolder = typeMoq.Mock.ofType<WorkspaceFolder>();
                    workspaceFolder
                        .setup((w) => w.uri)
                        .returns(() => workspaceUri)
                        .verifiable(typeMoq.Times.atLeastOnce());
                    workspaceService
                        .setup((w) => w.workspaceFolders)
                        .returns(() => [workspaceFolder.object, workspaceFolder.object])
                        .verifiable(typeMoq.Times.atLeastOnce());
                    workspaceService
                        .setup((w) => w.getWorkspaceFolder(typeMoq.It.isValue(workspaceUri)))
                        .returns(() => undefined)
                        .verifiable(typeMoq.Times.once());

                    const { configValue } = getExpectedValueAndSettings();

                    const promise = testConfigSettingsService.updateTestArgs(workspaceUri, product, configValue);
                    expect(promise).to.eventually.rejectedWith();
                    workspaceService.verifyAll();
                });
            });
        });
    });
});

suite('Unit Tests - BufferedTestConfigSettingsService', () => {
    test('config changes are pushed when apply() is called', async () => {
        const testDir = '/my/project';
        const newArgs: string[] = ['-x', '--spam=42'];
        const cfg = typeMoq.Mock.ofType<ITestConfigSettingsService>(undefined, typeMoq.MockBehavior.Strict);
        cfg.setup((c) =>
            c.updateTestArgs(
                typeMoq.It.isValue(testDir),
                typeMoq.It.isValue(Product.pytest),
                typeMoq.It.isValue(newArgs),
            ),
        )
            .returns(() => Promise.resolve())
            .verifiable(typeMoq.Times.once());
        cfg.setup((c) => c.disable(typeMoq.It.isValue(testDir), typeMoq.It.isValue(Product.unittest)))
            .returns(() => Promise.resolve())
            .verifiable(typeMoq.Times.once());
        cfg.setup((c) => c.enable(typeMoq.It.isValue(testDir), typeMoq.It.isValue(Product.pytest)))
            .returns(() => Promise.resolve())
            .verifiable(typeMoq.Times.once());

        const delayed = new BufferedTestConfigSettingsService();
        await delayed.updateTestArgs(testDir, Product.pytest, newArgs);
        await delayed.disable(testDir, Product.unittest);
        await delayed.enable(testDir, Product.pytest);
        await delayed.apply(cfg.object);

        // Ideally we would verify that the ops were applied in their
        // original order.  Unfortunately, the version of TypeMoq we're
        // using does not give us that option.
        cfg.verifyAll();
    });

    test('applied changes are cleared', async () => {
        const cfg = typeMoq.Mock.ofType<ITestConfigSettingsService>(undefined, typeMoq.MockBehavior.Strict);
        cfg.setup((c) => c.enable(typeMoq.It.isAny(), typeMoq.It.isAny()))
            .returns(() => Promise.resolve())
            .verifiable(typeMoq.Times.once());

        const delayed = new BufferedTestConfigSettingsService();
        await delayed.enable('/my/project', Product.pytest);
        await delayed.apply(cfg.object);
        await delayed.apply(cfg.object);

        cfg.verifyAll();
    });
});
