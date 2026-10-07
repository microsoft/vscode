/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISandboxHelperService = createDecorator<ISandboxHelperService>('sandboxHelperService');

export interface ISandboxDependencyStatus {
	readonly bubblewrapInstalled: boolean;
	readonly bubblewrapUsable: boolean;
	readonly socatInstalled: boolean;
	readonly bubblewrapError?: string;
	readonly dependencyInstallCommand?: string;
	readonly apparmorRestrictsUnprivilegedUserNamespaces?: boolean;
}

export interface IWindowsMxcFilesystemPolicy {
	readonly readonlyPaths: string[];
	readonly readwritePaths: string[];
}

/** Sandbox policy passed to the Windows MXC SDK. */
export interface IWindowsMxcSandboxPolicy {
	filesystem?: {
		readwritePaths?: string[];
		readonlyPaths?: string[];
		deniedPaths?: string[];
		clearPolicyOnExit?: boolean;
	};
	network?: {
		egress?: { default: 'allow' | 'deny' };
		ingress?: { default: 'allow' | 'deny' };
	};
	ui?: {
		disable: boolean;
		clipboard?: 'none' | 'read' | 'write' | 'all';
		allowInputInjection?: boolean;
	};
	timeoutMs?: number;
}

/** Serializable V1 container request returned by the Windows sandbox helper. */
export interface IWindowsMxcConfig extends IWindowsMxcSandboxPolicy {
	command: string;
	workingDirectory?: string;
	containerName?: string;
	containment?: { type: IWindowsMxcPolicyContainment };
	environment?: Record<string, string>;
}

export type IWindowsMxcPolicyContainment = 'process' | 'processcontainer' | 'wslc' | 'lxc' | 'seatbelt' | 'isolation_session' | 'bubblewrap';

export interface ISandboxHelperService {
	readonly _serviceBrand: undefined;
	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined>;
	getWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined>;
	getWindowsMxcEnvironment(): Promise<string[] | undefined>;
	buildWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment): Promise<IWindowsMxcConfig | undefined>;
}
