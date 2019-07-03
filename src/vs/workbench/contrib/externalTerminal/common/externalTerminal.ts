/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalSettings } from 'vs/workbench/contrib/debug/common/debug';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('nativeTerminalService');

export interface IExternalTerminalService {
	_serviceBrand: any;
	openTerminal(path: string): void;
	runInTerminal(title: string, cwd: string, args: string[], env: { [key: string]: string | null; }, configuration: ITerminalSettings): Promise<number | undefined>;
}

export interface IExternalTerminalConfiguration {
	terminal: {
		explorerKind: 'integrated' | 'external',
		external: {
			linuxExec: string,
			osxExec: string,
			windowsExec: string
		}
	};
}