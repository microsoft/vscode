import * as path from 'path';
import * as TypeMoq from 'typemoq';
import { ConfigurationTarget, Uri } from 'vscode';
import { IWorkspaceService } from '../../client/common/application/types';
import { IExperimentService, IInterpreterPathService } from '../../client/common/types';
import { PythonPathUpdaterServiceFactory } from '../../client/interpreter/configuration/pythonPathUpdaterServiceFactory';
import { IPythonPathUpdaterServiceFactory } from '../../client/interpreter/configuration/types';
import { IServiceContainer } from '../../client/ioc/types';

suite('Python Path Settings Updater', () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let experimentsManager: TypeMoq.IMock<IExperimentService>;
    let interpreterPathService: TypeMoq.IMock<IInterpreterPathService>;
    let updaterServiceFactory: IPythonPathUpdaterServiceFactory;
    function setupMocks() {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
        interpreterPathService = TypeMoq.Mock.ofType<IInterpreterPathService>();
        experimentsManager = TypeMoq.Mock.ofType<IExperimentService>();
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IWorkspaceService)))
            .returns(() => workspaceService.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IExperimentService)))
            .returns(() => experimentsManager.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterPathService)))
            .returns(() => interpreterPathService.object);
        updaterServiceFactory = new PythonPathUpdaterServiceFactory(serviceContainer.object);
    }

    suite('Global', () => {
        setup(() => setupMocks());
        test('Python Path should not be updated when current pythonPath is the same', async () => {
            const pythonPath = `xGlobalPythonPath${new Date().getMilliseconds()}`;
            interpreterPathService
                .setup((i) => i.inspect(undefined))
                .returns(() => {
                    return { globalValue: pythonPath };
                });
            interpreterPathService
                .setup((i) => i.update(undefined, ConfigurationTarget.Global, pythonPath))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());

            const updater = updaterServiceFactory.getGlobalPythonPathConfigurationService();
            await updater.updatePythonPath(pythonPath);
            interpreterPathService.verifyAll();
        });
        test('Python Path should be updated when current pythonPath is different', async () => {
            const pythonPath = `xGlobalPythonPath${new Date().getMilliseconds()}`;
            interpreterPathService.setup((i) => i.inspect(undefined)).returns(() => ({}));

            interpreterPathService
                .setup((i) => i.update(undefined, ConfigurationTarget.Global, pythonPath))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());
            const updater = updaterServiceFactory.getGlobalPythonPathConfigurationService();
            await updater.updatePythonPath(pythonPath);
            interpreterPathService.verifyAll();
        });
    });

    suite('WorkspaceFolder', () => {
        setup(() => setupMocks());
        test('Python Path should not be updated when current pythonPath is the same', async () => {
            const workspaceFolderPath = path.join('user', 'desktop', 'development');
            const workspaceFolder = Uri.file(workspaceFolderPath);
            const pythonPath = `xWorkspaceFolderPythonPath${new Date().getMilliseconds()}`;
            interpreterPathService
                .setup((i) => i.inspect(workspaceFolder))
                .returns(() => ({
                    workspaceFolderValue: pythonPath,
                }));
            interpreterPathService
                .setup((i) => i.update(workspaceFolder, ConfigurationTarget.WorkspaceFolder, pythonPath))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());
            const updater = updaterServiceFactory.getWorkspaceFolderPythonPathConfigurationService(workspaceFolder);
            await updater.updatePythonPath(pythonPath);
            interpreterPathService.verifyAll();
        });
        test('Python Path should be updated when current pythonPath is different', async () => {
            const workspaceFolderPath = path.join('user', 'desktop', 'development');
            const workspaceFolder = Uri.file(workspaceFolderPath);
            const pythonPath = `xWorkspaceFolderPythonPath${new Date().getMilliseconds()}`;
            interpreterPathService.setup((i) => i.inspect(workspaceFolder)).returns(() => ({}));
            interpreterPathService
                .setup((i) => i.update(workspaceFolder, ConfigurationTarget.WorkspaceFolder, pythonPath))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            const updater = updaterServiceFactory.getWorkspaceFolderPythonPathConfigurationService(workspaceFolder);
            await updater.updatePythonPath(pythonPath);
            interpreterPathService.verifyAll();
        });
    });
    suite('Workspace (multiroot scenario)', () => {
        setup(() => setupMocks());
        test('Python Path should not be updated when current pythonPath is the same', async () => {
            const workspaceFolderPath = path.join('user', 'desktop', 'development');
            const workspaceFolder = Uri.file(workspaceFolderPath);
            const pythonPath = `xWorkspaceFolderPythonPath${new Date().getMilliseconds()}`;
            interpreterPathService
                .setup((i) => i.inspect(workspaceFolder))
                .returns(() => ({ workspaceValue: pythonPath }));
            interpreterPathService
                .setup((i) => i.update(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.never());

            const updater = updaterServiceFactory.getWorkspacePythonPathConfigurationService(workspaceFolder);
            await updater.updatePythonPath(pythonPath);
            interpreterPathService.verifyAll();
        });
        test('Python Path should be updated when current pythonPath is different', async () => {
            const workspaceFolderPath = path.join('user', 'desktop', 'development');
            const workspaceFolder = Uri.file(workspaceFolderPath);
            const pythonPath = `xWorkspaceFolderPythonPath${new Date().getMilliseconds()}`;

            interpreterPathService.setup((i) => i.inspect(workspaceFolder)).returns(() => ({}));
            interpreterPathService
                .setup((i) => i.update(workspaceFolder, ConfigurationTarget.Workspace, pythonPath))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            const updater = updaterServiceFactory.getWorkspacePythonPathConfigurationService(workspaceFolder);
            await updater.updatePythonPath(pythonPath);

            interpreterPathService.verifyAll();
        });
    });
});
