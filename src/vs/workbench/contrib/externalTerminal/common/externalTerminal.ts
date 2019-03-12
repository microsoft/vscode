/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IRunInTerminalResult } from 'vs/workbench/contrib/debug/common/debug';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('nativeTerminalService');

export interface IExternalTerminalService {
	_serviceBrand: any;
	openTerminal(path: string): void;
	runInTerminal(title: string, cwd: string, args: string[], env: IProcessEnvironment): Promise<IRunInTerminalResult>;
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