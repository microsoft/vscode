/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { TerminalCapability } from '../../terminal/common/capabilities/capabilities.js';

export const ITerminalSandboxService = createDecorator<ITerminalSandboxService>('terminalSandboxService');

export interface ITerminalSandboxResolvedNetworkDomains {
	allowedDomains: string[];
	deniedDomains: string[];
}

export const enum TerminalSandboxPrerequisiteCheck {
	Config = 'config',
	Dependencies = 'dependencies',
}

export interface ITerminalSandboxPrerequisiteCheckResult {
	enabled: boolean;
	sandboxConfigPath: string | undefined;
	failedCheck: TerminalSandboxPrerequisiteCheck | undefined;
	missingDependencies?: string[];
}

export interface ITerminalSandboxWrapResult {
	command: string;
	isSandboxWrapped: boolean;
	blockedDomains?: string[];
	deniedDomains?: string[];
	requiresUnsandboxConfirmation?: boolean;
}

/**
 * Abstraction over terminal operations needed by the install flow.
 * Provided by the browser-layer caller so the common-layer service
 * does not import browser types directly.
 */
export interface ISandboxDependencyInstallTerminal {
	sendText(text: string, addNewLine?: boolean): Promise<void>;
	focus(): void;
	capabilities: {
		get(id: TerminalCapability.CommandDetection): { onCommandFinished: Event<{ exitCode: number | undefined }> } | undefined;
		onDidAddCapability: Event<{ id: TerminalCapability }>;
	};
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
}

export interface ISandboxDependencyInstallOptions {
	/**
	 * Creates or obtains a terminal for running the install command.
	 */
	createTerminal(): Promise<ISandboxDependencyInstallTerminal>;
	/**
	 * Focuses the terminal for password entry.
	 */
	focusTerminal(terminal: ISandboxDependencyInstallTerminal): Promise<void>;
}

export interface ISandboxDependencyInstallResult {
	exitCode: number | undefined;
}

export interface ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): Promise<boolean>;
	getOS(): Promise<OperatingSystem>;
	checkForSandboxingPrereqs(forceRefresh?: boolean): Promise<ITerminalSandboxPrerequisiteCheckResult>;
	wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string): ITerminalSandboxWrapResult;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	setNeedsForceUpdateConfigFile(): void;
	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains;
	getMissingSandboxDependencies(): Promise<string[]>;
	installMissingSandboxDependencies(missingDependencies: string[], sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult>;
}

export class NullTerminalSandboxService implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;

	async isEnabled(): Promise<boolean> {
		return false;
	}

	async getOS(): Promise<OperatingSystem> {
		return OS;
	}

	async checkForSandboxingPrereqs(): Promise<ITerminalSandboxPrerequisiteCheckResult> {
		return { enabled: false, sandboxConfigPath: undefined, failedCheck: undefined };
	}

	wrapCommand(command: string): ITerminalSandboxWrapResult {
		return { command, isSandboxWrapped: false };
	}

	async getSandboxConfigPath(): Promise<string | undefined> {
		return undefined;
	}

	getTempDir(): URI | undefined {
		return undefined;
	}

	setNeedsForceUpdateConfigFile(): void {
		// No-op.
	}

	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains {
		return { allowedDomains: [], deniedDomains: [] };
	}

	async getMissingSandboxDependencies(): Promise<string[]> {
		return [];
	}

	async installMissingSandboxDependencies(): Promise<ISandboxDependencyInstallResult> {
		return { exitCode: undefined };
	}
}
