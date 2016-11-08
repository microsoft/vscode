/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { IProcessEnvironment } from 'vs/base/common/platform';

export const ITerminalService = createDecorator<ITerminalService>('nativeTerminalService');

export interface ITerminalService {
	_serviceBrand: any;
	openTerminal(path: string): void;
	runInTerminal(title: string, cwd: string, args: string[], env: IProcessEnvironment): TPromise<void>;
}