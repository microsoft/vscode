/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';

export const IInfrastructureRegistry = createDecorator<IInfrastructureRegistry>('infrastructureRegistry');

export interface IInfrastructureRegistry {
	readonly _serviceBrand: undefined;

	dispose(): Promise<void>;
	initialize(): Promise<void>;
	setConversationManager(conversationManager: any): void;
	setMessageIdManager(messageIdManager: IMessageIdManager): void;
	setSearchService(searchService: any): void;
	createCallContext(relatedToId: string | number, requestId: string, conversationManager: any, functionCallMessageId: string | number): any;
}
