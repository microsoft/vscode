import { ConfigurationTarget } from 'vscode';
import { IInterpreterPathService } from '../../../common/types';
import { IPythonPathUpdaterService } from '../types';

export class GlobalPythonPathUpdaterService implements IPythonPathUpdaterService {
    constructor(private readonly interpreterPathService: IInterpreterPathService) {}
    public async updatePythonPath(pythonPath: string | undefined): Promise<void> {
        const pythonPathValue = this.interpreterPathService.inspect(undefined);

        if (pythonPathValue && pythonPathValue.globalValue === pythonPath) {
            return;
        }
        await this.interpreterPathService.update(undefined, ConfigurationTarget.Global, pythonPath);
    }
}
