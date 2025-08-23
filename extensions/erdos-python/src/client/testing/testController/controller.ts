// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, named } from 'inversify';
import { uniq } from 'lodash';
import * as minimatch from 'minimatch';
import {
    CancellationToken,
    TestController,
    TestItem,
    TestRunRequest,
    tests,
    WorkspaceFolder,
    RelativePattern,
    TestRunProfileKind,
    CancellationTokenSource,
    Uri,
    EventEmitter,
    TextDocument,
    FileCoverageDetail,
    TestRun,
    MarkdownString,
} from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { ICommandManager, IWorkspaceService } from '../../common/application/types';
import * as constants from '../../common/constants';
import { IPythonExecutionFactory } from '../../common/process/types';
import { IConfigurationService, IDisposableRegistry, Resource } from '../../common/types';
import { DelayedTrigger, IDelayedTrigger } from '../../common/utils/delayTrigger';
import { noop } from '../../common/utils/misc';
import { IInterpreterService } from '../../interpreter/contracts';
import { traceError, traceInfo, traceVerbose } from '../../logging';
import { IEventNamePropertyMapping, sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { PYTEST_PROVIDER, UNITTEST_PROVIDER } from '../common/constants';
import { TestProvider } from '../types';
import { createErrorTestItem, DebugTestTag, getNodeByUri, RunTestTag } from './common/testItemUtilities';
import { buildErrorNodeOptions } from './common/utils';
import {
    ITestController,
    ITestDiscoveryAdapter,
    ITestFrameworkController,
    TestRefreshOptions,
    ITestExecutionAdapter,
} from './common/types';
import { UnittestTestDiscoveryAdapter } from './unittest/testDiscoveryAdapter';
import { UnittestTestExecutionAdapter } from './unittest/testExecutionAdapter';
import { PytestTestDiscoveryAdapter } from './pytest/pytestDiscoveryAdapter';
import { PytestTestExecutionAdapter } from './pytest/pytestExecutionAdapter';
import { WorkspaceTestAdapter } from './workspaceTestAdapter';
import { ITestDebugLauncher } from '../common/types';
import { PythonResultResolver } from './common/resultResolver';
import { onDidSaveTextDocument } from '../../common/vscodeApis/workspaceApis';
import { IEnvironmentVariablesProvider } from '../../common/variables/types';

// Types gymnastics to make sure that sendTriggerTelemetry only accepts the correct types.
type EventPropertyType = IEventNamePropertyMapping[EventName.UNITTEST_DISCOVERY_TRIGGER];
type TriggerKeyType = keyof EventPropertyType;
type TriggerType = EventPropertyType[TriggerKeyType];

@injectable()
export class PythonTestController implements ITestController, IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };

    private readonly testAdapters: Map<Uri, WorkspaceTestAdapter> = new Map();

    private readonly triggerTypes: TriggerType[] = [];

    private readonly testController: TestController;

    private readonly refreshData: IDelayedTrigger;

    private refreshCancellation: CancellationTokenSource;

    private readonly refreshingCompletedEvent: EventEmitter<void> = new EventEmitter<void>();

    private readonly refreshingStartedEvent: EventEmitter<void> = new EventEmitter<void>();

    private readonly runWithoutConfigurationEvent: EventEmitter<WorkspaceFolder[]> = new EventEmitter<
        WorkspaceFolder[]
    >();

    public readonly onRefreshingCompleted = this.refreshingCompletedEvent.event;

    public readonly onRefreshingStarted = this.refreshingStartedEvent.event;

    public readonly onRunWithoutConfiguration = this.runWithoutConfigurationEvent.event;

    private sendTestDisabledTelemetry = true;

    constructor(
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IConfigurationService) private readonly configSettings: IConfigurationService,
        @inject(ITestFrameworkController) @named(PYTEST_PROVIDER) private readonly pytest: ITestFrameworkController,
        @inject(ITestFrameworkController) @named(UNITTEST_PROVIDER) private readonly unittest: ITestFrameworkController,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IPythonExecutionFactory) private readonly pythonExecFactory: IPythonExecutionFactory,
        @inject(ITestDebugLauncher) private readonly debugLauncher: ITestDebugLauncher,
        @inject(IEnvironmentVariablesProvider) private readonly envVarsService: IEnvironmentVariablesProvider,
    ) {
        this.refreshCancellation = new CancellationTokenSource();

        this.testController = tests.createTestController('python-tests', 'Python Tests');
        this.disposables.push(this.testController);

        const delayTrigger = new DelayedTrigger(
            (uri: Uri, invalidate: boolean) => {
                this.refreshTestDataInternal(uri);
                if (invalidate) {
                    this.invalidateTests(uri);
                }
            },
            250, // Delay running the refresh by 250 ms
            'Refresh Test Data',
        );
        this.disposables.push(delayTrigger);
        this.refreshData = delayTrigger;

        this.disposables.push(
            this.testController.createRunProfile(
                'Run Tests',
                TestRunProfileKind.Run,
                this.runTests.bind(this),
                true,
                RunTestTag,
            ),
            this.testController.createRunProfile(
                'Debug Tests',
                TestRunProfileKind.Debug,
                this.runTests.bind(this),
                true,
                DebugTestTag,
            ),
            this.testController.createRunProfile(
                'Coverage Tests',
                TestRunProfileKind.Coverage,
                this.runTests.bind(this),
                true,
                RunTestTag,
            ),
        );

        this.testController.resolveHandler = this.resolveChildren.bind(this);
        this.testController.refreshHandler = (token: CancellationToken) => {
            this.disposables.push(
                token.onCancellationRequested(() => {
                    traceVerbose('Testing: Stop refreshing triggered');
                    sendTelemetryEvent(EventName.UNITTEST_DISCOVERING_STOP);
                    this.stopRefreshing();
                }),
            );

            traceVerbose('Testing: Manually triggered test refresh');
            sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_TRIGGER, undefined, {
                trigger: constants.CommandSource.commandPalette,
            });
            return this.refreshTestData(undefined, { forceRefresh: true });
        };
    }

    public async activate(): Promise<void> {
        const workspaces: readonly WorkspaceFolder[] = this.workspaceService.workspaceFolders || [];
        workspaces.forEach((workspace) => {
            const settings = this.configSettings.getSettings(workspace.uri);

            let discoveryAdapter: ITestDiscoveryAdapter;
            let executionAdapter: ITestExecutionAdapter;
            let testProvider: TestProvider;
            let resultResolver: PythonResultResolver;

            if (settings.testing.unittestEnabled) {
                testProvider = UNITTEST_PROVIDER;
                resultResolver = new PythonResultResolver(this.testController, testProvider, workspace.uri);
                discoveryAdapter = new UnittestTestDiscoveryAdapter(
                    this.configSettings,
                    resultResolver,
                    this.envVarsService,
                );
                executionAdapter = new UnittestTestExecutionAdapter(
                    this.configSettings,
                    resultResolver,
                    this.envVarsService,
                );
            } else {
                testProvider = PYTEST_PROVIDER;
                resultResolver = new PythonResultResolver(this.testController, testProvider, workspace.uri);
                discoveryAdapter = new PytestTestDiscoveryAdapter(
                    this.configSettings,
                    resultResolver,
                    this.envVarsService,
                );
                executionAdapter = new PytestTestExecutionAdapter(
                    this.configSettings,
                    resultResolver,
                    this.envVarsService,
                );
            }

            const workspaceTestAdapter = new WorkspaceTestAdapter(
                testProvider,
                discoveryAdapter,
                executionAdapter,
                workspace.uri,
                resultResolver,
            );

            this.testAdapters.set(workspace.uri, workspaceTestAdapter);

            if (settings.testing.autoTestDiscoverOnSaveEnabled) {
                traceVerbose(`Testing: Setting up watcher for ${workspace.uri.fsPath}`);
                this.watchForSettingsChanges(workspace);
                this.watchForTestContentChangeOnSave();
            }
        });
    }

    public refreshTestData(uri?: Resource, options?: TestRefreshOptions): Promise<void> {
        if (options?.forceRefresh) {
            if (uri === undefined) {
                // This is a special case where we want everything to be re-discovered.
                traceVerbose('Testing: Clearing all discovered tests');
                this.testController.items.forEach((item) => {
                    const ids: string[] = [];
                    item.children.forEach((child) => ids.push(child.id));
                    ids.forEach((id) => item.children.delete(id));
                });

                traceVerbose('Testing: Forcing test data refresh');
                return this.refreshTestDataInternal(undefined);
            }

            traceVerbose('Testing: Forcing test data refresh');
            return this.refreshTestDataInternal(uri);
        }

        this.refreshData.trigger(uri, false);
        return Promise.resolve();
    }

    public stopRefreshing(): void {
        this.refreshCancellation.cancel();
        this.refreshCancellation.dispose();
        this.refreshCancellation = new CancellationTokenSource();
    }

    public clearTestController(): void {
        const ids: string[] = [];
        this.testController.items.forEach((item) => ids.push(item.id));
        ids.forEach((id) => this.testController.items.delete(id));
    }

    private async refreshTestDataInternal(uri?: Resource): Promise<void> {
        this.refreshingStartedEvent.fire();
        if (uri) {
            const settings = this.configSettings.getSettings(uri);
            const workspace = this.workspaceService.getWorkspaceFolder(uri);
            traceInfo(`Discover tests for workspace name: ${workspace?.name} - uri: ${uri.fsPath}`);
            // Ensure we send test telemetry if it gets disabled again
            this.sendTestDisabledTelemetry = true;
            // ** experiment to roll out NEW test discovery mechanism
            if (settings.testing.pytestEnabled) {
                if (workspace && workspace.uri) {
                    const testAdapter = this.testAdapters.get(workspace.uri);
                    if (testAdapter) {
                        const testProviderInAdapter = testAdapter.getTestProvider();
                        if (testProviderInAdapter !== 'pytest') {
                            traceError('Test provider in adapter is not pytest. Please reload window.');
                            this.surfaceErrorNode(
                                workspace.uri,
                                'Test provider types are not aligned, please reload your VS Code window.',
                                'pytest',
                            );
                            return Promise.resolve();
                        }
                        await testAdapter.discoverTests(
                            this.testController,
                            this.refreshCancellation.token,
                            this.pythonExecFactory,
                            await this.interpreterService.getActiveInterpreter(workspace.uri),
                        );
                    } else {
                        traceError('Unable to find test adapter for workspace.');
                    }
                } else {
                    traceError('Unable to find workspace for given file');
                }
            } else if (settings.testing.unittestEnabled) {
                if (workspace && workspace.uri) {
                    const testAdapter = this.testAdapters.get(workspace.uri);
                    if (testAdapter) {
                        const testProviderInAdapter = testAdapter.getTestProvider();
                        if (testProviderInAdapter !== 'unittest') {
                            traceError('Test provider in adapter is not unittest. Please reload window.');
                            this.surfaceErrorNode(
                                workspace.uri,
                                'Test provider types are not aligned, please reload your VS Code window.',
                                'unittest',
                            );
                            return Promise.resolve();
                        }
                        await testAdapter.discoverTests(
                            this.testController,
                            this.refreshCancellation.token,
                            this.pythonExecFactory,
                            await this.interpreterService.getActiveInterpreter(workspace.uri),
                        );
                    } else {
                        traceError('Unable to find test adapter for workspace.');
                    }
                } else {
                    traceError('Unable to find workspace for given file');
                }
            } else {
                if (this.sendTestDisabledTelemetry) {
                    this.sendTestDisabledTelemetry = false;
                    sendTelemetryEvent(EventName.UNITTEST_DISABLED);
                }
                // If we are here we may have to remove an existing node from the tree
                // This handles the case where user removes test settings. Which should remove the
                // tests for that particular case from the tree view
                if (workspace) {
                    const toDelete: string[] = [];
                    this.testController.items.forEach((i: TestItem) => {
                        const w = this.workspaceService.getWorkspaceFolder(i.uri);
                        if (w?.uri.fsPath === workspace.uri.fsPath) {
                            toDelete.push(i.id);
                        }
                    });
                    toDelete.forEach((i) => this.testController.items.delete(i));
                }
            }
        } else {
            traceVerbose('Testing: Refreshing all test data');
            const workspaces: readonly WorkspaceFolder[] = this.workspaceService.workspaceFolders || [];
            await Promise.all(
                workspaces.map(async (workspace) => {
                    if (!(await this.interpreterService.getActiveInterpreter(workspace.uri))) {
                        this.commandManager
                            .executeCommand(constants.Commands.TriggerEnvironmentSelection, workspace.uri)
                            .then(noop, noop);
                        return;
                    }
                    await this.refreshTestDataInternal(workspace.uri);
                }),
            );
        }
        this.refreshingCompletedEvent.fire();
        return Promise.resolve();
    }

    private async resolveChildren(item: TestItem | undefined): Promise<void> {
        if (item) {
            traceVerbose(`Testing: Resolving item ${item.id}`);
            const settings = this.configSettings.getSettings(item.uri);
            if (settings.testing.pytestEnabled) {
                return this.pytest.resolveChildren(this.testController, item, this.refreshCancellation.token);
            }
            if (settings.testing.unittestEnabled) {
                return this.unittest.resolveChildren(this.testController, item, this.refreshCancellation.token);
            }
        } else {
            traceVerbose('Testing: Refreshing all test data');
            this.sendTriggerTelemetry('auto');
            const workspaces: readonly WorkspaceFolder[] = this.workspaceService.workspaceFolders || [];
            await Promise.all(
                workspaces.map(async (workspace) => {
                    if (!(await this.interpreterService.getActiveInterpreter(workspace.uri))) {
                        traceError('Cannot trigger test discovery as a valid interpreter is not selected');
                        return;
                    }
                    await this.refreshTestDataInternal(workspace.uri);
                }),
            );
        }
        return Promise.resolve();
    }

    private async runTests(request: TestRunRequest, token: CancellationToken): Promise<void> {
        const workspaces: WorkspaceFolder[] = [];
        if (request.include) {
            uniq(request.include.map((r) => this.workspaceService.getWorkspaceFolder(r.uri))).forEach((w) => {
                if (w) {
                    workspaces.push(w);
                }
            });
        } else {
            (this.workspaceService.workspaceFolders || []).forEach((w) => workspaces.push(w));
        }
        const runInstance = this.testController.createTestRun(
            request,
            `Running Tests for Workspace(s): ${workspaces.map((w) => w.uri.fsPath).join(';')}`,
            true,
        );
        const dispose = token.onCancellationRequested(() => {
            runInstance.appendOutput(`\nRun instance cancelled.\r\n`);
            runInstance.end();
        });

        const unconfiguredWorkspaces: WorkspaceFolder[] = [];

        try {
            await Promise.all(
                workspaces.map(async (workspace) => {
                    if (!(await this.interpreterService.getActiveInterpreter(workspace.uri))) {
                        this.commandManager
                            .executeCommand(constants.Commands.TriggerEnvironmentSelection, workspace.uri)
                            .then(noop, noop);
                        return undefined;
                    }
                    const testItems: TestItem[] = [];
                    // If the run request includes test items then collect only items that belong to
                    // `workspace`. If there are no items in the run request then just run the `workspace`
                    // root test node. Include will be `undefined` in the "run all" scenario.
                    (request.include ?? this.testController.items).forEach((i: TestItem) => {
                        const w = this.workspaceService.getWorkspaceFolder(i.uri);
                        if (w?.uri.fsPath === workspace.uri.fsPath) {
                            testItems.push(i);
                        }
                    });

                    const settings = this.configSettings.getSettings(workspace.uri);
                    if (testItems.length > 0) {
                        const testAdapter =
                            this.testAdapters.get(workspace.uri) ||
                            (this.testAdapters.values().next().value as WorkspaceTestAdapter);

                        // no profile will have TestRunProfileKind.Coverage if rewrite isn't enabled
                        if (request.profile?.kind && request.profile?.kind === TestRunProfileKind.Coverage) {
                            request.profile.loadDetailedCoverage = (
                                _testRun: TestRun,
                                fileCoverage,
                                _token,
                            ): Thenable<FileCoverageDetail[]> => {
                                const details = testAdapter.resultResolver.detailedCoverageMap.get(
                                    fileCoverage.uri.fsPath,
                                );
                                if (details === undefined) {
                                    // given file has no detailed coverage data
                                    return Promise.resolve([]);
                                }
                                return Promise.resolve(details);
                            };
                        }

                        if (settings.testing.pytestEnabled) {
                            sendTelemetryEvent(EventName.UNITTEST_RUN, undefined, {
                                tool: 'pytest',
                                debugging: request.profile?.kind === TestRunProfileKind.Debug,
                            });
                            return testAdapter.executeTests(
                                this.testController,
                                runInstance,
                                testItems,
                                token,
                                request.profile?.kind,
                                this.pythonExecFactory,
                                this.debugLauncher,
                                await this.interpreterService.getActiveInterpreter(workspace.uri),
                            );
                        }
                        if (settings.testing.unittestEnabled) {
                            sendTelemetryEvent(EventName.UNITTEST_RUN, undefined, {
                                tool: 'unittest',
                                debugging: request.profile?.kind === TestRunProfileKind.Debug,
                            });
                            // ** experiment to roll out NEW test discovery mechanism
                            return testAdapter.executeTests(
                                this.testController,
                                runInstance,
                                testItems,
                                token,
                                request.profile?.kind,
                                this.pythonExecFactory,
                                this.debugLauncher,
                                await this.interpreterService.getActiveInterpreter(workspace.uri),
                            );
                        }
                    }
                    if (!settings.testing.pytestEnabled && !settings.testing.unittestEnabled) {
                        unconfiguredWorkspaces.push(workspace);
                    }
                    return Promise.resolve();
                }),
            );
        } finally {
            traceVerbose('Finished running tests, ending runInstance.');
            runInstance.appendOutput(`Finished running tests!\r\n`);
            runInstance.end();
            dispose.dispose();
            if (unconfiguredWorkspaces.length > 0) {
                this.runWithoutConfigurationEvent.fire(unconfiguredWorkspaces);
            }
        }
    }

    private invalidateTests(uri: Uri) {
        this.testController.items.forEach((root) => {
            const item = getNodeByUri(root, uri);
            if (item && !!item.invalidateResults) {
                // Minimize invalidating to test case nodes for the test file where
                // the change occurred
                item.invalidateResults();
            }
        });
    }

    private watchForSettingsChanges(workspace: WorkspaceFolder): void {
        const pattern = new RelativePattern(workspace, '**/{settings.json,pytest.ini,pyproject.toml,setup.cfg}');
        const watcher = this.workspaceService.createFileSystemWatcher(pattern);
        this.disposables.push(watcher);

        this.disposables.push(
            onDidSaveTextDocument(async (doc: TextDocument) => {
                const file = doc.fileName;
                // refresh on any settings file save
                if (
                    file.includes('settings.json') ||
                    file.includes('pytest.ini') ||
                    file.includes('setup.cfg') ||
                    file.includes('pyproject.toml')
                ) {
                    traceVerbose(`Testing: Trigger refresh after saving ${doc.uri.fsPath}`);
                    this.sendTriggerTelemetry('watching');
                    this.refreshData.trigger(doc.uri, false);
                }
            }),
        );
        /* Keep both watchers for create and delete since config files can change test behavior without content
        due to their impact on pythonPath. */
        this.disposables.push(
            watcher.onDidCreate((uri) => {
                traceVerbose(`Testing: Trigger refresh after creating ${uri.fsPath}`);
                this.sendTriggerTelemetry('watching');
                this.refreshData.trigger(uri, false);
            }),
        );
        this.disposables.push(
            watcher.onDidDelete((uri) => {
                traceVerbose(`Testing: Trigger refresh after deleting in ${uri.fsPath}`);
                this.sendTriggerTelemetry('watching');
                this.refreshData.trigger(uri, false);
            }),
        );
    }

    private watchForTestContentChangeOnSave(): void {
        this.disposables.push(
            onDidSaveTextDocument(async (doc: TextDocument) => {
                const settings = this.configSettings.getSettings(doc.uri);
                if (
                    settings.testing.autoTestDiscoverOnSaveEnabled &&
                    minimatch.default(doc.uri.fsPath, settings.testing.autoTestDiscoverOnSavePattern)
                ) {
                    traceVerbose(`Testing: Trigger refresh after saving ${doc.uri.fsPath}`);
                    this.sendTriggerTelemetry('watching');
                    this.refreshData.trigger(doc.uri, false);
                }
            }),
        );
    }

    /**
     * Send UNITTEST_DISCOVERY_TRIGGER telemetry event only once per trigger type.
     *
     * @param triggerType The trigger type to send telemetry for.
     */
    private sendTriggerTelemetry(trigger: TriggerType): void {
        if (!this.triggerTypes.includes(trigger)) {
            sendTelemetryEvent(EventName.UNITTEST_DISCOVERY_TRIGGER, undefined, {
                trigger,
            });
            this.triggerTypes.push(trigger);
        }
    }

    private surfaceErrorNode(workspaceUri: Uri, message: string, testProvider: TestProvider): void {
        let errorNode = this.testController.items.get(`DiscoveryError:${workspaceUri.fsPath}`);
        if (errorNode === undefined) {
            const options = buildErrorNodeOptions(workspaceUri, message, testProvider);
            errorNode = createErrorTestItem(this.testController, options);
            this.testController.items.add(errorNode);
        }
        const errorNodeLabel: MarkdownString = new MarkdownString(message);
        errorNodeLabel.isTrusted = true;
        errorNode.error = errorNodeLabel;
    }
}
