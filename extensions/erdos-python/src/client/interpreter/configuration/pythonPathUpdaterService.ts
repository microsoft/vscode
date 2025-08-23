import { inject, injectable } from 'inversify';
import { ConfigurationTarget, l10n, Uri, window } from 'vscode';
import { StopWatch } from '../../common/utils/stopWatch';
import { SystemVariables } from '../../common/variables/systemVariables';
import { traceError } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { PythonInterpreterTelemetry } from '../../telemetry/types';
import { IComponentAdapter } from '../contracts';
import {
    IRecommendedEnvironmentService,
    IPythonPathUpdaterServiceFactory,
    IPythonPathUpdaterServiceManager,
} from './types';

@injectable()
export class PythonPathUpdaterService implements IPythonPathUpdaterServiceManager {
    constructor(
        @inject(IPythonPathUpdaterServiceFactory)
        private readonly pythonPathSettingsUpdaterFactory: IPythonPathUpdaterServiceFactory,
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
        @inject(IRecommendedEnvironmentService) private readonly preferredEnvService: IRecommendedEnvironmentService,
    ) {}

    public async updatePythonPath(
        pythonPath: string | undefined,
        configTarget: ConfigurationTarget,
        trigger: 'ui' | 'shebang' | 'load',
        wkspace?: Uri,
    ): Promise<void> {
        const stopWatch = new StopWatch();
        const pythonPathUpdater = this.getPythonUpdaterService(configTarget, wkspace);
        let failed = false;
        try {
            await pythonPathUpdater.updatePythonPath(pythonPath);
            if (trigger === 'ui') {
                this.preferredEnvService.trackUserSelectedEnvironment(pythonPath, wkspace);
            }
        } catch (err) {
            failed = true;
            const reason = err as Error;
            const message = reason && typeof reason.message === 'string' ? (reason.message as string) : '';
            window.showErrorMessage(l10n.t('Failed to set interpreter path. Error: {0}', message));
            traceError(reason);
        }
        // do not wait for this to complete
        this.sendTelemetry(stopWatch.elapsedTime, failed, trigger, pythonPath, wkspace).catch((ex) =>
            traceError('Python Extension: sendTelemetry', ex),
        );
    }

    private async sendTelemetry(
        duration: number,
        failed: boolean,
        trigger: 'ui' | 'shebang' | 'load',
        pythonPath: string | undefined,
        wkspace?: Uri,
    ) {
        const telemetryProperties: PythonInterpreterTelemetry = {
            failed,
            trigger,
        };
        if (!failed && pythonPath) {
            const systemVariables = new SystemVariables(undefined, wkspace?.fsPath);
            const interpreterInfo = await this.pyenvs.getInterpreterInformation(systemVariables.resolveAny(pythonPath));
            if (interpreterInfo) {
                telemetryProperties.pythonVersion = interpreterInfo.version?.raw;
            }
        }

        sendTelemetryEvent(EventName.PYTHON_INTERPRETER, duration, telemetryProperties);
    }

    private getPythonUpdaterService(configTarget: ConfigurationTarget, wkspace?: Uri) {
        switch (configTarget) {
            case ConfigurationTarget.Global: {
                return this.pythonPathSettingsUpdaterFactory.getGlobalPythonPathConfigurationService();
            }
            case ConfigurationTarget.Workspace: {
                if (!wkspace) {
                    throw new Error('Workspace Uri not defined');
                }

                return this.pythonPathSettingsUpdaterFactory.getWorkspacePythonPathConfigurationService(wkspace!);
            }
            default: {
                if (!wkspace) {
                    throw new Error('Workspace Uri not defined');
                }

                return this.pythonPathSettingsUpdaterFactory.getWorkspaceFolderPythonPathConfigurationService(wkspace!);
            }
        }
    }
}
