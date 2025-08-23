// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, multiInject } from 'inversify';
import { Terminal } from 'vscode';
import { IConfigurationService, IExperimentService } from '../../types';
import { ITerminalActivationHandler, ITerminalActivator, ITerminalHelper, TerminalActivationOptions } from '../types';
import { BaseTerminalActivator } from './base';
import { inTerminalEnvVarExperiment } from '../../experiments/helpers';
import { useEnvExtension } from '../../../envExt/api.internal';
import { EventName } from '../../../telemetry/constants';
import { sendTelemetryEvent } from '../../../telemetry';

@injectable()
export class TerminalActivator implements ITerminalActivator {
    protected baseActivator!: ITerminalActivator;
    private pendingActivations = new WeakMap<Terminal, Promise<boolean>>();
    constructor(
        @inject(ITerminalHelper) readonly helper: ITerminalHelper,
        @multiInject(ITerminalActivationHandler) private readonly handlers: ITerminalActivationHandler[],
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(IExperimentService) private readonly experimentService: IExperimentService,
    ) {
        this.initialize();
    }
    public async activateEnvironmentInTerminal(
        terminal: Terminal,
        options?: TerminalActivationOptions,
    ): Promise<boolean> {
        let promise = this.pendingActivations.get(terminal);
        if (promise) {
            return promise;
        }
        promise = this.activateEnvironmentInTerminalImpl(terminal, options);
        this.pendingActivations.set(terminal, promise);
        return promise;
    }
    private async activateEnvironmentInTerminalImpl(
        terminal: Terminal,
        options?: TerminalActivationOptions,
    ): Promise<boolean> {
        const settings = this.configurationService.getSettings(options?.resource);
        const activateEnvironment =
            settings.terminal.activateEnvironment && !inTerminalEnvVarExperiment(this.experimentService);
        if (!activateEnvironment || options?.hideFromUser || useEnvExtension()) {
            if (useEnvExtension()) {
                sendTelemetryEvent(EventName.PYTHON_INTERPRETER_ACTIVATION_FOR_TERMINAL);
            }
            return false;
        }

        const activated = await this.baseActivator.activateEnvironmentInTerminal(terminal, options);
        this.handlers.forEach((handler) =>
            handler
                .handleActivation(terminal, options?.resource, options?.preserveFocus === true, activated)
                .ignoreErrors(),
        );
        return activated;
    }
    protected initialize() {
        this.baseActivator = new BaseTerminalActivator(this.helper);
    }
}
