import { ICommandManager } from './application/types';

export class ContextKey {
    public get value(): boolean | undefined {
        return this.lastValue;
    }
    private lastValue?: boolean;

    constructor(private name: string, private commandManager: ICommandManager) {}

    public async set(value: boolean): Promise<void> {
        if (this.lastValue === value) {
            return;
        }
        this.lastValue = value;
        await this.commandManager.executeCommand('setContext', this.name, this.lastValue);
    }
}
