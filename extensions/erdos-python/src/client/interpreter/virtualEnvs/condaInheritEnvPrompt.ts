// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ConfigurationTarget, Uri } from 'vscode';
import { IExtensionActivationService } from '../../activation/types';
import { IApplicationEnvironment, IApplicationShell, IWorkspaceService } from '../../common/application/types';
import { IPlatformService } from '../../common/platform/types';
import { IPersistentStateFactory } from '../../common/types';
import { Common, Interpreters } from '../../common/utils/localize';
import { traceDecoratorError, traceError } from '../../logging';
import { EnvironmentType } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IInterpreterService } from '../contracts';

export const condaInheritEnvPromptKey = 'CONDA_INHERIT_ENV_PROMPT_KEY';

@injectable()
export class CondaInheritEnvPrompt implements IExtensionActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };
    constructor(
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IApplicationEnvironment) private readonly appEnvironment: IApplicationEnvironment,
        public hasPromptBeenShownInCurrentSession: boolean = false,
    ) {}

    public async activate(resource: Uri): Promise<void> {
        this.initializeInBackground(resource).ignoreErrors();
    }

    @traceDecoratorError('Failed to intialize conda inherit env prompt')
    public async initializeInBackground(resource: Uri): Promise<void> {
        const show = await this.shouldShowPrompt(resource);
        if (!show) {
            return;
        }
        await this.promptAndUpdate();
    }

    @traceDecoratorError('Failed to display conda inherit env prompt')
    public async promptAndUpdate() {
        const notificationPromptEnabled = this.persistentStateFactory.createGlobalPersistentState(
            condaInheritEnvPromptKey,
            true,
        );
        if (!notificationPromptEnabled.value) {
            return;
        }
        const prompts = [Common.allow, Common.close];
        const telemetrySelections: ['Allow', 'Close'] = ['Allow', 'Close'];
        const selection = await this.appShell.showInformationMessage(Interpreters.condaInheritEnvMessage, ...prompts);
        sendTelemetryEvent(EventName.CONDA_INHERIT_ENV_PROMPT, undefined, {
            selection: selection ? telemetrySelections[prompts.indexOf(selection)] : undefined,
        });
        if (!selection) {
            return;
        }
        if (selection === prompts[0]) {
            await this.workspaceService
                .getConfiguration('terminal')
                .update('integrated.inheritEnv', false, ConfigurationTarget.Global);
        } else if (selection === prompts[1]) {
            await notificationPromptEnabled.updateValue(false);
        }
    }

    @traceDecoratorError('Failed to check whether to display prompt for conda inherit env setting')
    public async shouldShowPrompt(resource: Uri): Promise<boolean> {
        if (this.hasPromptBeenShownInCurrentSession) {
            return false;
        }
        if (this.appEnvironment.remoteName) {
            // `terminal.integrated.inheritEnv` is only applicable user scope, so won't apply
            // in remote scenarios: https://github.com/microsoft/vscode/issues/147421
            return false;
        }
        if (this.platformService.isWindows) {
            return false;
        }
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        if (!interpreter || interpreter.envType !== EnvironmentType.Conda) {
            return false;
        }
        const setting = this.workspaceService
            .getConfiguration('terminal', resource)
            .inspect<boolean>('integrated.inheritEnv');
        if (!setting) {
            traceError(
                'WorkspaceConfiguration.inspect returns `undefined` for setting `terminal.integrated.inheritEnv`',
            );
            return false;
        }
        if (
            setting.globalValue !== undefined ||
            setting.workspaceValue !== undefined ||
            setting.workspaceFolderValue !== undefined
        ) {
            return false;
        }
        this.hasPromptBeenShownInCurrentSession = true;
        return true;
    }
}
