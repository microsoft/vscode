/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import { CreateEnvironmentOptionsInternal } from '../pythonEnvironments/creation/types';
import {
    CreateEnvironmentOptions,
    CreateEnvironmentProvider,
    CreateEnvironmentResult,
} from '../pythonEnvironments/creation/proposed.createEnvApis';
import { handleCreateEnvironmentCommand } from '../pythonEnvironments/creation/createEnvironment';
import { IPythonRuntimeManager } from './manager';
import { getExtension } from '../common/vscodeApis/extensionsApi';
import { PythonExtension } from '../api/types';
import { PVSC_EXTENSION_ID } from '../common/constants';
import { getConfiguration } from '../common/vscodeApis/workspaceApis';
import { CONDA_PROVIDER_ID } from '../pythonEnvironments/creation/provider/condaCreationProvider';
import { VenvCreationProviderId } from '../pythonEnvironments/creation/provider/venvCreationProvider';
import { UV_PROVIDER_ID } from '../pythonEnvironments/creation/provider/uvCreationProvider';
import { traceInfo, traceVerbose } from '../logging';

interface FlowEnvironmentProviders {
    id: string;
    name: string;
    description: string;
}

type CreateEnvironmentAndRegisterResult = CreateEnvironmentResult & { metadata?: erdos.LanguageRuntimeMetadata };

export async function getCreateEnvironmentProviders(
    providers: readonly CreateEnvironmentProvider[],
): Promise<FlowEnvironmentProviders[]> {
    return providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        description: provider.description,
    }));
}

export async function createEnvironmentAndRegister(
    providers: readonly CreateEnvironmentProvider[],
    pythonRuntimeManager: IPythonRuntimeManager,
    options: CreateEnvironmentOptions & CreateEnvironmentOptionsInternal,
): Promise<CreateEnvironmentAndRegisterResult | undefined> {
    if (!options.providerId || (!options.interpreterPath && !options.condaPythonVersion && !options.uvPythonVersion)) {
        return {
            error: new Error(
                'Missing required options for creating an environment. Please specify a provider ID and a Python interpreter path or a Conda or uv Python version.',
            ),
        };
    }
    const result = await handleCreateEnvironmentCommand(providers, options);
    if (result?.path) {
        const metadata = await pythonRuntimeManager.registerLanguageRuntimeFromPath(result.path);
        return { ...result, metadata };
    }
    return result;
}

export async function isGlobalPython(interpreterPath: string): Promise<boolean | undefined> {
    const extension = getExtension<PythonExtension>(PVSC_EXTENSION_ID);
    if (!extension) {
        return undefined;
    }
    const extensionApi: PythonExtension = extension.exports as PythonExtension;
    const interpreterDetails = await extensionApi.environments.resolveEnvironment(interpreterPath);

    if (!interpreterDetails) {
        return undefined;
    }

    if (interpreterDetails.environment === undefined) {
        return true;
    }

    if (interpreterDetails.tools.includes('Pyenv')) {
        return true;
    }

    return false;
}

const EnvProviderToProviderId: Record<string, string> = {
    'Venv': VenvCreationProviderId,
    'Conda': CONDA_PROVIDER_ID,
    'uv': UV_PROVIDER_ID,
};

function getEnabledEnvProviderIds(): string[] {
    const envProviderConfig = getConfiguration('python').get<Record<string, boolean>>('environmentProviders.enable');
    if (!envProviderConfig) {
        traceInfo('[getEnabledEnvProviderIds] No environment provider settings configured. Using default providers.');
        return [VenvCreationProviderId, CONDA_PROVIDER_ID, UV_PROVIDER_ID];
    }
    const enabledProviderIds = Object.entries(envProviderConfig)
        .filter(([providerName, isEnabled]) => {
            const includeProvider = isEnabled && Object.keys(EnvProviderToProviderId).includes(providerName);
            if (!includeProvider) {
                traceVerbose(`[getEnabledEnvProviderIds] Filtering out provider ${providerName}`);
            }
            return includeProvider;
        })
        .map(([providerName]) => EnvProviderToProviderId[providerName]);
    traceVerbose(`[getEnabledEnvProviderIds] Enabled environment providers: ${enabledProviderIds}`);
    return enabledProviderIds;
}

export function isEnvProviderEnabled(providerId: string): boolean {
    const enabledProviders = getEnabledEnvProviderIds();
    return enabledProviders.includes(providerId);
}
