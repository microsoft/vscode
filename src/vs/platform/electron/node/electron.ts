/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IElectronService = createDecorator<IElectronService>('electronService');

export interface IElectronService {

	_serviceBrand: undefined;

	// Dialogs
	showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
}
