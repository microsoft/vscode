/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INotebookLoggingService = createDecorator<INotebookLoggingService>('INotebookLoggingService');

export interface INotebookLoggingService {
	readonly _serviceBrand: undefined;
	info(category: string, output: string): void;
	warn(category: string, output: string): void;
	error(category: string, output: string): void;
	debug(category: string, output: string): void;
}
