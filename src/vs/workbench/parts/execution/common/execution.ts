/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export var ITerminalService = createDecorator<ITerminalService>('nativeTerminalService');

export interface ITerminalService {
	_serviceBrand: any;
	openTerminal(path: string): void;
}