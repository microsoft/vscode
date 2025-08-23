import { Disposable } from 'vscode';
import { IActiveResourceService, ICommandManager } from '../common/application/types';
import { Commands } from '../common/constants';
import { noop } from '../common/utils/misc';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { ICodeExecutionService } from '../terminals/types';

export class ReplProvider implements Disposable {
    private readonly disposables: Disposable[] = [];

    private activeResourceService: IActiveResourceService;

    constructor(private serviceContainer: IServiceContainer) {
        this.activeResourceService = this.serviceContainer.get<IActiveResourceService>(IActiveResourceService);
        this.registerCommand();
    }

    public dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    private registerCommand() {
        const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        const disposable = commandManager.registerCommand(Commands.Start_REPL, this.commandHandler, this);
        this.disposables.push(disposable);
    }

    private async commandHandler() {
        const resource = this.activeResourceService.getActiveResource();
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreter = await interpreterService.getActiveInterpreter(resource);
        if (!interpreter) {
            this.serviceContainer
                .get<ICommandManager>(ICommandManager)
                .executeCommand(Commands.TriggerEnvironmentSelection, resource)
                .then(noop, noop);
            return;
        }
        const replProvider = this.serviceContainer.get<ICodeExecutionService>(ICodeExecutionService, 'standard');
        await replProvider.initializeRepl(resource);
    }
}
