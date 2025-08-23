import 'rxjs/add/observable/of';

import { EventEmitter } from 'events';
import { Observable } from 'rxjs/Observable';

import { ChildProcess } from 'child_process';
import {
    ExecutionResult,
    IProcessService,
    ObservableExecutionResult,
    Output,
    ShellOptions,
    SpawnOptions,
} from '../../client/common/process/types';
import { noop } from '../core';

type ExecObservableCallback = (result: Observable<Output<string>> | Output<string>) => void;
type ExecCallback = (result: ExecutionResult<string>) => void;

export const IOriginalProcessService = Symbol('IProcessService');

export class MockProcessService extends EventEmitter implements IProcessService {
    constructor(private procService: IProcessService) {
        super();
    }

    public onExecObservable(
        handler: (file: string, args: string[], options: SpawnOptions, callback: ExecObservableCallback) => void,
    ): void {
        this.on('execObservable', handler);
    }

    public execObservable(file: string, args: string[], options: SpawnOptions = {}): ObservableExecutionResult<string> {
        let value: Observable<Output<string>> | Output<string> | undefined;
        let valueReturned = false;
        this.emit('execObservable', file, args, options, (result: Observable<Output<string>> | Output<string>) => {
            value = result;
            valueReturned = true;
        });

        if (valueReturned) {
            const output = value as Output<string>;
            if (['stderr', 'stdout'].some((source) => source === output.source)) {
                return {
                    proc: {} as ChildProcess,
                    out: Observable.of(output),
                    dispose: () => {
                        noop();
                    },
                };
            }
            return {
                proc: {} as ChildProcess,
                out: value as Observable<Output<string>>,
                dispose: () => {
                    noop();
                },
            };
        }
        return this.procService.execObservable(file, args, options);
    }

    public onExec(
        handler: (file: string, args: string[], options: SpawnOptions, callback: ExecCallback) => void,
    ): void {
        this.on('exec', handler);
    }

    public async exec(file: string, args: string[], options: SpawnOptions = {}): Promise<ExecutionResult<string>> {
        let value: ExecutionResult<string> | undefined;
        let valueReturned = false;
        this.emit('exec', file, args, options, (result: ExecutionResult<string>) => {
            value = result;
            valueReturned = true;
        });

        return valueReturned ? value! : this.procService.exec(file, args, options);
    }

    public async shellExec(command: string, options?: ShellOptions): Promise<ExecutionResult<string>> {
        let value: ExecutionResult<string> | undefined;
        let valueReturned = false;
        this.emit('shellExec', command, options, (result: ExecutionResult<string>) => {
            value = result;
            valueReturned = true;
        });

        return valueReturned ? value! : this.procService.shellExec(command, options);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public dispose(): void {}
}
