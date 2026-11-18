/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ITerminalEnvironment } from '../../terminal/common/terminal.js';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('externalTerminal');

/** A launch failure that occurred before the requested terminal command could start. */
export class ExternalTerminalNotStartedError extends Error {
	override readonly name = 'ExternalTerminalNotStartedError';

	static is(error: unknown): error is Error {
		return error instanceof Error && error.name === 'ExternalTerminalNotStartedError';
	}
}

export interface IExternalTerminalSettings {
	linuxExec?: string;
	osxExec?: string;
	windowsExec?: string;
}

export interface ITerminalForPlatform {
	windows: string;
	linux: string;
	osx: string;
}

export interface IExternalTerminalService {
	readonly _serviceBrand: undefined;
	openTerminal(configuration: IExternalTerminalSettings, cwd: string | undefined): Promise<void>;
	/**
	 * Without `env`, the command runs with the terminal's own environment. With it, the terminal runs the command with
	 * VS Code's environment and `env`, which Terminal.app and iTerm show in the command line they run.
	 */
	runInTerminal(title: string, cwd: string, args: string[], env: ITerminalEnvironment | undefined, settings: IExternalTerminalSettings): Promise<number | undefined>;
	getDefaultTerminalForPlatforms(): Promise<ITerminalForPlatform>;
}

export interface IExternalTerminalConfiguration {
	terminal: {
		explorerKind: 'integrated' | 'external' | 'both';
		external: IExternalTerminalSettings;
	};
}

export const DEFAULT_TERMINAL_OSX = 'Terminal.app';
