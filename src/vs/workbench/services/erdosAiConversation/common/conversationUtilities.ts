/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ConversationLogEntry {
    id: number;
    role: string;
    content?: string;
    type?: string;
    function_call?: {
        name: string;
        call_id: string;
        arguments?: any;
    };
    call_id?: string;
    output?: string;
    related_to?: number;
}

export const IConversationUtilities = createDecorator<IConversationUtilities>('conversationUtilities');

export interface IConversationUtilities {
	readonly _serviceBrand: undefined;

	getCurrentConversationIndex(): number;
	setCurrentConversationIndex(index: number): boolean;
	findHighestConversationIndex(): Promise<number>;
	analyzeConversationHistory(filePath: string, currentLog: ConversationLogEntry[]): Promise<{
		prevReadSameFile: boolean;
		prevMaxLines: number;
	}>;
	readConversationLog(conversationIndex?: number): Promise<ConversationLogEntry[]>;
	writeConversationLog(log: ConversationLogEntry[], conversationIndex?: number): Promise<boolean>;
	isConversationEmpty(conversationIndex?: number): Promise<boolean>;
	conversationExists(conversationIndex: number): Promise<boolean>;
	createNewConversation(): Promise<number>;
	switchConversation(index: number): Promise<{
		success: boolean;
		message?: string;
		index?: number;
	}>;
}
