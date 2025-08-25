// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import {
    ConfigurationTarget,
    OpenDialogOptions,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    Uri,
    WorkspaceFolder,
} from 'vscode';
import { cloneDeep } from 'lodash';
import { anything, instance, mock, when, verify } from 'ts-mockito';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../client/common/application/types';
import { PathUtils } from '../../../../client/common/platform/pathUtils';
import { IPlatformService } from '../../../../client/common/platform/types';
import { IConfigurationService, IPythonSettings } from '../../../../client/common/types';
import { Common, InterpreterQuickPickList, Interpreters } from '../../../../client/common/utils/localize';
import {
    IMultiStepInput,
    IMultiStepInputFactory,
    InputStep,
    IQuickPickParameters,
} from '../../../../client/common/utils/multiStepInput';
import {
    EnvGroups,
    InterpreterStateArgs,
    QuickPickType,
    SetInterpreterCommand,
} from '../../../../client/interpreter/configuration/interpreterSelector/commands/setInterpreter';
import {
    IInterpreterQuickPickItem,
    IInterpreterSelector,
    IPythonPathUpdaterServiceManager,
} from '../../../../client/interpreter/configuration/types';
import { EnvironmentType, PythonEnvironment } from '../../../../client/pythonEnvironments/info';
import { EventName } from '../../../../client/telemetry/constants';
import * as Telemetry from '../../../../client/telemetry';
import { MockWorkspaceConfiguration } from '../../../mocks/mockWorkspaceConfig';
import { Commands, Octicons } from '../../../../client/common/constants';
import { IInterpreterService, PythonEnvironmentsChangedEvent } from '../../../../client/interpreter/contracts';
import { createDeferred, sleep } from '../../../../client/common/utils/async';
import { SystemVariables } from '../../../../client/common/variables/systemVariables';
import { untildify } from '../../../../client/common/helpers';
import * as extapi from '../../../../client/envExt/api.internal';

type TelemetryEventType = { eventName: EventName; properties: unknown };

suite('Set Interpreter Command', () => {
    let workspace: TypeMoq.IMock<IWorkspaceService>;
    let interpreterSelector: TypeMoq.IMock<IInterpreterSelector>;
    let appShell: TypeMoq.IMock<IApplicationShell>;
    let commandManager: TypeMoq.IMock<ICommandManager>;
    let pythonPathUpdater: TypeMoq.IMock<IPythonPathUpdaterServiceManager>;
    let configurationService: TypeMoq.IMock<IConfigurationService>;
    let pythonSettings: TypeMoq.IMock<IPythonSettings>;
    let platformService: TypeMoq.IMock<IPlatformService>;
    let multiStepInputFactory: TypeMoq.IMock<IMultiStepInputFactory>;
    let interpreterService: IInterpreterService;
    let useEnvExtensionStub: sinon.SinonStub;
    const folder1 = { name: 'one', uri: Uri.parse('one'), index: 1 };
    const folder2 = { name: 'two', uri: Uri.parse('two'), index: 2 };

    let setInterpreterCommand: SetInterpreterCommand;

    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        interpreterSelector = TypeMoq.Mock.ofType<IInterpreterSelector>();
        multiStepInputFactory = TypeMoq.Mock.ofType<IMultiStepInputFactory>();
        platformService = TypeMoq.Mock.ofType<IPlatformService>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        pythonPathUpdater = TypeMoq.Mock.ofType<IPythonPathUpdaterServiceManager>();
        configurationService = TypeMoq.Mock.ofType<IConfigurationService>();
        pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();

        workspace = TypeMoq.Mock.ofType<IWorkspaceService>();
        interpreterService = mock<IInterpreterService>();
        when(interpreterService.refreshPromise).thenReturn(undefined);
        when(interpreterService.triggerRefresh(anything(), anything())).thenResolve();
        workspace.setup((w) => w.rootPath).returns(() => 'rootPath');

        configurationService.setup((x) => x.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);

        setInterpreterCommand = new SetInterpreterCommand(
            appShell.object,
            new PathUtils(false),
            pythonPathUpdater.object,
            configurationService.object,
            commandManager.object,
            multiStepInputFactory.object,
            platformService.object,
            interpreterSelector.object,
            workspace.object,
            instance(interpreterService),
            {} as any, // IPythonRuntimeManager mock
        );
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Test method _pickInterpreter()', async () => {
        let _enterOrBrowseInterpreterPath: sinon.SinonStub;
        let sendTelemetryStub: sinon.SinonStub;
        let telemetryEvent: TelemetryEventType | undefined;

        const interpreterPath = 'path/to/interpreter';
        const item: IInterpreterQuickPickItem = {
            description: interpreterPath,
            detail: '',
            label: 'This is the selected Python path',
            path: `path/to/envFolder`,
            interpreter: {
                path: interpreterPath,
                id: interpreterPath,
                envType: EnvironmentType.Conda,
                envPath: `path/to/envFolder`,
            } as PythonEnvironment,
        };
        const defaultInterpreterPath = 'defaultInterpreterPath';
        const defaultInterpreterPathSuggestion = {
            label: `${Octicons.Gear} ${InterpreterQuickPickList.defaultInterpreterPath.label}`,
            description: defaultInterpreterPath,
            path: defaultInterpreterPath,
            alwaysShow: true,
        };

        const noPythonInstalled = {
            label: `${Octicons.Error} ${InterpreterQuickPickList.noPythonInstalled}`,
            detail: InterpreterQuickPickList.clickForInstructions,
            alwaysShow: true,
        };

        const tipToReloadWindow = {
            label: `${Octicons.Lightbulb} Reload the window if you installed Python but don't see it`,
            detail: `Click to run \`Developer: Reload Window\` command`,
            alwaysShow: true,
        };

        const refreshedItem: IInterpreterQuickPickItem = {
            description: interpreterPath,
            detail: '',
            label: 'Refreshed path',
            path: `path/to/envFolder`,
            interpreter: {
                path: interpreterPath,
                id: interpreterPath,
                envType: EnvironmentType.Conda,
                envPath: `path/to/envFolder`,
            } as PythonEnvironment,
        };
        const expectedEnterInterpreterPathSuggestion = {
            label: `${Octicons.Folder} ${InterpreterQuickPickList.enterPath.label}`,
            alwaysShow: true,
        };
        const expectedCreateEnvSuggestion = {
            label: `${Octicons.Add} ${InterpreterQuickPickList.create.label}`,
            alwaysShow: true,
        };
        const currentPythonPath = 'python';
        const workspacePath = 'path/to/workspace';

        setup(() => {
            _enterOrBrowseInterpreterPath = sinon.stub(
                SetInterpreterCommand.prototype,
                '_enterOrBrowseInterpreterPath',
            );
            _enterOrBrowseInterpreterPath.resolves();
            sendTelemetryStub = sinon
                .stub(Telemetry, 'sendTelemetryEvent')
                .callsFake((eventName: EventName, _, properties: unknown) => {
                    telemetryEvent = {
                        eventName,
                        properties,
                    };
                });
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => [item]);
            interpreterSelector
                .setup((i) => i.getRecommendedSuggestion(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => item);

            pythonSettings.setup((p) => p.pythonPath).returns(() => currentPythonPath);
            pythonSettings.setup((p) => p.defaultInterpreterPath).returns(() => defaultInterpreterPath);

            workspace
                .setup((w) => w.getConfiguration(TypeMoq.It.isValue('python'), TypeMoq.It.isAny()))
                .returns(
                    () =>
                        new MockWorkspaceConfiguration({
                            defaultInterpreterPath,
                        }),
                );

            workspace
                .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isAny()))
                .returns(() => (({ uri: { fsPath: workspacePath } } as unknown) as WorkspaceFolder));

            setInterpreterCommand = new SetInterpreterCommand(
                appShell.object,
                new PathUtils(false),
                pythonPathUpdater.object,
                configurationService.object,
                commandManager.object,
                multiStepInputFactory.object,
                platformService.object,
                interpreterSelector.object,
                workspace.object,
                instance(interpreterService),
                {} as any, // IPythonRuntimeManager mock
            );
        });
        teardown(() => {
            telemetryEvent = undefined;
            sinon.restore();
            Telemetry._resetSharedProperties();
        });

        test('Existing state path must be removed before displaying picker', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(undefined as unknown));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(state.path).to.equal(undefined, '');
        });

        test('Picker should be displayed with expected items', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const recommended = cloneDeep(item);
            recommended.label = item.label;
            recommended.description = interpreterPath;
            const suggestions = [
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: EnvGroups.Recommended },
                recommended,
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions,
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            if (typeof actualParameters!.activeItem === 'function') {
                const activeItem = await actualParameters!.activeItem(({ items: suggestions } as unknown) as QuickPick<
                    QuickPickType
                >);
                assert.deepStrictEqual(activeItem, recommended);
            } else {
                assert.ok(false, 'Not a function');
            }
            delete actualParameters!.activeItem;
            assert.deepStrictEqual(actualParameters, expectedParameters, 'Params not equal');
        });

        test('Picker should show create env when set in options', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const recommended = cloneDeep(item);
            recommended.label = item.label;
            recommended.description = interpreterPath;
            const suggestions = [
                expectedCreateEnvSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: EnvGroups.Recommended },
                recommended,
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions,
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state, undefined, {
                showCreateEnvironment: true,
            });

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            if (typeof actualParameters!.activeItem === 'function') {
                const activeItem = await actualParameters!.activeItem(({ items: suggestions } as unknown) as QuickPick<
                    QuickPickType
                >);
                assert.deepStrictEqual(activeItem, recommended);
            } else {
                assert.ok(false, 'Not a function');
            }
            delete actualParameters!.activeItem;
            assert.deepStrictEqual(actualParameters, expectedParameters, 'Params not equal');
        });

        test('Picker should be displayed with expected items if no interpreters are available', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const suggestions = [
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultInterpreterPathSuggestion,
                noPythonInstalled,
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions, // Verify suggestions
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => []);

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            if (typeof actualParameters!.activeItem === 'function') {
                const activeItem = await actualParameters!.activeItem(({ items: suggestions } as unknown) as QuickPick<
                    QuickPickType
                >);
                assert.deepStrictEqual(activeItem, noPythonInstalled);
            } else {
                assert.ok(false, 'Not a function');
            }
            delete actualParameters!.activeItem;
            assert.deepStrictEqual(actualParameters, expectedParameters, 'Params not equal');
        });

        test('Picker should install python if corresponding item is selected', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve((noPythonInstalled as unknown) as QuickPickItem));
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => []);
            commandManager
                .setup((c) => c.executeCommand(Commands.InstallPython))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            commandManager.verifyAll();
        });

        test('Picker should reload window if corresponding item is selected', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve((tipToReloadWindow as unknown) as QuickPickItem));
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => []);
            commandManager
                .setup((c) => c.executeCommand('workbench.action.reloadWindow'))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            commandManager.verifyAll();
        });

        test('Items displayed should be grouped if no refresh is going on', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const interpreterItems: IInterpreterQuickPickItem[] = [
                {
                    description: `${workspacePath}/interpreterPath1`,
                    detail: '',
                    label: 'This is the selected Python path',
                    path: `${workspacePath}/interpreterPath1`,
                    interpreter: {
                        id: `${workspacePath}/interpreterPath1`,
                        path: `${workspacePath}/interpreterPath1`,
                        envType: EnvironmentType.Venv,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath2',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath2',
                    interpreter: {
                        id: 'interpreterPath2',
                        path: 'interpreterPath2',
                        envType: EnvironmentType.VirtualEnvWrapper,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath3',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath3',
                    interpreter: {
                        id: 'interpreterPath3',
                        path: 'interpreterPath3',
                        envType: EnvironmentType.VirtualEnvWrapper,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath4',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath4',
                    interpreter: {
                        path: 'interpreterPath4',
                        id: 'interpreterPath4',
                        envType: EnvironmentType.Conda,
                    } as PythonEnvironment,
                },
                item,
                {
                    description: 'interpreterPath5',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath5',
                    interpreter: {
                        path: 'interpreterPath5',
                        id: 'interpreterPath5',
                        envType: EnvironmentType.Global,
                    } as PythonEnvironment,
                },
            ];
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => interpreterItems);
            interpreterSelector
                .setup((i) => i.getRecommendedSuggestion(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => item);
            const recommended = cloneDeep(item);
            recommended.label = item.label;
            recommended.description = interpreterPath;
            const suggestions = [
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: EnvGroups.Recommended },
                recommended,
                { label: EnvGroups.Workspace, kind: QuickPickItemKind.Separator },
                interpreterItems[0],
                { label: EnvGroups.VirtualEnvWrapper, kind: QuickPickItemKind.Separator },
                interpreterItems[1],
                interpreterItems[2],
                { label: EnvGroups.Conda, kind: QuickPickItemKind.Separator },
                interpreterItems[3],
                item,
                { label: EnvGroups.Global, kind: QuickPickItemKind.Separator },
                interpreterItems[5],
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions,
                activeItem: recommended,
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            assert.deepStrictEqual(actualParameters?.items, expectedParameters.items, 'Params not equal');
        });

        test('Items displayed should be filtered out if a filter is provided', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const interpreterItems: IInterpreterQuickPickItem[] = [
                {
                    description: `${workspacePath}/interpreterPath1`,
                    detail: '',
                    label: 'This is the selected Python path',
                    path: `${workspacePath}/interpreterPath1`,
                    interpreter: {
                        id: `${workspacePath}/interpreterPath1`,
                        path: `${workspacePath}/interpreterPath1`,
                        envType: EnvironmentType.Venv,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath2',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath2',
                    interpreter: {
                        id: 'interpreterPath2',
                        path: 'interpreterPath2',
                        envType: EnvironmentType.VirtualEnvWrapper,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath3',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath3',
                    interpreter: {
                        id: 'interpreterPath3',
                        path: 'interpreterPath3',
                        envType: EnvironmentType.VirtualEnvWrapper,
                    } as PythonEnvironment,
                },
                {
                    description: 'interpreterPath4',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath4',
                    interpreter: {
                        path: 'interpreterPath4',
                        id: 'interpreterPath4',
                        envType: EnvironmentType.Conda,
                    } as PythonEnvironment,
                },
                item,
                {
                    description: 'interpreterPath5',
                    detail: '',
                    label: 'This is the selected Python path',
                    path: 'interpreterPath5',
                    interpreter: {
                        path: 'interpreterPath5',
                        id: 'interpreterPath5',
                        envType: EnvironmentType.Global,
                    } as PythonEnvironment,
                },
            ];
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => interpreterItems);
            interpreterSelector
                .setup((i) => i.getRecommendedSuggestion(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => item);
            const recommended = cloneDeep(item);
            recommended.label = item.label;
            recommended.description = interpreterPath;
            const suggestions = [
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: EnvGroups.Recommended },
                recommended,
                { label: EnvGroups.VirtualEnvWrapper, kind: QuickPickItemKind.Separator },
                interpreterItems[1],
                interpreterItems[2],
                { label: EnvGroups.Global, kind: QuickPickItemKind.Separator },
                interpreterItems[5],
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions,
                activeItem: recommended,
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(
                multiStepInput.object,
                state,
                (e) => e.envType === EnvironmentType.VirtualEnvWrapper || e.envType === EnvironmentType.Global,
            );

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            assert.deepStrictEqual(actualParameters?.items, expectedParameters.items, 'Params not equal');
        });

        test('If system variables are used in the default interpreter path, make sure they are resolved when the path is displayed', async () => {
            // Create a SetInterpreterCommand instance from scratch, and use a different defaultInterpreterPath from the rest of the tests.
            const workspaceDefaultInterpreterPath = '${workspaceFolder}/defaultInterpreterPath';

            const systemVariables = new SystemVariables(undefined, undefined, workspace.object);
            const pathUtils = new PathUtils(false);

            const expandedPath = systemVariables.resolveAny(workspaceDefaultInterpreterPath);
            const expandedDetail = pathUtils.getDisplayName(expandedPath);

            pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
            workspace = TypeMoq.Mock.ofType<IWorkspaceService>();

            pythonSettings.setup((p) => p.pythonPath).returns(() => currentPythonPath);
            pythonSettings.setup((p) => p.defaultInterpreterPath).returns(() => workspaceDefaultInterpreterPath);
            configurationService.setup((x) => x.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);
            workspace.setup((w) => w.rootPath).returns(() => 'rootPath');
            workspace
                .setup((w) => w.getConfiguration(TypeMoq.It.isValue('python'), TypeMoq.It.isAny()))
                .returns(
                    () =>
                        new MockWorkspaceConfiguration({
                            defaultInterpreterPath: workspaceDefaultInterpreterPath,
                        }),
                );

            setInterpreterCommand = new SetInterpreterCommand(
                appShell.object,
                pathUtils,
                pythonPathUpdater.object,
                configurationService.object,
                commandManager.object,
                multiStepInputFactory.object,
                platformService.object,
                interpreterSelector.object,
                workspace.object,
                instance(interpreterService),
                {} as any, // IPythonRuntimeManager mock
            );

            // Test info
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const recommended = cloneDeep(item);
            recommended.label = item.label;
            recommended.description = interpreterPath;
            const separator = { label: EnvGroups.Recommended, kind: QuickPickItemKind.Separator };

            const defaultPathSuggestion = {
                label: `${Octicons.Gear} ${InterpreterQuickPickList.defaultInterpreterPath.label}`,
                description: expandedDetail,
                path: expandedPath,
                alwaysShow: true,
            };

            const suggestions = [
                expectedEnterInterpreterPathSuggestion,
                { kind: QuickPickItemKind.Separator, label: '' },
                defaultPathSuggestion,
                separator,
                recommended,
            ];
            const expectedParameters: IQuickPickParameters<QuickPickItem> = {
                placeholder: `Selected Interpreter: ${currentPythonPath}`,
                items: suggestions,
                matchOnDetail: true,
                matchOnDescription: true,
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                sortByLabel: true,
                keepScrollPosition: true,
            };
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');

            delete actualParameters!.initialize;
            delete actualParameters!.customButtonSetups;
            delete actualParameters!.onChangeItem;
            if (typeof actualParameters!.activeItem === 'function') {
                const activeItem = await actualParameters!.activeItem(({ items: suggestions } as unknown) as QuickPick<
                    QuickPickType
                >);
                assert.deepStrictEqual(activeItem, recommended);
            } else {
                assert.ok(false, 'Not a function');
            }
            delete actualParameters!.activeItem;

            assert.deepStrictEqual(actualParameters, expectedParameters, 'Params not equal');
        });

        test('Ensure a refresh is triggered if refresh button is clicked', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const refreshButtons = actualParameters!.customButtonSetups;
            expect(refreshButtons).to.not.equal(undefined, 'Callback not set');
            expect(refreshButtons?.length).to.equal(1);

            await refreshButtons![0].callback!({} as QuickPick<QuickPickItem>); // Invoke callback, meaning that the refresh button is clicked.

            verify(interpreterService.triggerRefresh(anything(), anything())).once();
        });

        test('Events to update quickpick updates the quickpick accordingly', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            let actualParameters: IQuickPickParameters<QuickPickItem> | undefined;
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .callback((options) => {
                    actualParameters = options;
                })
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem));
            const refreshPromiseDeferred = createDeferred();
            // Assume a refresh is currently going on...
            when(interpreterService.refreshPromise).thenReturn(refreshPromiseDeferred.promise);

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(actualParameters).to.not.equal(undefined, 'Parameters not set');
            const onChangedCallback = actualParameters!.onChangeItem?.callback;
            expect(onChangedCallback).to.not.equal(undefined, 'Callback not set');
            multiStepInput.verifyAll();

            const separator = { label: EnvGroups.Conda, kind: QuickPickItemKind.Separator };
            const quickPick = {
                items: [expectedEnterInterpreterPathSuggestion, defaultInterpreterPathSuggestion, separator, item],
                activeItems: [item],
                busy: false,
            };
            interpreterSelector
                .setup((i) => i.suggestionToQuickPickItem(TypeMoq.It.isAny(), undefined, false))
                .returns(() => refreshedItem);

            const changeEvent: PythonEnvironmentsChangedEvent = {
                old: item.interpreter,
                new: refreshedItem.interpreter,
            };
            await onChangedCallback!(changeEvent, (quickPick as unknown) as QuickPick<QuickPickItem>); // Invoke callback, meaning that the items are supposed to change.

            assert.deepStrictEqual(
                quickPick,
                {
                    items: [
                        expectedEnterInterpreterPathSuggestion,
                        defaultInterpreterPathSuggestion,
                        separator,
                        refreshedItem,
                    ],
                    activeItems: [refreshedItem],
                    busy: true,
                },
                'Quickpick not updated correctly',
            );

            // Refresh is over; set the final states accordingly
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => [refreshedItem]);
            interpreterSelector
                .setup((i) => i.getRecommendedSuggestion(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => refreshedItem);
            interpreterSelector
                .setup((i) =>
                    i.suggestionToQuickPickItem(TypeMoq.It.isValue(refreshedItem.interpreter), undefined, false),
                )
                .returns(() => refreshedItem);
            when(interpreterService.refreshPromise).thenReturn(undefined);

            refreshPromiseDeferred.resolve();
            await sleep(1);

            const recommended = cloneDeep(refreshedItem);
            recommended.label = refreshedItem.label;
            recommended.description = `${interpreterPath} - ${Common.recommended}`;
            assert.deepStrictEqual(
                quickPick,
                {
                    // Refresh has finished, so recommend an interpreter
                    items: [
                        expectedEnterInterpreterPathSuggestion,
                        defaultInterpreterPathSuggestion,
                        separator,
                        recommended,
                    ],
                    activeItems: [recommended],
                    // Refresh has finished, so quickpick busy indicator should go away
                    busy: false,
                },
                'Quickpick not updated correctly after refresh has finished',
            );

            const newItem = {
                description: `${workspacePath}/interpreterPath1`,
                detail: '',
                label: 'This is the selected Python path',
                path: `${workspacePath}/interpreterPath1`,
                interpreter: {
                    id: `${workspacePath}/interpreterPath1`,
                    path: `${workspacePath}/interpreterPath1`,
                    envType: EnvironmentType.Venv,
                } as PythonEnvironment,
            };
            const changeEvent2: PythonEnvironmentsChangedEvent = {
                old: undefined,
                new: newItem.interpreter,
            };
            interpreterSelector.reset();
            interpreterSelector
                .setup((i) => i.getSuggestions(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => [refreshedItem, newItem]);
            interpreterSelector
                .setup((i) => i.getRecommendedSuggestion(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => refreshedItem);
            interpreterSelector
                .setup((i) =>
                    i.suggestionToQuickPickItem(TypeMoq.It.isValue(refreshedItem.interpreter), undefined, false),
                )
                .returns(() => refreshedItem);
            interpreterSelector
                .setup((i) => i.suggestionToQuickPickItem(TypeMoq.It.isValue(newItem.interpreter), undefined, false))
                .returns(() => newItem);
            await onChangedCallback!(changeEvent2, (quickPick as unknown) as QuickPick<QuickPickItem>); // Invoke callback, meaning that the items are supposed to change.

            assert.deepStrictEqual(
                quickPick,
                {
                    items: [
                        expectedEnterInterpreterPathSuggestion,
                        defaultInterpreterPathSuggestion,
                        separator,
                        recommended,
                        { label: EnvGroups.Workspace, kind: QuickPickItemKind.Separator },
                        newItem,
                    ],
                    activeItems: [recommended],
                    busy: false,
                },
                'Quickpick not updated correctly',
            );
        });

        test('If an item is selected, update state and return', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(item));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            expect(state.path).to.equal(item.interpreter.envPath, '');
        });

        test('If an item is selected, send SELECT_INTERPRETER_SELECTED telemetry with the "selected" property value', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(item));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            sinon.assert.calledOnce(sendTelemetryStub);
            assert.deepStrictEqual(telemetryEvent, {
                eventName: EventName.SELECT_INTERPRETER_SELECTED,
                properties: { action: 'selected' },
            });
        });

        test('If the dropdown is dismissed, send SELECT_INTERPRETER_SELECTED telemetry with the "escape" property value', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(undefined));

            await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            sinon.assert.calledOnce(sendTelemetryStub);
            assert.deepStrictEqual(telemetryEvent, {
                eventName: EventName.SELECT_INTERPRETER_SELECTED,
                properties: { action: 'escape' },
            });
        });

        test('If `Enter or browse...` option is selected, call the corresponding method with correct arguments', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(expectedEnterInterpreterPathSuggestion));

            const step = await setInterpreterCommand._pickInterpreter(multiStepInput.object, state);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await step!(multiStepInput.object as any, state);
            assert.ok(
                _enterOrBrowseInterpreterPath.calledOnceWith(multiStepInput.object, {
                    path: undefined,
                    workspace: undefined,
                }),
            );
        });
    });

    suite('Test method _enterOrBrowseInterpreterPath()', async () => {
        const items: QuickPickItem[] = [
            {
                label: InterpreterQuickPickList.browsePath.label,
                detail: InterpreterQuickPickList.browsePath.detail,
            },
        ];
        const expectedParameters = {
            placeholder: InterpreterQuickPickList.enterPath.placeholder,
            items,
            acceptFilterBoxTextAsSelection: true,
        };
        let getItemsStub: sinon.SinonStub;
        setup(() => {
            getItemsStub = sinon.stub(SetInterpreterCommand.prototype, '_getItems').returns([]);
        });
        teardown(() => sinon.restore());

        test('Picker should be displayed with expected items', async () => {
            const state: InterpreterStateArgs = { path: 'some path', workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(expectedParameters))
                .returns(() => Promise.resolve((undefined as unknown) as QuickPickItem))
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);

            multiStepInput.verifyAll();
        });

        test('If user enters path to interpreter in the filter box, get path and update state', async () => {
            const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput
                .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve('enteredPath'));

            await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);

            expect(state.path).to.equal('enteredPath', '');
        });

        test('If `Browse...` is selected, open the file browser to get path and update state', async () => {
            const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
            const expectedPathUri = Uri.parse('browsed path');
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(items[0]));
            appShell
                .setup((a) => a.showOpenDialog(TypeMoq.It.isAny()))
                .returns(() => Promise.resolve([expectedPathUri]));

            await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);

            expect(state.path).to.equal(expectedPathUri.fsPath, '');
        });

        test('If `Browse...` option is selected on Windows, file browser is opened using expected parameters', async () => {
            const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
            const filtersKey = 'Executables';
            const filtersObject: { [name: string]: string[] } = {};
            filtersObject[filtersKey] = ['exe'];
            const expectedParams = {
                filters: filtersObject,
                openLabel: InterpreterQuickPickList.browsePath.openButtonLabel,
                canSelectMany: false,
                title: InterpreterQuickPickList.browsePath.title,
            };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(items[0]));
            appShell
                .setup((a) => a.showOpenDialog(expectedParams as OpenDialogOptions))
                .verifiable(TypeMoq.Times.once());
            platformService.setup((p) => p.isWindows).returns(() => true);

            await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state).ignoreErrors();

            appShell.verifyAll();
        });

        test('If `Browse...` option is selected on non-Windows, file browser is opened using expected parameters', async () => {
            const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
            const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
            const expectedParams = {
                filters: undefined,
                openLabel: InterpreterQuickPickList.browsePath.openButtonLabel,
                canSelectMany: false,
                title: InterpreterQuickPickList.browsePath.title,
            };
            multiStepInput.setup((i) => i.showQuickPick(TypeMoq.It.isAny())).returns(() => Promise.resolve(items[0]));
            appShell.setup((a) => a.showOpenDialog(expectedParams)).verifiable(TypeMoq.Times.once());
            platformService.setup((p) => p.isWindows).returns(() => false);

            await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state).ignoreErrors();

            appShell.verifyAll();
        });

        suite('SELECT_INTERPRETER_ENTERED_EXISTS telemetry', async () => {
            let sendTelemetryStub: sinon.SinonStub;
            let telemetryEvents: TelemetryEventType[] = [];

            setup(() => {
                sendTelemetryStub = sinon
                    .stub(Telemetry, 'sendTelemetryEvent')
                    .callsFake((eventName: EventName, _, properties: unknown) => {
                        telemetryEvents.push({
                            eventName,
                            properties,
                        });
                    });
            });

            teardown(() => {
                telemetryEvents = [];
                sinon.restore();
                Telemetry._resetSharedProperties();
            });

            test('A telemetry event should be sent after manual entry of an intepreter path', async () => {
                const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
                const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
                multiStepInput
                    .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve('enteredPath'));

                await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);
                const existsTelemetry = telemetryEvents[1];

                sinon.assert.callCount(sendTelemetryStub, 2);
                expect(existsTelemetry.eventName).to.equal(EventName.SELECT_INTERPRETER_ENTERED_EXISTS);
            });

            test('A telemetry event should be sent after browsing for an interpreter', async () => {
                const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
                const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
                const expectedParams = {
                    filters: undefined,
                    openLabel: InterpreterQuickPickList.browsePath.openButtonLabel,
                    canSelectMany: false,
                    title: InterpreterQuickPickList.browsePath.title,
                };
                multiStepInput
                    .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(items[0]));
                appShell
                    .setup((a) => a.showOpenDialog(expectedParams))
                    .returns(() => Promise.resolve([{ fsPath: 'browsedPath' } as Uri]));
                platformService.setup((p) => p.isWindows).returns(() => false);

                await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);
                const existsTelemetry = telemetryEvents[1];

                sinon.assert.callCount(sendTelemetryStub, 2);
                expect(existsTelemetry.eventName).to.equal(EventName.SELECT_INTERPRETER_ENTERED_EXISTS);
            });

            enum SelectionPathType {
                Absolute = 'absolute',
                HomeRelative = 'home relative',
                WorkspaceRelative = 'workspace relative',
            }
            type DiscoveredPropertyTestValues = { discovered: boolean; pathType: SelectionPathType };
            const discoveredPropertyTestMatrix: DiscoveredPropertyTestValues[] = [
                { discovered: true, pathType: SelectionPathType.Absolute },
                { discovered: true, pathType: SelectionPathType.HomeRelative },
                { discovered: true, pathType: SelectionPathType.WorkspaceRelative },
                { discovered: false, pathType: SelectionPathType.Absolute },
                { discovered: false, pathType: SelectionPathType.HomeRelative },
                { discovered: false, pathType: SelectionPathType.WorkspaceRelative },
            ];

            const testDiscovered = async (
                discovered: boolean,
                pathType: SelectionPathType,
            ): Promise<TelemetryEventType> => {
                let interpreterPath = '';
                let expandedPath = '';
                switch (pathType) {
                    case SelectionPathType.Absolute: {
                        interpreterPath = path.resolve(path.join('is', 'absolute', 'path'));
                        expandedPath = interpreterPath;
                        break;
                    }
                    case SelectionPathType.HomeRelative: {
                        interpreterPath = path.join('~', 'relative', 'path');
                        expandedPath = untildify(interpreterPath);
                        break;
                    }
                    case SelectionPathType.WorkspaceRelative:
                    default: {
                        interpreterPath = path.join('..', 'workspace', 'path');
                        expandedPath = path.normalize(path.resolve(interpreterPath));
                    }
                }
                const state: InterpreterStateArgs = { path: undefined, workspace: undefined };
                const multiStepInput = TypeMoq.Mock.ofType<IMultiStepInput<InterpreterStateArgs>>();
                multiStepInput
                    .setup((i) => i.showQuickPick(TypeMoq.It.isAny()))
                    .returns(() => Promise.resolve(interpreterPath));

                const suggestions = [
                    { interpreter: { path: 'path/to/an/interpreter/' } },
                    { interpreter: { path: '~/path/to/another/interpreter' } },
                    { interpreter: { path: './.myvenv/bin/python' } },
                ] as IInterpreterQuickPickItem[];

                if (discovered) {
                    suggestions.push({ interpreter: { path: expandedPath } } as IInterpreterQuickPickItem);
                }
                getItemsStub.restore();
                getItemsStub = sinon.stub(SetInterpreterCommand.prototype, '_getItems').returns(suggestions);
                await setInterpreterCommand._enterOrBrowseInterpreterPath(multiStepInput.object, state);
                return telemetryEvents[1];
            };

            for (const testValue of discoveredPropertyTestMatrix) {
                test(`A telemetry event should be sent with the discovered prop set to ${
                    testValue.discovered
                } if the interpreter had ${
                    testValue.discovered ? 'already' : 'not'
                } been discovered, with an interpreter path path that is ${testValue.pathType})`, async () => {
                    const telemetryResult = await testDiscovered(testValue.discovered, testValue.pathType);

                    expect(telemetryResult.properties).to.deep.equal({ discovered: testValue.discovered });
                });
            }
        });
    });

    suite('Test method setInterpreter()', async () => {
        test('Update Global settings when there are no workspaces', async () => {
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            const selectedItem: IInterpreterQuickPickItem = {
                description: '',
                detail: '',
                label: '',
                path: 'This is the selected Python path',

                interpreter: {} as PythonEnvironment,
            };

            workspace.setup((w) => w.workspaceFolders).returns(() => undefined);

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => []);
            const multiStepInput = {
                run: (_: unknown, state: InterpreterStateArgs) => {
                    state.path = selectedItem.path;
                    return Promise.resolve();
                },
            };
            multiStepInputFactory.setup((f) => f.create()).returns(() => multiStepInput as IMultiStepInput<unknown>);
            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(selectedItem.path),
                        TypeMoq.It.isValue(ConfigurationTarget.Global),
                        TypeMoq.It.isValue('ui'),
                        TypeMoq.It.isValue(undefined),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand.setInterpreter();

            workspace.verifyAll();
            pythonPathUpdater.verifyAll();
        });
        test('Update workspace folder settings when there is one workspace folder and no workspace file', async () => {
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            workspace.setup((w) => w.workspaceFile).returns(() => undefined);
            const selectedItem: IInterpreterQuickPickItem = {
                description: '',
                detail: '',
                label: '',
                path: 'This is the selected Python path',

                interpreter: {} as PythonEnvironment,
            };

            const folder = { name: 'one', uri: Uri.parse('one'), index: 0 };
            workspace.setup((w) => w.workspaceFolders).returns(() => [folder]);

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => []);

            const multiStepInput = {
                run: (_: unknown, state: InterpreterStateArgs) => {
                    state.path = selectedItem.path;
                    return Promise.resolve();
                },
            };
            multiStepInputFactory.setup((f) => f.create()).returns(() => multiStepInput as IMultiStepInput<unknown>);

            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(selectedItem.path),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('ui'),
                        TypeMoq.It.isValue(folder.uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand.setInterpreter();

            workspace.verifyAll();
            pythonPathUpdater.verifyAll();
        });
        test('Update selected workspace folder settings when there is more than one workspace folder', async () => {
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            const selectedItem: IInterpreterQuickPickItem = {
                description: '',
                detail: '',
                label: '',
                path: 'This is the selected Python path',

                interpreter: {} as PythonEnvironment,
            };

            workspace.setup((w) => w.workspaceFolders).returns(() => [folder1, folder2]);
            const expectedItems = [
                {
                    label: 'one',
                    description: path.dirname(folder1.uri.fsPath),
                    uri: folder1.uri,
                    detail: 'python',
                },
                {
                    label: 'two',
                    description: path.dirname(folder2.uri.fsPath),
                    uri: folder2.uri,
                    detail: 'python',
                },
                {
                    label: Interpreters.entireWorkspace,
                    uri: folder1.uri,
                },
            ];

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => []);

            const multiStepInput = {
                run: (_: unknown, state: InterpreterStateArgs) => {
                    state.path = selectedItem.path;
                    return Promise.resolve();
                },
            };
            multiStepInputFactory.setup((f) => f.create()).returns(() => multiStepInput as IMultiStepInput<unknown>);
            appShell
                .setup((s) => s.showQuickPick(TypeMoq.It.isValue(expectedItems), TypeMoq.It.isAny()))
                .returns(() =>
                    Promise.resolve({
                        label: 'two',
                        description: path.dirname(folder2.uri.fsPath),
                        uri: folder2.uri,
                        detail: 'python',
                    }),
                )
                .verifiable(TypeMoq.Times.once());
            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(selectedItem.path),
                        TypeMoq.It.isValue(ConfigurationTarget.WorkspaceFolder),
                        TypeMoq.It.isValue('ui'),
                        TypeMoq.It.isValue(folder2.uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand.setInterpreter();

            appShell.verifyAll();
            workspace.verifyAll();
            pythonPathUpdater.verifyAll();
        });
        test('Update entire workspace settings when there is more than one workspace folder and `Select at workspace level` is selected', async () => {
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            const selectedItem: IInterpreterQuickPickItem = {
                description: '',
                detail: '',
                label: '',
                path: 'This is the selected Python path',

                interpreter: {} as PythonEnvironment,
            };

            workspace.setup((w) => w.workspaceFolders).returns(() => [folder1, folder2]);
            const expectedItems = [
                {
                    label: 'one',
                    description: path.dirname(folder1.uri.fsPath),
                    uri: folder1.uri,
                    detail: 'python',
                },
                {
                    label: 'two',
                    description: path.dirname(folder2.uri.fsPath),
                    uri: folder2.uri,
                    detail: 'python',
                },
                {
                    label: Interpreters.entireWorkspace,
                    uri: folder1.uri,
                },
            ];

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => [selectedItem]);
            const multiStepInput = {
                run: (_: unknown, state: InterpreterStateArgs) => {
                    state.path = selectedItem.path;
                    return Promise.resolve();
                },
            };
            multiStepInputFactory.setup((f) => f.create()).returns(() => multiStepInput as IMultiStepInput<unknown>);
            appShell
                .setup((s) => s.showQuickPick(TypeMoq.It.isValue(expectedItems), TypeMoq.It.isAny()))
                .returns(() =>
                    Promise.resolve({
                        label: Interpreters.entireWorkspace,
                        uri: folder1.uri,
                    }),
                )
                .verifiable(TypeMoq.Times.once());
            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(selectedItem.path),
                        TypeMoq.It.isValue(ConfigurationTarget.Workspace),
                        TypeMoq.It.isValue('ui'),
                        TypeMoq.It.isValue(folder1.uri),
                    ),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await setInterpreterCommand.setInterpreter();

            appShell.verifyAll();
            workspace.verifyAll();
            pythonPathUpdater.verifyAll();
        });
        test('Do not update anything when user does not select a workspace folder and there is more than one workspace folder', async () => {
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            workspace.setup((w) => w.workspaceFolders).returns(() => [folder1, folder2]);

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => []);
            multiStepInputFactory.setup((f) => f.create()).verifiable(TypeMoq.Times.never());

            const expectedItems = [
                {
                    label: 'one',
                    description: path.dirname(folder1.uri.fsPath),
                    uri: folder1.uri,
                    detail: 'python',
                },
                {
                    label: 'two',
                    description: path.dirname(folder2.uri.fsPath),
                    uri: folder2.uri,
                    detail: 'python',
                },
                {
                    label: Interpreters.entireWorkspace,
                    uri: folder1.uri,
                },
            ];

            appShell
                .setup((s) => s.showQuickPick(TypeMoq.It.isValue(expectedItems), TypeMoq.It.isAny()))
                .returns(() => Promise.resolve(undefined))
                .verifiable(TypeMoq.Times.once());
            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                )
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());

            await setInterpreterCommand.setInterpreter();

            appShell.verifyAll();
            workspace.verifyAll();
            pythonPathUpdater.verifyAll();
            multiStepInputFactory.verifyAll();
        });
        test('Make sure multiStepInput.run is called with the correct arguments', async () => {
            const pickInterpreter = sinon.stub(SetInterpreterCommand.prototype, '_pickInterpreter');
            setInterpreterCommand = new SetInterpreterCommand(
                appShell.object,
                new PathUtils(false),
                pythonPathUpdater.object,
                configurationService.object,
                commandManager.object,
                multiStepInputFactory.object,
                platformService.object,
                interpreterSelector.object,
                workspace.object,
                instance(interpreterService),
                {} as any, // IPythonRuntimeManager mock
            );
            type InputStepType = () => Promise<InputStep<unknown> | void>;
            let inputStep!: InputStepType;
            pythonSettings.setup((p) => p.pythonPath).returns(() => 'python');
            const selectedItem: IInterpreterQuickPickItem = {
                description: '',
                detail: '',
                label: '',
                path: 'This is the selected Python path',

                interpreter: {} as PythonEnvironment,
            };

            workspace.setup((w) => w.workspaceFolders).returns(() => undefined);

            interpreterSelector.setup((i) => i.getSuggestions(TypeMoq.It.isAny())).returns(() => []);
            const multiStepInput = {
                run: (inputStepArg: InputStepType, state: InterpreterStateArgs) => {
                    inputStep = inputStepArg;
                    state.path = selectedItem.path;
                    return Promise.resolve();
                },
            };
            multiStepInputFactory.setup((f) => f.create()).returns(() => multiStepInput as IMultiStepInput<unknown>);
            pythonPathUpdater
                .setup((p) =>
                    p.updatePythonPath(
                        TypeMoq.It.isValue(selectedItem.path),
                        TypeMoq.It.isValue(ConfigurationTarget.Global),
                        TypeMoq.It.isValue('ui'),
                        TypeMoq.It.isValue(undefined),
                    ),
                )
                .returns(() => Promise.resolve());

            await setInterpreterCommand.setInterpreter();

            expect(inputStep).to.not.equal(undefined, '');

            assert.ok(pickInterpreter.notCalled);
            await inputStep();
            assert.ok(pickInterpreter.calledOnce);
        });
    });
});
