// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CreateEnv } from '../../../common/utils/localize';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { CreateEnvironmentProgress } from '../types';

export const VENV_CREATED_MARKER = 'CREATED_VENV:';
export const VENV_EXISTING_MARKER = 'EXISTING_VENV:';
const INSTALLING_REQUIREMENTS = 'VENV_INSTALLING_REQUIREMENTS:';
const INSTALLING_PYPROJECT = 'VENV_INSTALLING_PYPROJECT:';
const PIP_NOT_INSTALLED_MARKER = 'CREATE_VENV.PIP_NOT_FOUND';
const VENV_NOT_INSTALLED_MARKER = 'CREATE_VENV.VENV_NOT_FOUND';
const INSTALL_REQUIREMENTS_FAILED_MARKER = 'CREATE_VENV.PIP_FAILED_INSTALL_REQUIREMENTS';
const INSTALL_PYPROJECT_FAILED_MARKER = 'CREATE_VENV.PIP_FAILED_INSTALL_PYPROJECT';
const CREATE_VENV_FAILED_MARKER = 'CREATE_VENV.VENV_FAILED_CREATION';
const VENV_ALREADY_EXISTS_MARKER = 'CREATE_VENV.VENV_ALREADY_EXISTS';
const INSTALLED_REQUIREMENTS_MARKER = 'CREATE_VENV.PIP_INSTALLED_REQUIREMENTS';
const INSTALLED_PYPROJECT_MARKER = 'CREATE_VENV.PIP_INSTALLED_PYPROJECT';
const UPGRADE_PIP_FAILED_MARKER = 'CREATE_VENV.UPGRADE_PIP_FAILED';
const UPGRADING_PIP_MARKER = 'CREATE_VENV.UPGRADING_PIP';
const UPGRADED_PIP_MARKER = 'CREATE_VENV.UPGRADED_PIP';
const CREATING_MICROVENV_MARKER = 'CREATE_MICROVENV.CREATING_MICROVENV';
const CREATE_MICROVENV_FAILED_MARKER = 'CREATE_VENV.MICROVENV_FAILED_CREATION';
const CREATE_MICROVENV_FAILED_MARKER2 = 'CREATE_MICROVENV.MICROVENV_FAILED_CREATION';
const MICROVENV_CREATED_MARKER = 'CREATE_MICROVENV.CREATED_MICROVENV';
const INSTALLING_PIP_MARKER = 'CREATE_VENV.INSTALLING_PIP';
const INSTALL_PIP_FAILED_MARKER = 'CREATE_VENV.INSTALL_PIP_FAILED';
const DOWNLOADING_PIP_MARKER = 'CREATE_VENV.DOWNLOADING_PIP';
const DOWNLOAD_PIP_FAILED_MARKER = 'CREATE_VENV.DOWNLOAD_PIP_FAILED';
const DISTUTILS_NOT_INSTALLED_MARKER = 'CREATE_VENV.DISTUTILS_NOT_INSTALLED';

export class VenvProgressAndTelemetry {
    private readonly processed = new Set<string>();

    private readonly reportActions = new Map<string, (progress: CreateEnvironmentProgress) => string | undefined>([
        [
            VENV_CREATED_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.created });
                sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                    environmentType: 'venv',
                    reason: 'created',
                });
                return undefined;
            },
        ],
        [
            VENV_EXISTING_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.existing });
                sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                    environmentType: 'venv',
                    reason: 'existing',
                });
                return undefined;
            },
        ],
        [
            INSTALLING_REQUIREMENTS,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.installingPackages });
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'requirements.txt',
                });
                return undefined;
            },
        ],
        [
            INSTALLING_PYPROJECT,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.installingPackages });
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pyproject.toml',
                });
                return undefined;
            },
        ],
        [
            PIP_NOT_INSTALLED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'venv',
                    reason: 'noPip',
                });
                return PIP_NOT_INSTALLED_MARKER;
            },
        ],
        [
            DISTUTILS_NOT_INSTALLED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'venv',
                    reason: 'noDistUtils',
                });
                return VENV_NOT_INSTALLED_MARKER;
            },
        ],
        [
            VENV_NOT_INSTALLED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'venv',
                    reason: 'noVenv',
                });
                return VENV_NOT_INSTALLED_MARKER;
            },
        ],
        [
            INSTALL_REQUIREMENTS_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                    environmentType: 'venv',
                    using: 'requirements.txt',
                });
                return INSTALL_REQUIREMENTS_FAILED_MARKER;
            },
        ],
        [
            INSTALL_PYPROJECT_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                    environmentType: 'venv',
                    using: 'pyproject.toml',
                });
                return INSTALL_PYPROJECT_FAILED_MARKER;
            },
        ],
        [
            CREATE_VENV_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'venv',
                    reason: 'other',
                });
                return CREATE_VENV_FAILED_MARKER;
            },
        ],
        [
            VENV_ALREADY_EXISTS_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                    environmentType: 'venv',
                    reason: 'existing',
                });
                return undefined;
            },
        ],
        [
            INSTALLED_REQUIREMENTS_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLED_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'requirements.txt',
                });
                return undefined;
            },
        ],
        [
            INSTALLED_PYPROJECT_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLED_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pyproject.toml',
                });
                return undefined;
            },
        ],
        [
            UPGRADED_PIP_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLED_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pipUpgrade',
                });
                return undefined;
            },
        ],
        [
            UPGRADE_PIP_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                    environmentType: 'venv',
                    using: 'pipUpgrade',
                });
                return UPGRADE_PIP_FAILED_MARKER;
            },
        ],
        [
            DOWNLOADING_PIP_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.downloadingPip });
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pipDownload',
                });
                return undefined;
            },
        ],
        [
            DOWNLOAD_PIP_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                    environmentType: 'venv',
                    using: 'pipDownload',
                });
                return DOWNLOAD_PIP_FAILED_MARKER;
            },
        ],
        [
            INSTALLING_PIP_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.installingPip });
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pipInstall',
                });
                return undefined;
            },
        ],
        [
            INSTALL_PIP_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES_FAILED, undefined, {
                    environmentType: 'venv',
                    using: 'pipInstall',
                });
                return INSTALL_PIP_FAILED_MARKER;
            },
        ],
        [
            CREATING_MICROVENV_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.creatingMicrovenv });
                sendTelemetryEvent(EventName.ENVIRONMENT_CREATING, undefined, {
                    environmentType: 'microvenv',
                    pythonVersion: undefined,
                });
                return undefined;
            },
        ],
        [
            CREATE_MICROVENV_FAILED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'microvenv',
                    reason: 'other',
                });
                return CREATE_MICROVENV_FAILED_MARKER;
            },
        ],
        [
            CREATE_MICROVENV_FAILED_MARKER2,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_FAILED, undefined, {
                    environmentType: 'microvenv',
                    reason: 'other',
                });
                return CREATE_MICROVENV_FAILED_MARKER2;
            },
        ],
        [
            MICROVENV_CREATED_MARKER,
            (_progress: CreateEnvironmentProgress) => {
                sendTelemetryEvent(EventName.ENVIRONMENT_CREATED, undefined, {
                    environmentType: 'microvenv',
                    reason: 'created',
                });
                return undefined;
            },
        ],
        [
            UPGRADING_PIP_MARKER,
            (progress: CreateEnvironmentProgress) => {
                progress.report({ message: CreateEnv.Venv.upgradingPip });
                sendTelemetryEvent(EventName.ENVIRONMENT_INSTALLING_PACKAGES, undefined, {
                    environmentType: 'venv',
                    using: 'pipUpgrade',
                });
                return undefined;
            },
        ],
    ]);

    private lastError: string | undefined = undefined;

    constructor(private readonly progress: CreateEnvironmentProgress) {}

    public getLastError(): string | undefined {
        return this.lastError;
    }

    public process(output: string): void {
        const keys: string[] = Array.from(this.reportActions.keys());

        for (const key of keys) {
            if (output.includes(key) && !this.processed.has(key)) {
                const action = this.reportActions.get(key);
                if (action) {
                    const err = action(this.progress);
                    if (err) {
                        this.lastError = err;
                    }
                }
                this.processed.add(key);
            }
        }
    }
}
