/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDeleteFileCommandHandler = createDecorator<IDeleteFileCommandHandler>('deleteFileCommandHandler');

export interface IDeleteFileCommandHandler {
	readonly _serviceBrand: undefined;

	acceptDeleteFileCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}>;
	cancelDeleteFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
}
