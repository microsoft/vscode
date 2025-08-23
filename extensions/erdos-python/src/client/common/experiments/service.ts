// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { l10n } from 'vscode';
import { getExperimentationService, IExperimentationService, TargetPopulation } from 'vscode-tas-client';
import { traceLog } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IApplicationEnvironment, IWorkspaceService } from '../application/types';
import { PVSC_EXTENSION_ID } from '../constants';
import { IExperimentService, IPersistentStateFactory } from '../types';
import { ExperimentationTelemetry } from './telemetry';

const EXP_MEMENTO_KEY = 'VSCode.ABExp.FeatureData';
const EXP_CONFIG_ID = 'vscode';

@injectable()
export class ExperimentService implements IExperimentService {
    /**
     * Experiments the user requested to opt into manually.
     */
    public _optInto: string[] = [];

    /**
     * Experiments the user requested to opt out from manually.
     */
    public _optOutFrom: string[] = [];

    private readonly experiments = this.persistentState.createGlobalPersistentState<{ features: string[] }>(
        EXP_MEMENTO_KEY,
        { features: [] },
    );

    private readonly enabled: boolean;

    private readonly experimentationService?: IExperimentationService;

    constructor(
        @inject(IWorkspaceService) readonly workspaceService: IWorkspaceService,
        @inject(IApplicationEnvironment) private readonly appEnvironment: IApplicationEnvironment,
        @inject(IPersistentStateFactory) private readonly persistentState: IPersistentStateFactory,
    ) {
        const settings = this.workspaceService.getConfiguration('python');
        // Users can only opt in or out of experiment groups, not control groups.
        const optInto = settings.get<string[]>('experiments.optInto') || [];
        const optOutFrom = settings.get<string[]>('experiments.optOutFrom') || [];
        this._optInto = optInto.filter((exp) => !exp.endsWith('control'));
        this._optOutFrom = optOutFrom.filter((exp) => !exp.endsWith('control'));

        // If users opt out of all experiments we treat it as disabling them.
        // The `experiments.enabled` setting also needs to be explicitly disabled, default to true otherwise.
        if (this._optOutFrom.includes('All') || settings.get<boolean>('experiments.enabled') === false) {
            this.enabled = false;
        } else {
            this.enabled = true;
        }

        if (!this.enabled) {
            return;
        }

        let targetPopulation: TargetPopulation;
        // if running in VS Code Insiders, use the Insiders target population
        if (this.appEnvironment.channel === 'insiders') {
            targetPopulation = TargetPopulation.Insiders;
        } else {
            targetPopulation = TargetPopulation.Public;
        }

        const telemetryReporter = new ExperimentationTelemetry();

        this.experimentationService = getExperimentationService(
            PVSC_EXTENSION_ID,
            this.appEnvironment.packageJson.version!,
            targetPopulation,
            telemetryReporter,
            this.experiments.storage,
        );
    }

    public async activate(): Promise<void> {
        if (this.experimentationService) {
            const initStart = Date.now();
            await this.experimentationService.initializePromise;

            if (this.experiments.value.features.length === 0) {
                // Only await on this if we don't have anything in cache.
                // This means that we start the session with partial experiment info.
                // We accept this as a compromise to avoid delaying startup.

                // In the case where we don't wait on this promise. If the experiment info changes,
                // those changes will be applied in the next session. This is controlled internally
                // in the tas-client via `overrideInMemoryFeatures` value that is passed to
                // `getFeaturesAsync`. At the time of writing this comment the value of
                // `overrideInMemoryFeatures` was always passed in as `false`. So, the experiment
                // states did not change mid way.
                await this.experimentationService.initialFetch;
                sendTelemetryEvent(EventName.PYTHON_EXPERIMENTS_INIT_PERFORMANCE, Date.now() - initStart);
            }
            this.logExperiments();
        }
        sendOptInOptOutTelemetry(this._optInto, this._optOutFrom, this.appEnvironment.packageJson);
    }

    public async inExperiment(experiment: string): Promise<boolean> {
        return this.inExperimentSync(experiment);
    }

    public inExperimentSync(experiment: string): boolean {
        if (!this.experimentationService) {
            return false;
        }

        // Currently the service doesn't support opting in and out of experiments.
        // so we need to perform these checks manually.
        if (this._optOutFrom.includes('All') || this._optOutFrom.includes(experiment)) {
            return false;
        }

        if (this._optInto.includes('All') || this._optInto.includes(experiment)) {
            // Check if the user was already in the experiment server-side. We need to do
            // this to ensure the experiment service is ready and internal states are fully
            // synced with the experiment server.
            this.experimentationService.getTreatmentVariable(EXP_CONFIG_ID, experiment);
            return true;
        }

        // If getTreatmentVariable returns undefined,
        // it means that the value for this experiment was not found on the server.
        const treatmentVariable = this.experimentationService.getTreatmentVariable(EXP_CONFIG_ID, experiment);

        return treatmentVariable === true;
    }

    public async getExperimentValue<T extends boolean | number | string>(experiment: string): Promise<T | undefined> {
        if (!this.experimentationService || this._optOutFrom.includes('All') || this._optOutFrom.includes(experiment)) {
            return undefined;
        }

        return this.experimentationService.getTreatmentVariable<T>(EXP_CONFIG_ID, experiment);
    }

    private logExperiments() {
        const telemetrySettings = this.workspaceService.getConfiguration('telemetry');
        let experimentsDisabled = false;
        if (telemetrySettings && telemetrySettings.get<boolean>('enableTelemetry') === false) {
            traceLog('Telemetry is disabled');
            experimentsDisabled = true;
        }

        if (telemetrySettings && telemetrySettings.get<string>('telemetryLevel') === 'off') {
            traceLog('Telemetry level is off');
            experimentsDisabled = true;
        }

        if (experimentsDisabled) {
            traceLog('Experiments are disabled, only manually opted experiments are active.');
        }

        if (this._optOutFrom.includes('All')) {
            // We prioritize opt out first
            traceLog(l10n.t("Experiment '{0}' is inactive", 'All'));

            // Since we are in the Opt Out all case, this means when checking for experiment we
            // short circuit and return. So, printing out additional experiment info might cause
            // confusion. So skip printing out any specific experiment details to the log.
            return;
        }
        if (this._optInto.includes('All')) {
            // Only if 'All' is not in optOut then check if it is in Opt In.
            traceLog(l10n.t("Experiment '{0}' is active", 'All'));

            // Similar to the opt out case. If user is opting into to all experiments we short
            // circuit the experiment checks. So, skip printing any additional details to the logs.
            return;
        }

        // Log experiments that users manually opt out, these are experiments which are added using the exp framework.
        this._optOutFrom
            .filter((exp) => exp !== 'All' && exp.toLowerCase().startsWith('python'))
            .forEach((exp) => {
                traceLog(l10n.t("Experiment '{0}' is inactive", exp));
            });

        // Log experiments that users manually opt into, these are experiments which are added using the exp framework.
        this._optInto
            .filter((exp) => exp !== 'All' && exp.toLowerCase().startsWith('python'))
            .forEach((exp) => {
                traceLog(l10n.t("Experiment '{0}' is active", exp));
            });

        if (!experimentsDisabled) {
            // Log experiments that users are added to by the exp framework
            this.experiments.value.features.forEach((exp) => {
                // Filter out experiment groups that are not from the Python extension.
                // Filter out experiment groups that are not already opted out or opted into.
                if (
                    exp.toLowerCase().startsWith('python') &&
                    !this._optOutFrom.includes(exp) &&
                    !this._optInto.includes(exp)
                ) {
                    traceLog(l10n.t("Experiment '{0}' is active", exp));
                }
            });
        }
    }
}

/**
 * Read accepted experiment settings values from the extension's package.json.
 * This function assumes that the `setting` argument is a string array that has a specific set of accepted values.
 *
 * Accessing the values is done via these keys:
 * <root> -> "contributes" -> "configuration" -> "properties" -> <setting name> -> "items" -> "enum"
 *
 * @param setting The setting we want to read the values of.
 * @param packageJson The content of `package.json`, as a JSON object.
 *
 * @returns An array containing all accepted values for the setting, or [] if there were none.
 */
function readEnumValues(setting: string, packageJson: Record<string, unknown>): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingProperties = (packageJson.contributes as any).configuration.properties[setting];

    if (settingProperties) {
        return settingProperties.items.enum ?? [];
    }

    return [];
}

/**
 * Send telemetry on experiments that have been manually opted into or opted-out from.
 * The telemetry will only contain values that are present in the list of accepted values for these settings.
 *
 * @param optedIn The list of experiments opted into.
 * @param optedOut The list of experiments opted out from.
 * @param packageJson The content of `package.json`, as a JSON object.
 */
function sendOptInOptOutTelemetry(optedIn: string[], optedOut: string[], packageJson: Record<string, unknown>): void {
    const optedInEnumValues = readEnumValues('python.experiments.optInto', packageJson);
    const optedOutEnumValues = readEnumValues('python.experiments.optOutFrom', packageJson);

    const sanitizedOptedIn = optedIn.filter((exp) => optedInEnumValues.includes(exp));
    const sanitizedOptedOut = optedOut.filter((exp) => optedOutEnumValues.includes(exp));

    JSON.stringify(sanitizedOptedIn.sort());

    sendTelemetryEvent(EventName.PYTHON_EXPERIMENTS_OPT_IN_OPT_OUT_SETTINGS, undefined, {
        optedInto: JSON.stringify(sanitizedOptedIn.sort()),
        optedOutFrom: JSON.stringify(sanitizedOptedOut.sort()),
    });
}
