// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typeMoq from 'typemoq';
import { OutputChannel, Uri, WorkspaceConfiguration } from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../client/common/application/types';
import {
    IConfigurationService,
    IInstaller,
    ILogOutputChannel,
    IPythonSettings,
    Product,
} from '../../client/common/types';
import { getNamesAndValues } from '../../client/common/utils/enum';
import { IServiceContainer } from '../../client/ioc/types';
import { UNIT_TEST_PRODUCTS } from '../../client/testing/common/constants';
import { TestsHelper } from '../../client/testing/common/testUtils';
import {
    ITestConfigSettingsService,
    ITestConfigurationManager,
    ITestConfigurationManagerFactory,
    ITestsHelper,
} from '../../client/testing/common/types';
import { ITestingSettings } from '../../client/testing/configuration/types';
import { UnitTestConfigurationService } from '../../client/testing/configuration';

suite('Unit Tests - ConfigurationService', () => {
    UNIT_TEST_PRODUCTS.forEach((product) => {
        const prods = getNamesAndValues(Product);
        const productName = prods.filter((item) => item.value === product)[0];
        const workspaceUri = Uri.file(__filename);
        suite(productName.name, () => {
            let testConfigService: typeMoq.IMock<UnitTestConfigurationService>;
            let workspaceService: typeMoq.IMock<IWorkspaceService>;
            let factory: typeMoq.IMock<ITestConfigurationManagerFactory>;
            let testSettingsService: typeMoq.IMock<ITestConfigSettingsService>;
            let appShell: typeMoq.IMock<IApplicationShell>;
            let unitTestSettings: typeMoq.IMock<ITestingSettings>;
            setup(() => {
                const serviceContainer = typeMoq.Mock.ofType<IServiceContainer>(undefined, typeMoq.MockBehavior.Strict);
                const configurationService = typeMoq.Mock.ofType<IConfigurationService>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                appShell = typeMoq.Mock.ofType<IApplicationShell>(undefined, typeMoq.MockBehavior.Strict);
                const outputChannel = typeMoq.Mock.ofType<OutputChannel>(undefined, typeMoq.MockBehavior.Strict);
                const installer = typeMoq.Mock.ofType<IInstaller>(undefined, typeMoq.MockBehavior.Strict);
                workspaceService = typeMoq.Mock.ofType<IWorkspaceService>(undefined, typeMoq.MockBehavior.Strict);
                factory = typeMoq.Mock.ofType<ITestConfigurationManagerFactory>(undefined, typeMoq.MockBehavior.Strict);
                testSettingsService = typeMoq.Mock.ofType<ITestConfigSettingsService>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                unitTestSettings = typeMoq.Mock.ofType<ITestingSettings>();
                const pythonSettings = typeMoq.Mock.ofType<IPythonSettings>(undefined, typeMoq.MockBehavior.Strict);

                pythonSettings.setup((p) => p.testing).returns(() => unitTestSettings.object);
                configurationService.setup((c) => c.getSettings(workspaceUri)).returns(() => pythonSettings.object);

                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(ILogOutputChannel)))
                    .returns(() => outputChannel.object);
                serviceContainer.setup((c) => c.get(typeMoq.It.isValue(IInstaller))).returns(() => installer.object);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(IConfigurationService)))
                    .returns(() => configurationService.object);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(IApplicationShell)))
                    .returns(() => appShell.object);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(IWorkspaceService)))
                    .returns(() => workspaceService.object);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(ITestConfigurationManagerFactory)))
                    .returns(() => factory.object);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(ITestConfigSettingsService)))
                    .returns(() => testSettingsService.object);
                const commands = typeMoq.Mock.ofType<ICommandManager>(undefined, typeMoq.MockBehavior.Strict);
                serviceContainer
                    .setup((c) => c.get(typeMoq.It.isValue(ICommandManager)))
                    .returns(() => commands.object);
                serviceContainer.setup((c) => c.get(typeMoq.It.isValue(ITestsHelper))).returns(() => new TestsHelper());
                testConfigService = typeMoq.Mock.ofType(
                    UnitTestConfigurationService,
                    typeMoq.MockBehavior.Loose,
                    true,
                    serviceContainer.object,
                );
            });
            test('Enable Test when setting testing.promptToConfigure is enabled', async () => {
                const configMgr = typeMoq.Mock.ofType<ITestConfigurationManager>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                configMgr
                    .setup((c) => c.enable())
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());

                factory
                    .setup((f) => f.create(workspaceUri, product))
                    .returns(() => configMgr.object)
                    .verifiable(typeMoq.Times.once());

                const workspaceConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                workspaceService
                    .setup((w) => w.getConfiguration(typeMoq.It.isValue('python'), workspaceUri))
                    .returns(() => workspaceConfig.object)
                    .verifiable(typeMoq.Times.once());

                workspaceConfig
                    .setup((w) => w.get(typeMoq.It.isValue('testing.promptToConfigure')))
                    .returns(() => true)
                    .verifiable(typeMoq.Times.once());

                await testConfigService.target.enableTest(workspaceUri, product);

                configMgr.verifyAll();
                factory.verifyAll();
                workspaceService.verifyAll();
                workspaceConfig.verifyAll();
            });
            test('Enable Test when setting testing.promptToConfigure is disabled', async () => {
                const configMgr = typeMoq.Mock.ofType<ITestConfigurationManager>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                configMgr
                    .setup((c) => c.enable())
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());

                factory
                    .setup((f) => f.create(workspaceUri, product))
                    .returns(() => configMgr.object)
                    .verifiable(typeMoq.Times.once());

                const workspaceConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                workspaceService
                    .setup((w) => w.getConfiguration(typeMoq.It.isValue('python'), workspaceUri))
                    .returns(() => workspaceConfig.object)
                    .verifiable(typeMoq.Times.once());

                workspaceConfig
                    .setup((w) => w.get(typeMoq.It.isValue('testing.promptToConfigure')))
                    .returns(() => false)
                    .verifiable(typeMoq.Times.once());

                workspaceConfig
                    .setup((w) =>
                        w.update(typeMoq.It.isValue('testing.promptToConfigure'), typeMoq.It.isValue(undefined)),
                    )
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());

                await testConfigService.target.enableTest(workspaceUri, product);

                configMgr.verifyAll();
                factory.verifyAll();
                workspaceService.verifyAll();
                workspaceConfig.verifyAll();
            });
            test('Enable Test when setting testing.promptToConfigure is disabled and fail to update the settings', async () => {
                const configMgr = typeMoq.Mock.ofType<ITestConfigurationManager>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                configMgr
                    .setup((c) => c.enable())
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());

                factory
                    .setup((f) => f.create(workspaceUri, product))
                    .returns(() => configMgr.object)
                    .verifiable(typeMoq.Times.once());

                const workspaceConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                workspaceService
                    .setup((w) => w.getConfiguration(typeMoq.It.isValue('python'), workspaceUri))
                    .returns(() => workspaceConfig.object)
                    .verifiable(typeMoq.Times.once());

                workspaceConfig
                    .setup((w) => w.get(typeMoq.It.isValue('testing.promptToConfigure')))
                    .returns(() => false)
                    .verifiable(typeMoq.Times.once());

                const errorMessage = 'Update Failed';
                const updateFailError = new Error(errorMessage);
                workspaceConfig
                    .setup((w) =>
                        w.update(typeMoq.It.isValue('testing.promptToConfigure'), typeMoq.It.isValue(undefined)),
                    )
                    .returns(() => Promise.reject(updateFailError))
                    .verifiable(typeMoq.Times.once());

                const promise = testConfigService.target.enableTest(workspaceUri, product);

                await expect(promise).to.eventually.be.rejectedWith(errorMessage);
                configMgr.verifyAll();
                factory.verifyAll();
                workspaceService.verifyAll();
                workspaceConfig.verifyAll();
            });
            test('Select Test runner displays 2 items', async () => {
                const placeHolder = 'Some message';
                appShell
                    .setup((s) => s.showQuickPick(typeMoq.It.isAny(), typeMoq.It.isObjectWith({ placeHolder })))
                    .callback((items) => expect(items).be.lengthOf(2))
                    .verifiable(typeMoq.Times.once());

                await testConfigService.target.selectTestRunner(placeHolder);
                appShell.verifyAll();
            });
            test('Ensure selected item is returned', async () => {
                const placeHolder = 'Some message';
                const indexes = [Product.unittest, Product.pytest];
                appShell
                    .setup((s) => s.showQuickPick(typeMoq.It.isAny(), typeMoq.It.isObjectWith({ placeHolder })))
                    .callback((items) => expect(items).be.lengthOf(2))
                    .returns((items) => items[indexes.indexOf(product)])
                    .verifiable(typeMoq.Times.once());

                const selectedItem = await testConfigService.target.selectTestRunner(placeHolder);
                expect(selectedItem).to.be.equal(product);
                appShell.verifyAll();
            });
            test('Ensure undefined is returned when nothing is selected', async () => {
                const placeHolder = 'Some message';
                appShell
                    .setup((s) => s.showQuickPick(typeMoq.It.isAny(), typeMoq.It.isObjectWith({ placeHolder })))
                    .returns(() => Promise.resolve(undefined))
                    .verifiable(typeMoq.Times.once());

                const selectedItem = await testConfigService.target.selectTestRunner(placeHolder);
                expect(selectedItem).to.be.equal(undefined, 'invalid value');
                appShell.verifyAll();
            });
            test('Correctly returns hasConfiguredTests', () => {
                let enabled = false;
                unitTestSettings.setup((u) => u.unittestEnabled).returns(() => false);
                unitTestSettings.setup((u) => u.pytestEnabled).returns(() => enabled);

                expect(testConfigService.target.hasConfiguredTests(workspaceUri)).to.equal(false);
                enabled = true;
                expect(testConfigService.target.hasConfiguredTests(workspaceUri)).to.equal(true);
            });

            test('Prompt to enable and configure selected test framework', async () => {
                unitTestSettings.setup((u) => u.pytestEnabled).returns(() => false);
                unitTestSettings.setup((u) => u.unittestEnabled).returns(() => false);

                const workspaceConfig = typeMoq.Mock.ofType<WorkspaceConfiguration>(
                    undefined,
                    typeMoq.MockBehavior.Strict,
                );
                workspaceConfig
                    .setup((w) => w.get(typeMoq.It.isAny()))
                    .returns(() => true)
                    .verifiable(typeMoq.Times.once());
                workspaceService
                    .setup((w) => w.getConfiguration(typeMoq.It.isValue('python'), workspaceUri))
                    .returns(() => workspaceConfig.object)
                    .verifiable(typeMoq.Times.once());

                appShell
                    .setup((s) => s.showInformationMessage(typeMoq.It.isAny(), typeMoq.It.isAny()))
                    .verifiable(typeMoq.Times.never());

                let selectTestRunnerInvoked = false;
                testConfigService.callBase = false;
                testConfigService
                    .setup((t) => t.selectTestRunner(typeMoq.It.isAny()))
                    .returns(() => {
                        selectTestRunnerInvoked = true;
                        return Promise.resolve(product);
                    });

                const configMgr = typeMoq.Mock.ofType<ITestConfigurationManager>();
                factory
                    .setup((f) =>
                        f.create(typeMoq.It.isValue(workspaceUri), typeMoq.It.isValue(product), typeMoq.It.isAny()),
                    )
                    .returns(() => configMgr.object)
                    .verifiable(typeMoq.Times.once());

                configMgr
                    .setup((c) => c.configure(typeMoq.It.isValue(workspaceUri)))
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());
                configMgr
                    .setup((c) => c.enable())
                    .returns(() => Promise.resolve())
                    .verifiable(typeMoq.Times.once());
                const configManagersToVerify: typeof configMgr[] = [configMgr];

                await testConfigService.target.promptToEnableAndConfigureTestFramework(workspaceUri);

                expect(selectTestRunnerInvoked).to.be.equal(true, 'Select Test Runner not invoked');
                appShell.verifyAll();
                factory.verifyAll();
                for (const item of configManagersToVerify) {
                    item.verifyAll();
                }
                workspaceConfig.verifyAll();
            });
        });
    });
});
