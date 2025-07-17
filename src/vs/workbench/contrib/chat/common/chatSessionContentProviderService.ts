/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatModel } from './chatModel.js';

export interface IChatSessionContentProvider {
	provideChatSessionContent(id: string, token: CancellationToken): Promise<IChatModel>;
}


export interface IChatSessionContentProviderService {
	_serviceBrand: undefined;
	registerChatSessionContentProvider(type: string, provider: IChatSessionContentProvider): void;
	unregisterChatSessionContentProvider(type: string): void;
	getChatSessionContentProvider(type: string): IChatSessionContentProvider | undefined;

	getChatSession(type: string, id: string, token: CancellationToken): Promise<IChatModel>;
}

export const IChatSessionContentProviderService = createDecorator<IChatSessionContentProviderService>('IChatSessionContentProviderService');
