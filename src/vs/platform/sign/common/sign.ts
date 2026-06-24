/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const SIGN_SERVICE_ID = 'signService';
export const ISignService = createDecorator<ISignService>(SIGN_SERVICE_ID);

export interface IMessage {
	id: string;
	data: string;
}

export interface ISignService {
	readonly _serviceBrand: undefined;

	createNewMessage(value: string): Promise<IMessage>;
	validate(message: IMessage, value: string): Promise<boolean>;
	sign(value: string): Promise<string>;
}
