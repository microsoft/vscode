/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ContainerConfig, ContainmentBackend, ContainmentType, SandboxPolicy } from '@microsoft/mxc-sdk';

export const ISandboxHelperService = createDecorator<ISandboxHelperService>('sandboxHelperService');

export interface ISandboxDependencyStatus {
	readonly bubblewrapInstalled: boolean;
	readonly socatInstalled: boolean;
}

export interface IWindowsMxcFilesystemPolicy {
	readonly readonlyPaths: string[];
	readonly readwritePaths: string[];
}

export type IWindowsMxcSandboxPolicy = SandboxPolicy;

export type IWindowsMxcConfig = ContainerConfig;

export type IWindowsMxcPolicyContainment = ContainmentType | ContainmentBackend;

export interface ISandboxHelperService {
	readonly _serviceBrand: undefined;
	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined>;
	getWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined>;
	getWindowsMxcEnvironment(): Promise<string[] | undefined>;
	buildWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment): Promise<IWindowsMxcConfig | undefined>;
}
