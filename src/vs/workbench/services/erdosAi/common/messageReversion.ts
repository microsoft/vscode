/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IMessageReversion = createDecorator<IMessageReversion>('messageReversion');

export interface IMessageReversion {
	readonly _serviceBrand: undefined;

	revertToMessage(messageId: number): Promise<{status: string, data: any}>;
}
