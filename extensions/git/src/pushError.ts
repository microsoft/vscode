/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { PushErrorHandler } from './api/git';

export interface IPushErrorHandlerRegistry {
	registerPushErrorHandler(provider: PushErrorHandler): Disposable;
	getPushErrorHandlers(): PushErrorHandler[];
}
