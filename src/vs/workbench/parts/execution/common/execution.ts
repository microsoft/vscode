/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export interface IOptions {
	cwd: string;
	env?: any;
}

export var IExecutionService = createDecorator<IExecutionService>('executionService');

export interface IExecutionService {
	serviceId: ServiceIdentifier<any>;
	exec(file: string, args: string[], cwd: string | IOptions): TPromise<any>;
}

export var ITerminalService = createDecorator<ITerminalService>('nativeTerminalService');

export interface ITerminalService {
	serviceId: ServiceIdentifier<any>;
	openTerminal(path: string): void;
}