/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosAiNameService = createDecorator<IErdosAiNameService>('erdosAiNameService');

export interface IErdosAiNameService {
	readonly _serviceBrand: undefined;

	generateConversationName(conversationId: number): Promise<string | null>;
	shouldPromptForName(conversationId: number): Promise<boolean>;
	triggerConversationNameCheck(): void;
}
