// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { ConfigurationTarget, Disposable, Uri } from 'vscode';
import { IExtensionActivationService } from '../../activation/types';
import { IApplicationShell } from '../../common/application/types';
import { IDisposableRegistry, IPersistentStateFactory } from '../../common/types';
import { Common, Interpreters } from '../../common/utils/localize';
import { traceDecoratorError, traceVerbose } from '../../logging';
import { isCreatingEnvironment } from '../../pythonEnvironments/creation/createEnvApi';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IPythonPathUpdaterServiceManager } from '../configuration/types';
import { IComponentAdapter, IInterpreterHelper, IInterpreterService } from '../contracts';

const doNotDisplayPromptStateKey = 'MESSAGE_KEY_FOR_VIRTUAL_ENV';
@injectable()
export class VirtualEnvironmentPrompt implements IExtensionActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };

    constructor(
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory,
        @inject(IInterpreterHelper) private readonly helper: IInterpreterHelper,
        @inject(IPythonPathUpdaterServiceManager)
        private readonly pythonPathUpdaterService: IPythonPathUpdaterServiceManager,
        @inject(IDisposableRegistry) private readonly disposableRegistry: Disposable[],
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
    ) {}

    public async activate(resource: Uri): Promise<void> {
        const disposable = this.pyenvs.onDidCreate(resource, () => this.handleNewEnvironment(resource));
        this.disposableRegistry.push(disposable);
    }

    @traceDecoratorError('Error in event handler for detection of new environment')
    protected async handleNewEnvironment(resource: Uri): Promise<void> {
        if (isCreatingEnvironment()) {
            return;
        }
        const interpreters = await this.pyenvs.getWorkspaceVirtualEnvInterpreters(resource);
        const interpreter =
            Array.isArray(interpreters) && interpreters.length > 0
                ? this.helper.getBestInterpreter(interpreters)
                : undefined;
        if (!interpreter) {
            return;
        }
        const currentInterpreter = await this.interpreterService.getActiveInterpreter(resource);
        if (currentInterpreter?.id === interpreter.id) {
            traceVerbose('New environment has already been selected');
            return;
        }
        await this.notifyUser(interpreter, resource);
    }

    protected async notifyUser(interpreter: PythonEnvironment, resource: Uri): Promise<void> {
        const notificationPromptEnabled = this.persistentStateFactory.createWorkspacePersistentState(
            doNotDisplayPromptStateKey,
            true,
        );
        if (!notificationPromptEnabled.value) {
            return;
        }
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo, Common.doNotShowAgain];
        const telemetrySelections: ['Yes', 'No', 'Ignore'] = ['Yes', 'No', 'Ignore'];
        const selection = await this.appShell.showInformationMessage(Interpreters.environmentPromptMessage, ...prompts);
        sendTelemetryEvent(EventName.PYTHON_INTERPRETER_ACTIVATE_ENVIRONMENT_PROMPT, undefined, {
            selection: selection ? telemetrySelections[prompts.indexOf(selection)] : undefined,
        });
        if (!selection) {
            return;
        }
        if (selection === prompts[0]) {
            await this.pythonPathUpdaterService.updatePythonPath(
                interpreter.path,
                ConfigurationTarget.WorkspaceFolder,
                'ui',
                resource,
            );
        } else if (selection === prompts[2]) {
            await notificationPromptEnabled.updateValue(false);
        }
    }
}
