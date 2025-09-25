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
    environmentType?: string;
    environmentName?: string;
    environmentPath?: string;
    sysPrefix?: string;
    tools?: string[];
    workspaceFolder?: string;
    displayName?: string;
    description?: string;
    envKind?: string;
}

export async function createPythonRuntimeMetadataFromEnvironment(
    environment: any, // ResolvedEnvironment from Python extension API
    serviceContainer: IServiceContainer,
    recommendedForWorkspace: boolean,
): Promise<erdos.LanguageRuntimeMetadata> {
    const installer = serviceContainer.get<IInstaller>(IInstaller);
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const applicationEnv = serviceContainer.get<IApplicationEnvironment>(IApplicationEnvironment);

    const workspaceUri = workspaceService.workspaceFolders?.[0]?.uri;

    // Extract Python executable path from environment
    const pythonPath = environment.executable?.uri?.fsPath || environment.path;
    if (!pythonPath) {
        throw new Error(`Environment ${environment.id} has no executable path`);
    }

    // Create a temporary interpreter object for compatibility with existing ipykernel logic
    const interpreterForIpykernel: PythonEnvironment = {
        path: pythonPath,
        version: environment.version ? {
            major: environment.version.major || 3,
            minor: environment.version.minor || 0,
            micro: environment.version.micro || 0,
            raw: environment.version.sysVersion || '3.0.0'
        } : undefined,
        sysVersion: environment.version?.sysVersion,
        envType: environment.environment?.type || 'Unknown',
        envName: environment.environment?.name,
        envPath: environment.environment?.folderUri?.fsPath,
        displayName: environment.id,
        detailedDisplayName: environment.id,
        sysPrefix: environment.executable?.sysPrefix || ''
    } as PythonEnvironment;

    const ipykernelBundle = await getIpykernelBundle(interpreterForIpykernel, serviceContainer, workspaceUri);

    let hasCompatibleKernel: boolean;
    if (ipykernelBundle.disabledReason) {
        const productInstallStatus = await installer.isProductVersionCompatible(
            Product.ipykernel,
            IPYKERNEL_VERSION,
            interpreterForIpykernel,
        );
        hasCompatibleKernel = productInstallStatus === ProductInstallStatus.Installed;
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
        const isLocal = workspacePath && environment.environment?.workspaceFolder?.uri.fsPath === workspacePath;
        startupBehavior =
            isLocal && recommendedForWorkspace
                ? erdos.LanguageRuntimeStartupBehavior.Immediate
                : erdos.LanguageRuntimeStartupBehavior.Explicit;
    }

    const pythonVersion = environment.version?.sysVersion?.split(' ')[0] || environment.version?.raw || '0.0.1';
    const envName = environment.environment?.name || '';
    const runtimeSource = environment.environment?.type || 'Unknown';

    // Create proper display name using environment information
    let runtimeShortName = pythonVersion;
    runtimeShortName += ` (${runtimeSource}`;
    if (envName.length > 0 && envName !== pythonVersion) {
        runtimeShortName += `: ${envName}`;
    }
    runtimeShortName += ')';

    let supportedFlag = '';
    if (!isVersionSupported(interpreterForIpykernel.version)) {
        supportedFlag = `Unsupported: `;
    }

    const runtimeName = `${supportedFlag}Python ${runtimeShortName}`;

    const digest = crypto.createHash('sha256');
    digest.update(environment.id); // Use environment ID instead of interpreter path
    digest.update(pythonVersion);
    const runtimeId = digest.digest('hex').substring(0, 32);

    const homedir = os.homedir();
    const runtimePath =
        os.platform() !== 'win32' && pythonPath.startsWith(homedir)
            ? path.join('~', pythonPath.substring(homedir.length))
            : pythonPath;

    const extraRuntimeData: PythonRuntimeExtraData = {
        pythonPath: pythonPath,
        ipykernelBundle,
        supported: isVersionSupported(interpreterForIpykernel.version),
        environmentType: environment.environment?.type?.toString() || 'Unknown',
        environmentName: environment.environment?.name,
        environmentPath: environment.environment?.folderUri?.fsPath,
        sysPrefix: environment.executable?.sysPrefix,
        tools: environment.tools || [],
        workspaceFolder: environment.environment?.workspaceFolder?.uri?.fsPath,
        displayName: environment.id,
        description: `${environment.environment?.type || 'Python'} environment`,
        envKind: environment.environment?.type?.toString() || 'Unknown',
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

export async function createPythonRuntimeMetadata(
    interpreter: PythonEnvironment,
    serviceContainer: IServiceContainer,
    recommendedForWorkspace: boolean,
): Promise<erdos.LanguageRuntimeMetadata> {
    const installer = serviceContainer.get<IInstaller>(IInstaller);
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const applicationEnv = serviceContainer.get<IApplicationEnvironment>(IApplicationEnvironment);

    const workspaceUri = workspaceService.workspaceFolders?.[0]?.uri;

    const ipykernelBundle = await getIpykernelBundle(interpreter, serviceContainer, workspaceUri);

    let hasCompatibleKernel: boolean;
    if (ipykernelBundle.disabledReason) {
        const productInstallStatus = await installer.isProductVersionCompatible(
            Product.ipykernel,
            IPYKERNEL_VERSION,
            interpreter,
        );
        hasCompatibleKernel = productInstallStatus === ProductInstallStatus.Installed;
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
        environmentType: interpreter.envType?.toString() || 'Unknown',
        environmentName: interpreter.envName,
        environmentPath: interpreter.envPath,
        sysPrefix: interpreter.sysPrefix,
        tools: undefined,
        workspaceFolder: workspaceService.workspaceFolders?.[0]?.uri.fsPath,
        displayName: interpreter.detailedDisplayName || interpreter.displayName,
        description: undefined, // Let VS Code handle description generation
        envKind: interpreter.envType?.toString() || 'Unknown',
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
