/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

import { IServiceContainer } from '../ioc/types';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { traceInfo } from '../logging';
import { IInstaller, Product, ProductInstallStatus } from '../common/types';
import { IApplicationEnvironment, IWorkspaceService } from '../common/application/types';
import { EXTENSION_ROOT_DIR, IPYKERNEL_VERSION, PYTHON_LANGUAGE } from '../common/constants';
import {
    EnvLocationHeuristic,
    getEnvLocationHeuristic,
    isVersionSupported,
} from '../interpreter/configuration/environmentTypeComparer';
import { getIpykernelBundle, IpykernelBundle } from './ipykernel';

export interface PythonRuntimeExtraData {
    pythonPath: string;
    ipykernelBundle?: IpykernelBundle;
    externallyManaged?: boolean;
    supported?: boolean;
}

export async function createPythonRuntimeMetadata(
    interpreter: PythonEnvironment,
    serviceContainer: IServiceContainer,
    recommendedForWorkspace: boolean,
): Promise<erdos.LanguageRuntimeMetadata> {
    traceInfo('createPythonRuntime: getting service instances');
    const installer = serviceContainer.get<IInstaller>(IInstaller);
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const applicationEnv = serviceContainer.get<IApplicationEnvironment>(IApplicationEnvironment);

    const workspaceUri = workspaceService.workspaceFolders?.[0]?.uri;

    traceInfo('createPythonRuntime: getting extension runtime settings');

    const ipykernelBundle = await getIpykernelBundle(interpreter, serviceContainer, workspaceUri);

    let hasCompatibleKernel: boolean;
    if (ipykernelBundle.disabledReason) {
        traceInfo(
            `createPythonRuntime: ipykernel bundling is disabled ` +
                `(reason: ${ipykernelBundle.disabledReason}). ` +
                `Checking if ipykernel is installed`,
        );
        const productInstallStatus = await installer.isProductVersionCompatible(
            Product.ipykernel,
            IPYKERNEL_VERSION,
            interpreter,
        );
        hasCompatibleKernel = productInstallStatus === ProductInstallStatus.Installed;
        if (hasCompatibleKernel) {
            traceInfo(`createPythonRuntime: ipykernel installed`);
        } else {
            traceInfo('createPythonRuntime: ipykernel not installed');
        }
    } else {
        hasCompatibleKernel = true;
    }

    let startupBehavior;
    if (hasCompatibleKernel) {
        startupBehavior = recommendedForWorkspace
            ? erdos.LanguageRuntimeStartupBehavior.Immediate
            : erdos.LanguageRuntimeStartupBehavior.Implicit;
    } else {
        const workspacePath = workspaceService.workspaceFolders?.[0]?.uri?.fsPath;
        const isLocal =
            workspacePath && getEnvLocationHeuristic(interpreter, workspacePath) === EnvLocationHeuristic.Local;
        startupBehavior =
            isLocal && recommendedForWorkspace
                ? erdos.LanguageRuntimeStartupBehavior.Immediate
                : erdos.LanguageRuntimeStartupBehavior.Explicit;
    }
    traceInfo(`createPythonRuntime: startup behavior: ${startupBehavior}`);

    const pythonVersion = interpreter.sysVersion?.split(' ')[0] || interpreter.version?.raw || '0.0.1';
    const envName = interpreter.envName ?? '';
    const runtimeSource = interpreter.envType;

    let runtimeShortName = pythonVersion;

    runtimeShortName += ` (${runtimeSource}`;

    if (envName.length > 0 && envName !== pythonVersion) {
        runtimeShortName += `: ${envName}`;
    }
    runtimeShortName += ')';

    let supportedFlag = '';
    if (!isVersionSupported(interpreter.version)) {
        supportedFlag = `Unsupported: `;
    }

    const runtimeName = `${supportedFlag}Python ${runtimeShortName}`;

    const digest = crypto.createHash('sha256');
    digest.update(interpreter.path);
    digest.update(pythonVersion);
    const runtimeId = digest.digest('hex').substring(0, 32);

    const homedir = os.homedir();
    const runtimePath =
        os.platform() !== 'win32' && interpreter.path.startsWith(homedir)
            ? path.join('~', interpreter.path.substring(homedir.length))
            : interpreter.path;

    const extraRuntimeData: PythonRuntimeExtraData = {
        pythonPath: interpreter.path,
        ipykernelBundle,
        supported: isVersionSupported(interpreter.version),
    };

    const config = vscode.workspace.getConfiguration('kernelSupervisor');
    const sessionLocation =
        config.get<string>('shutdownTimeout', 'immediately') !== 'immediately'
            ? erdos.LanguageRuntimeSessionLocation.Machine
            : erdos.LanguageRuntimeSessionLocation.Workspace;

    const metadata: erdos.LanguageRuntimeMetadata = {
        runtimeId,
        runtimeName,
        runtimeShortName,
        runtimePath,
        runtimeVersion: applicationEnv.packageJson.version,
        runtimeSource,
        languageId: PYTHON_LANGUAGE,
        languageName: 'Python',
        languageVersion: pythonVersion,
        base64EncodedIconSvg: fs
            .readFileSync(path.join(EXTENSION_ROOT_DIR, 'resources', 'branding', 'python-icon.svg'))
            .toString('base64'),
        startupBehavior,
        sessionLocation,
        extraRuntimeData,
    };

    return metadata;
}
