// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Container } from 'inversify';
import { anything } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Disposable, Memento } from 'vscode';
import { FileSystem } from '../client/common/platform/fileSystem';
import { PathUtils } from '../client/common/platform/pathUtils';
import { PlatformService } from '../client/common/platform/platformService';
import { isWindows } from '../client/common/utils/platform';
import { RegistryImplementation } from '../client/common/platform/registry';
import { registerTypes as platformRegisterTypes } from '../client/common/platform/serviceRegistry';
import { IFileSystem, IPlatformService, IRegistry } from '../client/common/platform/types';
import { ProcessService } from '../client/common/process/proc';
import { PythonExecutionFactory } from '../client/common/process/pythonExecutionFactory';
import { PythonToolExecutionService } from '../client/common/process/pythonToolService';
import { registerTypes as processRegisterTypes } from '../client/common/process/serviceRegistry';
import {
    IProcessServiceFactory,
    IPythonExecutionFactory,
    IPythonToolExecutionService,
} from '../client/common/process/types';
import { registerTypes as commonRegisterTypes } from '../client/common/serviceRegistry';
import {
    GLOBAL_MEMENTO,
    ICurrentProcess,
    IDisposableRegistry,
    IMemento,
    IPathUtils,
    IsWindows,
    WORKSPACE_MEMENTO,
    ILogOutputChannel,
} from '../client/common/types';
import { registerTypes as variableRegisterTypes } from '../client/common/variables/serviceRegistry';
import { EnvironmentActivationService } from '../client/interpreter/activation/service';
import { IEnvironmentActivationService } from '../client/interpreter/activation/types';
import {
    IInterpreterAutoSelectionService,
    IInterpreterAutoSelectionProxyService,
} from '../client/interpreter/autoSelection/types';
import { IInterpreterService } from '../client/interpreter/contracts';
import { InterpreterService } from '../client/interpreter/interpreterService';
import { registerInterpreterTypes } from '../client/interpreter/serviceRegistry';
import { ServiceContainer } from '../client/ioc/container';
import { ServiceManager } from '../client/ioc/serviceManager';
import { IServiceContainer, IServiceManager } from '../client/ioc/types';
import { registerTypes as unittestsRegisterTypes } from '../client/testing/serviceRegistry';
import { LegacyFileSystem } from './legacyFileSystem';
import { MockOutputChannel } from './mockClasses';
import { MockAutoSelectionService } from './mocks/autoSelector';
import { MockMemento } from './mocks/mementos';
import { MockProcessService } from './mocks/proc';
import { MockProcess } from './mocks/process';
import { registerForIOC } from './pythonEnvironments/legacyIOC';
import { createTypeMoq } from './mocks/helper';

export class IocContainer {
    // This may be set (before any registration happens) to indicate
    // whether or not IOC should depend on the VS Code API (e.g. the
    // "vscode" module).  So in "functional" tests, this should be set
    // to "false".
    public useVSCodeAPI = true;

    public readonly serviceManager: IServiceManager;

    public readonly serviceContainer: IServiceContainer;

    private disposables: Disposable[] = [];

    constructor() {
        const cont = new Container({ skipBaseClassChecks: true });
        this.serviceManager = new ServiceManager(cont);
        this.serviceContainer = new ServiceContainer(cont);

        this.serviceManager.addSingletonInstance<IServiceContainer>(IServiceContainer, this.serviceContainer);
        this.serviceManager.addSingletonInstance<Disposable[]>(IDisposableRegistry, this.disposables);
        this.serviceManager.addSingleton<Memento>(IMemento, MockMemento, GLOBAL_MEMENTO);
        this.serviceManager.addSingleton<Memento>(IMemento, MockMemento, WORKSPACE_MEMENTO);

        const stdOutputChannel = new MockOutputChannel('Python');
        this.disposables.push(stdOutputChannel);
        this.serviceManager.addSingletonInstance<ILogOutputChannel>(ILogOutputChannel, stdOutputChannel);
        const testOutputChannel = new MockOutputChannel('Python Test - UnitTests');
        this.disposables.push(testOutputChannel);
        this.serviceManager.addSingletonInstance<ILogOutputChannel>(ILogOutputChannel, testOutputChannel);

        this.serviceManager.addSingleton<IInterpreterAutoSelectionService>(
            IInterpreterAutoSelectionService,
            MockAutoSelectionService,
        );
        this.serviceManager.addSingleton<IInterpreterAutoSelectionProxyService>(
            IInterpreterAutoSelectionProxyService,
            MockAutoSelectionService,
        );
    }

    public async dispose(): Promise<void> {
        for (const disposable of this.disposables) {
            if (disposable) {
                const promise = disposable.dispose() as Promise<unknown>;
                if (promise) {
                    await promise;
                }
            }
        }
        this.disposables = [];
        this.serviceManager.dispose();
    }

    public registerCommonTypes(registerFileSystem = true): void {
        commonRegisterTypes(this.serviceManager);
        if (registerFileSystem) {
            this.registerFileSystemTypes();
        }
    }

    public registerFileSystemTypes(): void {
        this.serviceManager.addSingleton<IPlatformService>(IPlatformService, PlatformService);
        this.serviceManager.addSingleton<IFileSystem>(
            IFileSystem,
            // Maybe use fake vscode.workspace.filesystem API:
            this.useVSCodeAPI ? FileSystem : LegacyFileSystem,
        );
    }

    public registerProcessTypes(): void {
        processRegisterTypes(this.serviceManager);
        const mockEnvironmentActivationService = createTypeMoq<IEnvironmentActivationService>();
        mockEnvironmentActivationService
            .setup((f) => f.getActivatedEnvironmentVariables(anything()))
            .returns(() => Promise.resolve(undefined));
    }

    public registerVariableTypes(): void {
        variableRegisterTypes(this.serviceManager);
    }

    public registerUnitTestTypes(): void {
        unittestsRegisterTypes(this.serviceManager);
    }

    public registerPlatformTypes(): void {
        platformRegisterTypes(this.serviceManager);
    }

    public registerInterpreterTypes(): void {
        // This method registers all interpreter types except `IInterpreterAutoSelectionProxyService` & `IEnvironmentActivationService`, as it's already registered in the constructor & registerMockProcessTypes() respectively
        registerInterpreterTypes(this.serviceManager);
    }

    public registerMockProcessTypes(): void {
        const processServiceFactory = createTypeMoq<IProcessServiceFactory>();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processService = new MockProcessService(new ProcessService(process.env as any));
        processServiceFactory.setup((f) => f.create(TypeMoq.It.isAny())).returns(() => Promise.resolve(processService));
        this.serviceManager.addSingletonInstance<IProcessServiceFactory>(
            IProcessServiceFactory,
            processServiceFactory.object,
        );
        this.serviceManager.addSingleton<IPythonExecutionFactory>(IPythonExecutionFactory, PythonExecutionFactory);
        this.serviceManager.addSingleton<IPythonToolExecutionService>(
            IPythonToolExecutionService,
            PythonToolExecutionService,
        );
        this.serviceManager.addSingleton<IEnvironmentActivationService>(
            IEnvironmentActivationService,
            EnvironmentActivationService,
        );
        const mockEnvironmentActivationService = createTypeMoq<IEnvironmentActivationService>();
        mockEnvironmentActivationService
            .setup((m) => m.getActivatedEnvironmentVariables(anything()))
            .returns(() => Promise.resolve(undefined));
        this.serviceManager.rebindInstance<IEnvironmentActivationService>(
            IEnvironmentActivationService,
            mockEnvironmentActivationService.object,
        );
    }

    public async registerMockInterpreterTypes(): Promise<void> {
        this.serviceManager.addSingleton<IInterpreterService>(IInterpreterService, InterpreterService);
        this.serviceManager.addSingleton<IRegistry>(IRegistry, RegistryImplementation);
        await registerForIOC(this.serviceManager, this.serviceContainer);
    }

    public registerMockProcess(): void {
        this.serviceManager.addSingletonInstance<boolean>(IsWindows, isWindows());

        this.serviceManager.addSingleton<IPathUtils>(IPathUtils, PathUtils);
        this.serviceManager.addSingleton<ICurrentProcess>(ICurrentProcess, MockProcess);
    }
}
