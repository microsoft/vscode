'use strict';

import { inject, injectable } from 'inversify';
import {
    ConfigurationChangeEvent,
    Disposable,
    Uri,
    tests,
    TestResultState,
    WorkspaceFolder,
    Command,
    TestItem,
} from 'vscode';
import { IApplicationShell, ICommandManager, IContextKeyManager, IWorkspaceService } from '../common/application/types';
import * as constants from '../common/constants';
import '../common/extensions';
import { IDisposableRegistry, Product } from '../common/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { EventName } from '../telemetry/constants';
import { captureTelemetry, sendTelemetryEvent } from '../telemetry/index';
import { selectTestWorkspace } from './common/testUtils';
import { TestSettingsPropertyNames } from './configuration/types';
import { ITestConfigurationService, ITestsHelper } from './common/types';
import { ITestingService } from './types';
import { IExtensionActivationService } from '../activation/types';
import { ITestController } from './testController/common/types';
import { DelayedTrigger, IDelayedTrigger } from '../common/utils/delayTrigger';
import { ExtensionContextKey } from '../common/application/contextKeys';
import { checkForFailedTests, updateTestResultMap } from './testController/common/testItemUtilities';
import { Testing } from '../common/utils/localize';
import { traceVerbose, traceWarn } from '../logging';
import { writeTestIdToClipboard } from './utils';

@injectable()
export class TestingService implements ITestingService {
    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {}

    public getSettingsPropertyNames(product: Product): TestSettingsPropertyNames {
        const helper = this.serviceContainer.get<ITestsHelper>(ITestsHelper);
        return helper.getSettingsPropertyNames(product);
    }
}

@injectable()
export class UnitTestManagementService implements IExtensionActivationService {
    private activatedOnce: boolean = false;
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };
    private readonly disposableRegistry: Disposable[];
    private workspaceService: IWorkspaceService;
    private context: IContextKeyManager;
    private testController: ITestController | undefined;
    private configChangeTrigger: IDelayedTrigger;

    // This is temporarily needed until the proposed API settles for this part
    private testStateMap: Map<string, TestResultState> = new Map();

    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {
        this.disposableRegistry = serviceContainer.get<Disposable[]>(IDisposableRegistry);
        this.workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        this.context = this.serviceContainer.get<IContextKeyManager>(IContextKeyManager);

        if (tests && !!tests.createTestController) {
            this.testController = serviceContainer.get<ITestController>(ITestController);
        }

        const configChangeTrigger = new DelayedTrigger(
            this.configurationChangeHandler.bind(this),
            500,
            'Test Configuration Change',
        );
        this.configChangeTrigger = configChangeTrigger;
        this.disposableRegistry.push(configChangeTrigger);
    }

    public async activate(): Promise<void> {
        if (this.activatedOnce) {
            return;
        }
        this.activatedOnce = true;

        this.registerHandlers();
        this.registerCommands();

        if (!!tests.testResults) {
            await this.updateTestUIButtons();
            this.disposableRegistry.push(
                tests.onDidChangeTestResults(() => {
                    this.updateTestUIButtons();
                }),
            );
        }

        if (this.testController) {
            this.testController.onRefreshingStarted(async () => {
                await this.context.setContext(ExtensionContextKey.RefreshingTests, true);
            });
            this.testController.onRefreshingCompleted(async () => {
                await this.context.setContext(ExtensionContextKey.RefreshingTests, false);
            });
            this.testController.onRunWithoutConfiguration(async (unconfigured: WorkspaceFolder[]) => {
                const workspaces = this.workspaceService.workspaceFolders ?? [];
                if (unconfigured.length === workspaces.length) {
                    const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
                    await commandManager.executeCommand('workbench.view.testing.focus');
                    traceWarn(
                        'Testing: Run attempted but no test configurations found for any workspace, use command palette to configure tests for python if desired.',
                    );
                }
            });
        }
    }

    private async updateTestUIButtons() {
        // See if we already have stored tests results from previous runs.
        // The tests results currently has a historical test status based on runs. To get a
        // full picture of the tests state these need to be reduced by test id.
        updateTestResultMap(this.testStateMap, tests.testResults);

        const hasFailedTests = checkForFailedTests(this.testStateMap);
        await this.context.setContext(ExtensionContextKey.HasFailedTests, hasFailedTests);
    }

    private async configurationChangeHandler(eventArgs: ConfigurationChangeEvent) {
        const workspaces = this.workspaceService.workspaceFolders ?? [];
        const changedWorkspaces: Uri[] = workspaces
            .filter((w) => eventArgs.affectsConfiguration('python.testing', w.uri))
            .map((w) => w.uri);

        await Promise.all(changedWorkspaces.map((u) => this.testController?.refreshTestData(u)));
    }

    @captureTelemetry(EventName.UNITTEST_CONFIGURE, undefined, false)
    private async configureTests(resource?: Uri) {
        let wkspace: Uri | undefined;
        if (resource) {
            const wkspaceFolder = this.workspaceService.getWorkspaceFolder(resource);
            wkspace = wkspaceFolder ? wkspaceFolder.uri : undefined;
        } else {
            const appShell = this.serviceContainer.get<IApplicationShell>(IApplicationShell);
            wkspace = await selectTestWorkspace(appShell);
        }
        if (!wkspace) {
            return;
        }
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        if (!(await interpreterService.getActiveInterpreter(wkspace))) {
            commandManager.executeCommand(constants.Commands.TriggerEnvironmentSelection, wkspace);
            return;
        }
        const configurationService = this.serviceContainer.get<ITestConfigurationService>(ITestConfigurationService);
        await configurationService.promptToEnableAndConfigureTestFramework(wkspace!);
    }

    private registerCommands(): void {
        const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        this.disposableRegistry.push(
            commandManager.registerCommand(
                constants.Commands.Tests_Configure,
                (_, _cmdSource: constants.CommandSource = constants.CommandSource.commandPalette, resource?: Uri) => {
                    // Ignore the exceptions returned.
                    // This command will be invoked from other places of the extension.
                    this.configureTests(resource).ignoreErrors();
                    traceVerbose('Testing: Trigger refresh after config change');
                    this.testController?.refreshTestData(resource, { forceRefresh: true });
                },
            ),
            commandManager.registerCommand(constants.Commands.Tests_CopilotSetup, (resource?: Uri):
                | { message: string; command: Command }
                | undefined => {
                const wkspaceFolder =
                    this.workspaceService.getWorkspaceFolder(resource) || this.workspaceService.workspaceFolders?.at(0);
                if (!wkspaceFolder) {
                    return undefined;
                }

                const configurationService = this.serviceContainer.get<ITestConfigurationService>(
                    ITestConfigurationService,
                );
                if (configurationService.hasConfiguredTests(wkspaceFolder.uri)) {
                    return undefined;
                }

                return {
                    message: Testing.copilotSetupMessage,
                    command: {
                        title: Testing.configureTests,
                        command: constants.Commands.Tests_Configure,
                        arguments: [undefined, constants.CommandSource.ui, resource],
                    },
                };
            }),
            commandManager.registerCommand(constants.Commands.CopyTestId, async (testItem: TestItem) => {
                writeTestIdToClipboard(testItem);
            }),
        );
    }

    private registerHandlers() {
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        this.disposableRegistry.push(
            this.workspaceService.onDidChangeConfiguration((e) => {
                this.configChangeTrigger.trigger(e);
            }),
            interpreterService.onDidChangeInterpreter(async () => {
                traceVerbose('Testing: Triggered refresh due to interpreter change.');
                sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_TRIGGER, undefined, { trigger: 'interpreter' });
                await this.testController?.refreshTestData(undefined, { forceRefresh: true });
            }),
        );
    }
}
