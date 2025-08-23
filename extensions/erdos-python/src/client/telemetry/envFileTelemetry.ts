// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IWorkspaceService } from '../common/application/types';
import { IFileSystem } from '../common/platform/types';
import { Resource } from '../common/types';
import { SystemVariables } from '../common/variables/systemVariables';

import { sendTelemetryEvent } from '.';
import { EventName } from './constants';

let _defaultEnvFileSetting: string | undefined;
let envFileTelemetrySent = false;

export function sendSettingTelemetry(workspaceService: IWorkspaceService, envFileSetting?: string): void {
    if (shouldSendTelemetry() && envFileSetting !== defaultEnvFileSetting(workspaceService)) {
        sendTelemetry(true);
    }
}

export function sendFileCreationTelemetry(): void {
    if (shouldSendTelemetry()) {
        sendTelemetry();
    }
}

export async function sendActivationTelemetry(
    fileSystem: IFileSystem,
    workspaceService: IWorkspaceService,
    resource: Resource,
): Promise<void> {
    if (shouldSendTelemetry()) {
        const systemVariables = new SystemVariables(resource, undefined, workspaceService);
        const envFilePath = systemVariables.resolveAny(defaultEnvFileSetting(workspaceService))!;
        const envFileExists = await fileSystem.fileExists(envFilePath);

        if (envFileExists) {
            sendTelemetry();
        }
    }
}

function sendTelemetry(hasCustomEnvPath = false) {
    sendTelemetryEvent(EventName.ENVFILE_WORKSPACE, undefined, { hasCustomEnvPath });

    envFileTelemetrySent = true;
}

function shouldSendTelemetry(): boolean {
    return !envFileTelemetrySent;
}

function defaultEnvFileSetting(workspaceService: IWorkspaceService) {
    if (!_defaultEnvFileSetting) {
        const section = workspaceService.getConfiguration('python');
        _defaultEnvFileSetting = section.inspect<string>('envFile')?.defaultValue || '';
    }

    return _defaultEnvFileSetting;
}

// Set state for tests.
export const EnvFileTelemetryTests = {
    setState: ({ telemetrySent, defaultSetting }: { telemetrySent?: boolean; defaultSetting?: string }): void => {
        if (telemetrySent !== undefined) {
            envFileTelemetrySent = telemetrySent;
        }
        if (defaultEnvFileSetting !== undefined) {
            _defaultEnvFileSetting = defaultSetting;
        }
    },
    resetState: (): void => {
        _defaultEnvFileSetting = undefined;
        envFileTelemetrySent = false;
    },
};
