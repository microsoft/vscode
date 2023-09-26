/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalEnvironment } from 'vs/platform/terminal/common/terminal';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('externalTerminal');

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
	runInTerminal(title: string, cwd: string, args: string[], env: ITerminalEnvironment, settings: IExternalTerminalSettings): Promise<number | undefined>;
	getDefaultTerminalForPlatforms(): Promise<ITerminalForPlatform>;
}

export interface IExternalTerminalConfiguration {
	terminal: {
		explorerKind: 'integrated' | 'external' | 'both';
		external: IExternalTerminalSettings;
	};
}

export const DEFAULT_TERMINAL_OSX = 'Terminal.app';
