import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IInterpreterPathService } from '../../common/types';
import { IServiceContainer } from '../../ioc/types';
import { GlobalPythonPathUpdaterService } from './services/globalUpdaterService';
import { WorkspaceFolderPythonPathUpdaterService } from './services/workspaceFolderUpdaterService';
import { WorkspacePythonPathUpdaterService } from './services/workspaceUpdaterService';
import { IPythonPathUpdaterService, IPythonPathUpdaterServiceFactory } from './types';

@injectable()
export class PythonPathUpdaterServiceFactory implements IPythonPathUpdaterServiceFactory {
    private readonly interpreterPathService: IInterpreterPathService;
    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        this.interpreterPathService = serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
    }
    public getGlobalPythonPathConfigurationService(): IPythonPathUpdaterService {
        return new GlobalPythonPathUpdaterService(this.interpreterPathService);
    }
    public getWorkspacePythonPathConfigurationService(wkspace: Uri): IPythonPathUpdaterService {
        return new WorkspacePythonPathUpdaterService(wkspace, this.interpreterPathService);
    }
    public getWorkspaceFolderPythonPathConfigurationService(workspaceFolder: Uri): IPythonPathUpdaterService {
        return new WorkspaceFolderPythonPathUpdaterService(workspaceFolder, this.interpreterPathService);
    }
}
