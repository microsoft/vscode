import { expect } from 'chai';
import * as path from 'path';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import {
    ConfigurationTarget,
    Disposable,
    EventEmitter,
    LanguageStatusItem,
    LanguageStatusSeverity,
    StatusBarAlignment,
    StatusBarItem,
    Uri,
    WorkspaceFolder,
} from 'vscode';
import { IExtensionSingleActivationService } from '../../client/activation/types';
import { IApplicationShell, IWorkspaceService } from '../../client/common/application/types';
import { Commands, PYTHON_LANGUAGE } from '../../client/common/constants';
import { IFileSystem } from '../../client/common/platform/types';
import { IDisposableRegistry, IPathUtils, ReadWrite } from '../../client/common/types';
import { InterpreterQuickPickList } from '../../client/common/utils/localize';
import { Architecture } from '../../client/common/utils/platform';
import {
    IInterpreterDisplay,
    IInterpreterHelper,
    IInterpreterService,
    IInterpreterStatusbarVisibilityFilter,
} from '../../client/interpreter/contracts';
import { InterpreterDisplay } from '../../client/interpreter/display';
import { IServiceContainer } from '../../client/ioc/types';
import * as logging from '../../client/logging';
import { EnvironmentType, PythonEnvironment } from '../../client/pythonEnvironments/info';
import { ThemeColor } from '../mocks/vsc';
import * as extapi from '../../client/envExt/api.internal';

const info: PythonEnvironment = {
    architecture: Architecture.Unknown,
    companyDisplayName: '',
    detailedDisplayName: '',
    envName: '',
    path: '',
    envType: EnvironmentType.Unknown,
    version: new SemVer('0.0.0-alpha'),
    sysPrefix: '',
    sysVersion: '',
};

suite('Interpreters Display', () => {
    let applicationShell: TypeMoq.IMock<IApplicationShell>;
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    let disposableRegistry: Disposable[];
    let statusBar: TypeMoq.IMock<StatusBarItem>;
    let interpreterDisplay: IInterpreterDisplay & IExtensionSingleActivationService;
    let interpreterHelper: TypeMoq.IMock<IInterpreterHelper>;
    let pathUtils: TypeMoq.IMock<IPathUtils>;
    let languageStatusItem: TypeMoq.IMock<LanguageStatusItem>;
    let traceLogStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;
    async function createInterpreterDisplay(filters: IInterpreterStatusbarVisibilityFilter[] = []) {
        interpreterDisplay = new InterpreterDisplay(serviceContainer.object);
        try {
            await interpreterDisplay.activate();
        } catch {}
        filters.forEach((f) => interpreterDisplay.registerVisibilityFilter(f));
    }

    async function setupMocks(useLanguageStatus: boolean) {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        applicationShell = TypeMoq.Mock.ofType<IApplicationShell>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();
        interpreterHelper = TypeMoq.Mock.ofType<IInterpreterHelper>();
        disposableRegistry = [];
        statusBar = TypeMoq.Mock.ofType<StatusBarItem>();
        statusBar.setup((s) => s.name).returns(() => '');
        languageStatusItem = TypeMoq.Mock.ofType<LanguageStatusItem>();
        pathUtils = TypeMoq.Mock.ofType<IPathUtils>();

        traceLogStub = sinon.stub(logging, 'traceLog');

        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IWorkspaceService)))
            .returns(() => workspaceService.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IApplicationShell)))
            .returns(() => applicationShell.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterService)))
            .returns(() => interpreterService.object);
        serviceContainer.setup((c) => c.get(TypeMoq.It.isValue(IFileSystem))).returns(() => fileSystem.object);
        serviceContainer.setup((c) => c.get(TypeMoq.It.isValue(IDisposableRegistry))).returns(() => disposableRegistry);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterHelper)))
            .returns(() => interpreterHelper.object);
        serviceContainer.setup((c) => c.get(TypeMoq.It.isValue(IPathUtils))).returns(() => pathUtils.object);
        if (!useLanguageStatus) {
            applicationShell
                .setup((a) =>
                    a.createStatusBarItem(
                        TypeMoq.It.isValue(StatusBarAlignment.Right),
                        TypeMoq.It.isAny(),
                        TypeMoq.It.isAny(),
                    ),
                )
                .returns(() => statusBar.object);
        } else {
            applicationShell
                .setup((a) =>
                    a.createLanguageStatusItem(TypeMoq.It.isAny(), TypeMoq.It.isValue({ language: PYTHON_LANGUAGE })),
                )
                .returns(() => languageStatusItem.object);
        }
        pathUtils.setup((p) => p.getDisplayName(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns((p) => p);
        await createInterpreterDisplay();
    }

    function setupWorkspaceFolder(resource: Uri, workspaceFolder?: Uri) {
        if (workspaceFolder) {
            const mockFolder = TypeMoq.Mock.ofType<WorkspaceFolder>();
            mockFolder.setup((w) => w.uri).returns(() => workspaceFolder);
            workspaceService
                .setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(resource)))
                .returns(() => mockFolder.object);
        } else {
            workspaceService.setup((w) => w.getWorkspaceFolder(TypeMoq.It.isValue(resource))).returns(() => undefined);
        }
    }
    [false].forEach((useLanguageStatus) => {
        suite(`When ${useLanguageStatus ? `using language status` : 'using status bar'}`, () => {
            setup(async () => {
                setupMocks(useLanguageStatus);
            });

            teardown(() => {
                sinon.restore();
            });
            test('Statusbar must be created and have command name initialized', () => {
                if (useLanguageStatus) {
                    languageStatusItem.verify(
                        (s) => (s.severity = TypeMoq.It.isValue(LanguageStatusSeverity.Information)),
                        TypeMoq.Times.once(),
                    );
                    languageStatusItem.verify(
                        (s) =>
                            (s.command = TypeMoq.It.isValue({
                                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                                command: Commands.Set_Interpreter,
                            })),
                        TypeMoq.Times.once(),
                    );
                    expect(disposableRegistry).contain(languageStatusItem.object);
                } else {
                    statusBar.verify((s) => (s.command = TypeMoq.It.isAny()), TypeMoq.Times.once());
                    expect(disposableRegistry).contain(statusBar.object);
                }
                expect(disposableRegistry).to.be.lengthOf.above(0);
            });
            test('Display name and tooltip must come from interpreter info', async () => {
                const resource = Uri.file('x');
                const workspaceFolder = Uri.file('workspace');
                const activeInterpreter: PythonEnvironment = {
                    ...info,
                    detailedDisplayName: 'Dummy_Display_Name',
                    envType: EnvironmentType.Unknown,
                    path: path.join('user', 'development', 'env', 'bin', 'python'),
                };
                setupWorkspaceFolder(resource, workspaceFolder);
                interpreterService
                    .setup((i) => i.getInterpreters(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => []);
                interpreterService
                    .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => Promise.resolve(activeInterpreter));

                await interpreterDisplay.refresh(resource);

                if (useLanguageStatus) {
                    languageStatusItem.verify(
                        (s) => (s.text = TypeMoq.It.isValue(activeInterpreter.detailedDisplayName)!),
                        TypeMoq.Times.once(),
                    );
                    languageStatusItem.verify(
                        (s) => (s.detail = TypeMoq.It.isValue(activeInterpreter.path)!),
                        TypeMoq.Times.atLeastOnce(),
                    );
                } else {
                    statusBar.verify(
                        (s) => (s.text = TypeMoq.It.isValue(activeInterpreter.detailedDisplayName)!),
                        TypeMoq.Times.once(),
                    );
                    statusBar.verify(
                        (s) => (s.tooltip = TypeMoq.It.isValue(activeInterpreter.path)!),
                        TypeMoq.Times.atLeastOnce(),
                    );
                }
            });
            test('Log the output channel if displayed needs to be updated with a new interpreter', async () => {
                const resource = Uri.file('x');
                const workspaceFolder = Uri.file('workspace');
                const activeInterpreter: PythonEnvironment = {
                    ...info,
                    detailedDisplayName: 'Dummy_Display_Name',
                    envType: EnvironmentType.Unknown,
                    path: path.join('user', 'development', 'env', 'bin', 'python'),
                };
                pathUtils
                    .setup((p) => p.getDisplayName(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                    .returns(() => activeInterpreter.path);
                setupWorkspaceFolder(resource, workspaceFolder);
                interpreterService
                    .setup((i) => i.getInterpreters(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => []);
                interpreterService
                    .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => Promise.resolve(activeInterpreter));

                await interpreterDisplay.refresh(resource);
                traceLogStub.calledOnceWithExactly(
                    `Python interpreter path: ${activeInterpreter.path}`,
                    activeInterpreter.path,
                );
            });
            test('If interpreter is not identified then tooltip should point to python Path', async () => {
                const resource = Uri.file('x');
                const pythonPath = path.join('user', 'development', 'env', 'bin', 'python');
                const workspaceFolder = Uri.file('workspace');
                const displayName = 'Python 3.10.1';
                const expectedDisplayName = '3.10.1';

                setupWorkspaceFolder(resource, workspaceFolder);
                const pythonInterpreter: PythonEnvironment = ({
                    detailedDisplayName: displayName,
                    path: pythonPath,
                } as any) as PythonEnvironment;
                interpreterService
                    .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => Promise.resolve(pythonInterpreter));

                await interpreterDisplay.refresh(resource);
                if (useLanguageStatus) {
                    languageStatusItem.verify(
                        (s) => (s.detail = TypeMoq.It.isValue(pythonPath)),
                        TypeMoq.Times.atLeastOnce(),
                    );
                    languageStatusItem.verify(
                        (s) => (s.text = TypeMoq.It.isValue(expectedDisplayName)),
                        TypeMoq.Times.once(),
                    );
                } else {
                    statusBar.verify((s) => (s.tooltip = TypeMoq.It.isValue(pythonPath)), TypeMoq.Times.atLeastOnce());
                    statusBar.verify((s) => (s.text = TypeMoq.It.isValue(expectedDisplayName)), TypeMoq.Times.once());
                }
            });
            test('If interpreter file does not exist then update status bar accordingly', async () => {
                const resource = Uri.file('x');
                const pythonPath = path.join('user', 'development', 'env', 'bin', 'python');
                const workspaceFolder = Uri.file('workspace');
                setupWorkspaceFolder(resource, workspaceFolder);

                interpreterService
                    .setup((i) => i.getInterpreters(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => [{} as any]);
                interpreterService
                    .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(workspaceFolder)))
                    .returns(() => Promise.resolve(undefined));
                fileSystem
                    .setup((f) => f.fileExists(TypeMoq.It.isValue(pythonPath)))
                    .returns(() => Promise.resolve(false));
                interpreterHelper
                    .setup((v) => v.getInterpreterInformation(TypeMoq.It.isValue(pythonPath)))
                    .returns(() => Promise.resolve(undefined));

                await interpreterDisplay.refresh(resource);

                if (useLanguageStatus) {
                    languageStatusItem.verify(
                        (s) => (s.text = TypeMoq.It.isValue('$(alert) No Interpreter Selected')),
                        TypeMoq.Times.once(),
                    );
                } else {
                    statusBar.verify(
                        (s) =>
                            (s.backgroundColor = TypeMoq.It.isValue(new ThemeColor('statusBarItem.warningBackground'))),
                        TypeMoq.Times.once(),
                    );
                    statusBar.verify((s) => (s.color = TypeMoq.It.isValue('')), TypeMoq.Times.once());
                    statusBar.verify(
                        (s) =>
                            (s.text = TypeMoq.It.isValue(
                                `$(alert) ${InterpreterQuickPickList.browsePath.openButtonLabel}`,
                            )),
                        TypeMoq.Times.once(),
                    );
                }
            });
            test('Ensure we try to identify the active workspace when a resource is not provided ', async () => {
                const workspaceFolder = Uri.file('x');
                const resource = workspaceFolder;
                const pythonPath = path.join('user', 'development', 'env', 'bin', 'python');
                const activeInterpreter: PythonEnvironment = {
                    ...info,
                    detailedDisplayName: 'Dummy_Display_Name',
                    envType: EnvironmentType.Unknown,
                    companyDisplayName: 'Company Name',
                    path: pythonPath,
                };
                fileSystem.setup((fs) => fs.fileExists(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));
                interpreterService
                    .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(resource)))
                    .returns(() => Promise.resolve(activeInterpreter))
                    .verifiable(TypeMoq.Times.once());
                interpreterHelper
                    .setup((i) => i.getActiveWorkspaceUri(undefined))
                    .returns(() => {
                        return { folderUri: workspaceFolder, configTarget: ConfigurationTarget.Workspace };
                    })
                    .verifiable(TypeMoq.Times.once());

                await interpreterDisplay.refresh();

                interpreterHelper.verifyAll();
                interpreterService.verifyAll();
                if (useLanguageStatus) {
                    languageStatusItem.verify(
                        (s) => (s.text = TypeMoq.It.isValue(activeInterpreter.detailedDisplayName)!),
                        TypeMoq.Times.once(),
                    );
                    languageStatusItem.verify(
                        (s) => (s.detail = TypeMoq.It.isValue(pythonPath)!),
                        TypeMoq.Times.atLeastOnce(),
                    );
                } else {
                    statusBar.verify(
                        (s) => (s.text = TypeMoq.It.isValue(activeInterpreter.detailedDisplayName)!),
                        TypeMoq.Times.once(),
                    );
                    statusBar.verify((s) => (s.tooltip = TypeMoq.It.isValue(pythonPath)!), TypeMoq.Times.atLeastOnce());
                }
            });
            suite('Visibility', () => {
                const resource = Uri.file('x');
                suiteSetup(function () {
                    if (useLanguageStatus) {
                        return this.skip();
                    }
                });
                setup(() => {
                    const workspaceFolder = Uri.file('workspace');
                    const activeInterpreter: PythonEnvironment = {
                        ...info,
                        detailedDisplayName: 'Dummy_Display_Name',
                        envType: EnvironmentType.Unknown,
                        path: path.join('user', 'development', 'env', 'bin', 'python'),
                    };
                    setupWorkspaceFolder(resource, workspaceFolder);
                    interpreterService
                        .setup((i) => i.getInterpreters(TypeMoq.It.isValue(workspaceFolder)))
                        .returns(() => []);
                    interpreterService
                        .setup((i) => i.getActiveInterpreter(TypeMoq.It.isValue(workspaceFolder)))
                        .returns(() => Promise.resolve(activeInterpreter));
                });
                test('Status bar must be displayed', async () => {
                    await interpreterDisplay.refresh(resource);

                    statusBar.verify((s) => s.show(), TypeMoq.Times.once());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.never());
                });
                test('Status bar must not be displayed if a filter is registered that needs it to be hidden', async () => {
                    const filter1: IInterpreterStatusbarVisibilityFilter = { hidden: true };
                    const filter2: IInterpreterStatusbarVisibilityFilter = { hidden: false };
                    createInterpreterDisplay([filter1, filter2]);

                    await interpreterDisplay.refresh(resource);

                    statusBar.verify((s) => s.show(), TypeMoq.Times.never());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.once());
                });
                test('Status bar must not be displayed if both filters need it to be hidden', async () => {
                    const filter1: IInterpreterStatusbarVisibilityFilter = { hidden: true };
                    const filter2: IInterpreterStatusbarVisibilityFilter = { hidden: true };
                    createInterpreterDisplay([filter1, filter2]);

                    await interpreterDisplay.refresh(resource);

                    statusBar.verify((s) => s.show(), TypeMoq.Times.never());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.once());
                });
                test('Status bar must be displayed if both filter needs it to be displayed', async () => {
                    const filter1: IInterpreterStatusbarVisibilityFilter = { hidden: false };
                    const filter2: IInterpreterStatusbarVisibilityFilter = { hidden: false };
                    createInterpreterDisplay([filter1, filter2]);

                    await interpreterDisplay.refresh(resource);

                    statusBar.verify((s) => s.show(), TypeMoq.Times.once());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.never());
                });
                test('Status bar must hidden if a filter triggers need for status bar to be hidden', async () => {
                    const event1 = new EventEmitter<void>();
                    const filter1: ReadWrite<IInterpreterStatusbarVisibilityFilter> = {
                        hidden: false,
                        changed: event1.event,
                    };
                    const event2 = new EventEmitter<void>();
                    const filter2: ReadWrite<IInterpreterStatusbarVisibilityFilter> = {
                        hidden: false,
                        changed: event2.event,
                    };
                    createInterpreterDisplay([filter1, filter2]);

                    await interpreterDisplay.refresh(resource);

                    statusBar.verify((s) => s.show(), TypeMoq.Times.once());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.never());

                    // Filter one will now want the status bar to get hidden.
                    statusBar.reset();
                    filter1.hidden = true;
                    event1.fire();

                    statusBar.verify((s) => s.show(), TypeMoq.Times.never());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.once());

                    // Filter two now needs it to be displayed.
                    statusBar.reset();
                    event2.fire();

                    // No changes.
                    statusBar.verify((s) => s.show(), TypeMoq.Times.never());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.once());

                    // Filter two now needs it to be displayed & filter 1 will allow it to be displayed.
                    filter1.hidden = false;
                    statusBar.reset();
                    event2.fire();

                    // No changes.
                    statusBar.verify((s) => s.show(), TypeMoq.Times.once());
                    statusBar.verify((s) => s.hide(), TypeMoq.Times.never());
                });
            });
        });
    });
});
