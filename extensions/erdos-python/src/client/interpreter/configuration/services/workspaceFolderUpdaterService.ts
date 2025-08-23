import { ConfigurationTarget, Uri } from 'vscode';
import { IInterpreterPathService } from '../../../common/types';
import { IPythonPathUpdaterService } from '../types';

export class WorkspaceFolderPythonPathUpdaterService implements IPythonPathUpdaterService {
    constructor(private workspaceFolder: Uri, private readonly interpreterPathService: IInterpreterPathService) {}
    public async updatePythonPath(pythonPath: string | undefined): Promise<void> {
        const pythonPathValue = this.interpreterPathService.inspect(this.workspaceFolder);

        if (pythonPathValue && pythonPathValue.workspaceFolderValue === pythonPath) {
            return;
        }
        await this.interpreterPathService.update(this.workspaceFolder, ConfigurationTarget.WorkspaceFolder, pythonPath);
    }
}
