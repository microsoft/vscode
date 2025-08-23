// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CreateEnv } from '../../../common/utils/localize';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { CreateEnvironmentProgress } from '../types';

export const CONDA_ENV_CREATED_MARKER = 'CREATED_CONDA_ENV:';
export const CONDA_ENV_EXISTING_MARKER = 'EXISTING_CONDA_ENV:';
export const CONDA_INSTALLING_YML = 'CONDA_INSTALLING_YML:';
export const CREATE_CONDA_FAILED_MARKER = 'CREATE_CONDA.ENV_FAILED_CREATION';
export const CREATE_CONDA_INSTALLED_YML = 'CREATE_CONDA.INSTALLED_YML';
export const CREATE_FAILED_INSTALL_YML = 'CREATE_CONDA.FAILED_INSTALL_YML';

export class CondaProgressAndTelemetry {
    private condaCreatedReported = false;

    private condaFailedReported = false;

    private condaInstallingPackagesReported = false;

    private condaInstallingPackagesFailedReported = false;

    private condaInstalledPackagesReported = false;

    private lastError: string | undefined = undefined;

    constructor(private readonly progress: CreateEnvironmentProgress) {}

    public process(output: string): void {
        if (!this.condaCreatedReported && output.includes(CONDA_ENV_CREATED_MARKER)) {
            this.condaCreatedReported = true;
            this.progress.report({
                message: CreateEnv.Conda.created,
            });
            sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                environmentType: 'conda',
                reason: 'created',
            });
        } else if (!this.condaCreatedReported && output.includes(CONDA_ENV_EXISTING_MARKER)) {
            this.condaCreatedReported = true;
            this.progress.report({
                message: CreateEnv.Conda.created,
            });
            sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                environmentType: 'conda',
                reason: 'existing',
            });
        } else if (!this.condaFailedReported && output.includes(CREATE_CONDA_FAILED_MARKER)) {
            this.condaFailedReported = true;
            sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                environmentType: 'conda',
                reason: 'other',
            });
            this.lastError = CREATE_CONDA_FAILED_MARKER;
        } else if (!this.condaInstallingPackagesReported && output.includes(CONDA_INSTALLING_YML)) {
            this.condaInstallingPackagesReported = true;
            this.progress.report({
                message: CreateEnv.Conda.installingPackages,
            });
            sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                environmentType: 'conda',
                using: 'environment.yml',
            });
        } else if (!this.condaInstallingPackagesFailedReported && output.includes(CREATE_FAILED_INSTALL_YML)) {
            this.condaInstallingPackagesFailedReported = true;
            sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                environmentType: 'conda',
                using: 'environment.yml',
            });
            this.lastError = CREATE_FAILED_INSTALL_YML;
        } else if (!this.condaInstalledPackagesReported && output.includes(CREATE_CONDA_INSTALLED_YML)) {
            this.condaInstalledPackagesReported = true;
            sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLED_PACKAGES, undefined, {
                environmentType: 'conda',
                using: 'environment.yml',
            });
        }
    }

    public getLastError(): string | undefined {
        return this.lastError;
    }
}
